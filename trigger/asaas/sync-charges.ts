import { schedules, logger } from "@trigger.dev/sdk/v3";
import { getSupabase } from "../_shared/supabase";
import { listCharges } from "../_shared/asaas";

const ASAAS_TO_PAGAMENTO_STATUS: Record<string, string> = {
  CONFIRMED: "em_dia",
  RECEIVED:  "em_dia",
  OVERDUE:   "atrasado",
  REFUNDED:  "cancelado",
  REMOVED:   "cancelado",
};

export const asaasSyncCharges = schedules.task({
  id: "asaas-sync-charges",
  cron: "0 */2 * * *",
  retry: { maxAttempts: 3, minTimeoutInMs: 30_000, maxTimeoutInMs: 120_000, factor: 2 },

  run: async (_payload, { ctx }) => {
    logger.info("asaas-sync-charges: iniciando sincronização", { runId: ctx.run.id });

    const sb = getSupabase();

    // 1. Busca contratos ativos com assinatura Asaas
    const { data: contratos, error } = await sb
      .from("contratos")
      .select("id, tenant_id, asaas_subscription_id, pagamento_status")
      .not("asaas_subscription_id", "is", null)
      .in("status", ["assinado"])
      .limit(100);

    if (error) throw new Error(`[asaas-sync] erro ao buscar contratos: ${error.message}`);
    if (!contratos?.length) {
      logger.info("asaas-sync-charges: nenhum contrato ativo com assinatura Asaas");
      return { synced: 0 };
    }

    logger.info(`asaas-sync-charges: ${contratos.length} contratos para verificar`);

    let synced = 0;
    let errors = 0;

    for (const contrato of contratos) {
      try {
        // 2. Lista cobranças da assinatura (últimas 5, pendentes/vencidas)
        const result = await listCharges({
          customer: contrato.asaas_subscription_id!,
          limit: 5,
        });

        if (!result.data.length) continue;

        // 3. Determina status consolidado (pior caso vence)
        let resolvedStatus = "em_dia";
        for (const charge of result.data) {
          const mapped = ASAAS_TO_PAGAMENTO_STATUS[charge.status] ?? null;
          if (mapped === "atrasado") { resolvedStatus = "atrasado"; break; }
          if (mapped === "cancelado") resolvedStatus = "cancelado";
        }

        // 4. Atualiza contrato apenas se status mudou
        if (resolvedStatus !== contrato.pagamento_status) {
          const latestPaid = result.data.find(
            (c) => c.status === "CONFIRMED" || c.status === "RECEIVED"
          );
          const updates: Record<string, unknown> = {
            pagamento_status: resolvedStatus,
            updated_at: new Date().toISOString(),
          };
          if (latestPaid?.paymentDate) {
            updates.ultimo_pagamento_em = latestPaid.paymentDate;
          }

          const { error: upErr } = await sb
            .from("contratos")
            .update(updates)
            .eq("id", contrato.id);

          if (upErr) {
            logger.warn(`[asaas-sync] update falhou contrato ${contrato.id}: ${upErr.message}`);
            errors++;
          } else {
            logger.info(`[asaas-sync] contrato ${contrato.id} ${contrato.pagamento_status} → ${resolvedStatus}`);
            synced++;
          }
        }
      } catch (err) {
        logger.warn(`[asaas-sync] erro ao processar contrato ${contrato.id}: ${(err as Error).message}`);
        errors++;
      }
    }

    logger.info(`asaas-sync-charges: concluído`, { synced, errors, total: contratos.length });
    return { synced, errors, total: contratos.length };
  },
});
