import { task } from "@trigger.dev/sdk/v3";
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { getSupabase } from "../_shared/supabase";
import { logAgentRun } from "../_shared/audit";

const InputSchema = z.object({
  tenant_id: z.string().uuid(),
  cobranca_id: z.string().uuid(),
  motivo: z.string().optional(),
  triggered_by: z.string().uuid().optional(),
});

const OutputSchema = z.object({
  ok: z.boolean(),
  escalonado: z.boolean(),
  prioridade: z.enum(["baixa", "media", "alta", "critica"]),
  resumo: z.string(),
  proximos_passos: z.array(z.string()),
  draft_id: z.string().uuid().optional(),
});

export const coraEscalonar = task({
  id: "cora-escalonar",
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
      .select("modo_override")
      .eq("tenant_id", input.tenant_id)
      .eq("agent_id", "cora")
      .maybeSingle();
    const modo = (agentCfg?.modo_override as "humano" | "hibrido" | "ia") ?? "hibrido";

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
      .slice(0, 8)
      .map(a => `- ${new Date(a.created_at).toLocaleDateString("pt-BR")}: ${a.tipo} → ${a.resultado || "sem retorno"}`)
      .join("\n");

    const prompt = `Você é CORA. Prepare um resumo de escalonamento para que um humano (Wandson) possa tomar uma decisão sobre esta cobrança.

**Cliente:** ${cob.customer_name}
**Valor:** R$ ${Number(cob.valor_atual).toFixed(2)}
**Dias em atraso:** ${diasAtraso}
**Motivo do escalonamento:** ${input.motivo || "Sem resposta após múltiplas tentativas"}
**Histórico:**
${acoesCtx || "Nenhuma ação anterior"}
**Análise CORA anterior:** ${cob.cora_analise ? JSON.stringify(cob.cora_analise).slice(0, 200) : "Nenhuma"}

Retorne APENAS JSON:
{
  "prioridade": "baixa|media|alta|critica",
  "resumo": "resumo executivo em 3-4 frases do que aconteceu e por que está sendo escalonado",
  "proximos_passos": ["passo 1 recomendado para o humano", "passo 2", "passo 3"]
}`;

    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 800,
      system: "Você é CORA. Prepare escalonamentos concisos e acionáveis. JSON apenas.",
      messages: [{ role: "user", content: prompt }],
    });

    const rawText = response.content
      .filter((b) => b.type === "text")
      .map((b) => (b as Anthropic.TextBlock).text)
      .join("");

    let parsed: { prioridade: string; resumo: string; proximos_passos: string[] };
    try {
      const m = rawText.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(m ? m[0] : rawText);
    } catch {
      parsed = {
        prioridade: diasAtraso > 30 ? "critica" : "alta",
        resumo: `${cob.customer_name} possui R$ ${Number(cob.valor_atual).toFixed(2)} em aberto há ${diasAtraso} dias sem resposta às tentativas de cobrança.`,
        proximos_passos: ["Tentar contato telefônico direto", "Negociar parcelamento", "Considerar medidas formais"],
      };
    }

    const prioridade = parsed.prioridade as z.infer<typeof OutputSchema>["prioridade"];

    // Atualiza status da cobrança
    await sb
      .from("cora_cobrancas")
      .update({ status: "escalonado", updated_at: new Date().toISOString() })
      .eq("id", input.cobranca_id)
      .eq("tenant_id", input.tenant_id);

    // Cria draft para Wandson — colunas corretas conforme schema real de agent_drafts
    const { data: draft } = await sb.from("agent_drafts").insert({
      tenant_id:      input.tenant_id,
      agent_name:     "cora",
      channel:        "whatsapp",
      subject:        `Escalonamento ${prioridade.toUpperCase()} — ${cob.customer_name}`,
      content:        `CORA — Escalonamento ${prioridade.toUpperCase()}\n\n**Cliente:** ${cob.customer_name}\n**Valor:** R$ ${Number(cob.valor_atual).toFixed(2)}\n**Dias em atraso:** ${diasAtraso}\n\n${parsed.resumo}\n\n**Próximos passos sugeridos:**\n${parsed.proximos_passos.map((p: string, i: number) => `${i + 1}. ${p}`).join("\n")}`,
      status:         "pending",
      autonomy_level: modo,
      metadata: {
        cobranca_id:       input.cobranca_id,
        prioridade,
        dias_atraso:       diasAtraso,
        requires_approval: modo !== "ia",
        modo,
      },
    }).select("id").single();

    // Registra ação (V1 + campos V2)
    await sb.from("cora_acoes").insert({
      cobranca_id: input.cobranca_id,
      tenant_id:   input.tenant_id,
      tipo:        "escalonamento",
      acao:        "escalonamento",
      agente:      "cora",
      conteudo:    parsed.resumo,
      cora_analise: { prioridade, proximos_passos: parsed.proximos_passos },
    });

    await sb.from("agent_runs").insert({
      tenant_id:          input.tenant_id,
      agent_id:           "cora",
      trigger_dev_run_id: ctx.run.id,
      status:             "success",
      input:              { cobranca_id: input.cobranca_id, modo },
      output:             { ok: true, prioridade, resumo: parsed.resumo },
      duration_ms:        Date.now() - start,
    });

    await logAgentRun({
      runId: ctx.run.id,
      agentSlug: "cora-escalonar",
      input: { cobranca_id: input.cobranca_id },
      output: { ok: true },
      tenantId: input.tenant_id,
      triggeredBy: input.triggered_by,
      durationMs: Date.now() - start,
    });

    return OutputSchema.parse({
      ok: true,
      escalonado: true,
      prioridade,
      resumo: parsed.resumo,
      proximos_passos: parsed.proximos_passos,
      draft_id: draft?.id,
    });
  },
});
