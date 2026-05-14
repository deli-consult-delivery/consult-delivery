import { task } from "@trigger.dev/sdk/v3";
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { getSupabase } from "../_shared/supabase";
import { logAgentRun } from "../_shared/audit";

// ── Schemas ───────────────────────────────────────────────────────────────────

const InputSchema = z.object({
  tenant_id: z.string().uuid(),
  user_id: z.string().uuid(),
  message: z.string().min(3).max(2000),
  sistema: z.enum(["ifood", "whatsapp", "pdv", "delivery", "geral"]).optional(),
  loja_id: z.string().uuid().optional(),
  triggered_by: z.string().uuid().optional(),
});

const OutputSchema = z.object({
  ok: z.boolean(),
  solution: z.string(),
  citations: z.array(z.string()),
  needs_escalation: z.boolean(),
  escalation_reason: z.string().optional(),
  knowledge_articles_used: z.number(),
});

// ── Task ──────────────────────────────────────────────────────────────────────

export const maxDiagnostico = task({
  id: "max-diagnostico",
  retry: { maxAttempts: 2 },

  run: async (payload: unknown, { ctx }) => {
    const input = InputSchema.parse(payload);
    const sb = getSupabase();
    const startedAt = Date.now();

    // 1. Buscar artigos relevantes da base de conhecimento
    const sistemas = input.sistema
      ? [input.sistema, "geral"]
      : ["ifood", "whatsapp", "pdv", "delivery", "geral"];

    const { data: articles } = await sb
      .from("max_knowledge_base")
      .select("title, content, system_name, tags")
      .or(`tenant_id.eq.${input.tenant_id},tenant_id.is.null`)
      .in("system_name", sistemas)
      .eq("is_active", true)
      .limit(20);

    // 2. Contexto da loja se fornecido
    let lojaContext = "";
    if (input.loja_id) {
      const { data: loja } = await sb
        .from("lojas")
        .select("nome, cidade")
        .eq("id", input.loja_id)
        .maybeSingle();
      if (loja) {
        lojaContext = `\nLoja: ${loja.nome}${loja.cidade ? ` (${loja.cidade})` : ""}`;
      }
    }

    // 3. Montar base de conhecimento para o Claude
    const kbBlock =
      articles && articles.length > 0
        ? articles
            .map(
              (a, i) =>
                `[Artigo ${i + 1}] ${a.system_name.toUpperCase()} — ${a.title}\n${a.content}`
            )
            .join("\n\n---\n\n")
        : "(base de conhecimento vazia para este sistema)";

    const systemPrompt = `Você é MAX, consultor técnico da Consult Delivery especialista em sistemas de delivery.

## Seu papel
- Diagnosticar problemas técnicos relacionados a iFood, WhatsApp Business, PDVs e delivery
- Fornecer soluções claras e passo-a-passo baseadas na base de conhecimento
- Decidir quando escalar para atendimento humano (Eduardo)

## Base de conhecimento disponível
${kbBlock}

## Regras
- SEMPRE cite o artigo usado: ex "[Artigo 1]"
- Se não souber a solução com certeza, diga e recomende escalação
- Nunca invente passos técnicos sem base no conhecimento disponível
- Escalar obrigatoriamente: perda de dados, falha de segurança, pagamento real, urgência crítica
- Resposta máxima: 400 palavras
- Responda sempre em português brasileiro`;

    // 4. Claude analisa o problema
    const client = new Anthropic();
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 800,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: `Problema relatado:${lojaContext}\n\n${input.message}`,
        },
      ],
    });

    const solutionText = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    // 5. Detectar se precisa escalação
    const needsEscalation =
      /escal|humano|Eduardo|atendimento manual|suporte presencial|não consigo resolver|fora do escopo|contate a equipe/i.test(
        solutionText
      );

    // 6. Extrair citações usadas
    const citationMatches = solutionText.match(/\[Artigo \d+\]/g) ?? [];
    const citations = [...new Set(citationMatches)];

    const output = OutputSchema.parse({
      ok: true,
      solution: solutionText,
      citations,
      needs_escalation: needsEscalation,
      escalation_reason: needsEscalation
        ? "MAX identificou problema que requer atendimento humano"
        : undefined,
      knowledge_articles_used: articles?.length ?? 0,
    });

    // 7. Notificar DELI sobre o diagnóstico
    await sb
      .from("deli_messages")
      .insert({
        tenant_id: input.tenant_id,
        user_id: null,
        role: "assistant",
        content: `🔧 **MAX** diagnosticou problema${needsEscalation ? " — ⚠️ requer escalação" : " — ✅ solução fornecida"}\n\n${solutionText.slice(0, 350)}${solutionText.length > 350 ? "…" : ""}`,
        metadata: {
          source_agent: "max",
          source_task: "max-diagnostico",
          run_id: ctx.run.id,
        },
      })
      .catch(() => {});

    // 8. Log de execução
    await logAgentRun({
      runId: ctx.run.id,
      agentSlug: "max",
      input,
      output,
      tenantId: input.tenant_id,
      triggeredBy: input.triggered_by ?? input.user_id,
      durationMs: Date.now() - startedAt,
    });

    return output;
  },
});
