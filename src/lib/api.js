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
    .select('id, slug, name, emoji, color, status, plan, parent_tenant_id')
    .order('name')
    .limit(50);
  if (error) throw error;
  return data ?? [];
}

export async function listTenantsWithRole(userId) {
  const [tenants, memberRes] = await Promise.all([
    listTenants(),
    userId
      ? supabase.from('tenant_members').select('tenant_id, role').eq('user_id', userId)
      : Promise.resolve({ data: [] }),
  ]);
  const roleByTenant = new Map((memberRes.data || []).map(m => [m.tenant_id, m.role]));
  const byId = new Map(tenants.map(t => [t.id, t]));
  const resolveRole = (t) => {
    const seen = new Set();
    let cur = t;
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id);
      if (roleByTenant.has(cur.id)) return roleByTenant.get(cur.id);
      cur = cur.parent_tenant_id ? byId.get(cur.parent_tenant_id) : null;
    }
    return undefined;
  };
  return tenants.map(t => ({ ...t, role: resolveRole(t) }));
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

export async function createAnalise(payload) {
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
      resultado_json, mensagem_whatsapp,
      cliente:customers(id, name)
    `)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function listClientes(tenantId) {
  const { data: lojasAtivas, error: eLojas } = await supabase
    .from('lojas')
    .select('client_id')
    .eq('tenant_id', tenantId)
    .eq('is_consultoria_ativa', true)
    .not('client_id', 'is', null);
  if (eLojas) throw eLojas;
  const ids = [...new Set((lojasAtivas ?? []).map(l => l.client_id))];
  if (ids.length === 0) return [];
  const { data, error } = await supabase
    .from('customers')
    .select('id, name, phone')
    .eq('tenant_id', tenantId)
    .in('id', ids)
    .order('name');
  if (error) throw error;
  return data ?? [];
}

export async function updateCustomer(id, updates) {
  const { error } = await supabase.from('customers').update(updates).eq('id', id);
  if (error) throw error;
}

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

export async function createCorrecao({ tenant_id, bloco, instrucao }) {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('agent_corrections')
    .insert({ tenant_id, bloco, instrucao, created_by: user?.id })
    .select('id')
    .single();
  if (error) throw error;
  return data;
}

export async function listCorrecoes(tenantId) {
  const { data, error } = await supabase
    .from('agent_corrections')
    .select('id, bloco, instrucao, ativo, created_at')
    .eq('tenant_id', tenantId)
    .eq('ativo', true)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function desativarCorrecao(id) {
  const { error } = await supabase
    .from('agent_corrections')
    .update({ ativo: false })
    .eq('id', id);
  if (error) throw error;
}

export async function createTask(payload) {
  const { data, error } = await supabase
    .from('tasks')
    .insert(payload)
    .select('id')
    .single();
  if (error) throw error;
  return data;
}

export async function updateTask(taskId, updates) {
  const { error } = await supabase
    .from('tasks')
    .update(updates)
    .eq('id', taskId);
  if (error) throw error;
}

export async function deleteTask(taskId) {
  const { error } = await supabase
    .from('tasks')
    .delete()
    .eq('id', taskId);
  if (error) throw error;
}

export async function listClientTasks(tenantId, listId) {
  let q = supabase
    .from('client_tasks')
    .select('*, assignee:profiles!assignee_id(id, full_name, avatar_url)')
    .order('position', { ascending: true });
  if (tenantId) q = q.eq('tenant_id', tenantId);
  if (listId)   q = q.eq('list_id', listId);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function createClientTask(payload) {
  const { data, error } = await supabase
    .from('client_tasks').insert(payload).select('id').single();
  if (error) throw error;
  return data;
}

export async function updateClientTask(id, updates) {
  const { error } = await supabase
    .from('client_tasks').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}

export async function moveClientTask(id, columnId, position) {
  const { error } = await supabase
    .from('client_tasks').update({ column_id: columnId, position, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}

export async function deleteClientTask(id) {
  const { error } = await supabase.from('client_tasks').delete().eq('id', id);
  if (error) throw error;
}

const DEFAULT_COLUMNS = [
  { name: 'A Fazer',    color: '#6B7280', position: 0, is_done: false },
  { name: 'Fazendo',    color: '#3B82F6', position: 1, is_done: false },
  { name: 'Aguardando', color: '#F59E0B', position: 2, is_done: false },
  { name: 'Concluído',  color: '#10B981', position: 3, is_done: true  },
];

export async function listWorkspaces(tenantId) {
  const { data, error } = await supabase
    .from('espacos_workspaces')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('position', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function createWorkspace({ tenantId, name, color = '#B70C00', icon = null, position = 0 }) {
  const { data, error } = await supabase
    .from('espacos_workspaces')
    .insert({ tenant_id: tenantId, name, color, icon, position })
    .select('*').single();
  if (error) throw error;
  return data;
}

export async function updateWorkspace(id, updates) {
  const { error } = await supabase.from('espacos_workspaces').update(updates).eq('id', id);
  if (error) throw error;
}

export async function deleteWorkspace(id) {
  const { error } = await supabase.from('espacos_workspaces').delete().eq('id', id);
  if (error) throw error;
}

export async function listActiveMembers(tenantId) {
  const { data, error } = await supabase.rpc('get_tenant_members', { p_tenant_id: tenantId });
  if (error) throw error;
  return (data ?? []).map(m => ({
    id: m.user_id,
    name: m.display_name || m.full_name || m.email,
    role: m.role,
  }));
}

export async function listFolders(tenantId, customerId, workspaceId) {
  let q = supabase
    .from('espacos_folders')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('position', { ascending: true });
  if (customerId)   q = q.eq('customer_id', customerId);
  if (workspaceId)  q = q.eq('workspace_id', workspaceId);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function createFolder({ tenantId, customerId = null, workspaceId = null, name, color, icon, position = 0 }) {
  const { data, error } = await supabase
    .from('espacos_folders')
    .insert({ tenant_id: tenantId, customer_id: customerId, workspace_id: workspaceId, name, color, icon, position })
    .select('*').single();
  if (error) throw error;
  return data;
}

export async function updateFolder(id, updates) {
  const { error } = await supabase.from('espacos_folders').update(updates).eq('id', id);
  if (error) throw error;
}

export async function deleteFolder(id) {
  const { error } = await supabase.from('espacos_folders').delete().eq('id', id);
  if (error) throw error;
}

export async function listLists(folderId) {
  const { data, error } = await supabase
    .from('espacos_lists')
    .select('*')
    .eq('folder_id', folderId)
    .order('position', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function createList({ tenantId, folderId, name, color = '#6B7280', position = 0 }) {
  const { data: list, error } = await supabase
    .from('espacos_lists')
    .insert({ tenant_id: tenantId, folder_id: folderId, name, color, position })
    .select('*').single();
  if (error) throw error;

  const rows = DEFAULT_COLUMNS.map((c) => ({ ...c, tenant_id: tenantId, list_id: list.id }));
  const { data: columns, error: colErr } = await supabase
    .from('espacos_columns').insert(rows).select('*');
  if (colErr) throw colErr;

  return { list, columns: columns ?? [] };
}

export async function updateList(id, updates) {
  const { error } = await supabase.from('espacos_lists').update(updates).eq('id', id);
  if (error) throw error;
}

export async function deleteList(id) {
  const { error } = await supabase.from('espacos_lists').delete().eq('id', id);
  if (error) throw error;
}

export async function listColumns(listId) {
  const { data, error } = await supabase
    .from('espacos_columns')
    .select('*')
    .eq('list_id', listId)
    .order('position', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function createColumn({ tenantId, listId, name, color = '#6B7280', position = 0, isDone = false }) {
  const { data, error } = await supabase
    .from('espacos_columns')
    .insert({ tenant_id: tenantId, list_id: listId, name, color, position, is_done: isDone })
    .select('*').single();
  if (error) throw error;
  return data;
}

export async function updateColumn(id, updates) {
  const { error } = await supabase.from('espacos_columns').update(updates).eq('id', id);
  if (error) throw error;
}

export async function deleteColumn(id) {
  const { error } = await supabase.from('espacos_columns').delete().eq('id', id);
  if (error) throw error;
}

export async function reorderColumns(updates) {
  const results = await Promise.all(
    updates.map(({ id, position }) =>
      supabase.from('espacos_columns').update({ position }).eq('id', id))
  );
  const firstErr = results.find((r) => r.error);
  if (firstErr) throw firstErr.error;
}

export async function createTasksFromAnalise({ tenantId, analiseId, clienteId, pontos }) {
  const rows = pontos.map((p, i) => ({
    tenant_id:   tenantId,
    analise_id:  analiseId,
    cliente_id:  clienteId,
    title:       p.titulo,
    description: [p.descricao, p.acao ? `Ação: ${p.acao}` : ''].filter(Boolean).join('\n\n'),
    col:         'todo',
    priority:    p.status === 'critico' ? 'high' : p.status === 'atencao' ? 'med' : 'low',
    due_label:   '',
    position:    i,
    fonte:       'analise',
  }));
  const { data, error } = await supabase
    .from('tasks')
    .insert(rows)
    .select('id');
  if (error) throw error;
  return data ?? [];
}

export async function createSugestao({ tenant_id, texto, tela }) {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('sugestoes_plataforma')
    .insert({ tenant_id, texto, tela, created_by: user?.id })
    .select('id')
    .single();
  if (error) throw error;
  return data;
}

export async function listAgentDrafts(tenantId, filters = {}) {
  let q = supabase
    .from('agent_drafts')
    .select(`
      id, agent_name, channel, target_id, content, reasoning,
      status, rejection_reason, expires_at, created_at,
      loja:lojas(id, nome)
    `)
    .eq('tenant_id', tenantId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  if (filters.agent) q = q.eq('agent_name', filters.agent);
  if (filters.channel) q = q.eq('channel', filters.channel);

  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function approveDraft(draftId) {
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase
    .from('agent_drafts')
    .update({ status: 'approved', reviewer_id: user?.id, reviewed_at: new Date().toISOString() })
    .eq('id', draftId);
  if (error) throw error;
}

export async function rejectDraft(draftId, rejectionReason) {
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase
    .from('agent_drafts')
    .update({
      status: 'rejected',
      reviewer_id: user?.id,
      reviewed_at: new Date().toISOString(),
      rejection_reason: rejectionReason,
    })
    .eq('id', draftId);
  if (error) throw error;
}

export async function updateDraftContent(draftId, newContent, editsSummary) {
  const { error } = await supabase
    .from('agent_drafts')
    .update({ content: newContent, edits_made: editsSummary })
    .eq('id', draftId);
  if (error) throw error;
}

const DEBOUNCE_DRAFTS_MS = 2000;

export function subscribeToDrafts(tenantId, callback) {
  let debounceTimer = null;
  const channel = supabase
    .channel(`drafts-${tenantId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'agent_drafts', filter: `tenant_id=eq.${tenantId}` },
      payload => {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => callback(payload), DEBOUNCE_DRAFTS_MS);
      }
    )
    .subscribe();
  return () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    supabase.removeChannel(channel);
  };
}

export async function listLojasConsultoria(tenantId) {
  const { data, error } = await supabase
    .from('lojas')
    .select('id, nome, super_restaurante, whatsapp_group_jid, ifood_portal_nome')
    .eq('tenant_id', tenantId)
    .eq('is_consultoria_ativa', true)
    .eq('is_active', true)
    .order('nome');
  if (error) throw error;
  return data ?? [];
}

const BRIDGE = import.meta.env.VITE_BRIDGE_URL || 'https://bridge.consultdelivery.com.br';

export async function enviarWhatsAppAvaliacao({ tenantId, chatId, texto }) {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token || '';
  const res = await fetch(`${BRIDGE}/api/avaliacoes/enviar-whatsapp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ tenant_id: tenantId, chat_id: chatId, texto }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`enviarWhatsAppAvaliacao HTTP ${res.status}: ${body.slice(0, 300)}`);
  }
  return res.json();
}

// Resumo de notas da Review API (iFood oficial) — alimenta o card "Notas iFood"
// da Visão Geral. Rota já gated por fonte_dados==='api' + membership no Bridge.
export async function getIfoodSummary(lojaId) {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token || '';
  const res = await fetch(`${BRIDGE}/api/ifood-api/summary/${lojaId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`getIfoodSummary HTTP ${res.status}: ${body.slice(0, 300)}`);
  }
  const json = await res.json();
  return json.data?.summary ?? null;
}

// Cardápio (Catalog API oficial) por loja — GET /ifood-api/catalogo/:lojaId
// (#799, mergeado), gated por fonte_dados==='api' + membership no Bridge,
// mesmo padrão de getIfoodSummary. Distingue 404 "rota não existe" (corpo
// não é o envelope JSON {ok:...} — Express default, ex: rota removida/nunca
// deployada) de 404 "condição de negócio" (resolveLojaGated: loja não
// encontrada / sem ifood_merchants vinculado — SEMPRE vem com {ok:false,...}
// no corpo) via `err.rotaAusente`. Só o primeiro deve virar "indisponível";
// o segundo é um erro de configuração real e deve aparecer como tal.
export async function getCardapioApiLoja(lojaId) {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token || '';
  const res = await fetch(`${BRIDGE}/api/ifood-api/catalogo/${lojaId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    let json = null;
    try { json = JSON.parse(body); } catch { /* corpo não-JSON (ex: "Cannot GET ...") */ }
    const err = new Error(json?.error || `getCardapioApiLoja HTTP ${res.status}: ${body.slice(0, 300)}`);
    err.status = res.status;
    err.rotaAusente = res.status === 404 && !json; // 404 sem envelope JSON = rota inexistente
    throw err;
  }
  const json = await res.json();
  return json.data?.cardapio ?? json.data ?? null;
}

// Itens não-vendáveis (arquivados/fora do catálogo ativo) — App 3 Catálogo M2.
// Mesmo padrão de getCardapioApiLoja: mesma distinção 404 "rota ausente" × 404
// "condição de negócio" via err.rotaAusente. groupId = identificador do catálogo
// (campo que o próprio iFood devolve em cada catalog); catalogId opcional
// sobrescreve via query (a doc usa catalogId nesta rota, diferente de
// sellableItems que usa groupId — em muitos merchants são o mesmo id).
export async function getUnsellableApiLoja(lojaId, groupId, { catalogId } = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token || '';
  const qs = catalogId ? `?catalogId=${encodeURIComponent(catalogId)}` : '';
  const res = await fetch(`${BRIDGE}/api/ifood-api/catalogo/${lojaId}/unsellable/${encodeURIComponent(groupId)}${qs}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    let json = null;
    try { json = JSON.parse(body); } catch { /* corpo não-JSON */ }
    const err = new Error(json?.error || `getUnsellableApiLoja HTTP ${res.status}: ${body.slice(0, 300)}`);
    err.status = res.status;
    err.rotaAusente = res.status === 404 && !json;
    throw err;
  }
  const json = await res.json();
  return json.data?.itens ?? json.data ?? null;
}

// ── iFood Review API (fluxo draft→aprovação, homologação App Avaliações) ────
// Erros trazem status/code/message/retryAfterSeconds do Bridge (routes/ifood*.js)
// pra o front tratar 400/409/429 com mensagem clara — não um Error genérico.
async function ifoodBridgeFetch(path, { method = 'GET', body } = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token || '';
  const res = await fetch(`${BRIDGE}/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text().catch(() => '');
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* corpo não-JSON */ }
  if (!res.ok) {
    const err = new Error(json?.message || json?.error || `HTTP ${res.status}`);
    err.status = res.status;
    err.code = json?.code ?? null;
    err.details = json?.details ?? null;
    err.retryAfterSeconds = json?.retryAfterSeconds ?? null;
    throw err;
  }
  return json;
}

export async function listIfoodReviews({ lojaId, page, size, dataInicio, dataFim } = {}) {
  const qs = new URLSearchParams();
  if (page != null) qs.set('page', String(page));
  if (size != null) qs.set('size', String(size));
  if (dataInicio) qs.set('dataInicio', dataInicio);
  if (dataFim) qs.set('dataFim', dataFim);
  const q = qs.toString();
  const json = await ifoodBridgeFetch(`/ifood-api/reviews/${encodeURIComponent(lojaId)}${q ? `?${q}` : ''}`);
  return json?.data;
}

export async function getIfoodReviewDetalhe({ lojaId, reviewId }) {
  const json = await ifoodBridgeFetch(`/ifood-api/reviews/${encodeURIComponent(lojaId)}/${encodeURIComponent(reviewId)}`);
  return json?.data?.review;
}

// ── iFood Financeiro (App 2) — Sales já live; Repasses/Settlement quando o
// worker 83 entregar (rota pode não existir ainda — o chamador trata o erro
// como estado vazio, nunca card de erro pra "ainda não implementado").
// Sales é tenant-scoped (rota antiga /ifood/vendas, sem :lojaId) — Repasses
// já nasce no padrão novo (:lojaId, gated por resolveLojaGated).
export async function getIfoodVendas({ tenantId, dataInicio, dataFim } = {}) {
  const qs = new URLSearchParams({ tenant_id: tenantId });
  if (dataInicio) qs.set('dataInicio', dataInicio);
  if (dataFim) qs.set('dataFim', dataFim);
  const json = await ifoodBridgeFetch(`/ifood/vendas?${qs.toString()}`);
  return json?.data;
}

export async function getIfoodRepasses({ lojaId, dataInicio, dataFim } = {}) {
  const qs = new URLSearchParams();
  if (dataInicio) qs.set('dataInicio', dataInicio);
  if (dataFim) qs.set('dataFim', dataFim);
  const q = qs.toString();
  const json = await ifoodBridgeFetch(`/ifood-api/repasses/${encodeURIComponent(lojaId)}${q ? `?${q}` : ''}`);
  return json?.data?.repasses;
}

export async function criarDraftRespostaReview({ lojaId, reviewId, texto }) {
  const json = await ifoodBridgeFetch(`/ifood-api/reviews/${encodeURIComponent(lojaId)}/${encodeURIComponent(reviewId)}/draft`, {
    method: 'POST',
    body: { texto },
  });
  return json?.data;
}

export async function aprovarDraftIfood({ draftId, tenantId }) {
  const json = await ifoodBridgeFetch(`/ifood/aprovar/${encodeURIComponent(draftId)}`, {
    method: 'POST',
    body: { tenant_id: tenantId },
  });
  return json?.data;
}

export async function getAvaliacoesConfig(lojaId) {
  const { data, error } = await supabase
    .from('avaliacoes_loja_config')
    .select('id, loja_id, logistica_tipo, tom, tom_sugerido_ia, updated_at')
    .eq('loja_id', lojaId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function saveAvaliacoesConfig({ tenantId, lojaId, logistica_tipo, tom }) {
  const { data, error } = await supabase
    .from('avaliacoes_loja_config')
    .upsert(
      {
        tenant_id: tenantId,
        loja_id: lojaId,
        logistica_tipo,
        tom: tom ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'loja_id' }
    )
    .select('id, loja_id, logistica_tipo, tom, tom_sugerido_ia, updated_at')
    .single();
  if (error) throw error;
  return data;
}

export async function listLojasConfigAvaliacoes(tenantId) {
  const [lojasRes, cfgRes] = await Promise.all([
    supabase
      .from('lojas')
      .select('id, nome, super_restaurante, is_consultoria_ativa')
      .eq('tenant_id', tenantId)
      .eq('is_consultoria_ativa', true)
      .order('nome'),
    supabase
      .from('avaliacoes_loja_config')
      .select('loja_id, logistica_tipo, tom')
      .eq('tenant_id', tenantId),
  ]);
  if (lojasRes.error) throw lojasRes.error;
  if (cfgRes.error) throw cfgRes.error;
  const byLoja = new Map((cfgRes.data ?? []).map(c => [c.loja_id, c]));
  return (lojasRes.data ?? []).map(l => ({
    ...l,
    logistica_tipo: byLoja.get(l.id)?.logistica_tipo ?? null,
    tom: byLoja.get(l.id)?.tom ?? null,
  }));
}

export async function setLojaLogistica({ tenantId, lojaId, logistica_tipo }) {
  const { data, error } = await supabase
    .from('avaliacoes_loja_config')
    .upsert(
      { tenant_id: tenantId, loja_id: lojaId, logistica_tipo, updated_at: new Date().toISOString() },
      { onConflict: 'loja_id' }
    )
    .select('id, loja_id, logistica_tipo, tom, tom_sugerido_ia, updated_at')
    .single();
  if (error) throw error;
  return data;
}

export async function setLojaConsultoriaAtiva(lojaId, ativa) {
  const { data, error } = await supabase
    .from('lojas')
    .update({ is_consultoria_ativa: ativa })
    .eq('id', lojaId)
    .select('id, is_consultoria_ativa')
    .single();
  if (error) throw error;
  return data;
}

// Grupos WhatsApp via Bridge (GET /whatsapp/groups) — a chave da Evolution
// nunca sai do servidor; front autentica com o JWT da sessão.
export async function listEvoGroups(tenantId) {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token || '';
  const r = await fetch(`${BRIDGE}/whatsapp/groups?tenant_id=${encodeURIComponent(tenantId || '')}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) throw new Error(`listEvoGroups HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const data = await r.json();
  return (Array.isArray(data?.groups) ? data.groups : [])
    .map(g => ({ id: g.jid, name: g.name || g.jid }))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

export async function updateLojaWaGroup(lojaId, groupJid) {
  const { error } = await supabase
    .from('lojas')
    .update({ whatsapp_group_jid: groupJid || null })
    .eq('id', lojaId);
  if (error) throw error;
}

export async function listAvaliacoes(tenantId, lojaId) {
  let q = supabase
    .from('avaliacoes')
    .select(`
      id, loja_id, nota, comentario, nome_cliente, tipo, prazo_label,
      resposta_sugerida, resposta_final, insights_consultoria, status,
      draft_id, ajuste_pedido, run_id, created_at, updated_at
    `)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(100);
  if (lojaId) q = q.eq('loja_id', lojaId);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function updateAvaliacaoStatus(id, updates) {
  const { data, error } = await supabase
    .from('avaliacoes')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('id, status, resposta_final, ajuste_pedido, draft_id, updated_at')
    .single();
  if (error) throw error;
  return data;
}

export async function listAuditLog(tenantId, filters = {}) {
  let q = supabase
    .from('audit_log')
    .select('id, agent_name, user_id, action, resource, metadata, created_at')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });

  if (filters.agentName) q = q.eq('agent_name', filters.agentName);
  if (filters.limit) q = q.limit(filters.limit);

  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}


export async function listNotifications(tenantId, userId, { onlyUnread = false, limit = 50 } = {}) {
  let q = supabase
    .from('internal_notifications')
    .select('id, kind, agent, title, body, link, read_at, created_at, recipient_user_id')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (onlyUnread) q = q.is('read_at', null);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function countUnreadNotifications(tenantId, userId) {
  const { count, error } = await supabase
    .from('internal_notifications')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .is('read_at', null);
  if (error) throw error;
  return count ?? 0;
}

export async function markNotificationRead(notificationId) {
  const { error } = await supabase
    .from('internal_notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', notificationId);
  if (error) throw error;
}

export async function markAllNotificationsRead(tenantId, userId) {
  const { error } = await supabase
    .from('internal_notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('tenant_id', tenantId)
    .eq('recipient_user_id', userId)
    .is('read_at', null);
  if (error) throw error;
}

export async function deleteNotification(notificationId) {
  const { error } = await supabase
    .from('internal_notifications')
    .delete()
    .eq('id', notificationId);
  if (error) throw error;
}

export function subscribeToNotifications(tenantId, userId, onInsert, suffix = '') {
  const name = suffix
    ? `notifications-${tenantId}-${userId}-${suffix}`
    : `notifications-${tenantId}-${userId}`;
  return supabase
    .channel(name)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'internal_notifications',
      filter: `tenant_id=eq.${tenantId}`,
    }, onInsert)
    .subscribe();
}

export async function listTarefasIA(lojaId) {
  if (!lojaId) return [];
  const { data, error } = await supabase
    .from('tarefas_loja')
    .select('id, bloco, titulo, situacao, o_que_sera_feito, por_que_importa, prioridade, status, metadata, created_at, aprovada_em')
    .eq('loja_id', lojaId)
    .eq('criado_por_ia', true)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function aprovarTarefa(id, lojaId) {
  const { data, error } = await supabase
    .from('tarefas_loja')
    .update({ status: 'aprovada', aprovada_em: new Date().toISOString() })
    .eq('id', id)
    .eq('loja_id', lojaId)
    .eq('criado_por_ia', true)
    .eq('status', 'rascunho')
    .select('id');
  if (error) throw error;
  if (!data?.length) throw new Error('Tarefa não encontrada ou já processada');
}

export async function rejeitarTarefa(id, lojaId) {
  const { data, error } = await supabase
    .from('tarefas_loja')
    .update({ status: 'rejeitada' })
    .eq('id', id)
    .eq('loja_id', lojaId)
    .eq('criado_por_ia', true)
    .eq('status', 'rascunho')
    .select('id');
  if (error) throw error;
  if (!data?.length) throw new Error('Tarefa não encontrada ou já processada');
}
