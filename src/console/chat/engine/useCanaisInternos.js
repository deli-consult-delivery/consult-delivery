/**
 * useCanaisInternos — canais internos da EQUIPE (cv2 redesign / FASE 4)
 *
 * Porta a lógica testada do ChatScreen legado:
 *  - Lista internal_channels do tenant OU globais (.or tenant_id.eq / is_global).
 *  - Carrega channel_messages do canal ativo (quando activeId = 'chan-<id>').
 *  - Realtime INSERT em channel_messages (append + dedup; cleanup no return).
 *  - Envia mensagem no canal ativo (insert otimista + reconcilia com a linha real).
 *
 * Os canais são expostos como convShapes (mesmo contrato da inbox) com
 * id 'chan-<id>' e isChan:true — o container mescla na lista e o filtro 'interno'
 * (useConversas) os roteia para a aba EQUIPE.
 *
 * Padrões CLAUDE.md:
 *  - Query de canais filtrada por tenant (.or tenant_id / is_global).
 *  - Realtime: canal filtrado, cleanup removeChannel() no return do effect.
 *  - Sem console.log: erros via early-return.
 *  - Imutabilidade: novos arrays/objetos no setState.
 *
 * Contrato:
 *  - useCanaisInternos(tenantDbId, activeId, userId)
 *      → { canais, chanMsgs, enviarNoCanal }
 *  - canais: convShape[] (id 'chan-<id>', isChan:true)
 *  - chanMsgs: msgShape[] do canal ATIVO (ordenadas asc)
 *  - enviarNoCanal(texto): insere no canal ativo
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../../../lib/supabase.js';

const SELECT_CHAN = 'id, name, color, description, is_global, created_at';
const SELECT_CHAN_MSG = 'id, channel_id, sender_id, sender_name, text, media_url, media_type, is_pinned, created_at';

// id 'chan-<uuid>' → uuid do canal interno
const chanIdDe = (activeId) =>
  (typeof activeId === 'string' && activeId.startsWith('chan-')) ? activeId.slice(5) : null;

// row internal_channels → convShape (contrato da inbox; isChan diferencia da aba)
const toCanalShape = (c) => ({
  id: 'chan-' + c.id,
  chanId: c.id,
  nome: '#' + (c.name || 'canal'),
  telefone: '',
  chatId: null,
  isGroup: false,
  isChan: true,
  isGlobal: !!c.is_global,
  prev: c.description || 'Canal interno',
  ts: c.created_at || null,
  hora: '',
  status: null,
  status_v2: 'interno',
  deptId: null,
  customerId: null,
  unread: 0,
  foto: null,
});

export function useCanaisInternos(tenantDbId, activeId, userId) {
  const [canais, setCanais] = useState([]);
  const [chanMsgs, setChanMsgs] = useState([]); // mensagens do canal ATIVO
  const [senderName, setSenderName] = useState('Equipe');

  const activeChanId = chanIdDe(activeId);
  const activeChanRef = useRef(null);
  useEffect(() => { activeChanRef.current = activeChanId; }, [activeChanId]);

  // ── lista de canais (tenant OU global) ──────────────────────────────────────
  useEffect(() => {
    if (!tenantDbId) { setCanais([]); return; }
    let vivo = true;
    supabase
      .from('internal_channels')
      .select(SELECT_CHAN)
      .or(`tenant_id.eq.${tenantDbId},is_global.eq.true`)
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (!vivo) return;
        setCanais(error ? [] : (data || []).map(toCanalShape));
      });
    return () => { vivo = false; };
  }, [tenantDbId]);

  // ── nome do remetente (display_name do membro / e-mail) ─────────────────────
  // Filtra por tenant_id: usuário pode ser membro de mais de um tenant; sem o
  // filtro, o display_name de outro tenant poderia vazar. Reavalia se o tenant muda.
  useEffect(() => {
    if (!tenantDbId) return;
    let vivo = true;
    supabase.auth.getUser().then(({ data }) => {
      const user = data?.user;
      if (!vivo || !user) return;
      supabase
        .from('tenant_members')
        .select('display_name')
        .eq('user_id', user.id)
        .eq('tenant_id', tenantDbId)
        .maybeSingle()
        .then(({ data: m }) => {
          if (!vivo) return;
          setSenderName(m?.display_name || user.email?.split('@')[0] || 'Equipe');
        });
    });
    return () => { vivo = false; };
  }, [tenantDbId]);

  // ── mensagens do canal ativo ────────────────────────────────────────────────
  useEffect(() => {
    if (!activeChanId) { setChanMsgs([]); return; }
    let vivo = true;
    supabase
      .from('channel_messages')
      .select(SELECT_CHAN_MSG)
      .eq('channel_id', activeChanId)
      .order('created_at', { ascending: true })
      .then(({ data, error }) => {
        if (!vivo) return;
        setChanMsgs(error ? [] : (data || []));
      });
    return () => { vivo = false; };
  }, [activeChanId]);

  // ── realtime INSERT (só reflete no canal ativo; dedup por id) ────────────────
  useEffect(() => {
    if (!tenantDbId) return;
    const ch = supabase
      .channel('ccv-chan-' + tenantDbId)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'channel_messages' }, (p) => {
        const m = p.new;
        if (!m || m.channel_id !== activeChanRef.current) return;
        setChanMsgs((prev) => (prev.some((e) => e.id === m.id) ? prev : [...prev, m]));
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [tenantDbId]);

  // ── enviar no canal ativo (otimista + reconcilia) ───────────────────────────
  const enviarNoCanal = useCallback(async (texto) => {
    const t = String(texto || '').trim();
    if (!t || !activeChanId) return;
    let userId2 = userId || null;
    if (!userId2) {
      const { data } = await supabase.auth.getUser();
      userId2 = data?.user?.id || null;
    }
    const tmpId = 'tmp-' + Date.now();
    const tmp = { id: tmpId, channel_id: activeChanId, sender_id: userId2, sender_name: senderName, text: t, is_pinned: false, created_at: new Date().toISOString() };
    setChanMsgs((prev) => [...prev, tmp]); // otimista
    const { data, error } = await supabase
      .from('channel_messages')
      .insert({ channel_id: activeChanId, sender_id: userId2, sender_name: senderName, text: t })
      .select(SELECT_CHAN_MSG)
      .single();
    if (error || !data) {
      // rollback do otimista: insert falhou (RLS / coluna)
      setChanMsgs((prev) => prev.filter((msg) => msg.id !== tmpId));
      return;
    }
    setChanMsgs((prev) => prev.map((msg) => (msg.id === tmpId ? data : msg)));
  }, [activeChanId, userId, senderName]);

  return { canais, chanMsgs, enviarNoCanal };
}
