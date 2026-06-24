import { getSupabase } from "./supabase";

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type LoopTargetSystem = "vendaerp" | "asaas" | "nenhum";
export type LoopState = "open" | "executing" | "done";
export type LoopStatus = "attending" | "task_pending" | "replied";

export interface CreateLoopTaskParams {
  tenantId: string;
  conversationId: string;
  customerId: string;
  agentId: string;
  titulo: string;
  descricao: string;
  prioridade: "urgent" | "high" | "normal" | "low";
  sistemaAlvo: LoopTargetSystem;
  operacao?: string | null;
  parametros?: Record<string, unknown> | null;
}

export interface CreateLoopTaskResult {
  taskId: string;
  conversationUpdated: boolean;
}

// ─── Helper: cria tarefa + atualiza conversa atomicamente ────────────────────

/**
 * Cria uma client_task vinculada ao loop AI-First e atualiza a conversa
 * com loop_status='task_pending' + active_task_id.
 *
 * Throws se a inserção da tarefa falhar (não silencia — o chamador decide).
 */
export async function createLoopTask(
  params: CreateLoopTaskParams
): Promise<CreateLoopTaskResult> {
  const sb = getSupabase();

  const { data: task, error: taskErr } = await sb
    .from("client_tasks")
    .insert({
      tenant_id:        params.tenantId,
      customer_id:      params.customerId,
      title:            params.titulo,
      description:      params.descricao,
      priority:         params.prioridade,
      status:           "doing",
      agent_id:         params.agentId,
      position:         0,
      conversation_id:  params.conversationId,
      loop_state:       "open" satisfies LoopState,
      target_system:    params.sistemaAlvo satisfies LoopTargetSystem,
      execution_result: params.operacao
        ? { operacao: params.operacao, parametros: params.parametros ?? null }
        : null,
    })
    .select("id")
    .single();

  if (taskErr || !task) {
    throw new Error(
      `createLoopTask: falha ao criar client_task: ${taskErr?.message ?? "sem retorno"}`
    );
  }

  const { error: convErr } = await sb
    .from("conversations")
    .update({
      loop_status:        "task_pending" satisfies LoopStatus,
      active_task_id:     task.id,
      attending_agent_id: params.agentId,
    })
    .eq("id", params.conversationId)
    .eq("tenant_id", params.tenantId);

  if (convErr) {
    console.warn(
      `[loop-tasks] falha ao atualizar conversa ${params.conversationId}:`,
      convErr.message
    );
  }

  return { taskId: task.id, conversationUpdated: !convErr };
}
