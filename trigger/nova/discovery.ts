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
  client_name: z.string().min(1),
  segmento: z.string().optional(),
  problema: z.string().min(10),
  objetivo: z.string().optional(),
  sistemas_atuais: z.array(z.string()).default([]),
  budget_range: z.enum(["ate-500", "500-2000", "2000-5000", "acima-5000"]).optional(),
  prazo_desejado: z.enum(["urgente", "1-mes", "2-3-meses", "flexivel"]).optional(),
  blueprint_id: z.string().uuid().optional(),
});

const OutputSchema = z.object({
  ok: z.boolean(),
  blueprint_id: z.string().uuid(),
  discovery: z.object({
    resumo_problema: z.string(),
    impacto_atual: z.string(),
    raiz_causa: z.array(z.string()),
    oportunidades_ia: z.array(z.object({
      area: z.string(),
      descricao: z.string(),
      potencial: z.enum(["alto", "medio", "baixo"]),
    })),
    dados_necessarios: z.array(z.string()),
    riscos: z.array(z.string()),
    recomendacao_geral: z.string(),
  }),
});

export const novaDiscovery = task({
  id: "nova-discovery",
  retry: { maxAttempts: 2 },
  run: async (payload: unknown, { ctx }) => {
    const start = Date.now();
    const input = InputSchema.parse(payload);
    const sb = getSupabase();

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

    const userPrompt = `Faça uma análise de discovery completa para o seguinte cliente:

**Cliente:** ${input.client_name}
**Segmento:** ${input.segmento || "Delivery / Food Service"}
**Problema reportado:** ${input.problema}
**Objetivo desejado:** ${input.objetivo || "Não especificado"}
**Sistemas atuais:** ${input.sistemas_atuais.join(", ") || "Nenhum"}
${input.budget_range ? `**Budget:** ${budgetLabel[input.budget_range]}` : ""}
${input.prazo_desejado ? `**Prazo:** ${prazoLabel[input.prazo_desejado]}` : ""}

Retorne APENAS um JSON válido com esta estrutura:
{
  "resumo_problema": "resumo executivo em 2-3 frases",
  "impacto_atual": "impacto no negócio (tempo, custo, oportunidades perdidas)",
  "raiz_causa": ["causa 1", "causa 2", "causa 3"],
  "oportunidades_ia": [
    { "area": "área", "descricao": "como IA pode ajudar", "potencial": "alto|medio|baixo" }
  ],
  "dados_necessarios": ["dado 1", "dado 2"],
  "riscos": ["risco 1", "risco 2"],
  "recomendacao_geral": "recomendação geral em 1-2 parágrafos"
}`;

    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2000,
      system: "Você é NOVA, consultora de automação com IA para PMEs de delivery/food service no Brasil. Responda SEMPRE em JSON válido, sem markdown, sem texto extra.",
      messages: [{ role: "user", content: userPrompt }],
    });

    const costUsd = calcularCustoUsd("claude-haiku-4-5-20251001", response.usage);

    const rawText = response.content
      .filter((b) => b.type === "text")
      .map((b) => (b as Anthropic.TextBlock).text)
      .join("");

    let discovery: z.infer<typeof OutputSchema>["discovery"];
    try {
      const m = rawText.match(/\{[\s\S]*\}/);
      discovery = JSON.parse(m ? m[0] : rawText);
    } catch {
      discovery = {
        resumo_problema: input.problema,
        impacto_atual: "Análise manual necessária",
        raiz_causa: ["Dados insuficientes para análise automática"],
        oportunidades_ia: [{ area: "Geral", descricao: rawText.slice(0, 200), potencial: "medio" as const }],
        dados_necessarios: ["Reunião de alinhamento"],
        riscos: ["Dados insuficientes"],
        recomendacao_geral: rawText.slice(0, 400),
      };
    }

    let blueprintId = input.blueprint_id;

    if (!blueprintId) {
      const { data, error } = await sb
        .from("nova_blueprints")
        .insert({
          tenant_id: input.tenant_id,
          user_id: input.user_id,
          client_name: input.client_name,
          segmento: input.segmento,
          problema: input.problema,
          objetivo: input.objetivo,
          sistemas_atuais: input.sistemas_atuais,
          budget_range: input.budget_range,
          prazo_desejado: input.prazo_desejado,
          discovery,
          status: "discovery",
        })
        .select("id")
        .single();

      if (error || !data) throw new Error(`Erro ao criar blueprint: ${error?.message}`);
      blueprintId = data.id;
    } else {
      await sb
        .from("nova_blueprints")
        .update({ discovery, updated_at: new Date().toISOString() })
        .eq("id", blueprintId)
        .eq("tenant_id", input.tenant_id);
    }

    await sb.from("agent_runs").insert({
      tenant_id: input.tenant_id,
      agent_id: "nova",
      trigger_dev_run_id: ctx.run.id,
      status: "completed",
      input: { blueprint_id: blueprintId, client_name: input.client_name },
      output: { ok: true, blueprint_id: blueprintId, discovery },
    });

    await logAgentRun({
      runId: ctx.run.id,
      agentSlug: "nova-discovery",
      input: { blueprint_id: blueprintId, client_name: input.client_name },
      output: { ok: true },
      tenantId: input.tenant_id,
      triggeredBy: input.user_id,
      durationMs: Date.now() - start,
      costUsd,
    });

    return OutputSchema.parse({ ok: true, blueprint_id: blueprintId, discovery });
  },
});
