import { schedules, logger } from "@trigger.dev/sdk/v3";
import { getSupabase } from "../_shared/supabase";
import { listChargesAll, listCustomersMap } from "../_shared/asaas";

function getMainTenantId(): string {
  const id = process.env.MAIN_TENANT_ID;
  if (!id) throw new Error("MAIN_TENANT_ID não configurado no Infisical.");
  return id;
}

const ASAAS_TO_STATUS: Record<string, string> = {
  PENDING:              "pending",
  RECEIVED:             "received",
  CONFIRMED:            "received",
  RECEIVED_IN_CASH:     "received",
  OVERDUE:              "overdue",
  REFUNDED:             "refunded",
  REMOVED:              "canceled",
  RESTORED:             "pending",
  CHARGEBACK_REQUESTED: "canceled",
  CHARGEBACK_DISPUTE:   "canceled",
  AWAITING_CHARGEBACK_REVERSAL: "canceled",
  DUNNING_REQUESTED:    "overdue",
  DUNNING_RECEIVED:     "received",
  IN_DEBT_RECOVERY:     "overdue",
};

const BATCH_SIZE = 200;

export const asaasSyncFinanceiro = schedules.task({
  id: "asaas-sync-financeiro",
  cron: "*/30 * * * *",
  maxDuration: 600, // 10 minutos — carga inicial pode ter 2000+ cobranças
  retry: { maxAttempts: 3, minTimeoutInMs: 30_000, maxTimeoutInMs: 120_000, factor: 2 },

  run: async (_payload, { ctx }) => {
    logger.info("asaas-sync-financeiro: iniciando", { runId: ctx.run.id });

    const tenantId = getMainTenantId();
    const sb = getSupabase();
    const now = new Date().toISOString();

    const [charges, customersMap] = await Promise.all([
      listChargesAll(),
      listCustomersMap(),
    ]);
    logger.info(`asaas-sync-financeiro: ${charges.length} cobranças, ${customersMap.size} clientes`);

    let upserted = 0;
    let errors = 0;

    for (let i = 0; i < charges.length; i += BATCH_SIZE) {
      const batch = charges.slice(i, i + BATCH_SIZE);

      const rows = batch.map((charge) => {
        const customer = customersMap.get(charge.customer);
        const phone = customer?.mobilePhone ?? customer?.phone ?? null;
        return {
          tenant_id:       tenantId,
          asaas_charge_id: charge.id,
          valor:           charge.value,
          vencimento:      charge.dueDate,
          status:          ASAAS_TO_STATUS[charge.status] ?? "canceled",
          billing_type:         charge.billingType,
          invoice_url:          charge.invoiceUrl ?? null,
          bank_slip_url:        charge.bankSlipUrl ?? null,
          pix_qr_code:          charge.pixQrCode?.payload ?? null,
          customer_name:        customer?.name ?? null,
          customer_phone:       phone,
          payment_date:         charge.paymentDate ? charge.paymentDate.slice(0, 10) : null,
          net_value:            charge.netValue ?? null,
          date_created:         charge.dateCreated ? charge.dateCreated.slice(0, 10) : null,
          invoice_viewed_date:  charge.invoiceViewedDate ?? null,
          description:          charge.description ?? null,
          confirmed_date:       charge.confirmedDate ? charge.confirmedDate.slice(0, 10) : null,
          metadata:             { asaas_raw: charge, synced_at: now },
          updated_at:           now,
        };
      });

      const { error } = await sb
        .from("cobrancas")
        .upsert(rows, { onConflict: "asaas_charge_id", ignoreDuplicates: false });

      if (error) {
        logger.warn(`[sync-financeiro] batch ${i}–${i + batch.length} falhou: ${error.message}`);
        errors += batch.length;
      } else {
        upserted += batch.length;
      }

      logger.info(`[sync-financeiro] progresso: ${Math.min(i + BATCH_SIZE, charges.length)}/${charges.length}`);
    }

    logger.info("asaas-sync-financeiro: concluído", {
      total: charges.length,
      upserted,
      errors,
    });

    return { total: charges.length, upserted, errors };
  },
});
