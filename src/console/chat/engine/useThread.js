/**
 * useThread — engine das mensagens da conversa ativa (cv2 redesign / FASE 1)
 *
 * Responsabilidades:
 *  - loadMsgs: últimas 30 mensagens da conversa, ordem ascendente, mapeadas p/ msgShape.
 *  - Realtime thread: INSERT + UPDATE filtrados por conversation_id; dedup por id.
 *  - cleanup removeChannel() no return do effect.
 *
 * Padrões CLAUDE.md:
 *  - Toda query: .eq('tenant_id', tenantDbId) + .eq('conversation_id', activeId).
 *  - Canal por conversa: 'ccv-thread-'+activeId.
 *  - Sem console.log. Imutabilidade (novo array sempre).
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../../../lib/supabase.js';

const LIMIT_MSGS = 30;

const hora = (ts) =>
  ts ? new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';

// row da tabela messages → msgShape (contrato consumido pela UI)
const toMsgShape = (m) => ({
  id: m.id,
  out: m.direction === 'outbound',
  txt: m.content || m.body || '',
  mtype: m.media_type || null,
  murl: m.media_url || null,
  who: m.sender_name || null,
  tm: hora(m.created_at),
  ts: m.created_at || null,
  reactions: Array.isArray(m.reactions) ? m.reactions : [],
  quoted: m.quoted_content || null,
  ds: m.delivery_status,
  del: !!m.deleted_at,
  waId: m.whatsapp_msg_id || null,
});

const SELECT_COLS =
  'id, direction, content, body, created_at, sender_name, media_type, media_url, reactions, quoted_content, delivery_status, deleted_at, whatsapp_msg_id';

export function useThread(activeId, tenantDbId, onInbound) {
  const [msgs, setMsgs] = useState([]);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  // paginação (FASE 3): temMais = ainda há histórico anterior; carregandoOlder = fetch em curso
  const [temMais, setTemMais] = useState(false);
  const [carregandoOlder, setCarregandoOlder] = useState(false);

  // guarda o id corrente p/ descartar respostas async de conversas já trocadas
  const activeRef = useRef(activeId);
  useEffect(() => { activeRef.current = activeId; }, [activeId]);
  // callback de mensagem nova de ENTRADA (FASE 4 · IA): híbrido/IA/auto-transcrição.
  // Ref estável p/ não recriar o canal de realtime quando o callback muda.
  const onInboundRef = useRef(onInbound);
  useEffect(() => { onInboundRef.current = onInbound; }, [onInbound]);
  // created_at da mensagem mais antiga em tela (cursor de paginação)
  const oldestTsRef = useRef(null);
  // guarda de concorrência do loadOlderMsgs (ref evita recriar o callback a cada fetch)
  const carregandoOlderRef = useRef(false);

  const loadMsgs = useCallback(async (convId) => {
    carregandoOlderRef.current = false; // troca de conversa libera a guarda de paginação
    // FASE 4: canais internos (chan-<id>) não vivem em `messages` (conversation_id é uuid);
    // suas mensagens vêm do useCanaisInternos. Pular evita query que erra no cast de tipo.
    const isCanal = typeof convId === 'string' && convId.startsWith('chan-');
    if (!convId || !tenantDbId || isCanal) { setMsgs([]); setTemMais(false); oldestTsRef.current = null; return; }
    setLoadingMsgs(true);
    const { data, error } = await supabase
      .from('messages')
      .select(SELECT_COLS)
      .eq('tenant_id', tenantDbId)
      .eq('conversation_id', convId)
      .order('created_at', { ascending: false }) // pega as 30 mais recentes…
      .limit(LIMIT_MSGS);
    // descarta se a conversa ativa mudou durante o await
    if (activeRef.current !== convId) { setLoadingMsgs(false); return; }
    if (error) { setMsgs([]); setTemMais(false); oldestTsRef.current = null; setLoadingMsgs(false); return; }
    const rows = data || [];
    // …e reinverte p/ ordem ascendente (mais antiga no topo)
    const asc = rows.map(toMsgShape).reverse();
    setMsgs(asc);
    setTemMais(rows.length === LIMIT_MSGS); // veio página cheia → provável haver mais
    oldestTsRef.current = asc.length ? asc[0].ts : null;
    setLoadingMsgs(false);
  }, [tenantDbId]);

  // carrega 30 mensagens anteriores à mais antiga em tela e faz prepend imutável
  const loadOlderMsgs = useCallback(async () => {
    const convId = activeRef.current;
    const cursor = oldestTsRef.current;
    // guarda de concorrência via ref: o state (carregandoOlder) é só p/ UI
    if (!convId || !tenantDbId || !cursor || carregandoOlderRef.current) return;
    carregandoOlderRef.current = true;
    setCarregandoOlder(true);
    const { data, error } = await supabase
      .from('messages')
      .select(SELECT_COLS)
      .eq('tenant_id', tenantDbId)
      .eq('conversation_id', convId)
      .lt('created_at', cursor)               // estritamente anteriores ao cursor
      .order('created_at', { ascending: false })
      .limit(LIMIT_MSGS);
    if (activeRef.current !== convId) { carregandoOlderRef.current = false; setCarregandoOlder(false); return; }
    if (error) { carregandoOlderRef.current = false; setCarregandoOlder(false); return; }
    const rows = data || [];
    const older = rows.map(toMsgShape).reverse(); // ascendente (mais antiga primeiro)
    setTemMais(rows.length === LIMIT_MSGS);
    if (older.length) {
      oldestTsRef.current = older[0].ts;
      // prepend imutável + dedup por id (realtime pode ter inserido algo no intervalo)
      setMsgs((prev) => {
        const vistos = new Set(prev.map((x) => x.id));
        const novos = older.filter((x) => !vistos.has(x.id));
        return [...novos, ...prev];
      });
    }
    carregandoOlderRef.current = false;
    setCarregandoOlder(false);
  }, [tenantDbId]);

  const reloadMsgs = useCallback(() => loadMsgs(activeRef.current), [loadMsgs]);

  useEffect(() => {
    if (!activeId) { setMsgs([]); setTemMais(false); oldestTsRef.current = null; return; }
    setMsgs([]);
    setTemMais(false);
    oldestTsRef.current = null;
    loadMsgs(activeId);

    const ch = supabase
      .channel('ccv-thread-' + activeId)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${activeId}` }, (p) => {
        // guarda multi-tenant: o filtro do Realtime é só por conversation_id;
        // valida tenant_id no handler caso o RLS não seja honrado na subscription.
        if (p.new.tenant_id !== tenantDbId) return;
        const nm = toMsgShape(p.new);
        setMsgs((prev) => (prev.some((x) => x.id === nm.id) ? prev : [...prev, nm]));
        // FASE 4 (IA): mensagem de entrada na conversa ativa → dispara o callback
        // (híbrido/IA/auto-transcrição). 'Bot' = automação, não aciona auto-reply.
        if (nm.out === false && nm.who !== 'Bot') onInboundRef.current?.(nm);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter: `conversation_id=eq.${activeId}` }, (p) => {
        if (p.new.tenant_id !== tenantDbId) return;
        const nm = toMsgShape(p.new);
        setMsgs((prev) => prev.map((x) => (x.id === nm.id ? nm : x)));
      })
      .subscribe();

    return () => { supabase.removeChannel(ch); };
  }, [activeId, loadMsgs, tenantDbId]);

  return { msgs, loadingMsgs, reloadMsgs, loadOlderMsgs, temMais, carregandoOlder };
}
