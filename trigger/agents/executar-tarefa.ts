import { task, logger } from "@trigger.dev/sdk/v3";
import { z } from "zod";
import { getSupabase } from "../_shared/supabase";
import { logAgentRun } from "../_shared/audit";

const InputSchema = z.object({
  tenant_id: z.string().uuid(),
  task_id:   z.string().uuid(),
  triggered_by: z.string().uuid().optional(),
});

const OutputSchema = z.object({
  ok:               z.boolean(),
  loop_state:       z.enum(["executing", "done", "failed"]),
  execution_run_id: z.string().optional(),
  execution_result: z.record(z.unknown()).optional(),
  error:            z.string().optional(),
});

export const agentExecutarTarefa = task({
  id: "agent-executar-tarefa",
  retry: { maxAttempts: 2, minTimeoutInMs: 2000 },
  run: async (payload: unknown, { ctx }) => {
    const start = Date.now();
    const input = InputSchema.parse(payload);
    const sb = getSupabase();

    // 1. Carregar tarefa e garantir que está no estado 'open'
    const { data: tarefa, error: tarefaErr } = await sb
      .from("client_tasks")
      .select("id, tenant_id, title, target_system, loop_state, execution_result")
      .eq("id", input.task_id)
      .eq("tenant_id", input.tenant_id)
      .maybeSingle();

    if (tarefaErr || !tarefa) {
      throw new Error(`agent-executar-tarefa: tarefa não encontrada: ${tarefaErr?.message ?? input.task_id}`);
    }

    if (tarefa.loop_state !== "open") {
      logger.info("agent-executar-tarefa: tarefa já processada, pulando", {
        task_id: input.task_id, loop_state: tarefa.loop_state,
      });
      return OutputSchema.parse({
        ok: true, loop_state: tarefa.loop_state as "done" | "executing",
      });
    }

    // 2. Marcar como 'executing'
    await sb.from("client_tasks")
      .update({ loop_state: "executing", execution_run_id: ctx.run.id })
      .eq("id", input.task_id)
      .eq("tenant_id", input.tenant_id);

    // 3. Executar no sistema alvo
    let executionResult: Record<string, unknown> = { sistema: tarefa.target_system };
    let finalState: "done" | "failed" = "done";
    let errorMsg: string | undefined;

    const bridgeUrl = process.env.BRIDGE_URL ?? "http://187.127.25.24:3001";
    const bridgeToken = process.env.INTERNAL_BRIDGE_TOKEN;

    if (!bridgeToken) {
      throw new Error("agent-executar-tarefa: INTERNAL_BRIDGE_TOKEN não configurado");
    }

    if (tarefa.target_system === "vendaerp") {
      // Leitura de contratos como prova de execução read-only
      try {
        const statusRes = await fetch(`${bridgeUrl}/api/vendaerp/status`, {
          headers: { "x-internal-token": bridgeToken },
          signal: AbortSignal.timeout(15_000),
        });

        if (statusRes.ok) {
          const statusData = await statusRes.json() as { ok: boolean; data: unknown };
          executionResult = {
            sistema: "vendaerp",
            status_erp: statusData.data,
            titulo_tarefa: tarefa.title,
            ok: true,
          };
        } else {
          const errText = await statusRes.text();
          throw new Error(`Bridge VendaERP retornou ${statusRes.status}: ${errText.slice(0, 200)}`);
        }
      } catch (err) {
        errorMsg = (err as Error).message;
        finalState = "failed";
        executionResult = { sistema: "vendaerp", error: errorMsg, titulo_tarefa: tarefa.title };
        logger.warn("agent-executar-tarefa: falha VendaERP", { error: errorMsg });
      }
    } else if (tarefa.target_system === "asaas") {
      // placeholder — integração Asaas em fase futura
      executionResult = { sistema: "asaas", ok: false, error: "Integração Asaas não implementada nesta fase." };
      finalState = "done";
    } else {
      // nenhum — resolve com conhecimento/memória
      const prevResult = tarefa.execution_result as Record<string, unknown> | null;
      executionResult = {
        sistema: "nenhum",
        titulo_tarefa: tarefa.title,
        ...( prevResult ? { contexto: prevResult } : {} ),
        ok: true,
      };
    }

    // 4. Salvar resultado
    await sb.from("client_tasks")
      .update({
        loop_state:       finalState,
        execution_result: executionResult,
        status:           finalState === "done" ? "done" : "blocked",
      })
      .eq("id", input.task_id)
      .eq("tenant_id", input.tenant_id);

    await logAgentRun({
      runId: ctx.run.id, agentSlug: "agent-executar-tarefa",
      input:  { task_id: input.task_id, target_system: tarefa.target_system },
      output: { ok: finalState === "done", loop_state: finalState, execution_result: executionResult },
      tenantId: input.tenant_id, triggeredBy: input.triggered_by,
      durationMs: Date.now() - start,
      status: finalState === "done" ? "success" : "failed",
    });

    return OutputSchema.parse({
      ok: finalState === "done",
      loop_state: finalState,
      execution_run_id: ctx.run.id,
      execution_result: executionResult,
      error: errorMsg,
    });
  },
});
