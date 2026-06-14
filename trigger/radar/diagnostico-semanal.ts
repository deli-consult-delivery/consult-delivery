import { schedules, logger } from "@trigger.dev/sdk/v3";
import Anthropic from "@anthropic-ai/sdk";
import { getAnthropic } from "../_shared/claude";
import { getSupabase } from "../_shared/supabase";
import { logAgentRun } from "../_shared/audit";
import { notify } from "../_shared/notify";
import { notifyDeli } from "../_shared/notify-deli";
import { lerMetricas } from "../_shared/radar-metricas";

// =====================================================
// RADAR — diagnóstico semanal automático (PR12c)
// Cron: segunda 08:00. Para cada tenant COM métricas importadas,
// monta o diagnóstico (números reais do radar_metricas + casos da
// Defesa), pede à IA um resumo curto no Brand Guard e posta no
// sino (internal_notifications) + feed da DELI. Custo no logAgentRun.
// =====================================================

function val(map: Record<string, any>, k: string): number | null {
  return map[k] != null && map[k].valor != null ? Number(map[k].valor) : null;
}
function txt(map: Record<string, any>, k: string): string | null {
  return map[k] != null ? map[k].valor_texto ?? null : null;
}

export const radarDiagnosticoSemanal = schedules.task({
  id: "radar-diagnostico-semanal",
  cron: "0 8 * * 1",
  run: async (_p, { ctx }) => {
    const sb = getSupabase();
    const t0 = Date.now();

    // tenants que têm métricas processadas
    const { data: distintos, error } = await sb
      .from("radar_metricas")
      .select("tenant_id")
      .limit(2000);
    if (error) throw new Error(`radar semanal: ${error.message}`);
    const tenants = [...new Set((distintos ?? []).map(r => r.tenant_id))];
    if (!tenants.length) return { ok: true, tenants: 0 };

    let enviados = 0;
    let custoTotal = 0;

    for (const tenantId of tenants) {
      try {
        // última ocorrência de cada métrica
        const map = await lerMetricas(sb, { tenantId, select: "metrica, valor, valor_texto, created_at" });
        if (!Object.keys(map).length) continue;

        const { data: casos } = await sb
          .from("defesa_casos")
          .select("status, motivo, resultado_valor_centavos")
          .eq("tenant_id", tenantId)
          .limit(500);
        const defendido = (casos ?? []).filter(c => c.status === "ganho").reduce((s, c) => s + (Number(c.resultado_valor_centavos) || 0), 0);
        const atraso = (casos ?? []).filter(c => /atras/i.test(c.motivo || "")).length;

        const taxas = val(map, "conciliacao_taxas");
        const entrada = val(map, "conciliacao_entrada") ?? val(map, "vendas_valor_total");
        const pctTaxas = (taxas != null && entrada) ? Math.round((Math.abs(taxas) / Math.abs(entrada)) * 100) : null;
        const conv = val(map, "funil_conversao_pct");
        const cancQtd = val(map, "cancelamentos_qtd");
        const cancTop = txt(map, "cancelamentos_motivo_top");
        const pedidos = val(map, "vendas_total_pedidos");

        const fatos = [
          entrada != null ? `Faturamento: R$ ${entrada.toFixed(2)}${pedidos != null ? ` (${pedidos} pedidos)` : ""}` : null,
          taxas != null ? `Taxas iFood: R$ ${Math.abs(taxas).toFixed(2)}${pctTaxas != null ? ` (${pctTaxas}% do faturamento)` : ""}` : null,
          conv != null ? `Conversão do cardápio: ${conv}%` : null,
          cancQtd != null ? `Cancelamentos: ${cancQtd}${cancTop ? ` (motivo top: ${cancTop})` : ""}` : null,
          atraso > 0 ? `${atraso} cancelamento(s) por atraso — contestáveis pela Defesa` : null,
          defendido > 0 ? `R$ defendido pela Defesa: R$ ${(defendido / 100).toFixed(2)}` : null,
        ].filter(Boolean).join("\n");

        // resumo curto pela IA (Brand Guard); fallback = os próprios fatos
        let resumo = fatos;
        try {
          const client = getAnthropic();
          const resp = await client.messages.create({
            model: "claude-sonnet-4-6",
            max_tokens: 600,
            system: "Voce e o RADAR da Consult Delivery. A partir dos numeros, escreva um diagnostico semanal curto (ate 4 frases) para o dono da loja: o que mais pesa, o que e contestavel pela Defesa, e a acao mais importante da semana. Portugues do Brasil, profissional, direto, ZERO emoji. Use 'oferta' nunca 'promocao'.",
            messages: [{ role: "user", content: `Numeros da semana:\n${fatos}` }],
          });
          const out = resp.content.filter(b => b.type === "text").map(b => (b as Anthropic.TextBlock).text).join("").trim();
          if (out) resumo = out;
          custoTotal += (resp.usage.input_tokens / 1e6) * 3 + (resp.usage.output_tokens / 1e6) * 15;
        } catch (e) {
          logger.warn("radar semanal: IA falhou, usando fatos crus", { erro: (e as Error).message });
        }

        await notify({
          tenantId,
          kind: "system",
          agent: "radar",
          title: "Radar da semana — diagnóstico da sua loja",
          body: resumo.slice(0, 280),
          link: "radar",
          metadata: { gerado_em: new Date().toISOString() },
        });
        await notifyDeli({
          tenantId,
          content: `RADAR semanal:\n${resumo}`,
          sourceAgent: "radar",
          sourceTask: "radar-diagnostico-semanal",
          runId: ctx.run.id,
        });
        enviados++;
      } catch (err) {
        logger.error("radar semanal: tenant com erro", { tenantId, erro: (err as Error).message });
      }
    }

    await logAgentRun({
      runId: ctx.run.id,
      agentSlug: "radar",
      input: { tenants: tenants.length },
      output: { enviados },
      durationMs: Date.now() - t0,
      costUsd: custoTotal,
      status: "success",
    });

    logger.info("radar semanal concluído", { tenants: tenants.length, enviados, custoUsd: custoTotal });
    return { ok: true, tenants: tenants.length, enviados, custoUsd: custoTotal };
  },
});
