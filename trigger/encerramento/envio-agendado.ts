import { schedules, tasks, logger } from "@trigger.dev/sdk/v3";
import { z } from "zod";
import { getSupabase } from "../_shared/supabase";
import { logAgentRun } from "../_shared/audit";

// ─── Feriados nacionais brasileiros (hardcoded 2026 e 2027) ──────────────────
const FERIADOS_POR_ANO: Record<number, string[]> = {
  2026: [
    "01-01", "04-20", "04-21", "05-01", "06-11",
    "09-07", "10-12", "11-02", "11-15", "12-25",
  ],
  2027: [
    "01-01", "04-05", "04-06", "05-01", "06-03",
    "09-07", "10-12", "11-02", "11-15", "12-25",
  ],
};

// ─── Schemas ──────────────────────────────────────────────────────────────────

const TenantSendResultSchema = z.object({
  tenant_id:    z.string().uuid(),
  groups_count: z.number().int(),
  status:       z.enum(["sent", "skipped_no_groups", "failed"]),
  error:        z.string().optional(),
});

const OutputSchema = z.object({
  date:              z.string(),
  is_holiday:        z.boolean(),
  tenants_processed: z.number().int(),
  results:           z.array(TenantSendResultSchema),
});

type TenantSendResult = z.infer<typeof TenantSendResultSchema>;
type Output           = z.infer<typeof OutputSchema>;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getSPDate(): { dateStr: string; year: number; monthDay: string } {
  const SP_OFFSET_MS = -3 * 60 * 60 * 1000;
  const nowSP        = new Date(Date.now() + SP_OFFSET_MS);
  const dateStr      = nowSP.toISOString().split("T")[0];
  const [yearStr, month, day] = dateStr.split("-");
  return {
    dateStr,
    year:     parseInt(yearStr, 10),
    monthDay: `${month}-${day}`,
  };
}

function isFeriadoNacional(year: number, monthDay: string): boolean {
  const feriados = FERIADOS_POR_ANO[year] ?? [];
  return feriados.includes(monthDay);
}

// ─── Lógica principal ─────────────────────────────────────────────────────────

async function enviarEncerramento(runId: string, weekdayLabel: string): Promise<Output> {
  const { dateStr, year, monthDay } = getSPDate();

  logger.info(`encerramento-envio-agendado: iniciando (${weekdayLabel})`, { dateStr });

  // 1. Verificar feriado — skip silencioso
  const isHoliday = isFeriadoNacional(year, monthDay);
  if (isHoliday) {
    logger.info("encerramento-envio-agendado: feriado nacional — skip", { dateStr, monthDay });

    const output = OutputSchema.parse({
      date:              dateStr,
      is_holiday:        true,
      tenants_processed: 0,
      results:           [],
    });

    await logAgentRun({
      runId,
      agentSlug: "encerramento-scheduler",
      input:     { weekdayLabel, dateStr },
      output,
      status:    "success",
    });

    return output;
  }

  const sb = getSupabase();

  // 2. Buscar tenants com auto_send = true
  const { data: configs, error: configErr } = await sb
    .from("encerramento_config")
    .select("tenant_id")
    .eq("auto_send", true);

  if (configErr) {
    throw new Error(`Falha ao buscar encerramento_config: ${configErr.message}`);
  }

  if (!configs || configs.length === 0) {
    logger.info("encerramento-envio-agendado: nenhum tenant com auto_send=true");

    const output = OutputSchema.parse({
      date:              dateStr,
      is_holiday:        false,
      tenants_processed: 0,
      results:           [],
    });

    await logAgentRun({
      runId,
      agentSlug: "encerramento-scheduler",
      input:     { weekdayLabel, dateStr },
      output,
      status:    "success",
    });

    return output;
  }

  logger.info(`encerramento-envio-agendado: ${configs.length} tenant(s) com auto_send`, { dateStr });

  const todayStart = `${dateStr}T00:00:00.000Z`;
  const results: TenantSendResult[] = [];

  const BRIDGE_URL            = process.env.BRIDGE_URL;
  const INTERNAL_BRIDGE_TOKEN = process.env.INTERNAL_BRIDGE_TOKEN;

  if (!BRIDGE_URL)            throw new Error("BRIDGE_URL não configurado");
  if (!INTERNAL_BRIDGE_TOKEN) throw new Error("INTERNAL_BRIDGE_TOKEN não configurado");

  // 3. Processar cada tenant
  for (const config of configs) {
    const tenantId = config.tenant_id as string;
    logger.info("encerramento-envio-agendado: processando tenant", { tenantId });

    try {
      // 3a. Buscar run de hoje já existente
      let imgGroupUrl: string | undefined;
      let caption: string | undefined;

      const { data: existingRun } = await sb
        .from("agent_runs")
        .select("output")
        .eq("agent_id", "encerramento")
        .eq("status", "success")
        .gte("created_at", todayStart)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingRun?.output) {
        const out = existingRun.output as Record<string, unknown>;
        imgGroupUrl = out.img_group_url as string | undefined;
        caption     = out.caption     as string | undefined;
        logger.info("encerramento-envio-agendado: usando imagem já gerada hoje", { tenantId, imgGroupUrl });
      }

      // Se não existe run de hoje, dispara gerar-imagem e espera resultado
      if (!imgGroupUrl) {
        logger.info("encerramento-envio-agendado: sem run hoje, disparando encerramento-gerar-imagem", { tenantId });

        const gerarResult = await tasks.triggerAndWait(
          "encerramento-gerar-imagem",
          { tenant_id: tenantId, triggered_by: undefined },
        ).unwrap();

        const gerarOut = gerarResult as Record<string, unknown>;
        imgGroupUrl = gerarOut.img_group_url as string | undefined;
        caption     = gerarOut.caption     as string | undefined;

        if (!imgGroupUrl) {
          throw new Error("encerramento-gerar-imagem não retornou img_group_url");
        }
      }

      // 3b. Buscar grupos com encerramento_ativo = true e ativo = true
      const { data: groups, error: groupsErr } = await sb
        .from("whatsapp_groups")
        .select("evolution_jid")
        .eq("tenant_id", tenantId)
        .eq("encerramento_ativo", true)
        .eq("ativo", true);

      if (groupsErr) {
        throw new Error(`Falha ao buscar grupos do tenant ${tenantId}: ${groupsErr.message}`);
      }

      if (!groups || groups.length === 0) {
        logger.info("encerramento-envio-agendado: nenhum grupo encerramento_ativo para o tenant", { tenantId });
        results.push(TenantSendResultSchema.parse({
          tenant_id:    tenantId,
          groups_count: 0,
          status:       "skipped_no_groups",
        }));
        continue;
      }

      const groupJids = (groups as Array<{ evolution_jid: string }>).map(g => g.evolution_jid);

      logger.info("encerramento-envio-agendado: enviando para grupos via bridge", {
        tenantId,
        groups_count: groupJids.length,
      });

      // 3c. POST para o bridge server
      const bridgeResp = await fetch(`${BRIDGE_URL}/agents/encerramento/send-groups`, {
        method: "POST",
        headers: {
          "Content-Type":     "application/json",
          "x-internal-token": INTERNAL_BRIDGE_TOKEN,
        },
        body: JSON.stringify({
          group_jids: groupJids,
          image_url:  imgGroupUrl,
          caption:    `${caption ?? ""}\n\nEquipe Consult Delivery 🚀\n\n*🤖 Mensagem automática*`,
          tenant_id:  tenantId,
        }),
        signal: AbortSignal.timeout(30_000),
      });

      if (!bridgeResp.ok) {
        const detail = await bridgeResp.text();
        throw new Error(`Bridge retornou ${bridgeResp.status}: ${detail.slice(0, 300)}`);
      }

      logger.info("encerramento-envio-agendado: envio concluído para tenant", {
        tenantId,
        groups_count: groupJids.length,
      });

      await logAgentRun({
        runId:    `${runId}-${tenantId}`,
        agentSlug: "encerramento-scheduler",
        tenantId,
        input:    { weekdayLabel, dateStr, groups_count: groupJids.length },
        output:   { img_group_url: imgGroupUrl, groups_sent: groupJids.length },
        status:   "success",
      });

      results.push(TenantSendResultSchema.parse({
        tenant_id:    tenantId,
        groups_count: groupJids.length,
        status:       "sent",
      }));
    } catch (tenantErr) {
      const errorMessage = tenantErr instanceof Error ? tenantErr.message : String(tenantErr);
      logger.error("encerramento-envio-agendado: erro no tenant", { tenantId, error: errorMessage });

      await logAgentRun({
        runId:    `${runId}-${tenantId}`,
        agentSlug: "encerramento-scheduler",
        tenantId,
        input:    { weekdayLabel, dateStr },
        output:   { error: errorMessage },
        status:   "failed",
      });

      results.push(TenantSendResultSchema.parse({
        tenant_id:    tenantId,
        groups_count: 0,
        status:       "failed",
        error:        errorMessage,
      }));
    }
  }

  const output = OutputSchema.parse({
    date:              dateStr,
    is_holiday:        false,
    tenants_processed: configs.length,
    results,
  });

  await logAgentRun({
    runId,
    agentSlug: "encerramento-scheduler",
    input:     { weekdayLabel, dateStr },
    output,
    status:    results.some(r => r.status === "failed") ? "failed" : "success",
  });

  logger.info("encerramento-envio-agendado: concluído", {
    dateStr,
    tenants_processed: configs.length,
    sent:    results.filter(r => r.status === "sent").length,
    skipped: results.filter(r => r.status === "skipped_no_groups").length,
    failed:  results.filter(r => r.status === "failed").length,
  });

  return output;
}

// ─── Schedule: Segunda–Sexta às 18:00 BRT = 21:00 UTC ────────────────────────

export const encerramentoEnvioAgendadoSemana = schedules.task({
  id:    "encerramento-envio-agendado-semana",
  cron:  "0 21 * * 1-5",
  retry: { maxAttempts: 5, minTimeoutInMs: 30_000, maxTimeoutInMs: 120_000, factor: 2 },

  run: async (_payload, { ctx }) => {
    logger.info("encerramento-envio-agendado-semana: schedule disparada (seg–sex, 21h UTC)");

    try {
      return await enviarEncerramento(ctx.run.id, "seg-sex");
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error("encerramento-envio-agendado-semana: falha fatal", { error: errorMessage });

      await logAgentRun({
        runId:     ctx.run.id,
        agentSlug: "encerramento-scheduler",
        input:     { weekdayLabel: "seg-sex" },
        output:    { error: errorMessage },
        status:    "failed",
      });

      throw error;
    }
  },
});

// ─── Schedule: Sábado às 12:00 BRT = 15:00 UTC ───────────────────────────────

export const encerramentoEnvioAgendadoSabado = schedules.task({
  id:    "encerramento-envio-agendado-sabado",
  cron:  "0 15 * * 6",
  retry: { maxAttempts: 5, minTimeoutInMs: 30_000, maxTimeoutInMs: 120_000, factor: 2 },

  run: async (_payload, { ctx }) => {
    logger.info("encerramento-envio-agendado-sabado: schedule disparada (sáb, 15h UTC)");

    try {
      return await enviarEncerramento(ctx.run.id, "sabado");
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error("encerramento-envio-agendado-sabado: falha fatal", { error: errorMessage });

      await logAgentRun({
        runId:     ctx.run.id,
        agentSlug: "encerramento-scheduler",
        input:     { weekdayLabel: "sabado" },
        output:    { error: errorMessage },
        status:    "failed",
      });

      throw error;
    }
  },
});
