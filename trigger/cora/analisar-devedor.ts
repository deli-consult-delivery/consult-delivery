import { task } from "@trigger.dev/sdk/v3";
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { getSupabase } from "../_shared/supabase";
import { logAgentRun } from "../_shared/audit";

const InputSchema = z.object({
  tenant_id: z.string().uuid(),
  cobranca_id: z.string().uuid(),
  triggered_by: z.string().uuid().optional(),
});

const OutputSchema = z.object({
  ok: z.boolean(),
  analise: z.object({
    perfil_cliente: z.string(),
    nivel_risco: z.enum(["baixo", "medio", "alto", "critico"]),
    probabilidade_pagamento: z.number().min(0).max(100),
    estrategia_recomendada: z.string(),
    tom_recomendado: z.enum(["amigavel", "neutro", "formal", "urgente"]),
    melhor_horario: z.string(),
    canal_preferido: z.enum(["whatsapp", "ligacao", "email", "todos"]),
    proxima_acao: z.string(),
    justificativa: z.string(),
  }),
});

export const coraAnalisarDevedor = task({
  id: "cora-analisar-devedor",
  retry: { maxAttempts: 2 },
  run: async (payload: unknown, { ctx }) => {
    const start = Date.now();
    const input = InputSchema.parse(payload);
    const sb = getSupabase();

    // Instanciado dentro do run() para evitar throw no topo de módulo (anti-padrão #4)
    const anthropic = new Anthropic();

    // Lê modo do tenant em tenant_agent_config
    const { data: agentCfg } = await sb
      .from("tenant_agent_config")
      .select("mode")
      .eq("tenant_id", input.tenant_id)
      .eq("agent_id", "cora")
      .maybeSingle();
    const modo = (agentCfg?.mode as "humano" | "hibrido" | "ia") ?? "hibrido";

    const { data: cob, error } = await sb
      .from("cora_cobrancas")
      .select("*, cora_acoes(tipo, conteudo, resultado, created_at)")
      .eq("id", input.cobranca_id)
      .eq("tenant_id", input.tenant_id)
      .order("created_at", { referencedTable: "cora_acoes", ascending: false })
      .single();

    if (error || !cob) throw new Error(`Cobrança não encontrada: ${input.cobranca_id}`);

    const diasAtraso = Math.max(0, Math.floor(
      (Date.now() - new Date(cob.data_vencimento).getTime()) / 86400000
    ));

    const acoesCtx = (cob.cora_acoes as { tipo: string; conteudo: string; resultado: string; created_at: string }[] || [])
      .slice(0, 10)
      .map(a => `- ${a.tipo}: ${a.conteudo?.slice(0, 80)} → resultado: ${a.resultado || "não registrado"}`)
      .join("\n");

    const prompt = `Você é CORA, especialista em cobrança amigável para PMEs de delivery/food service no Brasil.

Analise a situação desta cobrança e recomende a melhor estratégia:

**Cliente:** ${cob.customer_name}
**Valor:** R$ ${Number(cob.valor_atual).toFixed(2)}
**Dias em atraso:** ${diasAtraso} dias (vencimento: ${cob.data_vencimento})
**Status atual:** ${cob.status}
**Histórico de ações CORA:**
${acoesCtx || "Nenhuma ação anterior"}

Retorne APENAS JSON válido:
{
  "perfil_cliente": "perfil deduzido em 1-2 frases",
  "nivel_risco": "baixo|medio|alto|critico",
  "probabilidade_pagamento": 75,
  "estrategia_recomendada": "descrição da estratégia em 2-3 frases",
  "tom_recomendado": "amigavel|neutro|formal|urgente",
  "melhor_horario": "ex: 10h-11h ou 19h-20h",
  "canal_preferido": "whatsapp|ligacao|email|todos",
  "proxima_acao": "ação específica e imediata a tomar",
  "justificativa": "por que esta estratégia (1 parágrafo)"
}

Regras:
- 1-7 dias: tom amigável sempre
- 8-20 dias: neutro a formal
- 21-30 dias: formal a urgente
- 30+ dias: urgente + escalonamento
- Nunca recomendar constrangimento ou ameaça legal sem motivo sério`;

    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1200,
      system: "Você é CORA, especialista em cobrança amigável para delivery/food service. Responda SEMPRE em JSON válido, sem markdown.",
      messages: [{ role: "user", content: prompt }],
    });

    const rawText = response.content
      .filter((b) => b.type === "text")
      .map((b) => (b as Anthropic.TextBlock).text)
      .join("");

    let analise: z.infer<typeof OutputSchema>["analise"];
    try {
      const m = rawText.match(/\{[\s\S]*\}/);
      analise = JSON.parse(m ? m[0] : rawText);
    } catch {
      analise = {
        perfil_cliente: "Perfil não determinado",
        nivel_risco: diasAtraso > 30 ? "critico" : diasAtraso > 15 ? "alto" : "medio",
        probabilidade_pagamento: Math.max(10, 80 - diasAtraso * 2),
        estrategia_recomendada: "Abordagem padrão",
        tom_recomendado: diasAtraso > 20 ? "urgente" : "amigavel",
        melhor_horario: "10h-11h",
        canal_preferido: "whatsapp",
        proxima_acao: "Enviar lembrete amigável",
        justificativa: "Análise automática indisponível",
      };
    }

    // Salva análise na cobrança
    await sb
      .from("cora_cobrancas")
      .update({ cora_analise: analise, updated_at: new Date().toISOString() })
      .eq("id", input.cobranca_id)
      .eq("tenant_id", input.tenant_id);

    // Registra ação (V1 + campos V2)
    await sb.from("cora_acoes").insert({
      cobranca_id: input.cobranca_id,
      tenant_id: input.tenant_id,
      tipo: "analise_ia",
      acao: "analise_ia",
      agente: "cora",
      cora_analise: analise,
      conteudo: analise.proxima_acao,
    });

    await sb.from("agent_runs").insert({
      tenant_id: input.tenant_id,
      agent_id: "cora",
      trigger_dev_run_id: ctx.run.id,
      status: "success",
      input: { cobranca_id: input.cobranca_id, modo },
      output: { ok: true, analise },
      duration_ms: Date.now() - start,
    });

    await logAgentRun({
      runId: ctx.run.id,
      agentSlug: "cora-analisar-devedor",
      input: { cobranca_id: input.cobranca_id },
      output: { ok: true },
      tenantId: input.tenant_id,
      triggeredBy: input.triggered_by,
      durationMs: Date.now() - start,
    });

    return OutputSchema.parse({ ok: true, analise });
  },
});
