import { schedules, logger } from "@trigger.dev/sdk/v3";
import { z } from "zod";
import { getSupabase } from "../_shared/supabase";
import { logAgentRun } from "../_shared/audit";
import { notifyTelegram } from "../_shared/telegram";
import { logTimeline } from "../../src/agents/shared/runtime";

// =====================================================
// SCHEMAS
// =====================================================

const OutputSchema = z.object({
  ok: z.boolean(),
  skipped: z.boolean().optional(),
  motivo: z.string().optional(),
  lojas_processadas: z.number().optional(),
  lojas_puladas: z.number().optional(),
});

// Formato esperado do stdout do runner metricas (trigger/gestor F2, ainda não implementado).
const MetricasPortalSchema = z.object({
  faturamento: z.number().optional(),
  pedidos: z.number().optional(),
  ticket_medio: z.number().optional(),
  avaliacao: z.number().optional(),
  cancelamentos: z.number().optional(),
  loja_pausada: z.boolean().optional(),
  desconto_medio: z.number().optional(),
});

interface LojaAlvo {
  id: string;
  tenant_id: string;
  nome: string;
  ifood_portal_nome: string;
}

// =====================================================
// TASK — cron diário 06h UTC (03h Belém)
// =====================================================
//
// GESTOR_COLETA_ATIVA: trava explícita (env var do Trigger.dev). A coleta via portal
// depende do runner run-metricas.js (F2, ainda não existe) + deploy do probe supervisionado
// na VPS. Enquanto a trava estiver off, a task sai no primeiro if — sem tentar Bridge,
// sem cron falhando toda madrugada. Ativar via env var quando o probe for aprovado.

export const gestorColetaDiaria = schedules.task({
  id: "gestor-coleta-diaria",
  cron: "0 6 * * *",
  retry: { maxAttempts: 2, minTimeoutInMs: 2000 },

  run: async (_payload, { ctx }) => {
    if (process.env.GESTOR_COLETA_ATIVA !== "true") {
      const output = OutputSchema.parse({
        ok: true,
        skipped: true,
        motivo: "GESTOR_COLETA_ATIVA off (aguardando probe do portal)",
      });
      logger.info("gestor-coleta-diaria: pulado (trava off)", output);
      return output;
    }

    const sb = getSupabase();
    const startedAt = Date.now();
    const bridgeUrl = process.env.BRIDGE_URL;
    const bridgeToken = process.env.INTERNAL_BRIDGE_TOKEN;
    if (!bridgeUrl || !bridgeToken) {
      throw new Error("gestor-coleta-diaria: BRIDGE_URL/INTERNAL_BRIDGE_TOKEN não configurados");
    }

    const { data: lojasData, error: lojasError } = await sb
      .from("lojas")
      .select("id, tenant_id, nome, ifood_portal_nome")
      .eq("is_consultoria_ativa", true)
      .not("ifood_portal_nome", "is", null);

    if (lojasError) {
      throw new Error(`gestor-coleta-diaria: falha ao buscar lojas: ${lojasError.message}`);
    }

    const lojas = (lojasData ?? []) as LojaAlvo[];
    const hoje = new Date().toISOString().slice(0, 10);

    let lojasProcessadas = 0;
    let lojasPuladas = 0;

    for (const loja of lojas) {
      try {
        const resultado = await coletarLoja(loja, hoje, bridgeUrl, bridgeToken);

        if (resultado.sessaoExpirada) {
          await notifyTelegram("⚠️ Sessão do portal iFood expirou — relogin 2FA no viewer");
          logger.error("gestor-coleta-diaria: sessão do portal expirou, abortando lojas restantes", {
            loja_id: loja.id,
          });
          break;
        }

        if (!resultado.ok) {
          lojasPuladas++;
          continue;
        }

        lojasProcessadas++;

        await sb.from("loja_metricas").upsert(
          {
            loja_id: loja.id,
            tenant_id: loja.tenant_id,
            data: hoje,
            fonte: "portal_ifood",
            faturamento: resultado.metricas.faturamento ?? null,
            pedidos: resultado.metricas.pedidos ?? null,
            ticket_medio: resultado.metricas.ticket_medio ?? null,
            avaliacao: resultado.metricas.avaliacao ?? null,
            cancelamentos: resultado.metricas.cancelamentos ?? null,
            raw_data: resultado.metricas,
          },
          { onConflict: "loja_id,data,fonte" }
        );

        await logTimeline(loja.id, loja.tenant_id, "gestor", "coleta_metricas_portal", "Coleta diária de métricas do portal iFood", {
          description: `Coleta automática — ${hoje}`,
          payload: resultado.metricas,
        });

        await verificarAlertas(sb, loja, resultado.metricas);
      } catch (err) {
        logger.warn("gestor-coleta-diaria: erro ao coletar loja, pulando", {
          loja_id: loja.id,
          error: (err as Error).message,
        });
        lojasPuladas++;
      }
    }

    const output = OutputSchema.parse({
      ok: true,
      lojas_processadas: lojasProcessadas,
      lojas_puladas: lojasPuladas,
    });

    logger.info("gestor-coleta-diaria concluído", output);

    await logAgentRun({
      runId: ctx.run.id,
      agentSlug: "gestor",
      input: { hoje, total_lojas: lojas.length },
      output,
      durationMs: Date.now() - startedAt,
    });

    return output;
  },
});

// =====================================================
// HELPERS (esqueleto — completar quando o runner run-metricas.js existir, F2)
// =====================================================

interface ColetaResultado {
  ok: boolean;
  sessaoExpirada: boolean;
  metricas: z.infer<typeof MetricasPortalSchema>;
}

/**
 * POST ${BRIDGE_URL}/api/portal-worker/run {runner:'metricas', loja: ifood_portal_nome}.
 * 409 (runner ocupado) → espera 30s, tenta 1x de novo, senão pula a loja.
 * stdout com 'deslogada'/'login' → sinaliza sessão expirada (chamador aborta as lojas restantes).
 */
async function coletarLoja(
  loja: LojaAlvo,
  _dataRef: string,
  bridgeUrl: string,
  bridgeToken: string
): Promise<ColetaResultado> {
  const chamar = () =>
    fetch(`${bridgeUrl.replace(/\/+$/, "")}/api/portal-worker/run`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-internal-token": bridgeToken },
      body: JSON.stringify({ runner: "metricas", loja: loja.ifood_portal_nome }),
      signal: AbortSignal.timeout(120_000),
    });

  let res = await chamar();

  if (res.status === 409) {
    logger.warn("gestor-coleta-diaria: runner ocupado (409), aguardando 30s", { loja_id: loja.id });
    await new Promise((resolve) => setTimeout(resolve, 30_000));
    res = await chamar();
    if (res.status === 409) {
      logger.warn("gestor-coleta-diaria: runner ainda ocupado após retry, pulando loja", {
        loja_id: loja.id,
      });
      return { ok: false, sessaoExpirada: false, metricas: {} };
    }
  }

  const stdout = await res.text();

  if (/deslogada|login/i.test(stdout)) {
    return { ok: false, sessaoExpirada: true, metricas: {} };
  }

  if (!res.ok) {
    logger.warn("gestor-coleta-diaria: Bridge respondeu erro", {
      loja_id: loja.id,
      status: res.status,
      body: stdout.slice(0, 300),
    });
    return { ok: false, sessaoExpirada: false, metricas: {} };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    logger.warn("gestor-coleta-diaria: stdout não é JSON válido", {
      loja_id: loja.id,
      stdout: stdout.slice(0, 300),
    });
    return { ok: false, sessaoExpirada: false, metricas: {} };
  }

  const metricas = MetricasPortalSchema.parse(parsed);
  return { ok: true, sessaoExpirada: false, metricas };
}

/**
 * Compara a coleta do dia com o histórico (7/28d) de loja_metricas e dispara
 * alertas via Telegram quando algum limiar é cruzado. Cada alerta é 1 msg curta
 * com loja + números.
 */
async function verificarAlertas(
  sb: ReturnType<typeof getSupabase>,
  loja: LojaAlvo,
  metricas: z.infer<typeof MetricasPortalSchema>
): Promise<void> {
  const desde28d = new Date();
  desde28d.setUTCDate(desde28d.getUTCDate() - 28);

  const { data: historico } = await sb
    .from("loja_metricas")
    .select("data, faturamento, pedidos, avaliacao, cancelamentos")
    .eq("loja_id", loja.id)
    .eq("fonte", "portal_ifood")
    .gte("data", desde28d.toISOString().slice(0, 10))
    .order("data", { ascending: false });

  const hist = historico ?? [];
  const alertas: string[] = [];

  // Avaliação caiu ≥0.2 vs a coleta anterior, ou ≤3★ no dia
  const avaliacaoAnterior = hist.find((h) => h.avaliacao != null)?.avaliacao ?? null;
  if (metricas.avaliacao != null) {
    if (metricas.avaliacao <= 3) {
      alertas.push(`⭐ avaliação em ${metricas.avaliacao.toFixed(1)} (≤3★)`);
    } else if (avaliacaoAnterior != null && avaliacaoAnterior - metricas.avaliacao >= 0.2) {
      alertas.push(`⭐ avaliação caiu de ${avaliacaoAnterior.toFixed(1)} para ${metricas.avaliacao.toFixed(1)}`);
    }
  }

  // Cancelamentos ≥3 no dia, ou ≥2x a média do histórico
  if (metricas.cancelamentos != null) {
    const cancelVals = hist.map((h) => h.cancelamentos).filter((v): v is number => v != null);
    const mediaCancel = cancelVals.length ? cancelVals.reduce((s, v) => s + v, 0) / cancelVals.length : 0;
    if (metricas.cancelamentos >= 3 || (mediaCancel > 0 && metricas.cancelamentos >= mediaCancel * 2)) {
      alertas.push(`🚫 ${metricas.cancelamentos} cancelamentos hoje (média: ${mediaCancel.toFixed(1)})`);
    }
  }

  // Loja pausada
  if (metricas.loja_pausada) {
    alertas.push(`⏸️ loja pausada no iFood`);
  }

  // Faturamento < 70% da média do mesmo dia-da-semana
  if (metricas.faturamento != null) {
    const hojeDiaSemana = new Date().getUTCDay();
    const mesmoDiaSemana = hist.filter((h) => new Date(h.data).getUTCDay() === hojeDiaSemana && h.faturamento != null);
    if (mesmoDiaSemana.length) {
      const mediaFaturamento =
        mesmoDiaSemana.reduce((s, h) => s + (h.faturamento ?? 0), 0) / mesmoDiaSemana.length;
      if (mediaFaturamento > 0 && metricas.faturamento < mediaFaturamento * 0.7) {
        alertas.push(
          `📉 faturamento R$${metricas.faturamento.toFixed(2)} — 70% abaixo da média do dia (R$${mediaFaturamento.toFixed(2)})`
        );
      }
    }
  }

  // Pedidos zerados
  if (metricas.pedidos === 0) {
    alertas.push(`0️⃣ zero pedidos hoje`);
  }

  // Desconto médio ≥30% do ticket
  if (
    metricas.desconto_medio != null &&
    metricas.ticket_medio != null &&
    metricas.ticket_medio > 0 &&
    metricas.desconto_medio >= metricas.ticket_medio * 0.3
  ) {
    alertas.push(
      `🏷️ desconto médio R$${metricas.desconto_medio.toFixed(2)} (≥30% do ticket R$${metricas.ticket_medio.toFixed(2)})`
    );
  }

  for (const alerta of alertas) {
    await notifyTelegram(`🔔 <b>${loja.nome}</b>\n${alerta}`);
  }
}
