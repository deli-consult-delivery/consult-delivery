import { getSupabase } from "./supabase";

interface AgentRunLog {
  runId: string;
  agentSlug: string;
  input: unknown;
  output: unknown;
  tenantId?: string;
  triggeredBy?: string;
  durationMs?: number;
  costUsd?: number;
  status?: "success" | "failed";
}

export async function logAgentRun({
  runId,
  agentSlug,
  input,
  output,
  tenantId,
  triggeredBy,
  durationMs,
  costUsd,
  status = "success",
}: AgentRunLog): Promise<void> {
  try {
    const { error } = await getSupabase().from("agent_runs").upsert(
      {
        trigger_dev_run_id: runId,
        agent_id: agentSlug,
        input,
        output,
        tenant_id: tenantId ?? null,
        triggered_by: triggeredBy ?? null,
        duration_ms: durationMs ?? null,
        cost_usd: costUsd ?? null,
        status,
        completed_at: new Date().toISOString(),
      },
      { onConflict: "trigger_dev_run_id" }
    );
    if (error) throw error;
  } catch (err) {
    // Soft-fail: não quebra a task se a tabela agent_runs ainda não existir
    // (será criada pela migration 20260512_003)
    console.warn("[audit] logAgentRun falhou:", (err as Error).message);
  }
}
