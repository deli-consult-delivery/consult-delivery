/**
 * useConversas — engine de lista de conversas do Chat ao Vivo (cv2 redesign / FASE 1)
 *
 * Responsabilidades:
 *  - Carregar conversas do tenant (loadConvs) com batch-preview de mensagens (sem N+1).
 *  - Manter contadores por estado (status_v2) para a barra de filtros.
 *  - Busca client-side (nome / preview / telefone).
 *  - Filtro por estado (inbox = todas ativas; aguardando; abertos; automacao; resolvidos; falha; arquivados).
 *  - Realtime inbox: novo INSERT em messages → bump unread (se inbound e conversa não-ativa) + reordena topo.
 *
 * Padrões CLAUDE.md:
 *  - Toda query: .eq('tenant_id', tenantDbId).
 *  - Realtime: canal filtrado por tenant; cleanup removeChannel() no return do effect.
 *  - Sem console.log. Imutabilidade (sempre novo array/objeto no setState).
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { supabase } from '../../../lib/supabase.js';

// ─── constantes ──────────────────────────────────────────────────────────────
const LIMIT_CONVS = 150;
// Preview por conversa: ordenamos por (conversation_id, created_at DESC) e
// pegamos a 1ª linha de cada conversa — garante a MAIS recente POR conversa,
// não a mais recente global. O fator cobre folga p/ conversas com muitas msgs.
const PREVIEW_FACTOR = 4;

// Estados de filtro → conjunto de status_v2 que casam.
// 'inbox' = caixa de entrada (todas que não estão resolvidas/arquivadas).
// 'todos' = sem filtro.
export const FILTROS = [
  { id: 'inbox',      label: 'Caixa de entrada', ico: 'i-chat',   tone: 'red',   sv2: ['open', 'waiting', 'in_progress', 'automacao', 'falha'] },
  { id: 'aguardando', label: 'Aguardando',       ico: 'i-clock',  tone: 'amber', sv2: ['open'] },
  { id: 'abertos',    label: 'Em atendimento',   ico: 'i-folder', tone: 'red',   sv2: ['waiting', 'in_progress'] },
  { id: 'automacao',  label: 'Automação',        ico: 'i-bot',    tone: 'tx2',   sv2: ['automacao'] },
  { id: 'resolvidos', label: 'Resolvidos',       ico: 'i-check',  tone: 'green', sv2: ['closed'] },
  { id: 'falha',      label: 'Falha',            ico: 'i-flag',   tone: 'red',   sv2: ['falha'] },
  { id: 'arquivados', label: 'Arquivados',       ico: 'i-box',    tone: 'tx2',   sv2: ['archived'] },
];

// chave do contador a partir do status_v2 de uma conversa (1 conversa conta em 1+ buckets)
const CONTADOR_ZERO = { inbox: 0, aguardando: 0, abertos: 0, automacao: 0, resolvidos: 0, falha: 0, arquivados: 0 };

// ─── utilitários puros ───────────────────────────────────────────────────────
const previewTxt = (m) => {
  if (!m) return '';
  if (m.deleted_at) return '🚫 apagada';
  if (m.media_type) return '📎 mídia';
  return m.content || m.body || '';
};

const horaRel = (ts) => {
  if (!ts) return '';
  const d = new Date(ts);
  const diff = Date.now() - d.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  const dias = Math.floor(h / 24);
  if (dias < 7) return `${dias}d`;
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
};

const nomeDe = (c) => {
  const phone = c.whatsapp_chat_id ? c.whatsapp_chat_id.split('@')[0] : '';
  const gname = c.group_name && !/^\d{10,}$/.test(c.group_name) ? c.group_name : null;
  return c.contact_name || gname || c.push_name || phone || 'Conversa';
};

// row da tabela → convShape (contrato consumido pela UI)
const toConvShape = (c, lastMsg) => {
  const phone = c.whatsapp_chat_id ? c.whatsapp_chat_id.split('@')[0] : '';
  return {
    id: c.id,
    nome: nomeDe(c),
    telefone: phone,
    chatId: c.whatsapp_chat_id || null,
    isGroup: !!c.is_group,
    isChan: typeof c.id === 'string' && c.id.startsWith('chan-'),
    prev: previewTxt(lastMsg),
    ts: c.updated_at || null,
    hora: horaRel(c.updated_at),
    status: c.status || null,
    status_v2: c.status_v2 || 'open',
    deptId: c.department_id || null,
    customerId: c.customer_id || null,
    unread: c.unread_count || 0,
  };
};

// ─── hook ────────────────────────────────────────────────────────────────────
export function useConversas(tenantDbId) {
  const [convs, setConvs] = useState(null);   // null = carregando inicial
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState('inbox');
  const [busca, setBusca] = useState('');

  const activeIdRef = useRef(null); // a UI registra a conversa ativa aqui (via setActiveRef)

  // ── loadConvs ──────────────────────────────────────────────────────────────
  const loadConvs = useCallback(async () => {
    if (!tenantDbId) { setConvs([]); setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from('conversations')
      .select('id, whatsapp_chat_id, group_name, contact_name, push_name, is_group, updated_at, status, status_v2, department_id, customer_id, unread_count')
      .eq('tenant_id', tenantDbId)
      .order('updated_at', { ascending: false })
      .limit(LIMIT_CONVS);

    if (error) { setConvs([]); setLoading(false); return; }
    const rows = data || [];

    // Batch preview: 1 query para TODAS as conversas (sem N+1) via .in(ids).
    const convIds = rows.map((r) => r.id);
    const lastMsgMap = {};
    if (convIds.length > 0) {
      const { data: msgs } = await supabase
        .from('messages')
        .select('conversation_id, content, body, media_type, deleted_at, created_at')
        .eq('tenant_id', tenantDbId)
        .in('conversation_id', convIds)
        // ordena por conversa e, dentro dela, da mais nova p/ a mais antiga:
        // a 1ª linha vista de cada conversation_id é a mais recente DAQUELA conversa.
        .order('conversation_id', { ascending: true })
        .order('created_at', { ascending: false })
        .limit(convIds.length * PREVIEW_FACTOR);
      (msgs || []).forEach((m) => {
        if (!lastMsgMap[m.conversation_id]) lastMsgMap[m.conversation_id] = m;
      });
    }

    setConvs(rows.map((c) => toConvShape(c, lastMsgMap[c.id] || null)));
    setLoading(false);
  }, [tenantDbId]);

  useEffect(() => { loadConvs(); }, [loadConvs]);

  // ── realtime inbox (bump unread + reordena) ─────────────────────────────────
  useEffect(() => {
    if (!tenantDbId) return;
    const ch = supabase
      .channel('ccv-inbox-' + tenantDbId)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `tenant_id=eq.${tenantDbId}` }, (p) => {
        const m = p.new;
        const bump = m.direction === 'inbound' && m.conversation_id !== activeIdRef.current;
        setConvs((cs) => {
          if (!cs) return cs;
          const idx = cs.findIndex((c) => c.id === m.conversation_id);
          if (idx === -1) return cs; // conversa nova fora da janela → ignora (reload manual cobre)
          const c = cs[idx];
          const atualizada = {
            ...c,
            prev: previewTxt(m),
            ts: m.created_at || c.ts,
            hora: horaRel(m.created_at),
            unread: bump ? (c.unread || 0) + 1 : c.unread,
          };
          return [atualizada, ...cs.filter((_, i) => i !== idx)];
        });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [tenantDbId]);

  // ── contadores (derivados de convs) ─────────────────────────────────────────
  const contadores = useMemo(() => {
    const acc = { ...CONTADOR_ZERO };
    (convs || []).forEach((c) => {
      const sv = c.status_v2 || 'open';
      FILTROS.forEach((f) => { if (f.sv2.includes(sv)) acc[f.id] += 1; });
    });
    return acc;
  }, [convs]);

  // ── lista filtrada (estado + busca) ─────────────────────────────────────────
  const convsFiltradas = useMemo(() => {
    const def = FILTROS.find((f) => f.id === filtro) || FILTROS[0];
    const q = busca.trim().toLowerCase();
    return (convs || [])
      .filter((c) => def.sv2.includes(c.status_v2 || 'open'))
      .filter((c) => {
        if (!q) return true;
        return (
          c.nome.toLowerCase().includes(q) ||
          (c.prev || '').toLowerCase().includes(q) ||
          (c.telefone || '').includes(q)
        );
      });
  }, [convs, filtro, busca]);

  // ── mutadores otimistas expostos p/ UI (status local + unread) ──────────────
  const setActiveRef = useCallback((id) => { activeIdRef.current = id; }, []);

  const zerarUnread = useCallback((convId) => {
    setConvs((cs) => (cs || []).map((c) => (c.id === convId ? { ...c, unread: 0 } : c)));
  }, []);

  const patchConv = useCallback((convId, patch) => {
    setConvs((cs) => (cs || []).map((c) => (c.id === convId ? { ...c, ...patch } : c)));
  }, []);

  return {
    convs: convs || [],
    loading,
    contadores,
    filtro,
    setFiltro,
    busca,
    setBusca,
    reload: loadConvs,
    convsFiltradas,
    // helpers de integração com a thread/UI
    setActiveRef,
    zerarUnread,
    patchConv,
    FILTROS,
  };
}
