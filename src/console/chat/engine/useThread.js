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

export function useThread(activeId, tenantDbId) {
  const [msgs, setMsgs] = useState([]);
  const [loadingMsgs, setLoadingMsgs] = useState(false);

  // guarda o id corrente p/ descartar respostas async de conversas já trocadas
  const activeRef = useRef(activeId);
  useEffect(() => { activeRef.current = activeId; }, [activeId]);

  const loadMsgs = useCallback(async (convId) => {
    if (!convId || !tenantDbId) { setMsgs([]); return; }
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
    if (error) { setMsgs([]); setLoadingMsgs(false); return; }
    // …e reinverte p/ ordem ascendente (mais antiga no topo)
    setMsgs((data || []).map(toMsgShape).reverse());
    setLoadingMsgs(false);
  }, [tenantDbId]);

  const reloadMsgs = useCallback(() => loadMsgs(activeRef.current), [loadMsgs]);

  useEffect(() => {
    if (!activeId) { setMsgs([]); return; }
    setMsgs([]);
    loadMsgs(activeId);

    const ch = supabase
      .channel('ccv-thread-' + activeId)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${activeId}` }, (p) => {
        // guarda multi-tenant: o filtro do Realtime é só por conversation_id;
        // valida tenant_id no handler caso o RLS não seja honrado na subscription.
        if (p.new.tenant_id !== tenantDbId) return;
        const nm = toMsgShape(p.new);
        setMsgs((prev) => (prev.some((x) => x.id === nm.id) ? prev : [...prev, nm]));
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter: `conversation_id=eq.${activeId}` }, (p) => {
        if (p.new.tenant_id !== tenantDbId) return;
        const nm = toMsgShape(p.new);
        setMsgs((prev) => prev.map((x) => (x.id === nm.id ? nm : x)));
      })
      .subscribe();

    return () => { supabase.removeChannel(ch); };
  }, [activeId, loadMsgs, tenantDbId]);

  return { msgs, loadingMsgs, reloadMsgs };
}
