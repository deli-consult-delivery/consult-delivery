import { getSupabase } from "../../../trigger/_shared/supabase";
import { logAgentRun } from "../../../trigger/_shared/audit";
import { chat } from "../../../trigger/agents/llm-client";

export interface RunContext {
  runId: string;
  tenantId?: string;
}

// ── Memória Central ───────────────────────────────────────────────────────────

export interface ClientFact {
  category: string;
  key: string;
  value: unknown;
  confidence: number;
  source_agent: string | null;
  ts: string;
}

export interface TimelineEvent {
  agent_name: string | null;
  event_type: string;
  title: string;
  description: string | null;
  payload: unknown;
  ts: string;
}

export interface ClientContext {
  facts: ClientFact[];
  timeline: TimelineEvent[];
}

/** Carrega até 20 fatos ativos + 30 eventos recentes de uma loja. */
export async function getClientContext(
  lojaId: string,
  tenantId: string
): Promise<ClientContext> {
  const supabase = getSupabase();
  const now = new Date().toISOString();

  const [{ data: facts }, { data: timeline }] = await Promise.all([
    supabase
      .from("client_facts")
      .select("category, key, value, confidence, source_agent, ts")
      .eq("loja_id", lojaId)
      .eq("tenant_id", tenantId)
      .or(`expires_at.is.null,expires_at.gt.${now}`)
      .order("confidence", { ascending: false })
      .limit(20),
    supabase
      .from("client_timeline")
      .select("agent_name, event_type, title, description, payload, ts")
      .eq("loja_id", lojaId)
      .order("ts", { ascending: false })
      .limit(30),
  ]);

  return { facts: (facts as ClientFact[]) ?? [], timeline: (timeline as TimelineEvent[]) ?? [] };
}

/** Grava ou atualiza um fato sobre uma loja (upsert manual por loja+category+key). */
export async function recordFact(
  lojaId: string,
  tenantId: string,
  category: string,
  key: string,
  value: unknown,
  options?: { sourceAgent?: string; confidence?: number; expiresAt?: Date }
): Promise<void> {
  const supabase = getSupabase();

  const { data: existing } = await supabase
    .from("client_facts")
    .select("id")
    .eq("loja_id", lojaId)
    .eq("tenant_id", tenantId)
    .eq("category", category)
    .eq("key", key)
    .maybeSingle();

  const record = {
    loja_id: lojaId,
    tenant_id: tenantId,
    category,
    key,
    value,
    source_agent: options?.sourceAgent ?? null,
    confidence: Math.min(1, Math.max(0, options?.confidence ?? 1.0)),
    expires_at: options?.expiresAt?.toISOString() ?? null,
    updated_at: new Date().toISOString(),
  };

  if (existing) {
    const { error } = await supabase.from("client_facts").update(record).eq("id", existing.id);
    if (error) console.warn(`[runtime] recordFact update falhou (loja=${lojaId}): ${error.message}`);
  } else {
    const { error } = await supabase.from("client_facts").insert(record);
    if (error) console.warn(`[runtime] recordFact insert falhou (loja=${lojaId}): ${error.message}`);
  }
}

/** Registra um evento imutável na timeline de uma loja. */
export async function logTimeline(
  lojaId: string,
  tenantId: string,
  agentName: string,
  eventType: string,
  title: string,
  options?: { description?: string; payload?: unknown }
): Promise<void> {
  const supabase = getSupabase();

  const { error } = await supabase.from("client_timeline").insert({
    loja_id: lojaId,
    tenant_id: tenantId,
    agent_name: agentName,
    event_type: eventType,
    title,
    description: options?.description ?? null,
    payload: options?.payload ?? null,
  });

  if (error) {
    console.warn(`[runtime] logTimeline falhou (loja=${lojaId}): ${error.message}`);
  }
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

  // forceJson=false: agentes de texto (DELI, LARA, VERA) não devem ter formato forçado;
  // agentes que precisam de JSON incluem a instrução no próprio payload.
  const response = await chat([
    { role: "system", content: systemPrompt },
    { role: "user",   content: JSON.stringify(payload) },
  ], false);

  const output = response.content;
  const tokens = (response.tokens_in ?? 0) + (response.tokens_out ?? 0);

  await logRun({
    runId: ctx.runId,
    agentSlug: agentId,
    tenantId: ctx.tenantId,
    input: payload,
    output,
    status: "success",
  });

  return { output, tokens, modelId: response.modelo };
}
