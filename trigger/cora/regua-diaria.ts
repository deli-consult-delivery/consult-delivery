import { schedules, logger, tasks } from "@trigger.dev/sdk/v3";
import { getSupabase } from "../_shared/supabase";
import { coraProcessarCobranca } from "./processar-cobranca";

function getMainTenantId(): string {
  const id = process.env.MAIN_TENANT_ID;
  if (!id) throw new Error("MAIN_TENANT_ID não configurado no Infisical.");
  return id;
}

export const coraReguaDiaria = schedules.task({
  id: "cora-regua-diaria",
  // 09h00 horário de Brasília (UTC-3 = 12h UTC)
  cron: "0 12 * * *",
  retry: { maxAttempts: 2, minTimeoutInMs: 5_000 },

  run: async (_payload, { ctx }) => {
    logger.info("cora-regua-diaria: iniciando", { runId: ctx.run.id });

    const tenantId = getMainTenantId();
    const sb = getSupabase();

    // Janela: T-7 (lembrete pré-vencimento) até T+90
    const hoje = new Date();
    const dataMin = new Date(hoje); dataMin.setDate(dataMin.getDate() - 90);
    const dataMax = new Date(hoje); dataMax.setDate(dataMax.getDate() + 7);

    const { data: cobrancas, error } = await sb
      .from("cobrancas")
      .select("id, vencimento, status, customer_name, valor")
      .eq("tenant_id", tenantId)
      .in("status", ["pending", "overdue"])
      .gte("vencimento", dataMin.toISOString().slice(0, 10))
      .lte("vencimento", dataMax.toISOString().slice(0, 10));

    if (error) throw new Error(`Erro ao buscar cobranças: ${error.message}`);
    if (!cobrancas?.length) {
      logger.info("cora-regua-diaria: sem cobranças elegíveis hoje");
      return { processadas: 0, puladas: 0 };
    }

    logger.info(`cora-regua-diaria: ${cobrancas.length} cobranças elegíveis`);

    const hoje0 = new Date(); hoje0.setHours(0, 0, 0, 0);
    let processadas = 0, puladas = 0;

    for (const cob of cobrancas) {
      const dias = Math.floor((hoje0.getTime() - new Date(cob.vencimento).getTime()) / 86400000);

      // Skip se já houve ação CORA hoje nesta cobrança (V2)
      const { count } = await sb
        .from("cora_acoes")
        .select("id", { count: "exact", head: true })
        .eq("cobranca_v2_id", cob.id)
        .gte("created_at", hoje0.toISOString());

      if ((count ?? 0) > 0) { puladas++; continue; }

      await tasks.trigger(coraProcessarCobranca.id, {
        tenant_id: tenantId,
        cobranca_id: cob.id,
        dias_atraso: dias,
      });
      processadas++;
    }

    logger.info("cora-regua-diaria: concluído", { processadas, puladas });
    return { processadas, puladas, total: cobrancas.length };
  },
});
