import { schedules, logger } from "@trigger.dev/sdk/v3";
import { getSupabase } from "../_shared/supabase";
import { listChargesAll } from "../_shared/asaas";

function getMainTenantId(): string {
  const id = process.env.MAIN_TENANT_ID;
  if (!id) throw new Error("MAIN_TENANT_ID não configurado no Infisical.");
  return id;
}

const ASAAS_TO_STATUS: Record<string, string> = {
  PENDING:   "pending",
  RECEIVED:  "received",
  CONFIRMED: "received",
  OVERDUE:   "overdue",
  REFUNDED:  "refunded",
  REMOVED:   "canceled",
  RESTORED:  "pending",
};

export const asaasSyncFinanceiro = schedules.task({
  id: "asaas-sync-financeiro",
  cron: "*/30 * * * *",
  retry: { maxAttempts: 3, minTimeoutInMs: 30_000, maxTimeoutInMs: 120_000, factor: 2 },

  run: async (_payload, { ctx }) => {
    logger.info("asaas-sync-financeiro: iniciando", { runId: ctx.run.id });

    const tenantId = getMainTenantId();
    const sb = getSupabase();

    const charges = await listChargesAll();
    logger.info(`asaas-sync-financeiro: ${charges.length} cobranças recebidas do Asaas`);

    let upserted = 0;
    let errors = 0;

    for (const charge of charges) {
      const status = ASAAS_TO_STATUS[charge.status] ?? "canceled";

      const row = {
        tenant_id:       tenantId,
        asaas_charge_id: charge.id,
        valor:           charge.value,
        vencimento:      charge.dueDate,
        status,
        billing_type:    charge.billingType,
        invoice_url:     charge.invoiceUrl ?? null,
        bank_slip_url:   charge.bankSlipUrl ?? null,
        pix_qr_code:     charge.pixQrCode?.payload ?? null,
        customer_name:   null as string | null,
        customer_phone:  null as string | null,
        metadata:        { asaas_raw: charge, synced_at: new Date().toISOString() },
        updated_at:      new Date().toISOString(),
      };

      const { error } = await sb
        .from("cobrancas")
        .upsert(row, { onConflict: "asaas_charge_id", ignoreDuplicates: false });

      if (error) {
        logger.warn(`[sync-financeiro] upsert falhou ${charge.id}: ${error.message}`);
        errors++;
      } else {
        upserted++;
      }
    }

    logger.info("asaas-sync-financeiro: concluído", {
      total: charges.length,
      upserted,
      errors,
    });

    return { total: charges.length, upserted, errors };
  },
});
