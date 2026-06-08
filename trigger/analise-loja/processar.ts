import { schedules, logger } from "@trigger.dev/sdk/v3";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { getAnthropic } from "../_shared/claude";
import { getSupabase } from "../_shared/supabase";
import { logAgentRun } from "../_shared/audit";
import { notifyDeli } from "../_shared/notify-deli";

// =====================================================
// AGENTE ANÁLISE DE LOJA — processa a fila (PR plataforma completa)
// Cron 5min: analise_loja 'pendente' → lê radar_metricas da loja/tenant
// → diagnóstico (claude-sonnet-4-6) → grava resultado. Custo no log.
// NUNCA envia a cliente — resultado interno (tela + feed DELI).
// =====================================================

const DiagnosticoSchema = z.object({
  resumo: z.string(),
  prioridades: z.array(z.object({ titulo: z.string(), porque: z.string(), acao: z.string() })).min(1),
  plano: z.array(z.string()),
  pontos_fortes: z.array(z.string()),
});

export const analiseLojaProcessar = schedules.task({
  id: "analise-loja-processar",
  cron: "*/5 * * * *",
  run: async (_p, { ctx }) => {
    const sb = getSupabase();
    const { data: fila, error } = await sb
      .from("analise_loja")
      .select("id, tenant_id, loja_id, solicitado_por")
      .eq("status", "pendente")
      .limit(5);
    if (error) throw new Error(`analise-loja fila: ${error.message}`);
    if (!fila?.length) return { ok: true, processadas: 0 };

    let processadas = 0;
    for (const a of fila) {
      const t0 = Date.now();
      try {
        // métricas mais recentes do tenant (e da loja, se houver loja_id)
        let q = sb.from("radar_metricas").select("metrica, valor, valor_texto, created_at, loja_id")
          .eq("tenant_id", a.tenant_id).order("created_at", { ascending: false }).limit(400);
        const { data: mets } = await q;
        const filtradas = a.loja_id ? (mets ?? []).filter(m => !m.loja_id || m.loja_id === a.loja_id) : (mets ?? []);
        const mapa: Record<string, any> = {};
        for (const r of filtradas) { if (!mapa[r.metrica]) mapa[r.metrica] = r; }

        let loja_nome = "a loja";
        if (a.loja_id) {
          const { data: loja } = await sb.from("lojas").select("nome").eq("id", a.loja_id).maybeSingle();
          if (loja?.nome) loja_nome = loja.nome;
        }

        const fatos = Object.entries(mapa).map(([k, v]) => `${k}: ${v.valor ?? v.valor_texto ?? ""}`).join("\n");
        if (!fatos) {
          await sb.from("analise_loja").update({ status: "erro", erro_detalhe: "sem métricas importadas para esta loja/tenant", processado_em: new Date().toISOString() }).eq("id", a.id);
          continue;
        }

        const client = getAnthropic();
        const resp = await client.messages.create({
          model: "claude-sonnet-4-6",
          max_tokens: 1800,
          system: "Voce e o agente ANALISE DE LOJA da Consult Delivery, consultor senior de performance em delivery (iFood). A partir das metricas reais da loja, entregue um diagnostico acionavel. Portugues do Brasil, profissional, direto, ZERO emoji. Use 'oferta' nunca 'promocao'. Responda APENAS JSON: {\"resumo\":\"2-3 frases\",\"prioridades\":[{\"titulo\":\"\",\"porque\":\"\",\"acao\":\"\"}],\"plano\":[\"passo 1\",\"...\"],\"pontos_fortes\":[\"\"]}",
          messages: [{ role: "user", content: `Loja: ${loja_nome}\nMetricas do periodo:\n${fatos}` }],
        });
        const texto = resp.content.filter(b => b.type === "text").map(b => (b as Anthropic.TextBlock).text).join("");
        const diag = DiagnosticoSchema.parse(JSON.parse(texto.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim()));
        const custoUsd = (resp.usage.input_tokens / 1e6) * 3 + (resp.usage.output_tokens / 1e6) * 15;

        await sb.from("analise_loja").update({
          status: "processado", diagnostico: diag, custo_usd: custoUsd, processado_em: new Date().toISOString(),
        }).eq("id", a.id);

        await logAgentRun({
          runId: ctx.run.id + ":" + a.id, agentSlug: "analise-loja",
          input: { loja_id: a.loja_id ?? null }, output: { resumo: diag.resumo, prioridades: diag.prioridades.length },
          tenantId: a.tenant_id, triggeredBy: a.solicitado_por ?? undefined,
          durationMs: Date.now() - t0, costUsd: custoUsd, status: "success",
        });
        await notifyDeli({
          tenantId: a.tenant_id,
          content: `ANALISE DE LOJA (${loja_nome}): ${diag.resumo}`,
          sourceAgent: "analise-loja", sourceTask: "analise-loja-processar", runId: ctx.run.id,
        });
        processadas++;
      } catch (err) {
        await sb.from("analise_loja").update({ status: "erro", erro_detalhe: (err as Error).message.slice(0, 500), processado_em: new Date().toISOString() }).eq("id", a.id);
        logger.error("analise-loja erro", { id: a.id, erro: (err as Error).message });
      }
    }
    return { ok: true, processadas };
  },
});
