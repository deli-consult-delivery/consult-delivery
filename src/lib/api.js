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
