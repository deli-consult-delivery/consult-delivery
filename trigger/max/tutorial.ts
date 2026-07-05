import { task } from "@trigger.dev/sdk/v3";
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { getSupabase } from "../_shared/supabase";
import { logAgentRun } from "../_shared/audit";
import { calcularCustoUsd } from "../_shared/pricing";

// ── Schemas ───────────────────────────────────────────────────────────────────

const StepSchema = z.object({
  passo: z.number(),
  titulo: z.string(),
  descricao: z.string(),
  dica: z.string().optional(),
});

const InputSchema = z.object({
  tenant_id: z.string().uuid(),
  user_id: z.string().uuid(),
  topico: z.string().min(3).max(500),
  sistema: z.enum(["ifood", "whatsapp", "pdv", "delivery", "geral"]).optional(),
  nivel: z.enum(["basico", "intermediario", "avancado"]).optional().default("basico"),
  triggered_by: z.string().uuid().optional(),
});

const OutputSchema = z.object({
  ok: z.boolean(),
  titulo: z.string(),
  sistema: z.string(),
  nivel: z.string(),
  introducao: z.string(),
  passos: z.array(StepSchema),
  tempo_estimado: z.string(),
  dica_final: z.string().optional(),
});

// ── Task ──────────────────────────────────────────────────────────────────────

export const maxTutorial = task({
  id: "max-tutorial",
  retry: { maxAttempts: 2 },

  run: async (payload: unknown, { ctx }) => {
    const input = InputSchema.parse(payload);
    const sb = getSupabase();
    const startedAt = Date.now();

    // 1. Buscar artigos relevantes
    const sistema = input.sistema ?? "geral";
    const { data: articles } = await sb
      .from("max_knowledge_base")
      .select("title, content, system_name")
      .or(`tenant_id.eq.${input.tenant_id},tenant_id.is.null`)
      .in("system_name", [sistema, "geral"])
      .eq("is_active", true)
      .limit(10);

    const kbBlock = articles?.length
      ? articles
          .map((a) => `${a.system_name.toUpperCase()} — ${a.title}\n${a.content}`)
          .join("\n\n---\n\n")
      : "";

    const nivelDesc =
      input.nivel === "basico"
        ? "simples e acessível para leigos"
        : input.nivel === "intermediario"
        ? "técnica moderada, assume familiaridade básica"
        : "técnica avançada, detalhes de configuração";

    const systemPrompt = `Você é MAX, consultor técnico da Consult Delivery.
Gere um tutorial estruturado e prático sobre o tópico solicitado.

## Base de conhecimento
${kbBlock || "(use seu conhecimento geral sobre sistemas de delivery)"}

## Formato de resposta — retorne APENAS JSON válido:
{
  "titulo": "string — título claro e descritivo",
  "sistema": "string — sistema coberto (ex: iFood, WhatsApp Business)",
  "nivel": "básico | intermediário | avançado",
  "introducao": "string — 1-2 frases introdutórias",
  "passos": [
    {
      "passo": 1,
      "titulo": "string — título do passo",
      "descricao": "string — instrução clara, indique menus e botões específicos",
      "dica": "string opcional — atenção especial ou dica"
    }
  ],
  "tempo_estimado": "string — ex: '5 minutos', '10-15 minutos'",
  "dica_final": "string opcional — boas práticas"
}

## Regras
- Mínimo 3 passos, máximo 10
- Linguagem ${nivelDesc}
- Seja específico: indique caminhos de menu, nomes de botão, telas
- Responda em português brasileiro`;

    // 2. Claude gera o tutorial
    const client = new Anthropic();
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1200,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: `Tópico: ${input.topico}\nSistema: ${sistema}\nNível: ${input.nivel}`,
        },
      ],
    });

    const costUsd = calcularCustoUsd("claude-haiku-4-5-20251001", response.usage);

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
        titulo: input.topico,
        sistema: sistema,
        nivel: input.nivel,
        introducao: "Tutorial gerado pelo MAX.",
        passos: [
          {
            passo: 1,
            titulo: "Consultar equipe de suporte",
            descricao: rawText.slice(0, 500),
          },
        ],
        tempo_estimado: "variável",
      };
    }

    const output = OutputSchema.parse({
      ok: true,
      titulo: parsed.titulo ?? input.topico,
      sistema: parsed.sistema ?? sistema,
      nivel: parsed.nivel ?? input.nivel,
      introducao: parsed.introducao ?? "",
      passos: (parsed.passos ?? []).slice(0, 10),
      tempo_estimado: parsed.tempo_estimado ?? "variável",
      dica_final: parsed.dica_final,
    });

    // 4. Log de execução
    await logAgentRun({
      runId: ctx.run.id,
      agentSlug: "max",
      input,
      output,
      tenantId: input.tenant_id,
      triggeredBy: input.triggered_by ?? input.user_id,
      durationMs: Date.now() - startedAt,
      costUsd,
    });

    return output;
  },
});
