import { task } from "@trigger.dev/sdk/v3";
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { getSupabase } from "../_shared/supabase";
import { logAgentRun } from "../_shared/audit";

const anthropic = new Anthropic();

const InputSchema = z.object({
  tenant_id: z.string().uuid(),
  user_id: z.string().uuid(),
  blueprint_id: z.string().uuid(),
});

const OutputSchema = z.object({
  ok: z.boolean(),
  blueprint_id: z.string().uuid(),
  estimate: z.object({
    investimento_setup: z.object({
      minimo: z.number(),
      maximo: z.number(),
      descricao: z.string(),
    }),
    custo_mensal: z.object({
      minimo: z.number(),
      maximo: z.number(),
      descricao: z.string(),
    }),
    retorno_estimado: z.object({
      economia_mensal: z.number(),
      payback_meses: z.number(),
      roi_12meses: z.string(),
    }),
    cronograma: z.array(z.object({
      fase: z.string(),
      inicio: z.string(),
      fim: z.string(),
      marcos: z.array(z.string()),
    })),
    premissas: z.array(z.string()),
    proximos_passos: z.array(z.string()),
    nivel_complexidade: z.enum(["baixo", "medio", "alto"]),
    score_viabilidade: z.number().min(0).max(10),
    justificativa_score: z.string(),
  }),
});

export const novaEstimate = task({
  id: "nova-estimate",
  retry: { maxAttempts: 2 },
  run: async (payload: unknown, { ctx }) => {
    const start = Date.now();
    const input = InputSchema.parse(payload);
    const sb = getSupabase();

    const { data: record, error } = await sb
      .from("nova_blueprints")
      .select("*")
      .eq("id", input.blueprint_id)
      .eq("tenant_id", input.tenant_id)
      .single();

    if (error || !record) throw new Error(`Blueprint não encontrado: ${input.blueprint_id}`);
    if (!record.blueprint) throw new Error("Execute nova-blueprint primeiro.");

    const budgetLabel: Record<string, string> = {
      "ate-500": "até R$ 500/mês",
      "500-2000": "R$ 500–2.000/mês",
      "2000-5000": "R$ 2.000–5.000/mês",
      "acima-5000": "acima de R$ 5.000/mês",
    };
    const prazoLabel: Record<string, string> = {
      "urgente": "urgente (< 2 semanas)",
      "1-mes": "1 mês",
      "2-3-meses": "2–3 meses",
      "flexivel": "flexível",
    };

    const today = new Date().toISOString().split("T")[0];

    const userPrompt = `Com base no blueprint abaixo, gere uma Estimativa Financeira e Cronograma.

**Cliente:** ${record.client_name}
**Budget declarado:** ${record.budget_range ? budgetLabel[record.budget_range] : "Não especificado"}
**Prazo desejado:** ${record.prazo_desejado ? prazoLabel[record.prazo_desejado] : "Não especificado"}
**Data de referência:** ${today}

**Blueprint:**
${JSON.stringify(record.blueprint, null, 2)}

Retorne APENAS JSON válido (valores em Reais BRL):
{
  "investimento_setup": { "minimo": 1500, "maximo": 4000, "descricao": "o que inclui" },
  "custo_mensal": { "minimo": 300, "maximo": 800, "descricao": "breakdown dos custos" },
  "retorno_estimado": { "economia_mensal": 2000, "payback_meses": 3, "roi_12meses": "340% — R$ 18.000 economizados" },
  "cronograma": [
    { "fase": "Fase 1 — Nome", "inicio": "${today}", "fim": "YYYY-MM-DD", "marcos": ["entrega 1"] }
  ],
  "premissas": ["premissa 1", "premissa 2"],
  "proximos_passos": ["passo 1", "passo 2", "passo 3"],
  "nivel_complexidade": "baixo|medio|alto",
  "score_viabilidade": 8,
  "justificativa_score": "justificativa do score (0=inviável, 10=perfeito)"
}

Seja conservador nas estimativas de economia. Cronograma começa em ${today}.`;

    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2500,
      system: "Você é NOVA, consultora de automação com IA para PMEs de delivery/food service no Brasil. Responda SEMPRE em JSON válido, sem markdown, sem texto extra.",
      messages: [{ role: "user", content: userPrompt }],
    });

    const rawText = response.content
      .filter((b) => b.type === "text")
      .map((b) => (b as Anthropic.TextBlock).text)
      .join("");

    let estimate: z.infer<typeof OutputSchema>["estimate"];
    try {
      const m = rawText.match(/\{[\s\S]*\}/);
      estimate = JSON.parse(m ? m[0] : rawText);
    } catch {
      estimate = {
        investimento_setup: { minimo: 0, maximo: 0, descricao: "Análise manual necessária" },
        custo_mensal: { minimo: 0, maximo: 0, descricao: "A definir" },
        retorno_estimado: { economia_mensal: 0, payback_meses: 0, roi_12meses: "A calcular" },
        cronograma: [{ fase: "A definir", inicio: today, fim: today, marcos: ["Reunião de alinhamento"] }],
        premissas: ["Estimativa automática falhou — revisão manual necessária"],
        proximos_passos: ["Agendar reunião para alinhamento"],
        nivel_complexidade: "medio" as const,
        score_viabilidade: 5,
        justificativa_score: "Erro no processamento automático",
      };
    }

    await sb
      .from("nova_blueprints")
      .update({ estimate, status: "complete", updated_at: new Date().toISOString() })
      .eq("id", input.blueprint_id)
      .eq("tenant_id", input.tenant_id);

    await sb.from("agent_runs").insert({
      tenant_id: input.tenant_id,
      agent_id: "nova",
      trigger_dev_run_id: ctx.run.id,
      status: "completed",
      input: { blueprint_id: input.blueprint_id },
      output: { ok: true, blueprint_id: input.blueprint_id, estimate },
    });

    await logAgentRun({
      runId: ctx.run.id,
      agentSlug: "nova-estimate",
      input: { blueprint_id: input.blueprint_id },
      output: { ok: true },
      tenantId: input.tenant_id,
      triggeredBy: input.user_id,
      durationMs: Date.now() - start,
    });

    return OutputSchema.parse({ ok: true, blueprint_id: input.blueprint_id, estimate });
  },
});
