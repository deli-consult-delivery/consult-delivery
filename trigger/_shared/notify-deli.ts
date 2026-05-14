import { getSupabase } from "./supabase";

interface NotifyDeliParams {
  tenantId: string;
  content: string;
  sourceAgent: string;
  sourceTask: string;
  runId?: string;
}

/**
 * Insere notificação de agente no feed da DELI.
 * Aparece no chat da DELI com avatar do agente de origem.
 * Soft-fail: nunca quebra a task pai.
 */
export async function notifyDeli({
  tenantId,
  content,
  sourceAgent,
  sourceTask,
  runId,
}: NotifyDeliParams): Promise<void> {
  try {
    await getSupabase()
      .from("deli_messages")
      .insert({
        tenant_id: tenantId,
        user_id: null,
        role: "assistant",
        content,
        metadata: {
          source_agent: sourceAgent,
          source_task: sourceTask,
          run_id: runId ?? null,
        },
      });
  } catch (err) {
    console.warn("[notify-deli] falhou:", (err as Error).message);
  }
}
