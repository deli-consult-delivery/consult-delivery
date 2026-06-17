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
    .order('name')
    .limit(50);
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
      resultado_json, mensagem_whatsapp,
      cliente:customers(id, name)
    `)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function listClientes(tenantId) {
  // ESPAÇOS: lista só clientes de lojas em consultoria ativa (is_consultoria_ativa=true).
  // Reativar uma loja faz o cliente voltar automaticamente, sem mexer no código.
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

// ─────────────────────────────────────────────────────────────────────────────
// Treinamento do agente — correções aprendidas
// ─────────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────
// Tasks (Kanban) — CRUD completo
// ─────────────────────────────────────────────────────────────────────────────

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

// ─── Client Tasks (Tarefas Clientes) ──────────────────────────────────────

// Tarefas de uma lista (modelo ClickUp). Aceita listId; mantém customerId/tenantId opcionais.
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

// Mover tarefa entre colunas (drag-and-drop). columnId = nova coluna, position = índice de drop.
export async function moveClientTask(id, columnId, position) {
  const { error } = await supabase
    .from('client_tasks').update({ column_id: columnId, position, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}

export async function deleteClientTask(id) {
  const { error } = await supabase.from('client_tasks').delete().eq('id', id);
  if (error) throw error;
}

// ─── ESPAÇOS — hierarquia Pasta → Lista → Coluna (estilo ClickUp) ──────────

// Colunas default semeadas ao criar uma lista nova.
const DEFAULT_COLUMNS = [
  { name: 'A Fazer',    color: '#6B7280', position: 0, is_done: false },
  { name: 'Fazendo',    color: '#3B82F6', position: 1, is_done: false },
  { name: 'Aguardando', color: '#F59E0B', position: 2, is_done: false },
  { name: 'Concluído',  color: '#10B981', position: 3, is_done: true  },
];

// Pastas ──────────────────────────────────────────────────────────────────
export async function listFolders(tenantId, customerId) {
  let q = supabase
    .from('espacos_folders')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('position', { ascending: true });
  if (customerId) q = q.eq('customer_id', customerId);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function createFolder({ tenantId, customerId = null, name, color, icon, position = 0 }) {
  const { data, error } = await supabase
    .from('espacos_folders')
    .insert({ tenant_id: tenantId, customer_id: customerId, name, color, icon, position })
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

// Listas ──────────────────────────────────────────────────────────────────
export async function listLists(folderId) {
  const { data, error } = await supabase
    .from('espacos_lists')
    .select('*')
    .eq('folder_id', folderId)
    .order('position', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

// Cria lista + semeia colunas default. Retorna { list, columns }.
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

// Colunas ───────────────────────────────────────────────────────────────────
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

// Reordena colunas: recebe [{id, position}, ...] e aplica em paralelo.
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

// ─────────────────────────────────────────────────────────────────────────────
// Sugestões para o desenvolvedor
// ─────────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────
// Agent Drafts — sistema de proposta-aprovação (Etapa 11)
// ─────────────────────────────────────────────────────────────────────────────

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

export function subscribeToDrafts(tenantId, callback) {
  const channel = supabase
    .channel(`drafts-${tenantId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'agent_drafts', filter: `tenant_id=eq.${tenantId}` },
      payload => callback(payload)
    )
    .subscribe();
  return () => supabase.removeChannel(channel);
}

// ─────────────────────────────────────────────────────────────────────────────
// Avaliações iFood — config por loja + avaliações geradas (Console v2)
// Leituras/atualizações diretas via RLS (espelha o padrão de agent_drafts).
// ─────────────────────────────────────────────────────────────────────────────

// Lojas em consultoria ativa — alimenta o seletor de loja da aba Avaliações.
// (memória: filtrar por is_consultoria_ativa, nunca status='ativo'.)
export async function listLojasConsultoria(tenantId) {
  const { data, error } = await supabase
    .from('lojas')
    .select('id, nome, super_restaurante')
    .eq('tenant_id', tenantId)
    .eq('is_consultoria_ativa', true)
    .order('nome');
  if (error) throw error;
  return data ?? [];
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

// Upsert por loja_id (constraint UNIQUE garante 1 config por loja).
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

// Lojas em consultoria + a logística já configurada de cada uma — alimenta o
// painel de gestão em massa (definir logística por loja + marcar/remover
// consultoria ativa). 2 queries simples + merge por loja_id (sem embed/RLS join).
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

// Atualiza SÓ a logística da loja (não toca o tom já salvo). Upsert por loja_id:
// no UPDATE o supabase só seta as colunas presentes no objeto → tom preservado.
// Retorna a linha de config completa (mesmo shape de getAvaliacoesConfig) para
// que o chamador possa adotá-la quando a loja ainda não tinha config em memória.
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

// Marca/desmarca a consultoria ativa de uma loja (reversível). O Wandson usa
// isto p/ podar a lista — loja sem consultoria sai dos filtros que usam o flag.
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

// ─────────────────────────────────────────────────────────────────────────────
// Audit Log — histórico de ações dos agentes (Etapa 15)
// ─────────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────
// Webhook self-healing — Evolution API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Verifica se o webhook de uma instância aponta para a Supabase Edge Function
 * com enabled=true. Se não estiver correto, corrige automaticamente e loga em audit_log.
 *
 * @param {string} instanceName
 * @param {{ evolutionUrl?: string, apiKey?: string, tenantId?: string }} opts
 * @returns {Promise<{ status: 'ok'|'corrected'|'failed', url?: string, reason?: string }>}
 */
export async function ensureWebhookConfig(instanceName, opts = {}) {
  const SUPA_URL  = import.meta.env.VITE_SUPABASE_URL;
  const EVO_URL   = opts.evolutionUrl || import.meta.env.VITE_EVOLUTION_URL;
  const EVO_KEY   = opts.apiKey       || import.meta.env.VITE_EVOLUTION_KEY;
  const tenantId  = opts.tenantId     || null;

  if (!EVO_URL || !EVO_KEY || !SUPA_URL) {
    return { status: 'failed', reason: 'missing_env' };
  }

  const TARGET_URL = `${SUPA_URL}/functions/v1/evolution-webhook`;
  const evoHeaders = { 'Content-Type': 'application/json', apikey: EVO_KEY };

  try {
    const findRes = await fetch(`${EVO_URL}/webhook/find/${instanceName}`, { headers: evoHeaders });
    if (!findRes.ok) return { status: 'failed', reason: `find_http_${findRes.status}` };

    const current = await findRes.json();

    if (current.enabled === true && current.url === TARGET_URL) {
      return { status: 'ok', url: current.url };
    }

    // Webhook está incorreto — corrigir
    const setRes = await fetch(`${EVO_URL}/webhook/set/${instanceName}`, {
      method:  'POST',
      headers: evoHeaders,
      body: JSON.stringify({
        webhook: {
          enabled:           true,
          url:               TARGET_URL,
          webhook_by_events: false,
          events:            ['MESSAGES_UPSERT'],
        },
      }),
    });

    const corrected = setRes.ok;

    if (tenantId) {
      await supabase.from('audit_log').insert({
        tenant_id:  tenantId,
        agent_name: 'system',
        action:     corrected ? 'webhook_autocorrected' : 'webhook_correction_failed',
        resource:   `evolution_instances/${instanceName}`,
        metadata: {
          was_url:     current.url,
          was_enabled: current.enabled,
          target_url:  TARGET_URL,
          corrected,
        },
      });
    }

    return corrected
      ? { status: 'corrected', url: TARGET_URL }
      : { status: 'failed', reason: 'set_failed' };

  } catch (err) {
    return { status: 'failed', reason: err.message };
  }
}

// ── Notificações internas ─────────────────────────────────────────────────────

export async function listNotifications(tenantId, userId, { onlyUnread = false, limit = 50 } = {}) {
  // Retorna notificações do usuário: diretas + broadcasts do tenant
  // RLS garante o filtro — query simples com order
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

// ─────────────────────────────────────────────────────────────────────────────
// Dashboard iFood — Ações recomendadas (rascunhos de tarefa gerados pelo
// diagnóstico semanal). RLS por loja_id → lojas.tenant_id; só tarefas criadas
// pela IA (criado_por_ia=true). Aprovar/rejeitar move o status (Fase 6).
// ─────────────────────────────────────────────────────────────────────────────

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
  // .eq('status','rascunho'): só transiciona o que ainda é rascunho (UI stale não
  // regride tarefa já avançada). .select() + checagem de linhas: RLS bloqueando
  // devolve sucesso com 0 linhas — sem isso a falha seria silenciosa. updated_at
  // fica a cargo do trigger tarefas_loja_updated_at.
  // .eq('loja_id', lojaId) + .eq('criado_por_ia', true): defense-in-depth — a RLS
  // já barra cross-tenant, mas escopar à loja em tela impede que um id de outra
  // loja do mesmo tenant (ou UI stale) transicione a tarefa errada.
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
