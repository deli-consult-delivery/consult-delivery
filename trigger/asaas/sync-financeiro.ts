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

/**
 * Cobranças locais com asaas_charge_id que não aparece mais em nenhuma página
 * do Asaas — ou seja, o charge foi deletado de verdade lá (listChargesAll()
 * não tem filtro de data, então "ausente" não é "fora da janela consultada").
 *
 * ponytail: recusa reconciliar contra um `asaasIds` vazio — um Asaas com 0
 * cobranças pra um tenant real é sinal de resposta suspeita (env/API key
 * errada), não "cancelar tudo". Ver chamada em `run()` antes desta função.
 */
export function encontrarCobrancasOrfas<T extends { asaas_charge_id: string }>(
  locais: T[],
  asaasIds: Set<string>
): T[] {
  if (asaasIds.size === 0) return [];
  return locais.filter((c) => !asaasIds.has(c.asaas_charge_id));
}

type DraftPendente = { id: string; metadata: { cobranca_v2_id?: string } | null };
type CobrancaRef = { id: string; status: string; ignorar_cobranca: boolean };

/**
 * Drafts pending da CORA cuja cobrança de origem (metadata.cobranca_v2_id) não é
 * mais elegível pra cobrança — paga, removida do Asaas ou marcada "não cobrar".
 * Drafts sem cobranca_v2_id (fora do fluxo V2/Asaas) são ignorados aqui.
 */
export function encontrarDraftsObsoletos(
  drafts: DraftPendente[],
  cobrancasRef: CobrancaRef[]
): DraftPendente[] {
  const elegivel = new Map(
    cobrancasRef.map((c) => [c.id, !c.ignorar_cobranca && ["pending", "overdue"].includes(c.status)])
  );
  return drafts.filter((d) => {
    const id = d.metadata?.cobranca_v2_id;
    if (!id) return false;
    return !(elegivel.get(id) ?? false); // não encontrada = também obsoleto
  });
}

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

    // Reconciliação: cobranças locais com asaas_charge_id que o Asaas não retornou
    // em nenhuma página (listChargesAll() busca sem filtro de data — se o charge foi
    // realmente deletado no Asaas, ele nunca mais aparece aqui). Sem isso, uma
    // cobrança excluída no Asaas fica presa como aberta na plataforma pra sempre.
    const asaasIds = new Set(charges.map((c) => c.id));
    const { data: locais, error: locaisError } = await sb
      .from("cobrancas")
      .select("id, asaas_charge_id, status")
      .eq("tenant_id", tenantId)
      .not("asaas_charge_id", "is", null)
      .neq("status", "canceled");

    let orfas = 0;
    if (charges.length === 0) {
      // Resposta do Asaas sem nenhum charge para um tenant real é sinal de
      // configuração errada (ex: ASAAS_ENVIRONMENT/API key apontando pro
      // sandbox), não "cliente zerou tudo". Não reconcilia nesse caso —
      // encontrarCobrancasOrfas já recusa um asaasIds vazio, isto aqui é só
      // pra deixar o alerta visível nos logs do run.
      logger.warn("[sync-financeiro] Asaas retornou 0 cobranças — pulando reconciliação de órfãs (possível config errada)");
    } else if (locaisError) {
      logger.warn(`[sync-financeiro] falha ao buscar cobranças locais p/ reconciliação: ${locaisError.message}`);
    } else {
      const orfasRows = encontrarCobrancasOrfas(locais ?? [], asaasIds);
      for (let i = 0; i < orfasRows.length; i += BATCH_SIZE) {
        const idsBatch = orfasRows.slice(i, i + BATCH_SIZE).map((c) => c.id);
        const { error: cancelError } = await sb
          .from("cobrancas")
          .update({ status: "canceled", updated_at: now })
          .in("id", idsBatch);

        if (cancelError) {
          logger.warn(`[sync-financeiro] falha ao cancelar lote de ${idsBatch.length} cobrança(s) órfã(s): ${cancelError.message}`);
        } else {
          orfas += idsBatch.length;
        }
      }
      if (orfas) {
        logger.info(`[sync-financeiro] ${orfas} cobrança(s) removida(s) do Asaas → marcada(s) como canceled`, {
          ids: orfasRows.map((c) => c.id),
        });
      }
    }

    // Invalida drafts da CORA ("Fila de aprovação") ainda pending cuja cobrança de
    // origem deixou de ser cobrável entre a geração do draft (régua roda 1x/dia às 9h)
    // e agora — paga, removida do Asaas ou marcada "não cobrar" nesse meio-tempo. Sem
    // isso, o draft fica pendurado na fila até alguém aprovar/rejeitar manualmente,
    // com risco real de reenviar cobrança pra quem já pagou.
    let draftsInvalidados = 0;
    const { data: draftsPendentes, error: draftsError } = await sb
      .from("agent_drafts")
      .select("id, metadata")
      .eq("tenant_id", tenantId)
      .eq("agent_name", "cora")
      .eq("status", "pending");

    if (draftsError) {
      logger.warn(`[sync-financeiro] falha ao buscar drafts pendentes p/ invalidação: ${draftsError.message}`);
    } else if (draftsPendentes?.length) {
      const cobrancaIds = [...new Set(
        draftsPendentes
          .map((d) => (d.metadata as { cobranca_v2_id?: string } | null)?.cobranca_v2_id)
          .filter((id): id is string => !!id)
      )];

      if (cobrancaIds.length) {
        const { data: cobrancasRef, error: cobrancasRefError } = await sb
          .from("cobrancas")
          .select("id, status, ignorar_cobranca")
          .in("id", cobrancaIds);

        if (cobrancasRefError) {
          logger.warn(`[sync-financeiro] falha ao buscar cobranças referenciadas por drafts: ${cobrancasRefError.message}`);
        } else {
          const draftsObsoletos = encontrarDraftsObsoletos(draftsPendentes, cobrancasRef ?? []);

          for (let i = 0; i < draftsObsoletos.length; i += BATCH_SIZE) {
            const batch = draftsObsoletos.slice(i, i + BATCH_SIZE);
            const { error: rejectError } = await sb
              .from("agent_drafts")
              .update({ status: "rejected" })
              .in("id", batch.map((d) => d.id));

            if (rejectError) {
              logger.warn(`[sync-financeiro] falha ao invalidar lote de ${batch.length} draft(s): ${rejectError.message}`);
            } else {
              draftsInvalidados += batch.length;
            }
          }
          if (draftsInvalidados) {
            logger.info(`[sync-financeiro] ${draftsInvalidados} draft(s) da fila de aprovação invalidado(s) — fatura não é mais cobrável`, {
              ids: draftsObsoletos.map((d) => d.id),
            });
          }
        }
      }
    }

    logger.info("asaas-sync-financeiro: concluído", {
      total: charges.length,
      upserted,
      errors,
      orfas,
      draftsInvalidados,
    });

    return { total: charges.length, upserted, errors, orfas, draftsInvalidados };
  },
});
