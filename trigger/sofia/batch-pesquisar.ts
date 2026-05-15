import { task, tasks, logger } from "@trigger.dev/sdk/v3";
import { z } from "zod";
import { logAgentRun } from "../_shared/audit";

// =====================================================
// SCHEMAS
// =====================================================

const InputSchema = z.object({
  tenant_id:    z.string().uuid(),
  prospect_ids: z.array(z.string().uuid()).min(1).max(20),
  triggered_by: z.string().uuid().optional(),
});

const OutputSchema = z.object({
  ok:        z.boolean(),
  total:     z.number(),
  disparados: z.number(),
  erros:     z.number(),
});

type Input = z.infer<typeof InputSchema>;
type Output = z.infer<typeof OutputSchema>;

// =====================================================
// TASK
// =====================================================

export const sofiaBatchPesquisar = task({
  id: "sofia-batch-pesquisar",
  // Retry baixo: cada sub-task tem seu próprio retry configurado
  retry: { maxAttempts: 1, minTimeoutInMs: 1000 },

  run: async (payload: Input, { ctx }): Promise<Output> => {
    // OBRIGATÓRIO: validar input
    const input = InputSchema.parse(payload);

    logger.info("sofia-batch-pesquisar iniciado", {
      tenant_id:  input.tenant_id,
      total:      input.prospect_ids.length,
    });

    try {
      // Dispara sofia-pesquisar-prospect em paralelo para cada prospect_id
      const resultados = await Promise.allSettled(
        input.prospect_ids.map((prospect_id) =>
          tasks.trigger("sofia-pesquisar-prospect", {
            tenant_id:    input.tenant_id,
            prospect_id,
            triggered_by: input.triggered_by,
          })
        )
      );

      // Contabiliza disparados vs erros
      let disparados = 0;
      let erros = 0;

      for (const resultado of resultados) {
        if (resultado.status === "fulfilled") {
          disparados++;
        } else {
          erros++;
          logger.warn("Falha ao disparar sub-task de pesquisa", {
            reason: resultado.reason instanceof Error
              ? resultado.reason.message
              : String(resultado.reason),
          });
        }
      }

      logger.info("sofia-batch-pesquisar concluído", {
        total:      input.prospect_ids.length,
        disparados,
        erros,
      });

      // OBRIGATÓRIO: audit log
      await logAgentRun({
        runId:       ctx.run.id,
        agentSlug:   "sofia",
        tenantId:    input.tenant_id,
        triggeredBy: input.triggered_by,
        input,
        output: {
          ok:         true,
          total:      input.prospect_ids.length,
          disparados,
          erros,
        },
        status: "success",
      });

      return OutputSchema.parse({
        ok:         true,
        total:      input.prospect_ids.length,
        disparados,
        erros,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.error("sofia-batch-pesquisar falhou de forma inesperada", {
        error: errorMessage,
      });

      await logAgentRun({
        runId:       ctx.run.id,
        agentSlug:   "sofia",
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
