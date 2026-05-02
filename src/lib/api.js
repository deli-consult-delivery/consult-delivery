import { supabase } from './supabase';

/** @typedef {import('../types/database').Database} Database */
/** @typedef {Database['public']['Tables']['tenants']['Row']} Tenant */
/** @typedef {Database['public']['Tables']['agents']['Row']} Agent */
/** @typedef {Database['public']['Tables']['conversations']['Row']} Conversation */
/** @typedef {Database['public']['Tables']['messages']['Row']} Message */
/** @typedef {Database['public']['Tables']['tasks']['Row']} Task */
/** @typedef {Database['public']['Tables']['inadimplencias']['Row']} Inadimplencia */
/** @typedef {Database['public']['Tables']['agent_actions']['Row']} AgentAction */
/** @typedef {Database['public']['Views']['v_dashboard_kpis']['Row']} DashboardKpi */
/** @typedef {Database['public']['Tables']['analises']['Row']} Analise */

export async function listTenants() {
  const { data, error } = await supabase
    .from('tenants')
    .select('id, slug, name, emoji, color, status, plan')
    .order('name');
  if (error) throw error;
  return data ?? [];
}

export async function getTenantBySlug(slug) {
  const { data, error } = await supabase
    .from('tenants')
    .select('id, slug, name, emoji, color')
    .eq('slug', slug)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function listAgents() {
  const { data, error } = await supabase
    .from('agents')
    .select('*')
    .eq('is_active', true)
    .order('name');
  if (error) throw error;
  return data ?? [];
}

export async function getKPIs(tenantId) {
  const { data, error } = await supabase
    .from('v_dashboard_kpis')
    .select('*')
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getChart7d(tenantId) {
  const { data, error } = await supabase
    .from('v_chart_7d')
    .select('day, pedidos_count')
    .eq('tenant_id', tenantId)
    .order('day');
  if (error) throw error;

  const byDay = new Map((data ?? []).map(r => [r.day, r.pedidos_count ?? 0]));
  const out = [];
  const today = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const iso = d.toISOString().slice(0, 10);
    out.push(byDay.get(iso) ?? 0);
  }
  return out;
}

export async function getAgentActions(tenantId, limit = 6) {
  const { data, error } = await supabase
    .from('agent_actions')
    .select('id, agent_id, text, occurred_at')
    .eq('tenant_id', tenantId)
    .order('occurred_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function listConversations(tenantId) {
  const { data, error } = await supabase
    .from('conversations')
    .select(`
      id, type, title, preview, unread_count, is_online, last_message_at,
      customer:customers(id, name, avatar, is_vip, tags),
      agent:agents(id, name, letter, color)
    `)
    .eq('tenant_id', tenantId)
    .eq('status', 'open')
    .order('last_message_at', { ascending: false, nullsFirst: false });
  if (error) throw error;
  return data ?? [];
}

export async function listMessages(conversationId) {
  const { data, error } = await supabase
    .from('messages')
    .select('id, direction, sender_kind, body, sent_at')
    .eq('conversation_id', conversationId)
    .order('sent_at');
  if (error) throw error;
  return data ?? [];
}

export async function listTasks(tenantId) {
  const { data, error } = await supabase
    .from('tasks')
    .select(`
      id, title, description, col, priority, due_label,
      checklist_done, checklist_total, attachments_count, position, agent_id,
      assignee:profiles!tasks_assignee_id_fkey(id, full_name, avatar_url)
    `)
    .eq('tenant_id', tenantId)
    .order('col')
    .order('position');
  if (error) throw error;
  return data ?? [];
}

export async function moveTask(taskId, col, position) {
  const { error } = await supabase
    .from('tasks')
    .update({ col, position })
    .eq('id', taskId);
  if (error) throw error;
}

export async function listInadimplencias(tenantId) {
  const { data, error } = await supabase
    .from('inadimplencias')
    .select(`
      id, amount_cents, days_late, status, last_action_at, next_action,
      sentiment_score, pay_probability,
      customer:customers(id, name, avatar)
    `)
    .eq('tenant_id', tenantId)
    .order('amount_cents', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function listInadimplenciaTranscript(inadimplenciaId) {
  const { data, error } = await supabase
    .from('inadimplencia_messages')
    .select('id, from_kind, body, sent_at')
    .eq('inadimplencia_id', inadimplenciaId)
    .order('sent_at');
  if (error) throw error;
  return data ?? [];
}

// ─────────────────────────────────────────────────────────────────────────────
// Módulo Análise iFood — SCHEMA-05
// ─────────────────────────────────────────────────────────────────────────────

export async function createAnalise(payload) {
  // payload: { tenant_id, cliente_id, drive_link, periodo, criado_por }
  // Returns: { id, job_id, status }
  const { data, error } = await supabase
    .from('analises')
    .insert({ ...payload, status: 'pending' })
    .select('id, job_id, status')
    .single();
  if (error) throw error;
  return data;
}

export async function getAnalise(jobId) {
  const { data, error } = await supabase
    .from('analises')
    .select('*')
    .eq('job_id', jobId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function listAnalises(tenantId) {
  const { data, error } = await supabase
    .from('analises')
    .select(`
      id, job_id, status, periodo, drive_link, created_at, error_message,
      cliente:customers(id, name)
    `)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function listClientes(tenantId) {
  const { data, error } = await supabase
    .from('customers')
    .select('id, name, phone')
    .eq('tenant_id', tenantId)
    .order('name');
  if (error) throw error;
  return data ?? [];
}

// subscribeToAnalise is NOT async — it returns an unsubscribe cleanup function synchronously.
// REPLICA IDENTITY FULL on the analises table ensures payload.new contains the full row,
// not just the primary key. Call the returned function in useEffect's cleanup.
export function subscribeToAnalise(jobId, callback) {
  const channel = supabase
    .channel(`analise-${jobId}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'analises', filter: `job_id=eq.${jobId}` },
      payload => callback(payload.new)
    )
    .subscribe();
  return () => supabase.removeChannel(channel);
}

// ─────────────────────────────────────────────────────────────────────────────
// Tarefas do Cliente — geradas pelo analista-ifood por análise
// ─────────────────────────────────────────────────────────────────────────────

export async function createTarefasAnalise(analise_id, cliente_id, top5) {
  const tarefas = top5.map(item => ({
    analise_id,
    cliente_id,
    titulo: item.titulo,
    descricao: item.problema,
    acao: item.acao,
    urgencia: item.urgencia,
    prioridade: item.ordem,
    impacto_financeiro: item.impacto_financeiro,
    status: 'pendente',
  }));
  const { data, error } = await supabase
    .from('tarefas_analise')
    .insert(tarefas)
    .select();
  if (error) throw error;
  return data;
}

export async function listTarefasCliente(cliente_id) {
  const { data, error } = await supabase
    .from('tarefas_analise')
    .select('*, analises(created_at, resultado_json)')
    .eq('cliente_id', cliente_id)
    .order('prioridade', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function updateStatusTarefa(tarefa_id, status) {
  const { data, error } = await supabase
    .from('tarefas_analise')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', tarefa_id)
    .select();
  if (error) throw error;
  return data;
}
