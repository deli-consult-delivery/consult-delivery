import { task } from "@trigger.dev/sdk/v3";
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { getSupabase } from "../_shared/supabase";
import { logAgentRun } from "../_shared/audit";

// ── Schemas ───────────────────────────────────────────────────────────────────

const InputSchema = z.object({
  tenant_id: z.string().uuid(),
  user_id: z.string().uuid(),
  problema: z.string().min(10).max(2000),
  solucoes_tentadas: z.string().optional(),
  loja_id: z.string().uuid().optional(),
  triggered_by: z.string().uuid().optional(),
});

const OutputSchema = z.object({
  ok: z.boolean(),
  precisa_humano: z.boolean(),
  prioridade: z.enum(["baixa", "media", "alta", "critica"]),
  motivo: z.string(),
  resumo_ticket: z.string(),
  proximo_passo: z.string(),
});

// ── Task ──────────────────────────────────────────────────────────────────────

export const maxEscalonar = task({
  id: "max-escalonar",
  retry: { maxAttempts: 1 },

  run: async (payload: unknown, { ctx }) => {
    const input = InputSchema.parse(payload);
    const sb = getSupabase();
    const startedAt = Date.now();

    // 1. Contexto da loja
    let lojaInfo = "";
    if (input.loja_id) {
      const { data: loja } = await sb
        .from("lojas")
        .select("nome, cidade")
        .eq("id", input.loja_id)
        .maybeSingle();
      if (loja) {
        lojaInfo = `Loja: ${loja.nome}${loja.cidade ? ` (${loja.cidade})` : ""}\n\n`;
      }
    }

    const systemPrompt = `Você é MAX, consultor técnico da Consult Delivery.
Analise o problema abaixo e determine se requer escalação para atendimento humano (Wandson) e qual a prioridade.

## Critérios de prioridade
- **critica**: sistema totalmente fora, perda de receita ativa, falha de segurança, dados em risco
- **alta**: problema recorrente, cliente perdendo pedidos, não resolvido em tentativas anteriores
- **media**: problema impactante mas loja operando parcialmente
- **baixa**: dúvida, melhoria ou configuração simples, loja operando normalmente

## Retorne APENAS JSON válido:
{
  "precisa_humano": boolean,
  "prioridade": "baixa" | "media" | "alta" | "critica",
  "motivo": "string — justificativa da prioridade em 1-2 frases",
  "resumo_ticket": "string — resumo em 2-3 linhas para Wandson agir rapidamente",
  "proximo_passo": "string — primeiro passo que Wandson deve tomar"
}

Responda em português brasileiro.`;

    // 2. Claude classifica e gera ticket
    const client = new Anthropic();
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 600,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: `${lojaInfo}Problema: ${input.problema}${
            input.solucoes_tentadas
              ? `\n\nSoluções já tentadas: ${input.solucoes_tentadas}`
              : ""
          }`,
        },
      ],
    });

    const rawText = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    // 3. Parse JSON
    let parsed: any;
    try {
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch?.[0] ?? rawText);
    } catch {
      parsed = {
        precisa_humano: true,
        prioridade: "media",
        motivo: "Não foi possível analisar automaticamente.",
        resumo_ticket: input.problema.slice(0, 300),
        proximo_passo: "Revisar manualmente com a equipe.",
      };
    }

    const output = OutputSchema.parse({
      ok: true,
      precisa_humano: parsed.precisa_humano ?? true,
      prioridade: parsed.prioridade ?? "media",
      motivo: parsed.motivo ?? "",
      resumo_ticket: parsed.resumo_ticket ?? input.problema.slice(0, 300),
      proximo_passo: parsed.proximo_passo ?? "Verificar com a equipe.",
    });

    // 4. Criar draft para Wandson se requer escalação
    if (output.precisa_humano) {
      const prioEmoji: Record<string, string> = {
        critica: "🔴",
        alta: "🟠",
        media: "🟡",
        baixa: "🟢",
      };
      const emoji = prioEmoji[output.prioridade] ?? "⚪";

      await sb
        .from("agent_drafts")
        .insert({
          tenant_id: input.tenant_id,
          agent_name: "max",
          channel: "painel",
          subject: `${emoji} Escalação ${output.prioridade.toUpperCase()}: ${output.resumo_ticket.slice(0, 100)}`,
          body: `**Problema relatado:**\n${input.problema}\n\n**Soluções tentadas:**\n${
            input.solucoes_tentadas ?? "Nenhuma informada"
          }\n\n**Análise MAX:**\n${output.motivo}\n\n**Próximo passo para Wandson:**\n${output.proximo_passo}`,
          autonomy_level: output.prioridade === "critica" ? "vermelho" : "amarelo",
          metadata: {
            run_id: ctx.run.id,
            prioridade: output.prioridade,
            loja_id: input.loja_id ?? null,
          },
        });


      // Notificar DELI
      await sb
        .from("deli_messages")
        .insert({
          tenant_id: input.tenant_id,
          user_id: null,
          role: "assistant",
          content: `${emoji} **MAX** escalou problema (prioridade: ${output.prioridade})\n\n${output.resumo_ticket.slice(0, 200)}\n\n👤 Wandson notificado via Drafts Pendentes.`,
          metadata: {
            source_agent: "max",
            source_task: "max-escalonar",
            run_id: ctx.run.id,
          },
        })
        ;
    }

    // 5. Log de execução
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
