import Anthropic from "@anthropic-ai/sdk";
import { getSupabase } from "../../../trigger/_shared/supabase";
import { getAnthropic } from "../../../trigger/_shared/claude";
import { logAgentRun } from "../../../trigger/_shared/audit";

export interface RunContext {
  runId: string;
  tenantId?: string;
}

export interface AgentResult {
  output: unknown;
  tokens: number;
  modelId: string;
}

export interface RunLogParams {
  runId: string;
  agentSlug: string;
  tenantId?: string;
  input: unknown;
  output: unknown;
  status: "success" | "failed";
}

export async function getPrompt(agentId: string, tenantId: string): Promise<string> {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from("agent_prompts")
    .select("prompt")
    .eq("agent_id", agentId)
    .eq("active", true)
    .or(tenantId ? `tenant_id.eq.${tenantId},tenant_id.is.null` : "tenant_id.is.null")
    .order("tenant_id", { ascending: true, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`[runtime] getPrompt falhou (agent=${agentId}): ${error.message}`);
  }
  if (!data) {
    throw new Error(`[runtime] prompt não encontrado: agent=${agentId} tenant=${tenantId || "global"}`);
  }
  return data.prompt;
}

export async function logRun(params: RunLogParams): Promise<void> {
  await logAgentRun({
    runId: params.runId,
    agentSlug: params.agentSlug,
    tenantId: params.tenantId,
    input: params.input,
    output: params.output,
    status: params.status,
  });
}

export async function executeAgent(
  agentId: string,
  payload: unknown,
  ctx: RunContext
): Promise<AgentResult> {
  const systemPrompt = await getPrompt(agentId, ctx.tenantId ?? "");

  const client: Anthropic = getAnthropic();
  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{ role: "user", content: JSON.stringify(payload) }],
  });

  const output = response.content
    .filter((b) => b.type === "text")
    .map((b) => (b as Anthropic.TextBlock).text)
    .join("");

  const tokens =
    (response.usage?.input_tokens ?? 0) + (response.usage?.output_tokens ?? 0);

  await logRun({
    runId: ctx.runId,
    agentSlug: agentId,
    tenantId: ctx.tenantId,
    input: payload,
    output,
    status: "success",
  });

  return { output, tokens, modelId: "claude-sonnet-4-6" };
}
