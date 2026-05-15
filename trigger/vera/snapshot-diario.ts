import { task, logger } from "@trigger.dev/sdk/v3";
import { schedules } from "@trigger.dev/sdk/v3";
import { z } from "zod";
import { getSupabase } from "../_shared/supabase";
import { logAgentRun } from "../_shared/audit";

// =====================================================
// SCHEMAS
// =====================================================

const InputSchema = z.object({
  tenant_id:    z.string().uuid(),
  triggered_by: z.string().uuid().optional(),
});

const OutputSchema = z.object({
  ok:        z.boolean(),
  tenant_id: z.string().uuid(),
  data:      z.string(),
  metricas:  z.record(z.unknown()),
});

type Input  = z.infer<typeof InputSchema>;
type Output = z.infer<typeof OutputSchema>;

// =====================================================
// TASK ORQUESTRADORA (schedule) — itera por tenant
// =====================================================

export const veraSnapshotDiarioSchedule = schedules.task({
  id:    "vera-snapshot-diario-schedule",
  cron:  "0 9 * * *", // 9h UTC = 6h Brasília
  retry: { maxAttempts: 2, minTimeoutInMs: 2000 },

  run: async () => {
    // Lazy: getSupabase() somente dentro do run()
    const sb = getSupabase();

    logger.info("vera-snapshot-diario-schedule: buscando tenants ativos");

    // Busca todos os tenants ativos
    const { data: tenants, error } = await sb
      .from("tenants")
      .select("id")
      .eq("is_active", true);

    if (error) {
      logger.error("vera-snapshot-diario-schedule: erro ao buscar tenants", { error: error.message });
      throw error;
    }

    const tenantIds: string[] = (tenants ?? []).map((t: { id: string }) => t.id);

    logger.info("vera-snapshot-diario-schedule: disparando snapshot por tenant", {
      total_tenants: tenantIds.length,
    });

    // Dispara uma sub-task por tenant (não aguarda — fire-and-forget)
    for (const tenant_id of tenantIds) {
      await veraSnapshotDiario.trigger({ tenant_id });
    }

    return { ok: true, tenants_processados: tenantIds.length };
  },
});

// =====================================================
// TASK DE NEGÓCIO — snapshot por tenant
// =====================================================

export const veraSnapshotDiario = task({
  id:    "vera-snapshot-diario",
  retry: { maxAttempts: 2, minTimeoutInMs: 2000 },

  run: async (payload: Input, { ctx }): Promise<Output> => {
    // OBRIGATÓRIO: validar input na primeira linha
    const input = InputSchema.parse(payload);
    const sb    = getSupabase();

    logger.info("vera-snapshot-diario iniciado", { tenant_id: input.tenant_id });

    try {
      // 1. Calcula dataOntem em UTC-3 (Brasília)
      const agora   = new Date();
      const offsetMs = 3 * 60 * 60 * 1000; // UTC-3
      const hontem  = new Date(agora.getTime() - offsetMs);
      hontem.setUTCDate(hontem.getUTCDate() - 1);
      const dataOntem = hontem.toISOString().slice(0, 10); // "YYYY-MM-DD"

      logger.info("vera-snapshot-diario: data de referência", { data: dataOntem });

      // 2. Query view_metricas_agentes_dia (soft-fail se view não existir)
      let metricasAgentes: Record<string, unknown> = {};
      try {
        const { data } = await sb
          .from("view_metricas_agentes_dia")
          .select("*")
          .eq("tenant_id", input.tenant_id)
          .eq("data", dataOntem)
          .maybeSingle();
        metricasAgentes = (data as Record<string, unknown> | null) ?? {};
      } catch {
        logger.warn("vera-snapshot-diario: view_metricas_agentes_dia não disponível");
      }

      // 3. Query view_metricas_conversas_dia
      let metricasConversas: Record<string, unknown> = {};
      try {
        const { data } = await sb
          .from("view_metricas_conversas_dia")
          .select("*")
          .eq("tenant_id", input.tenant_id)
          .eq("data", dataOntem)
          .maybeSingle();
        metricasConversas = (data as Record<string, unknown> | null) ?? {};
      } catch {
        logger.warn("vera-snapshot-diario: view_metricas_conversas_dia não disponível");
      }

      // 4. Query view_metricas_negocio_dia
      let metricasNegocio: Record<string, unknown> = {};
      try {
        const { data } = await sb
          .from("view_metricas_negocio_dia")
          .select("*")
          .eq("tenant_id", input.tenant_id)
          .eq("data", dataOntem)
          .maybeSingle();
        metricasNegocio = (data as Record<string, unknown> | null) ?? {};
      } catch {
        logger.warn("vera-snapshot-diario: view_metricas_negocio_dia não disponível");
      }

      // 5. Query prospects (count de novos)
      const { count: numProspectsNovos } = await sb
        .from("prospects")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", input.tenant_id)
        .eq("status", "novo");

      logger.info("vera-snapshot-diario: prospects novos", { count: numProspectsNovos });

      // 6. Query cora_cobrancas — taxa de recuperação
      let taxaRecuperacao: Record<string, unknown> = {};
      try {
        const { data: cobrancasTotal } = await sb
          .from("cora_cobrancas")
          .select("id, status, valor_atual")
          .eq("tenant_id", input.tenant_id);

        const todas = (cobrancasTotal ?? []) as { id: string; status: string; valor_atual: string | number }[];
        const pagas = todas.filter((c) => c.status === "pago");
        const valorRecuperado = pagas.reduce((sum, c) => sum + Number(c.valor_atual ?? 0), 0);

        taxaRecuperacao = {
          total:            todas.length,
          pagas:            pagas.length,
          valor_recuperado: Number(valorRecuperado.toFixed(2)),
        };
      } catch {
        logger.warn("vera-snapshot-diario: cora_cobrancas não disponível");
      }

      // 7. Monta objeto metricas consolidado
      const metricas: Record<string, unknown> = {
        data:                   dataOntem,
        num_prospects_novos:    numProspectsNovos ?? 0,
        cobrancas:              taxaRecuperacao,
        agentes:                metricasAgentes,
        conversas:              metricasConversas,
        negocio:                metricasNegocio,
        gerado_em:              new Date().toISOString(),
      };

      logger.info("vera-snapshot-diario: métricas consolidadas, salvando snapshot");

      // 8. UPSERT em vera_metricas_snapshot
      const { error: upsertError } = await sb
        .from("vera_metricas_snapshot")
        .upsert(
          {
            tenant_id:  input.tenant_id,
            data:       dataOntem,
            metricas,
          },
          { onConflict: "tenant_id,data" }
        );

      if (upsertError) {
        throw new Error(`Erro ao salvar snapshot: ${upsertError.message}`);
      }

      logger.info("vera-snapshot-diario concluído com sucesso", {
        tenant_id: input.tenant_id,
        data:      dataOntem,
      });

      const output = OutputSchema.parse({
        ok:        true,
        tenant_id: input.tenant_id,
        data:      dataOntem,
        metricas,
      });

      // OBRIGATÓRIO: audit log (sucesso)
      await logAgentRun({
        runId:       ctx.run.id,
        agentSlug:   "vera",
        tenantId:    input.tenant_id,
        triggeredBy: input.triggered_by,
        input,
        output,
        status:      "success",
      });

      return output;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.error("vera-snapshot-diario falhou", {
        tenant_id: input.tenant_id,
        error:     errorMessage,
      });

      // OBRIGATÓRIO: audit log (falha)
      await logAgentRun({
        runId:       ctx.run.id,
        agentSlug:   "vera",
        tenantId:    input.tenant_id,
        triggeredBy: input.triggered_by,
        input,
        output:      { error: errorMessage },
        status:      "failed",
      });

      throw error;
    }
  },
});
