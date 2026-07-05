import { getSupabase } from "./supabase";

// UUID do tenant Consult Delivery — único tenant em produção.
// Tasks de sistema (cron sem contexto de tenant) logeiam sob este tenant.
// Após o cutover P-2, agent_runs.tenant_id é NOT NULL em todas as linhas.
const CONSULT_TENANT_ID = "9079bd4d-4df7-4023-90fb-d79c8ba7e900";

// Mapa automático agentSlug → pipeline_stage para runs que não passam o campo explicitamente.
// Garante que pipeline_stage fique preenchido mesmo em tasks legadas.
const AGENT_PIPELINE_STAGE: Record<string, string> = {
  "deli":                    "orchestrator",
  "deli-orchestrator-5min":  "orchestrator",
  "breno":                   "loop",
  "breno-resumir-conversa":  "loop",
  "breno-renotificar":       "loop",
  "lara":                    "crm",
  "vera":                    "bi",
  "cora":                    "financeiro",
  "sofia":                   "prospeccao",
  "analise-ifood":           "analise",
  "relatorio-diario":        "relatorio",
  "revisao-matinal":         "supervisao",
  "briefing-7h":             "supervisao",
  "supervisionar":           "supervisao",
  "conversa":                "atendimento",
  "chat-handler":            "atendimento",
  "nova":                    "onboarding",
};

interface AgentRunLog {
  runId: string;
  agentSlug: string;
  input: unknown;
  output: unknown;
  tenantId?: string;
  triggeredBy?: string;
  durationMs?: number;
  costUsd?: number | null;
  status?: "success" | "failed";
  explanation?: string;
  confidenceScore?: number;
  pipelineStage?: string;
  pipelinePosition?: number;
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
  explanation,
  confidenceScore,
  pipelineStage,
  pipelinePosition,
}: AgentRunLog): Promise<void> {
  try {
    const { error } = await getSupabase().from("agent_runs").upsert(
      {
        trigger_dev_run_id: runId,
        agent_id: agentSlug,
        input,
        output,
        tenant_id: tenantId ?? CONSULT_TENANT_ID,
        triggered_by: triggeredBy ?? null,
        duration_ms: durationMs ?? null,
        cost_usd: costUsd ?? null,
        status,
        completed_at: new Date().toISOString(),
        explanation: explanation ?? null,
        confidence_score: confidenceScore ?? null,
        pipeline_stage: pipelineStage ?? AGENT_PIPELINE_STAGE[agentSlug] ?? agentSlug,
        pipeline_position: pipelinePosition ?? null,
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
