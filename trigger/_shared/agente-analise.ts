import Anthropic from "@anthropic-ai/sdk";
import { getAnthropic } from "./claude";
import { getSupabase } from "./supabase";
import { logAgentRun } from "./audit";
import { notifyDeli } from "./notify-deli";

// =====================================================
// Helper compartilhado dos agentes de análise (Cardápio, Multicanal).
// Padrão fila: agente_analises 'pendente' → lê radar_metricas →
// IA (sonnet-4-6) → resultado { resumo, itens[], destaque } → grava.
// =====================================================

export async function processarFila(opts: {
  agente: string;
  runId: string;
  systemPrompt: string;
  metricasFiltro?: (k: string) => boolean;
}) {
  const sb = getSupabase();
  const { data: fila, error } = await sb
    .from("agente_analises")
    .select("id, tenant_id, loja_id, solicitado_por")
    .eq("agente", opts.agente)
    .eq("status", "pendente")
    .limit(5);
  if (error) throw new Error(`${opts.agente} fila: ${error.message}`);
  if (!fila?.length) return { ok: true, processadas: 0 };

  let processadas = 0;
  for (const a of fila) {
    const t0 = Date.now();
    try {
      const { data: mets } = await sb.from("radar_metricas")
        .select("metrica, valor, valor_texto, created_at, loja_id")
        .eq("tenant_id", a.tenant_id).order("created_at", { ascending: false }).limit(400);
      const filtradas = a.loja_id ? (mets ?? []).filter(m => !m.loja_id || m.loja_id === a.loja_id) : (mets ?? []);
      const mapa: Record<string, any> = {};
      for (const r of filtradas) { if (!mapa[r.metrica]) mapa[r.metrica] = r; }
      const entradas = Object.entries(mapa).filter(([k]) => !opts.metricasFiltro || opts.metricasFiltro(k));
      const fatos = entradas.map(([k, v]) => `${k}: ${v.valor ?? v.valor_texto ?? ""}`).join("\n");
      if (!fatos) {
        await sb.from("agente_analises").update({ status: "erro", erro_detalhe: "sem métricas importadas", processado_em: new Date().toISOString() }).eq("id", a.id);
        continue;
      }
      const client = getAnthropic();
      const resp = await client.messages.create({
        model: "claude-sonnet-4-6", max_tokens: 1600, system: opts.systemPrompt,
        messages: [{ role: "user", content: `Métricas:\n${fatos}` }],
      });
      const texto = resp.content.filter(b => b.type === "text").map(b => (b as Anthropic.TextBlock).text).join("");
      const resultado = JSON.parse(texto.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim());
      const custoUsd = (resp.usage.input_tokens / 1e6) * 3 + (resp.usage.output_tokens / 1e6) * 15;
      await sb.from("agente_analises").update({ status: "processado", resultado, custo_usd: custoUsd, processado_em: new Date().toISOString() }).eq("id", a.id);
      await logAgentRun({ runId: opts.runId + ":" + a.id, agentSlug: opts.agente, input: { loja_id: a.loja_id ?? null }, output: { resumo: resultado.resumo }, tenantId: a.tenant_id, triggeredBy: a.solicitado_por ?? undefined, durationMs: Date.now() - t0, costUsd: custoUsd, status: "success" });
      await notifyDeli({ tenantId: a.tenant_id, content: `${opts.agente.toUpperCase()}: ${resultado.resumo ?? "análise pronta"}`, sourceAgent: opts.agente, sourceTask: `${opts.agente}-processar`, runId: opts.runId });
      processadas++;
    } catch (err) {
      await sb.from("agente_analises").update({ status: "erro", erro_detalhe: (err as Error).message.slice(0, 500), processado_em: new Date().toISOString() }).eq("id", a.id);
    }
  }
  return { ok: true, processadas };
}
