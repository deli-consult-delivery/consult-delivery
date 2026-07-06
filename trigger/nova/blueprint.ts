import { task } from "@trigger.dev/sdk/v3";
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { getSupabase } from "../_shared/supabase";
import { logAgentRun } from "../_shared/audit";
import { calcularCustoUsd } from "../_shared/pricing";

const anthropic = new Anthropic();

const InputSchema = z.object({
  tenant_id: z.string().uuid(),
  user_id: z.string().uuid(),
  blueprint_id: z.string().uuid(),
});

const OutputSchema = z.object({
  ok: z.boolean(),
  blueprint_id: z.string().uuid(),
  blueprint: z.object({
    titulo: z.string(),
    descricao: z.string(),
    fases: z.array(z.object({
      numero: z.number(),
      nome: z.string(),
      objetivo: z.string(),
      entregaveis: z.array(z.string()),
      tecnologias: z.array(z.string()),
      duracao_semanas: z.number(),
    })),
    integracoes: z.array(z.object({
      sistema: z.string(),
      tipo: z.string(),
      descricao: z.string(),
    })),
    kpis: z.array(z.object({
      metrica: z.string(),
      baseline: z.string(),
      meta: z.string(),
      prazo: z.string(),
    })),
    stack_recomendada: z.array(z.string()),
    arquitetura_resumo: z.string(),
  }),
});

export const novaBlueprint = task({
  id: "nova-blueprint",
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
    if (!record.discovery) throw new Error("Execute nova-discovery primeiro.");

    const budgetLabel: Record<string, string> = {
      "ate-500": "até R$ 500/mês",
      "500-2000": "R$ 500–2.000/mês",
      "2000-5000": "R$ 2.000–5.000/mês",
      "acima-5000": "acima de R$ 5.000/mês",
    };

    const userPrompt = `Com base no discovery abaixo, crie um Blueprint de Automação IA detalhado.

**Cliente:** ${record.client_name}
**Segmento:** ${record.segmento || "Delivery / Food Service"}
**Problema:** ${record.problema}
**Budget:** ${record.budget_range ? budgetLabel[record.budget_range] : "Não especificado"}

**Discovery:**
${JSON.stringify(record.discovery, null, 2)}

Retorne APENAS JSON válido:
{
  "titulo": "título do projeto",
  "descricao": "descrição executiva em 2-3 frases",
  "fases": [
    { "numero": 1, "nome": "nome", "objetivo": "objetivo", "entregaveis": ["e1"], "tecnologias": ["t1"], "duracao_semanas": 2 }
  ],
  "integracoes": [
    { "sistema": "sistema", "tipo": "tipo", "descricao": "o que faz" }
  ],
  "kpis": [
    { "metrica": "nome", "baseline": "valor atual", "meta": "meta", "prazo": "prazo" }
  ],
  "stack_recomendada": ["tech1", "tech2"],
  "arquitetura_resumo": "descrição da arquitetura em 2-3 parágrafos"
}

Para orçamentos menores use no-code/low-code. Para maiores use Trigger.dev + Anthropic SDK + Supabase.`;

    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 3000,
      system: "Você é NOVA, consultora de automação com IA para PMEs de delivery/food service no Brasil. Responda SEMPRE em JSON válido, sem markdown, sem texto extra.",
      messages: [{ role: "user", content: userPrompt }],
    });

    const costUsd = calcularCustoUsd("claude-haiku-4-5-20251001", response.usage);

    const rawText = response.content
      .filter((b) => b.type === "text")
      .map((b) => (b as Anthropic.TextBlock).text)
      .join("");

    let blueprint: z.infer<typeof OutputSchema>["blueprint"];
    try {
      const m = rawText.match(/\{[\s\S]*\}/);
      blueprint = JSON.parse(m ? m[0] : rawText);
    } catch {
      blueprint = {
        titulo: `Automação IA — ${record.client_name}`,
        descricao: rawText.slice(0, 200),
        fases: [{ numero: 1, nome: "Revisão Manual", objetivo: "Análise manual necessária", entregaveis: ["Reunião de alinhamento"], tecnologias: [], duracao_semanas: 1 }],
        integracoes: [],
        kpis: [],
        stack_recomendada: [],
        arquitetura_resumo: rawText.slice(0, 400),
      };
    }

    await sb
      .from("nova_blueprints")
      .update({ blueprint, status: "blueprint", updated_at: new Date().toISOString() })
      .eq("id", input.blueprint_id)
      .eq("tenant_id", input.tenant_id);

    await sb.from("agent_runs").insert({
      tenant_id: input.tenant_id,
      agent_id: "nova",
      trigger_dev_run_id: ctx.run.id,
      status: "completed",
      input: { blueprint_id: input.blueprint_id },
      output: { ok: true, blueprint_id: input.blueprint_id, blueprint },
    });

    await logAgentRun({
      runId: ctx.run.id,
      agentSlug: "nova-blueprint",
      input: { blueprint_id: input.blueprint_id },
      output: { ok: true },
      tenantId: input.tenant_id,
      triggeredBy: input.user_id,
      durationMs: Date.now() - start,
      costUsd,
    });

    return OutputSchema.parse({ ok: true, blueprint_id: input.blueprint_id, blueprint });
  },
});
