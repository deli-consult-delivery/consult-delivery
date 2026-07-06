import { schedules, logger } from "@trigger.dev/sdk/v3";
import { z } from "zod";
import { getSupabase } from "../_shared/supabase";
import { logAgentRun } from "../_shared/audit";
import { chatWithTools } from "../_shared/llm-tools";

// =====================================================
// SCHEMAS
// =====================================================

const OutputSchema = z.object({
  ok: z.boolean(),
  lojas_processadas: z.number(),
  drafts_criados: z.number(),
  puladas: z.number(),
});

interface MetricaRow {
  data: string;
  faturamento: number | null;
  pedidos: number | null;
  ticket_medio: number | null;
  avaliacao: number | null;
  cancelamentos: number | null;
}

interface AgregadoSemana {
  faturamento: number;
  pedidos: number;
  ticketMedio: number | null;
  avaliacaoMedia: number | null;
  cancelamentos: number;
}

// =====================================================
// HELPERS — janela de datas (seg-dom) e agregação
// =====================================================

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Assume que a task roda numa segunda-feira (cron '0 9 * * 1'). Calcula:
 * - semana anterior: segunda a domingo que terminou ontem
 * - semana retrasada: os 7 dias antes disso
 */
function calcularJanelas(hoje: Date) {
  const domingoAnterior = new Date(hoje);
  domingoAnterior.setUTCDate(hoje.getUTCDate() - 1);
  const segundaAnterior = new Date(domingoAnterior);
  segundaAnterior.setUTCDate(domingoAnterior.getUTCDate() - 6);

  const domingoRetrasada = new Date(segundaAnterior);
  domingoRetrasada.setUTCDate(segundaAnterior.getUTCDate() - 1);
  const segundaRetrasada = new Date(domingoRetrasada);
  segundaRetrasada.setUTCDate(domingoRetrasada.getUTCDate() - 6);

  return {
    atual: { inicio: toISODate(segundaAnterior), fim: toISODate(domingoAnterior) },
    anterior: { inicio: toISODate(segundaRetrasada), fim: toISODate(domingoRetrasada) },
  };
}

function agregarSemana(rows: MetricaRow[]): AgregadoSemana {
  const faturamento = rows.reduce((s, r) => s + (r.faturamento ?? 0), 0);
  const pedidos = rows.reduce((s, r) => s + (r.pedidos ?? 0), 0);
  const cancelamentos = rows.reduce((s, r) => s + (r.cancelamentos ?? 0), 0);

  const ticketVals = rows.map((r) => r.ticket_medio).filter((v): v is number => v != null);
  const ticketMedio = ticketVals.length
    ? Number((ticketVals.reduce((s, v) => s + v, 0) / ticketVals.length).toFixed(2))
    : null;

  const avaliacaoVals = rows.map((r) => r.avaliacao).filter((v): v is number => v != null);
  const avaliacaoMedia = avaliacaoVals.length
    ? Number((avaliacaoVals.reduce((s, v) => s + v, 0) / avaliacaoVals.length).toFixed(2))
    : null;

  return { faturamento, pedidos, ticketMedio, avaliacaoMedia, cancelamentos };
}

function variacaoPct(atual: number, anterior: number): number | null {
  if (anterior <= 0) return null;
  return Number((((atual - anterior) / anterior) * 100).toFixed(1));
}

// =====================================================
// TASK — cron segunda 08h de Brasília (decisão 2026-07-03)
// =====================================================

export const gestorRelatorioSemanal = schedules.task({
  id: "gestor-relatorio-semanal",
  cron: {
    pattern: "0 8 * * 1",
    timezone: "America/Sao_Paulo",
  },
  retry: { maxAttempts: 2, minTimeoutInMs: 2000 },

  run: async (_payload, { ctx }) => {
    const sb = getSupabase();
    const startedAt = Date.now();
    const janelas = calcularJanelas(new Date());

    logger.info("gestor-relatorio-semanal: buscando lojas com consultoria ativa", { janelas });

    const { data: lojas, error: lojasError } = await sb
      .from("lojas")
      .select("id, tenant_id, nome, whatsapp_group_jid")
      .eq("is_consultoria_ativa", true);

    if (lojasError) {
      throw new Error(`gestor-relatorio-semanal: falha ao buscar lojas: ${lojasError.message}`);
    }

    let lojasProcessadas = 0;
    let draftsCriados = 0;
    let puladas = 0;

    for (const loja of lojas ?? []) {
      lojasProcessadas++;

      const { data: metricasAtual, error: errAtual } = await sb
        .from("loja_metricas")
        .select("data, faturamento, pedidos, ticket_medio, avaliacao, cancelamentos")
        .eq("loja_id", loja.id)
        .gte("data", janelas.atual.inicio)
        .lte("data", janelas.atual.fim);

      if (errAtual) {
        logger.warn("gestor-relatorio-semanal: falha ao buscar métricas, pulando loja", {
          loja_id: loja.id,
          error: errAtual.message,
        });
        puladas++;
        continue;
      }

      if (!metricasAtual || metricasAtual.length === 0) {
        // Loja sem nenhuma métrica na semana → coleta ainda não ativa. Pula silenciosamente.
        puladas++;
        continue;
      }

      const { data: metricasAnterior } = await sb
        .from("loja_metricas")
        .select("data, faturamento, pedidos, ticket_medio, avaliacao, cancelamentos")
        .eq("loja_id", loja.id)
        .gte("data", janelas.anterior.inicio)
        .lte("data", janelas.anterior.fim);

      const semanaAtual = agregarSemana(metricasAtual as MetricaRow[]);
      const semanaAnterior = agregarSemana((metricasAnterior as MetricaRow[]) ?? []);

      const stats = {
        faturamento: {
          atual: semanaAtual.faturamento,
          variacao_pct: variacaoPct(semanaAtual.faturamento, semanaAnterior.faturamento),
        },
        pedidos: {
          atual: semanaAtual.pedidos,
          variacao_pct: variacaoPct(semanaAtual.pedidos, semanaAnterior.pedidos),
        },
        ticket_medio: { atual: semanaAtual.ticketMedio },
        avaliacao_media: { atual: semanaAtual.avaliacaoMedia },
        cancelamentos: {
          atual: semanaAtual.cancelamentos,
          variacao_pct: variacaoPct(semanaAtual.cancelamentos, semanaAnterior.cancelamentos),
        },
      };

      let texto: string;
      try {
        const { message } = await chatWithTools({
          system:
            "Você é o GESTOR, consultor de operação iFood da Consult Delivery. Gera relatórios semanais curtos para " +
            "o grupo de WhatsApp da loja: tom consultivo, português brasileiro, direto ao ponto. Para cada métrica, " +
            "cite o número da semana e a variação percentual vs a semana anterior quando disponível. Feche com 1 a " +
            "2 recomendações práticas e específicas. Sem markdown pesado — é WhatsApp.",
          messages: [
            {
              role: "user",
              content:
                `Loja: ${loja.nome}\n` +
                `Semana atual: ${janelas.atual.inicio} a ${janelas.atual.fim}\n` +
                `Semana anterior: ${janelas.anterior.inicio} a ${janelas.anterior.fim}\n\n` +
                `Métricas (JSON):\n${JSON.stringify(stats, null, 2)}`,
            },
          ],
          tools: [],
          maxTokens: 700,
        });
        texto = (message.content ?? "").trim();
      } catch (err) {
        logger.warn("gestor-relatorio-semanal: LLM falhou, pulando loja", {
          loja_id: loja.id,
          error: (err as Error).message,
        });
        puladas++;
        continue;
      }

      if (!texto) {
        puladas++;
        continue;
      }

      const { error: draftError } = await sb.from("agent_drafts").insert({
        tenant_id: loja.tenant_id,
        agent_name: "gestor",
        origin: "gestor-relatorio-semanal",
        channel: "whatsapp",
        loja_id: loja.id,
        target_id: loja.whatsapp_group_jid ?? null,
        subject: `Relatório semanal — ${loja.nome}`,
        content: texto,
        reasoning: "Relatório semanal automático comparando semana atual vs anterior (loja_metricas).",
        status: "pending",
        autonomy_level: "amarelo",
        metadata: {
          periodo_atual: janelas.atual,
          periodo_anterior: janelas.anterior,
          stats,
          whatsapp_group_jid: loja.whatsapp_group_jid ?? null,
        },
      });

      if (draftError) {
        logger.warn("gestor-relatorio-semanal: falha ao criar draft", {
          loja_id: loja.id,
          error: draftError.message,
        });
        puladas++;
        continue;
      }

      draftsCriados++;
    }

    const output = OutputSchema.parse({
      ok: true,
      lojas_processadas: lojasProcessadas,
      drafts_criados: draftsCriados,
      puladas,
    });

    logger.info("gestor-relatorio-semanal concluído", output);

    await logAgentRun({
      runId: ctx.run.id,
      agentSlug: "gestor",
      input: { janelas },
      output,
      durationMs: Date.now() - startedAt,
    });

    return output;
  },
});
