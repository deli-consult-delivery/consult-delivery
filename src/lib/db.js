import { supabase } from './supabase.js';

// ── Tenants ──────────────────────────────────────────────────────────────────

export async function fetchUserTenants(userId) {
  const { data, error } = await supabase
    .from('tenant_members')
    .select('tenant_id, tenants(id, name, slug, theme_color, emoji)')
    .eq('user_id', userId);

  if (error || !data?.length) return null;

  return data.map(r => ({
    id: r.tenants.slug,
    dbId: r.tenants.id,
    name: r.tenants.name,
    emoji: r.tenants.emoji || '🏪',
    color: r.tenants.theme_color || '#B70C00',
  }));
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

export async function fetchDashboardKpis(tenantDbId) {
  const { data, error } = await supabase
    .from('v_dashboard_kpis')
    .select('*')
    .eq('tenant_id', tenantDbId)
    .single();

  if (error || !data) return null;

  return {
    pedidos:       { value: data.orders_today   ?? 0,    delta: data.orders_delta   ?? '—', trend: data.orders_trend   ?? 'neutral' },
    ticket:        { value: `R$ ${Number(data.avg_ticket ?? 0).toFixed(2)}`, delta: data.ticket_delta ?? '—', trend: data.ticket_trend ?? 'neutral' },
    tarefas:       { value: data.pending_tasks  ?? 0,    delta: data.tasks_delta    ?? '—', trend: data.tasks_trend    ?? 'neutral' },
    inadimplencia: { value: `R$ ${Number(data.overdue_amount ?? 0).toFixed(2)}`, delta: `${data.overdue_count ?? 0} clientes`, trend: 'down' },
  };
}

export async function fetchChart7d(tenantDbId) {
  const { data, error } = await supabase
    .from('v_chart_7d')
    .select('day, orders_count')
    .eq('tenant_id', tenantDbId)
    .order('day', { ascending: true })
    .limit(7);

  if (error || !data?.length) return null;

  return data.map(r => r.orders_count ?? 0);
}

export async function fetchRecentActions(tenantDbId) {
  const { data, error } = await supabase
    .from('agent_actions')
    .select('id, description, created_at, agents(id, name, color)')
    .eq('tenant_id', tenantDbId)
    .order('created_at', { ascending: false })
    .limit(6);

  if (error || !data?.length) return null;

  return data.map(r => {
    const age = Date.now() - new Date(r.created_at).getTime();
    const mins = Math.floor(age / 60000);
    const time = mins < 1 ? 'agora' : mins < 60 ? `${mins} min` : `${Math.floor(mins / 60)}h`;
    return { agent: r.agents?.id, text: r.description, time };
  });
}

// ── Tasks ─────────────────────────────────────────────────────────────────────

export async function fetchTasks(tenantDbId) {
  const { data, error } = await supabase
    .from('tasks')
    .select('id, title, description, status, priority, due_date, agents(id), assignee')
    .eq('tenant_id', tenantDbId)
    .order('created_at', { ascending: false });

  if (error || !data?.length) return null;

  const COL_MAP = { todo: 'todo', in_progress: 'progress', review: 'review', done: 'done' };

  return data.map(t => ({
    id: t.id,
    title: t.title,
    desc: t.description ?? '',
    col: COL_MAP[t.status] ?? 'todo',
    priority: t.priority ?? 'med',
    due: t.due_date ? new Date(t.due_date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '',
    assignee: t.assignee ?? 'W',
    comments: 0,
    attachments: 0,
    checklist: null,
    agent: t.agents?.id ?? null,
  }));
}

// ── Inadimplências ────────────────────────────────────────────────────────────

export async function fetchInadimplencias(tenantDbId) {
  const { data, error } = await supabase
    .from('inadimplencias')
    .select('id, customer_name, amount_due, days_overdue, last_contact_at, status')
    .eq('tenant_id', tenantDbId)
    .order('days_overdue', { ascending: false });

  if (error || !data?.length) return null;

  const initials = name => name?.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase() ?? '??';
  const timeAgo = iso => {
    if (!iso) return 'nunca';
    const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
    if (m < 1) return 'agora';
    if (m < 60) return `há ${m}min`;
    if (m < 1440) return `há ${Math.floor(m / 60)}h`;
    return 'ontem';
  };

  return data.map(r => ({
    id: r.id,
    name: r.customer_name,
    avatar: initials(r.customer_name),
    value: `R$ ${Number(r.amount_due).toFixed(2).replace('.', ',')}`,
    days: r.days_overdue ?? 0,
    last: timeAgo(r.last_contact_at),
    status: r.status ?? 'trying',
  }));
}

// ── Conversas ─────────────────────────────────────────────────────────────────

export async function fetchConversations(tenantDbId) {
  const { data, error } = await supabase
    .from('conversations')
    .select(`
      id, type, channel, unread_count, last_message_at,
      customers(id, name),
      messages(id, content, direction, created_at)
    `)
    .eq('tenant_id', tenantDbId)
    .order('last_message_at', { ascending: false })
    .limit(20);

  if (error || !data?.length) return null;

  const initials = name => name?.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase() ?? '??';

  return data.map(c => {
    const msgs = (c.messages ?? []).sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    const last = msgs[msgs.length - 1];
    return {
      id: c.id,
      type: c.channel ?? 'whatsapp',
      name: c.customers?.name ?? 'Desconhecido',
      avatar: initials(c.customers?.name),
      preview: last?.content?.slice(0, 50) ?? '',
      time: last ? new Date(last.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '',
      unread: c.unread_count ?? 0,
      online: false,
      messages: msgs.map(m => ({ from: m.direction === 'inbound' ? 'in' : 'out', text: m.content, time: new Date(m.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) })),
    };
  });
}
