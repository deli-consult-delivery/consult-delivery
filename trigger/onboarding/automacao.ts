import { task, logger, schedules } from "@trigger.dev/sdk/v3";
import { z } from "zod";
import { getSupabase } from "../_shared/supabase";
import { logAgentRun } from "../_shared/audit";

// ─────────────────────────────────────────────────────────────────
// SCHEMAS
// ─────────────────────────────────────────────────────────────────

const CriarChecklistInput = z.object({
  contrato_id:    z.string().uuid(),
  customer_id:    z.string().uuid(),
  tenant_id:      z.string().uuid(),
  vigencia_inicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato: YYYY-MM-DD"),
});

const CriarChecklistOutput = z.object({
  ok:          z.boolean(),
  marcos_criados: z.number(),
});

type CriarInput  = z.infer<typeof CriarChecklistInput>;
type CriarOutput = z.infer<typeof CriarChecklistOutput>;

// ─────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────

function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// Data "hoje" em BRT (UTC-3) — anti-padrão #3
function todayBRT(): string {
  const nowUtc = new Date();
  const nowBrt = new Date(nowUtc.getTime() - 3 * 60 * 60 * 1000);
  return nowBrt.toISOString().slice(0, 10);
}

// ─────────────────────────────────────────────────────────────────
// TASK: onboarding-criar-checklist
// Cria os 5 marcos D1/D7/D30/D60/D90 para um contrato novo.
// ─────────────────────────────────────────────────────────────────

export const onboardingCriarChecklist = task({
  id:    "onboarding-criar-checklist",
  retry: { maxAttempts: 3, minTimeoutInMs: 2000 },

  run: async (payload: CriarInput, { ctx }): Promise<CriarOutput> => {
    const input = CriarChecklistInput.parse(payload);
    const sb    = getSupabase();

    logger.info("onboarding-criar-checklist: iniciado", {
      contrato_id: input.contrato_id,
      tenant_id:   input.tenant_id,
    });

    const v = input.vigencia_inicio;
    const rows = [
      { marco: 'D1',  agendado_para: v                },
      { marco: 'D7',  agendado_para: addDays(v, 7)    },
      { marco: 'D30', agendado_para: addDays(v, 30)   },
      { marco: 'D60', agendado_para: addDays(v, 60)   },
      { marco: 'D90', agendado_para: addDays(v, 90)   },
    ].map(r => ({
      ...r,
      tenant_id:   input.tenant_id,
      customer_id: input.customer_id,
      contrato_id: input.contrato_id,
      status:      'pendente' as const,
    }));

    const { error } = await sb
      .from('onboarding_checklists')
      .insert(rows);

    if (error) {
      logger.error("onboarding-criar-checklist: erro ao inserir", { error: error.message });
      await logAgentRun({
        runId:     ctx.run.id,
        agentSlug: "onboarding",
        tenantId:  input.tenant_id,
        input,
        output:    { error: error.message },
        status:    "failed",
      });
      throw new Error(`Insert falhou: ${error.message}`);
    }

    const output = CriarChecklistOutput.parse({ ok: true, marcos_criados: rows.length });

    logger.info("onboarding-criar-checklist: concluído", { marcos_criados: rows.length });

    await logAgentRun({
      runId:     ctx.run.id,
      agentSlug: "onboarding",
      tenantId:  input.tenant_id,
      input,
      output,
      status:    "success",
    });

    return output;
  },
});

// ─────────────────────────────────────────────────────────────────
// SCHEDULE: onboarding-verificar-marcos
// Roda todo dia 09h UTC (06h BRT). Busca checklists com
// agendado_para=hoje BRT e status=pendente → notifica equipe interna.
// Anti-padrão: NUNCA envia mensagem diretamente ao cliente.
// ─────────────────────────────────────────────────────────────────

export const onboardingVerificarMarcosSchedule = schedules.task({
  id:    "onboarding-verificar-marcos",
  cron:  "0 9 * * *", // 09h UTC = 06h BRT
  retry: { maxAttempts: 2, minTimeoutInMs: 2000 },

  run: async (_, { ctx }) => {
    const sb    = getSupabase();
    const hoje  = todayBRT();

    logger.info("onboarding-verificar-marcos: verificando marcos do dia", { hoje });

    const { data: marcos, error } = await sb
      .from('onboarding_checklists')
      .select('id, tenant_id, customer_id, contrato_id, marco, customers(name)')
      .eq('agendado_para', hoje)
      .eq('status', 'pendente');

    if (error) {
      logger.error("onboarding-verificar-marcos: erro ao buscar", { error: error.message });
      throw error;
    }

    const lista = marcos ?? [];
    logger.info("onboarding-verificar-marcos: marcos encontrados", { total: lista.length });

    if (lista.length === 0) {
      await logAgentRun({
        runId:     ctx.run.id,
        agentSlug: "onboarding-schedule",
        input:     { hoje },
        output:    { notificacoes: 0 },
        status:    "success",
      });
      return { ok: true, notificacoes: 0 };
    }

    // Notifica equipe via Bridge — canal interno telegram_interno (nunca cliente)
    const bridgeUrl = process.env.BRIDGE_URL ?? "http://187.127.25.24:3001";

    let notificacoes = 0;
    for (const m of lista) {
      const nomeCliente = (m as { customers?: { name?: string } }).customers?.name ?? m.customer_id;
      const mensagem    = `[Onboarding] Marco ${m.marco} hoje: cliente "${nomeCliente}". Verifique o painel → Onboarding.`;

      try {
        const res = await fetch(`${bridgeUrl}/agents/deli/notify`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            channel: 'telegram_interno',
            message: mensagem,
            metadata: {
              source:      'onboarding-verificar-marcos',
              customer_id: m.customer_id,
              marco:       m.marco,
              tenant_id:   m.tenant_id,
            },
          }),
        });
        if (!res.ok) {
          logger.warn("onboarding-verificar-marcos: bridge retornou erro", { status: res.status, customer_id: m.customer_id });
        } else {
          notificacoes++;
        }
      } catch (fetchErr) {
        logger.warn("onboarding-verificar-marcos: falha no fetch do bridge", {
          error:       (fetchErr as Error).message,
          customer_id: m.customer_id,
        });
      }
    }

    logger.info("onboarding-verificar-marcos: concluído", { notificacoes });

    await logAgentRun({
      runId:     ctx.run.id,
      agentSlug: "onboarding-schedule",
      input:     { hoje },
      output:    { notificacoes },
      status:    "success",
    });

    return { ok: true, notificacoes };
  },
});
