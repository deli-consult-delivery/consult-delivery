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
  // EQUIPE (FASE 4): canais internos. Convs de canal têm isChan:true e status_v2:'interno';
  // só aparecem aqui (excluídas das demais abas — espelha o Bug-2 fix do legado).
  { id: 'interno',    label: 'Equipe',           ico: 'i-users',  tone: 'tx2',   sv2: ['interno'] },
];

// chave do contador a partir do status_v2 de uma conversa (1 conversa conta em 1+ buckets)
const CONTADOR_ZERO = { inbox: 0, aguardando: 0, abertos: 0, automacao: 0, resolvidos: 0, falha: 0, arquivados: 0, interno: 0 };

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
    foto: c.push_photo_url || null, // FASE 3: foto WhatsApp já persistida (apenas exibir)
  };
};

const SELECT_CONV =
  'id, whatsapp_chat_id, group_name, contact_name, push_name, push_photo_url, is_group, updated_at, status, status_v2, department_id, customer_id, unread_count';

// sanitiza termo p/ o filtro .or() do PostgREST.
// Remove os metacaracteres do parser de or()/ilike: vírgula e parênteses (separadores de
// cláusula), curinga (% *), aspas duplas (delimitam o valor), e ponto/dois-pontos
// (delimitadores de operador como `ilike.` / `eq.`) — fecha injeção de cláusula extra.
const sanitizeBusca = (q) => q.trim().replace(/[%,()*".:]/g, '');
const MIN_BUSCA_SERVER = 3;   // >=3 chars → busca server-side
const DEBOUNCE_BUSCA = 300;   // ms
const LIMIT_BUSCA = 100;

// ─── hook ────────────────────────────────────────────────────────────────────
// opts (FASE 4):
//  - extraConvs: convShape[] de canais internos (isChan) a mesclar na lista.
//  - favs/mutes: Set<convId> (favoritos sobem ao topo; mudas zeram o badge visual).
export function useConversas(tenantDbId, opts = {}) {
  const { extraConvs = [], favs = null, mutes = null } = opts;
  const [convs, setConvs] = useState(null);   // null = carregando inicial
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState('inbox');
  const [busca, setBusca] = useState('');
  // resultado da busca server-side (>=3 chars). null = sem busca server ativa.
  const [buscaServer, setBuscaServer] = useState(null);
  const [buscandoServer, setBuscandoServer] = useState(false);
  // Counts reais por status_v2 (não capados em LIMIT_CONVS=150) — para os
  // badges da barra de filtros. Sem isso, badges (aguardando/abertos/etc.)
  // sub-contam quando o tenant tem >150 conversas (ex.: Consult tem 177).
  // Mesmo padrão de ConsoleV2.jsx:251 (count exact, head true).
  const [countsStatus, setCountsStatus] = useState({});

  const activeIdRef = useRef(null); // a UI registra a conversa ativa aqui (via setActiveRef)

  // ── loadConvs ──────────────────────────────────────────────────────────────
  const loadConvs = useCallback(async () => {
    if (!tenantDbId) { setConvs([]); setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from('conversations')
      .select(SELECT_CONV)
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

    // Counts reais por status_v2 (sem o cap de 150) — 7 queries head:true
    // paralelas. Falha numa delas → mantém o último valor (não zera o badge
    // por erro transitório). PostgREST count é exato. `interno` NÃO entra
    // aqui (canais internos vêm de extraConcs, já contados corretamente).
    const SV2_COUNT = ['open', 'waiting', 'in_progress', 'automacao', 'closed', 'falha', 'archived'];
    const countResults = await Promise.all(
      SV2_COUNT.map((sv) => supabase.from('conversations').select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenantDbId).eq('status_v2', sv))
    );
    const next = {};
    SV2_COUNT.forEach((sv, i) => { if (!countResults[i].error) next[sv] = countResults[i].count ?? 0; });
    if (Object.keys(next).length > 0) setCountsStatus((prev) => ({ ...prev, ...next }));
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

  // ── busca server-side (>=3 chars, debounce) ─────────────────────────────────
  // ILIKE em push_name/contact_name/group_name/whatsapp_chat_id (.eq tenant, limit 100).
  // Abaixo de 3 chars, zera o resultado server e cai no filtro client-side atual.
  useEffect(() => {
    const safe = sanitizeBusca(busca);
    if (safe.length < MIN_BUSCA_SERVER || !tenantDbId) {
      setBuscaServer(null);
      setBuscandoServer(false);
      return;
    }
    let vivo = true;
    setBuscandoServer(true);
    const t = setTimeout(async () => {
      // valor entre aspas duplas conforme spec do PostgREST: trata o termo como
      // literal mesmo se algum metacaractere escapar do sanitizeBusca.
      const like = `"%${safe}%"`;
      const { data, error } = await supabase
        .from('conversations')
        .select(SELECT_CONV)
        .eq('tenant_id', tenantDbId)
        .or(`push_name.ilike.${like},contact_name.ilike.${like},group_name.ilike.${like},whatsapp_chat_id.ilike.${like}`)
        .order('updated_at', { ascending: false })
        .limit(LIMIT_BUSCA);
      if (!vivo) return;
      // sem preview aqui (busca é leve): preview vem do convShape sem lastMsg.
      setBuscaServer(error ? [] : (data || []).map((c) => toConvShape(c, null)));
      setBuscandoServer(false);
    }, DEBOUNCE_BUSCA);
    return () => { vivo = false; clearTimeout(t); };
  }, [busca, tenantDbId]);

  // ── lista combinada: whatsapp (convs) + canais internos (extraConvs) ────────
  // Canais vêm de useCanaisInternos (estado separado); aqui só mesclamos p/ a UI.
  const convsAll = useMemo(
    () => [...(convs || []), ...(extraConvs || [])],
    [convs, extraConvs],
  );

  // ── contadores ──────────────────────────────────────────────────────────────
  // Counts reais por status_v2 (count: 'exact', head: true) quando disponíveis,
  // não o length do array capado em 150. `interno` continua derivado de convsAll
  // (canais internos vêm de extraConvs, já contados corretamente). Fallback:
  // se countsStatus[sv] estiver undefined (1ª carga antes das queries count
  // terminarem, ou erro), usa a contagem do array como antes.
  const contadores = useMemo(() => {
    const acc = { ...CONTADOR_ZERO };
    // fallback do array (garante que sempre há um número, mesmo antes das
    // queries count terminarem — sem flash de "0" no badge)
    convsAll.forEach((c) => {
      const sv = c.status_v2 || 'open';
      FILTROS.forEach((f) => { if (f.sv2.includes(sv)) acc[f.id] += 1; });
    });
    // sobrescreve com counts reais por status_v2 (exceto interno)
    if (countsStatus && Object.keys(countsStatus).length > 0) {
      const recalc = { ...CONTADOR_ZERO };
      // interno: mantém do fallback (extraConvs)
      convsAll.forEach((c) => {
        if ((c.status_v2 || 'open') === 'interno') {
          FILTROS.forEach((f) => { if (f.sv2.includes('interno')) recalc[f.id] += 1; });
        }
      });
      // demais filtros: soma os counts reais dos status_v2 que cada filtro cobre
      FILTROS.forEach((f) => {
        if (f.id === 'interno') { acc[f.id] = recalc[f.id]; return; }
        acc[f.id] = f.sv2.reduce((n, sv) => n + (countsStatus[sv] ?? 0), 0);
      });
    }
    return acc;
  }, [convsAll, countsStatus]);

  // ── lista filtrada (estado + busca) ─────────────────────────────────────────
  // Com busca server-side ativa (>=3 chars) usa a base ampla retornada do banco;
  // senão usa a janela local (convs) + filtro client-side por substring.
  const convsFiltradas = useMemo(() => {
    const def = FILTROS.find((f) => f.id === filtro) || FILTROS[0];
    const q = busca.trim().toLowerCase();

    // FASE 4: conversa silenciada tem o badge de não-lidas zerado só na exibição
    // (o estado real em `convs` é preservado). Sem muda → retorna o mesmo objeto.
    const decorar = (c) => {
      const muted = !!mutes && mutes.has(c.id);
      return muted && c.unread > 0 ? { ...c, unread: 0 } : c;
    };
    // favoritos primeiro, mantendo a ordem relativa original (sort estável)
    const ordenarFav = (arr) => {
      if (!favs || favs.size === 0) return arr;
      return [...arr].sort((a, b) => (favs.has(b.id) ? 1 : 0) - (favs.has(a.id) ? 1 : 0));
    };

    if (buscaServer != null) {
      // base server já casa o termo; aplica só o filtro de estado por consistência da aba
      return ordenarFav(
        buscaServer.filter((c) => def.sv2.includes(c.status_v2 || 'open')).map(decorar),
      );
    }

    const base = convsAll
      .filter((c) => def.sv2.includes(c.status_v2 || 'open'))
      .filter((c) => {
        if (!q) return true;
        return (
          c.nome.toLowerCase().includes(q) ||
          (c.prev || '').toLowerCase().includes(q) ||
          (c.telefone || '').includes(q)
        );
      })
      .map(decorar);
    return ordenarFav(base);
  }, [convsAll, filtro, busca, buscaServer, favs, mutes]);

  // ── mutadores otimistas expostos p/ UI (status local + unread) ──────────────
  const setActiveRef = useCallback((id) => { activeIdRef.current = id; }, []);

  const zerarUnread = useCallback((convId) => {
    setConvs((cs) => (cs || []).map((c) => (c.id === convId ? { ...c, unread: 0 } : c)));
  }, []);

  const patchConv = useCallback((convId, patch) => {
    setConvs((cs) => (cs || []).map((c) => (c.id === convId ? { ...c, ...patch } : c)));
  }, []);

  return {
    convs: convsAll, // inclui canais internos (extraConvs) p/ o lookup da conversa ativa
    loading,
    contadores,
    filtro,
    setFiltro,
    busca,
    setBusca,
    buscandoServer,
    reload: loadConvs,
    convsFiltradas,
    // helpers de integração com a thread/UI
    setActiveRef,
    zerarUnread,
    patchConv,
    FILTROS,
  };
}
