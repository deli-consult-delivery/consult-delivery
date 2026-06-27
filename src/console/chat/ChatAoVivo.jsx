/**
 * Chat ao Vivo — novo layout na identidade Console V2
 *
 * Substitui o embed de ChatScreen (dark) no ConsoleV2.
 * Reusa o núcleo de mensageria de ChatV2.jsx.
 *
 * Correções nativas:
 *  Bug 1 — bulk finalize: query real ao banco, exclui canais, reporta count
 *  Bug 2 — canal interno: aparece SOMENTE na aba "Chat interno"
 *  Bug 3 — sugestão Breno: banner fixo no topo, compacto, fora do scroll
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../../lib/supabase.js';
import {
  sendTextMessage,
  sendMediaMessage,
  sendAudioMessage,
  sendReaction,
  deleteWhatsAppMessage,
} from '../../lib/evolution.js';
import { Ico } from '../CvIcons.jsx';
import { STATUS_V2_MAP } from '../../lib/conversationStatus.js';
import '../chat-ao-vivo.css';

// ─── utilitários ─────────────────────────────────────────────────────────────
const COR = ['#B70C00', '#1f4f9c', '#1e7d43', '#9a6a10', '#6d28d9', '#0e7490', '#b45309'];
const cor = s => COR[[...String(s || '?')].reduce((a, c) => a + c.charCodeAt(0), 0) % COR.length];
const hora = ts => ts ? new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
const previewTxt = m => !m ? '' : (m.deleted_at ? '🚫 apagada' : (m.media_type ? '📎 mídia' : (m.content || m.body || '')));
const mediaTipo = mime => /^image\//.test(mime) ? 'image' : /^video\//.test(mime) ? 'video' : /^audio\//.test(mime) ? 'audio' : 'document';
const toBase64 = file => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(String(r.result).split(',')[1] || '');
  r.onerror = rej;
  r.readAsDataURL(file);
});

// ─── abas de status (Bug 2: aba "interno" é exclusiva para canais) ────────────
const TABS = [
  { id: 'aguardando',  label: 'Aguardando',     sv2: ['open'] },
  { id: 'atendimento', label: 'Em Atendimento',  sv2: ['in_progress', 'waiting'] },
  { id: 'automacao',   label: 'Automação',        sv2: ['automacao'] },
  { id: 'finalizado',  label: 'Finalizados',      sv2: ['closed'] },
  { id: 'falha',       label: 'Falha',            sv2: ['falha'] },
  { id: 'interno',     label: 'Chat interno',     sv2: null }, // somente chan-*
];

// ─── formatação WhatsApp ──────────────────────────────────────────────────────
const WA_REGEX = /(\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~|`[^`\n]+`|https?:\/\/[^\s<>"')\]]+|www\.[^\s<>"')\]]+)/g;
function formatWA(text) {
  if (!text) return null;
  const out = [];
  text.split('\n').forEach((line, li) => {
    if (li > 0) out.push(<br key={`br${li}`} />);
    if (!line) return;
    let last = 0;
    let match;
    WA_REGEX.lastIndex = 0;
    while ((match = WA_REGEX.exec(line)) !== null) {
      if (match.index > last) out.push(line.slice(last, match.index));
      const t = match[0];
      const key = `wa${li}${match.index}`;
      if (t.startsWith('*') && t.endsWith('*')) out.push(<strong key={key} style={{ fontWeight: 700 }}>{t.slice(1, -1)}</strong>);
      else if (t.startsWith('_') && t.endsWith('_')) out.push(<em key={key}>{t.slice(1, -1)}</em>);
      else if (t.startsWith('~') && t.endsWith('~')) out.push(<del key={key}>{t.slice(1, -1)}</del>);
      else if (t.startsWith('`') && t.endsWith('`')) out.push(<code key={key} style={{ background: 'rgba(0,0,0,.06)', borderRadius: 3, padding: '0 3px', fontFamily: 'monospace', fontSize: '.9em' }}>{t.slice(1, -1)}</code>);
      else {
        const href = t.startsWith('http') ? t : `https://${t}`;
        out.push(<a key={key} href={href} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--red)', textDecoration: 'underline', wordBreak: 'break-all' }}>{t}</a>);
      }
      last = match.index + t.length;
    }
    if (last < line.length) out.push(line.slice(last));
  });
  return out.length ? out : null;
}

// ─── tick de entrega ──────────────────────────────────────────────────────────
function Tick({ s }) {
  if (s === 0) return <span title="erro ao enviar" style={{ color: 'var(--red)', fontWeight: 700 }}>!</span>;
  const color = (s >= 4) ? '#53BDEB' : 'var(--tx2)';
  if (s === null || s === undefined || s === 1)
    return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--tx2)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15 14" /></svg>;
  if (s === 2)
    return <svg width="14" height="12" viewBox="0 0 20 16" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 8 8 12 16 4" /></svg>;
  return <svg width="16" height="12" viewBox="0 0 24 16" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 8 7 12 15 4" /><polyline points="9 12 13 16 21 8" /></svg>;
}

// ─── render de mídia ──────────────────────────────────────────────────────────
function abrirDoc(url, nome) {
  if (!url) return;
  if (!url.startsWith('data:')) { window.open(url, '_blank'); return; }
  const [header, b64] = url.split(',');
  const mime = header.match(/:(.*?);/)?.[1] || 'application/octet-stream';
  const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  const blobUrl = URL.createObjectURL(new Blob([bytes], { type: mime }));
  if (mime.startsWith('image/') || mime === 'application/pdf') window.open(blobUrl, '_blank');
  else { const a = document.createElement('a'); a.href = blobUrl; a.download = nome || 'arquivo'; a.click(); }
  setTimeout(() => URL.revokeObjectURL(blobUrl), 4000);
}

function Media({ m }) {
  if (!m.mtype) return null;
  const url = m.murl;
  if (m.mtype === 'image' || (m.mtype === 'document' && url?.startsWith('data:image/')))
    return url
      ? <img src={url} alt={m.txt || 'imagem'} style={{ maxWidth: 220, maxHeight: 220, borderRadius: 6, display: 'block', cursor: 'pointer' }} onClick={() => window.open(url, '_blank')} />
      : <span style={{ fontSize: 12, color: 'var(--tx2)' }}>🖼️ carregando…</span>;
  if (m.mtype === 'sticker')
    return url ? <img src={url} alt="figurinha" style={{ width: 110, height: 110, objectFit: 'contain' }} /> : <span style={{ fontSize: 26 }}>🔖</span>;
  if (m.mtype === 'video')
    return url ? <video src={url} controls style={{ maxWidth: 240, borderRadius: 6, display: 'block' }} /> : <span style={{ fontSize: 12, color: 'var(--tx2)' }}>🎬 carregando…</span>;
  if (m.mtype === 'audio')
    return url ? <audio src={url} controls style={{ height: 36, maxWidth: 230 }} /> : <span style={{ fontSize: 12, color: 'var(--tx2)' }}>🎙️ carregando…</span>;
  return (
    <div onClick={() => abrirDoc(url, m.txt)} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: url ? 'pointer' : 'default', padding: '7px 9px', background: 'rgba(0,0,0,.04)', borderRadius: 6, fontSize: 12 }}>
      <span>📄</span><span style={{ flex: 1 }}>{m.txt || 'Documento'}</span>
      {url && <Ico name="i-clip" size={12} />}
    </div>
  );
}

const REACOES = ['👍', '❤️', '😂', '😮', '😢', '🙏'];
const actBtn = { background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, padding: '2px 3px', color: 'var(--tx2)' };

// ─────────────────────────────────────────────────────────────────────────────
// Componente principal
// ─────────────────────────────────────────────────────────────────────────────
export default function ChatAoVivo({ tenant, tenantDbId, userId, onNavigate, deepLinkConvId }) {
  // conversas + seleção
  const [convs, setConvs] = useState(null);
  const [activeId, setActiveId] = useState(deepLinkConvId || null);
  const [activeTab, setActiveTab] = useState('aguardando');
  const [busca, setBusca] = useState('');
  const [modoSelecao, setModoSelecao] = useState(false);
  const [selecionados, setSelecionados] = useState(new Set());
  const [bulkFeedback, setBulkFeedback] = useState('');

  // thread + composer
  const [msgs, setMsgs] = useState([]);
  const [draft, setDraft] = useState('');
  const [enviando, setEnviando] = useState(false); // mensagem/mídia/áudio
  const [atualizando, setAtualizando] = useState(false); // finalizar/reabrir/bulkFinalizar
  const [gravando, setGravando] = useState(false);
  const [replyTo, setReplyTo] = useState(null);
  const [reagindo, setReagindo] = useState(null);
  const [aviso, setAviso] = useState('');

  // breno + lead + infra
  const [brenoSugestao, setBrenoSugestao] = useState(null);
  const [customer, setCustomer] = useState(null);
  const [deps, setDeps] = useState([]);
  const [instance, setInstance] = useState(null);

  const threadRef = useRef(null);
  const fileRef = useRef(null);
  const recRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);
  const activeIdRef = useRef(null);

  useEffect(() => { activeIdRef.current = activeId; }, [activeId]);
  useEffect(() => () => { streamRef.current?.getTracks().forEach(t => t.stop()); }, []);

  // ── conversas ────────────────────────────────────────────────────────────
  const loadConvs = useCallback(async () => {
    if (!tenantDbId) return;
    const { data } = await supabase
      .from('conversations')
      .select('id, whatsapp_chat_id, group_name, contact_name, push_name, is_group, updated_at, status, status_v2, department_id, customer_id, unread_count')
      .eq('tenant_id', tenantDbId)
      .order('updated_at', { ascending: false })
      .limit(150);
    const rows = data || [];
    // Batch preview: 1 query para todas as conversas (sem N+1)
    const convIds = rows.map(r => r.id);
    let lastMsgMap = {};
    if (convIds.length > 0) {
      const { data: msgs } = await supabase
        .from('messages')
        .select('conversation_id, content, body, direction, media_type, deleted_at')
        .in('conversation_id', convIds)
        .order('created_at', { ascending: false })
        .limit(convIds.length * 2);
      (msgs || []).forEach(m => {
        if (!lastMsgMap[m.conversation_id]) lastMsgMap[m.conversation_id] = m;
      });
    }
    const mapped = rows.map((c) => {
      const phone = c.whatsapp_chat_id ? c.whatsapp_chat_id.split('@')[0] : '';
      const gname = c.group_name && !/^\d{10,}$/.test(c.group_name) ? c.group_name : null;
      const nome = c.contact_name || gname || c.push_name || phone || 'Conversa';
      return {
        id: c.id,
        nome,
        chatId: c.whatsapp_chat_id,
        isGroup: c.is_group,
        prev: previewTxt(lastMsgMap[c.id] || null),
        hora: hora(c.updated_at),
        status: c.status,
        status_v2: c.status_v2 || 'open',
        deptId: c.department_id || null,
        customerId: c.customer_id || null,
        unread: c.unread_count || 0,
      };
    });
    setConvs(mapped);
    setActiveId(a => {
      if (a) return a;
      // abre a primeira da aba atual automaticamente
      const firstTab = TABS.find(t => t.id === activeTab); // BUG-3 fix: respeitar aba corrente
      const first = mapped.find(c => !c.id.startsWith('chan-') && firstTab?.sv2?.includes(c.status_v2));
      return first?.id || mapped[0]?.id || null;
    });
  }, [tenantDbId]);

  useEffect(() => { loadConvs(); }, [loadConvs]);

  // ── infra ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!tenantDbId) return;
    supabase.from('departments').select('id, name').eq('tenant_id', tenantDbId)
      .then(({ data }) => setDeps(data || []));
  }, [tenantDbId]);

  useEffect(() => {
    if (!tenantDbId) return;
    // BUG-1 fix: filtrar por tenant para não vazar instâncias entre tenants
    supabase.from('evolution_instances')
      .select('instance_name, status, evolution_url, api_key')
      .eq('tenant_id', tenantDbId)
      .order('created_at')
      .then(({ data }) => {
        const arr = data || [];
        setInstance(arr.find(i => /conn|open/i.test(i.status || '')) || arr[0] || null);
      });
  }, [tenantDbId]); // BUG-1 fix: dep tenantDbId

  // ── mensagens ─────────────────────────────────────────────────────────────
  const mapMsg = m => ({
    id: m.id,
    out: m.direction === 'outbound',
    txt: m.content || m.body || '',
    mtype: m.media_type || null,
    murl: m.media_url || null,
    who: m.sender_name,
    tm: hora(m.created_at),
    reactions: Array.isArray(m.reactions) ? m.reactions : [],
    quoted: m.quoted_content || null,
    ds: m.delivery_status,
    del: !!m.deleted_at,
    waId: m.whatsapp_msg_id || null,
  });

  const loadMsgs = useCallback(async (convId) => {
    const { data } = await supabase.from('messages')
      .select('id, direction, content, body, created_at, sender_name, media_type, media_url, reactions, quoted_content, delivery_status, deleted_at, whatsapp_msg_id')
      .eq('conversation_id', convId)
      .order('created_at', { ascending: true })
      .limit(80);
    setMsgs((data || []).map(mapMsg));
  }, []);

  useEffect(() => {
    if (!activeId) return;
    setMsgs([]);
    loadMsgs(activeId);
    const ch = supabase.channel('cav-thread-' + activeId)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${activeId}` }, p => {
        const nm = mapMsg(p.new);
        setMsgs(prev => prev.some(x => x.id === nm.id) ? prev : [...prev, nm]);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter: `conversation_id=eq.${activeId}` }, p => {
        const nm = mapMsg(p.new);
        setMsgs(prev => prev.map(x => x.id === nm.id ? nm : x));
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [activeId, loadMsgs]);

  // realtime inbox: bump unread + preview
  useEffect(() => {
    if (!tenantDbId) return;
    const ch = supabase.channel('cav-inbox-' + tenantDbId)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `tenant_id=eq.${tenantDbId}` }, p => {
        const m = p.new;
        const bump = m.direction === 'inbound' && m.conversation_id !== activeIdRef.current;
        setConvs(cs => {
          if (!cs) return cs;
          const idx = cs.findIndex(c => c.id === m.conversation_id);
          if (idx === -1) return cs;
          const c = cs[idx];
          return [
            { ...c, prev: previewTxt(m), hora: hora(m.created_at), unread: bump ? (c.unread || 0) + 1 : c.unread },
            ...cs.filter((_, i) => i !== idx),
          ];
        });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [tenantDbId]);

  useEffect(() => {
    if (threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight;
  }, [msgs]);

  // ── Breno (Bug 3 fix: carregado por conversa, renderizado no topo) ─────────
  useEffect(() => {
    if (!activeId) { setBrenoSugestao(null); return; }
    supabase.from('breno_interactions')
      .select('id, resposta_sugerida, conversation_id, created_at')
      .eq('conversation_id', activeId)
      .eq('requires_review', true)
      .eq('action_taken', 'suggested')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => setBrenoSugestao(data || null));
  }, [activeId]);

  // ── lead / customer ───────────────────────────────────────────────────────
  const active = (convs || []).find(c => c.id === activeId) || null;

  useEffect(() => {
    if (!active?.customerId) { setCustomer(null); return; }
    supabase.from('customers')
      .select('id, name, phone, email, city, state, segment, pipeline_stage, notes')
      .eq('id', active.customerId)
      .single()
      .then(({ data }) => setCustomer(data || null));
  }, [active?.customerId]);

  // ── helpers ───────────────────────────────────────────────────────────────
  function flash(t) { setAviso(t); setTimeout(() => setAviso(''), 3000); }

  const abrirConv = useCallback((convId) => {
    setActiveId(convId);
    setSelecionados(new Set());
    setConvs(cs => (cs || []).map(c => c.id === convId ? { ...c, unread: 0 } : c));
    if (tenantDbId) supabase.from('conversations').update({ unread_count: 0 }).eq('id', convId).eq('tenant_id', tenantDbId).select('id'); // BUG-4 fix: .select() para detectar silent-fail de RLS
  }, [tenantDbId]);

  // ── envio de texto ────────────────────────────────────────────────────────
  async function enviar() {
    const text = draft.trim();
    if (!text || !active || enviando) return;
    const quoting = replyTo;
    setDraft('');
    setReplyTo(null);
    setEnviando(true);
    try {
      const quotedContent = quoting
        ? { waMsgId: quoting.waId, from: quoting.out ? 'out' : 'in', text: quoting.txt || '', mediaType: quoting.mtype || undefined }
        : null;
      await supabase.from('messages').insert({
        tenant_id: tenantDbId, conversation_id: active.id,
        direction: 'outbound', content: text,
        sender_name: null, quoted_content: quotedContent,
        created_at: new Date().toISOString(),
      });
      if (instance && active.chatId) {
        const evoQ = quoting?.waId ? { key: { id: quoting.waId, fromMe: quoting.out, remoteJid: active.chatId }, message: { conversation: quoting.txt || '' } } : null;
        await sendTextMessage(instance.instance_name, active.chatId, text, evoQ, instance.evolution_url, instance.api_key);
      }
    } catch (err) { console.error('[CAV] enviar:', err); flash('Falha ao enviar.'); }
    finally { setEnviando(false); }
  }

  // ── envio de mídia ────────────────────────────────────────────────────────
  async function enviarMidia(file) {
    if (!file || !active) return;
    if (!instance || !active.chatId) { flash('Sem instância WhatsApp conectada.'); return; }
    setEnviando(true);
    try {
      const tipo = mediaTipo(file.type || '');
      const b64 = await toBase64(file);
      await supabase.from('messages').insert({
        tenant_id: tenantDbId, conversation_id: active.id,
        direction: 'outbound', content: file.name,
        media_type: tipo, sender_name: null,
        created_at: new Date().toISOString(),
      });
      await sendMediaMessage(instance.instance_name, active.chatId, b64, tipo, file.type, '', file.name);
    } catch (err) { console.error('[CAV] mídia:', err); flash('Falha ao enviar mídia.'); }
    finally { setEnviando(false); }
  }

  function onPickFile(e) { const f = e.target.files?.[0]; e.target.value = ''; if (f) enviarMidia(f); }
  function onPaste(e) {
    const item = [...(e.clipboardData?.items || [])].find(i => i.type.startsWith('image/'));
    if (!item) return;
    const f = item.getAsFile();
    if (f) { e.preventDefault(); enviarMidia(f); }
  }

  // ── áudio PTT ─────────────────────────────────────────────────────────────
  async function gravarAudio() {
    if (gravando) { recRef.current?.stop(); return; }
    if (!active) return;
    if (!instance || !active.chatId) { flash('Sem instância WhatsApp conectada.'); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const rec = new MediaRecorder(stream);
      recRef.current = rec;
      rec.ondataavailable = ev => { if (ev.data.size) chunksRef.current.push(ev.data); };
      rec.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        streamRef.current = null;
        setGravando(false);
        const blob = new Blob(chunksRef.current, { type: 'audio/ogg; codecs=opus' });
        if (!blob.size) return;
        setEnviando(true);
        try {
          const b64 = await toBase64(blob);
          await supabase.from('messages').insert({
            tenant_id: tenantDbId, conversation_id: active.id,
            direction: 'outbound', content: 'Áudio',
            media_type: 'audio', sender_name: null,
            created_at: new Date().toISOString(),
          });
          await sendAudioMessage(instance.instance_name, active.chatId, b64);
        } catch (err) { console.error('[CAV] áudio:', err); flash('Falha ao enviar áudio.'); }
        finally { setEnviando(false); }
      };
      rec.start();
      setGravando(true);
    } catch (err) { console.error('[CAV] mic:', err); flash('Microfone indisponível.'); }
  }

  // ── reações ───────────────────────────────────────────────────────────────
  async function reagir(m, emoji) {
    setReagindo(null);
    if (!active || !m.waId) { flash('Mensagem sem ID WhatsApp.'); return; }
    if (!instance || !active.chatId) { flash('Sem instância conectada.'); return; }
    const nova = [...(m.reactions || []).filter(r => r.jid !== 'me'), { jid: 'me', emoji, name: 'Você' }];
    setMsgs(prev => prev.map(x => x.id === m.id ? { ...x, reactions: nova } : x));
    try {
      await supabase.from('messages').update({ reactions: nova }).eq('id', m.id).eq('tenant_id', tenantDbId);
      await sendReaction(instance.instance_name, active.chatId, m.waId, emoji, m.out);
    } catch (err) { console.error('[CAV] reagir:', err); flash('Falha ao reagir.'); }
  }

  // ── apagar mensagem ───────────────────────────────────────────────────────
  async function apagar(m) {
    if (!active || !window.confirm('Apagar esta mensagem para todos?')) return;
    setMsgs(prev => prev.map(x => x.id === m.id ? { ...x, del: true } : x));
    try {
      if (instance && active.chatId && m.waId) await deleteWhatsAppMessage(instance.instance_name, active.chatId, m.waId, m.out);
      await supabase.from('messages').update({ deleted_at: new Date().toISOString() }).eq('id', m.id).eq('tenant_id', tenantDbId);
    } catch (err) { console.error('[CAV] apagar:', err); flash('Falha ao apagar.'); }
  }

  // ── transferir ────────────────────────────────────────────────────────────
  async function transferir(deptId) {
    if (!active || !deptId) return;
    const { error } = await supabase.from('conversations')
      .update({ department_id: deptId }).eq('id', active.id).eq('tenant_id', tenantDbId);
    if (error) { flash('Falha ao transferir.'); return; }
    setConvs(cs => (cs || []).map(c => c.id === active.id ? { ...c, deptId } : c));
    flash('Transferida para ' + (deps.find(d => d.id === deptId)?.name || 'departamento') + '.');
  }

  // ── finalizar individual ──────────────────────────────────────────────────
  async function finalizar() {
    if (!active || atualizando) return; // BUG-6 fix: flag separada
    setAtualizando(true);
    try {
      const { data, error } = await supabase.from('conversations')
        .update({ status: 'finalizado', status_v2: 'closed', finished_by: userId || null })
        .eq('id', active.id).eq('tenant_id', tenantDbId)
        .select('id');
      if (error) throw error;
      if (!data?.length) throw new Error('0 linhas afetadas — sem permissão ou vínculo de tenant incorreto.');
      setConvs(cs => (cs || []).map(c => c.id === active.id ? { ...c, status: 'finalizado', status_v2: 'closed' } : c));
      flash('Conversa finalizada ✓');
      await loadConvs(); // BUG-5 fix: recarregar lista para mover conversa para aba correta
    } catch (err) {
      console.error('[CAV] finalizar:', err);
      const msg = err?.message || String(err);
      flash('Erro ao finalizar: ' + msg);
    } finally { setAtualizando(false); } // BUG-6 fix
  }

  // ── reabrir ───────────────────────────────────────────────────────────────
  async function reabrir() {
    if (!active || atualizando) return; // BUG-6 fix: flag separada
    setAtualizando(true);
    try {
      const { data, error } = await supabase.from('conversations')
        .update({ status: 'aguardando', status_v2: 'open', reopened_by: userId || null, assigned_to: null })
        .eq('id', active.id).eq('tenant_id', tenantDbId)
        .select('id');
      if (error) throw error;
      if (!data?.length) throw new Error('0 linhas afetadas.');
      setConvs(cs => (cs || []).map(c => c.id === active.id ? { ...c, status: 'aguardando', status_v2: 'open' } : c));
      flash('Conversa reaberta ✓');
      await loadConvs(); // BUG-5 fix: recarregar lista para mover conversa para aba correta
    } catch (err) {
      console.error('[CAV] reabrir:', err);
      flash('Erro ao reabrir: ' + (err?.message || String(err)));
    } finally { setAtualizando(false); } // BUG-6 fix
  }

  // ── bulk finalizar (Bug 1 fix) ────────────────────────────────────────────
  async function bulkFinalizar() {
    const ids = [...selecionados].filter(id => !id.startsWith('chan-'));
    if (!ids.length) { flash('Selecione ao menos uma conversa (não canal) para finalizar.'); return; }
    if (atualizando) return; // BUG-6 fix: flag separada
    setBulkFeedback(`Finalizando ${ids.length} conversa(s)…`);
    setAtualizando(true);
    try {
      const { data, error } = await supabase.from('conversations')
        .update({ status: 'finalizado', status_v2: 'closed', finished_by: userId || null })
        .in('id', ids).eq('tenant_id', tenantDbId)
        .select('id');
      if (error) throw error;
      const ok = data?.length || 0;
      setBulkFeedback(`Finalizadas ${ok} de ${ids.length} ✓`);
      setTimeout(() => setBulkFeedback(''), 5000);
      setConvs(cs => (cs || []).map(c => ids.includes(c.id) ? { ...c, status: 'finalizado', status_v2: 'closed' } : c));
      setSelecionados(new Set());
      setModoSelecao(false);
    } catch (err) {
      console.error('[CAV] bulk finalizar:', err);
      setBulkFeedback('Erro: ' + (err?.message || String(err)));
    } finally { setAtualizando(false); } // BUG-6 fix
  }

  // ── Breno actions ─────────────────────────────────────────────────────────
  function usarBreno() {
    if (!brenoSugestao) return;
    setDraft(brenoSugestao.resposta_sugerida || '');
    dispensarBreno();
  }
  async function dispensarBreno() {
    if (!brenoSugestao) return;
    const id = brenoSugestao.id;
    setBrenoSugestao(null);
    try { await supabase.from('breno_interactions').update({ action_taken: 'dismissed' }).eq('id', id); }
    catch (err) { console.error('[CAV] dispensar breno:', err); }
  }

  // ── filtro (Bug 2 fix: canais só na aba interno) ──────────────────────────
  const tabAtual = TABS.find(t => t.id === activeTab) || TABS[0];
  const filteredConvs = (convs || []).filter(c => {
    const isChan = c.id.startsWith('chan-');
    if (isChan) return activeTab === 'interno'; // Bug 2 fix
    if (activeTab === 'interno') return false;
    if (!tabAtual.sv2) return true;
    return tabAtual.sv2.includes(c.status_v2 || '');
  }).filter(c => !busca || c.nome.toLowerCase().includes(busca.toLowerCase()));

  // elegíveis para bulk: excluir canais e já finalizados
  const elegiveisParaBulk = filteredConvs.filter(c => !c.id.startsWith('chan-') && c.status_v2 !== 'closed');

  function toggleSel(id) {
    setSelecionados(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }
  function selecionarTodos() {
    const ids = elegiveisParaBulk.map(c => c.id);
    const todosOn = ids.length > 0 && ids.every(id => selecionados.has(id));
    setSelecionados(todosOn ? new Set() : new Set(ids));
  }

  const isFinalizado = active?.status_v2 === 'closed';
  const isCanal = active?.id?.startsWith('chan-') ?? false;
  const semInstancia = !instance;

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="cav">

      {/* ══ COL1 — lista ═══════════════════════════════════════════════════ */}
      <div className="cav-col1">

        <div className="cav-col1-hd">
          <span className="cav-title">Chat ao Vivo</span>
          <button
            className={`cav-sel-toggle${modoSelecao ? ' on' : ''}`}
            onClick={() => { setModoSelecao(v => !v); setSelecionados(new Set()); setBulkFeedback(''); }}
            title={modoSelecao ? 'Cancelar seleção múltipla' : 'Selecionar para finalizar em lote'}
          >
            {modoSelecao ? 'Cancelar' : 'Selecionar'}
          </button>
        </div>

        <div className="cav-search-wrap">
          <input className="cav-search" placeholder="Buscar conversa…" value={busca} onChange={e => setBusca(e.target.value)} />
        </div>

        {/* Abas */}
        <div className="cav-tabs">
          {TABS.map(t => {
            const count = (convs || []).filter(c => {
              const isCh = c.id.startsWith('chan-');
              if (t.id === 'interno') return isCh;
              if (isCh) return false;
              return t.sv2 ? t.sv2.includes(c.status_v2 || '') : false;
            }).length;
            return (
              <button
                key={t.id}
                className={`cav-tab${activeTab === t.id ? ' on' : ''}`}
                onClick={() => { setActiveTab(t.id); setSelecionados(new Set()); setBulkFeedback(''); }}
                title={t.label}
              >
                {t.label}
                {count > 0 && <span className="cav-tab-badge">{count > 99 ? '99+' : count}</span>}
              </button>
            );
          })}
        </div>

        {/* Barra de bulk */}
        {modoSelecao && (
          <div className="cav-bulk-bar">
            <button className="cav-bulk-selall" onClick={selecionarTodos}>
              {elegiveisParaBulk.length > 0 && elegiveisParaBulk.every(c => selecionados.has(c.id))
                ? 'Desmarcar todos'
                : `Todos (${elegiveisParaBulk.length})`}
            </button>
            {selecionados.size > 0 && (
              <button className="cav-bulk-action" onClick={bulkFinalizar} disabled={atualizando}>
                Finalizar {selecionados.size}
              </button>
            )}
            {bulkFeedback && <span className="cav-bulk-feedback">{bulkFeedback}</span>}
          </div>
        )}

        {/* Lista */}
        <div className="cav-list">
          {convs === null && <div className="cav-empty">Carregando conversas…</div>}
          {convs !== null && !filteredConvs.length && (
            <div className="cav-empty">
              {busca ? 'Nenhum resultado.' : 'Nenhuma conversa nesta aba.'}
            </div>
          )}
          {filteredConvs.map(c => (
            <div
              key={c.id}
              className={`cav-conv${c.id === activeId ? ' on' : ''}${c.unread > 0 ? ' unread' : ''}${selecionados.has(c.id) ? ' sel' : ''}`}
              onClick={() => {
                if (modoSelecao && !c.id.startsWith('chan-')) { toggleSel(c.id); return; }
                abrirConv(c.id);
              }}
            >
              {modoSelecao && !c.id.startsWith('chan-') && (
                <input
                  type="checkbox"
                  className="cav-check"
                  checked={selecionados.has(c.id)}
                  onChange={() => toggleSel(c.id)}
                  onClick={e => e.stopPropagation()}
                />
              )}
              <div className="cav-av" style={{ background: cor(c.nome) }}>
                {(c.nome || '?')[0].toUpperCase()}
              </div>
              <div className="cav-info">
                <div className="cav-nm">{c.nome}</div>
                <div className="cav-pv">{c.prev || (c.isGroup ? '(grupo)' : '(sem mensagem)')}</div>
              </div>
              <div className="cav-mt">
                {c.hora}
                {c.unread > 0 && <span className="cav-badge">{c.unread > 99 ? '99+' : c.unread}</span>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ══ COL2 — thread ══════════════════════════════════════════════════ */}
      <div className="cav-col2">

        {/* Cabeçalho da conversa */}
        <div className="cav-col2-hd">
          {active ? (
            <>
              <div className="cav-av sm" style={{ background: cor(active.nome) }}>
                {(active.nome || '?')[0].toUpperCase()}
              </div>
              <div className="cav-hd-info">
                <b>{active.nome}</b>
                <span>{active.isGroup ? 'Grupo' : 'WhatsApp'} · {active.status_v2 || active.status || '—'}</span>
              </div>
              {!isCanal && (
                <select
                  className="cv2-btn sec"
                  style={{ padding: '5px 8px', fontSize: 11.5, maxWidth: 140 }}
                  value=""
                  onChange={e => { transferir(e.target.value); e.target.value = ''; }}
                  title="Transferir para departamento"
                >
                  <option value="">Transferir…</option>
                  {deps.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              )}
              {!isCanal && !isFinalizado && (
                <button className="cv2-btn" style={{ padding: '5px 12px', fontSize: 11.5 }} onClick={finalizar} disabled={atualizando}> {/* BUG-6 fix */}
                  Finalizar
                </button>
              )}
              {!isCanal && isFinalizado && (
                <button className="cv2-btn sec" style={{ padding: '5px 12px', fontSize: 11.5 }} onClick={reabrir} disabled={atualizando}> {/* BUG-6 fix */}
                  Reabrir
                </button>
              )}
              {isCanal && (
                <span style={{ fontSize: 11, color: 'var(--tx2)', fontStyle: 'italic' }}>Canal interno</span>
              )}
            </>
          ) : (
            <span style={{ color: 'var(--tx2)', fontSize: 13 }}>Selecione uma conversa</span>
          )}
        </div>

        {/* Bug 3 fix: Breno banner — topo fixo, compacto, fora do scroll de mensagens */}
        {brenoSugestao && (
          <div className="cav-breno">
            <span className="cav-breno-ico">🤖</span>
            <div className="cav-breno-body">
              <span className="cav-breno-label">Breno sugeriu:</span>
              <span className="cav-breno-txt">{brenoSugestao.resposta_sugerida}</span>
            </div>
            <button className="cav-breno-usar" onClick={usarBreno}>Usar</button>
            <button className="cav-breno-dis" onClick={dispensarBreno} title="Dispensar sugestão">✕</button>
          </div>
        )}

        {/* Thread */}
        <div className="cav-thread" ref={threadRef}>
          {active && !msgs.length && <div className="cav-empty">Sem mensagens nesta conversa.</div>}
          {msgs.map(m => (
            <div
              key={m.id}
              className={`cav-msg${m.out ? ' me' : ''}`}
              style={{ position: 'relative' }}
              onMouseLeave={() => setReagindo(r => r === m.id ? null : r)}
            >
              {m.who && !m.out && <div className="cav-who">{m.who}</div>}
              {m.quoted && !m.del && (
                <div className="cav-quoted">
                  <div className="cav-quoted-who">{m.out ? 'Você' : (active?.nome || 'Cliente')}</div>
                  <div className="cav-quoted-txt">{(typeof m.quoted === 'string' ? m.quoted : m.quoted?.text) || '📎 Mídia'}</div>
                </div>
              )}
              {m.del
                ? <span style={{ fontStyle: 'italic', color: 'var(--tx2)' }}>🚫 mensagem apagada</span>
                : <>
                    <Media m={m} />
                    {m.txt && m.mtype !== 'document' && m.mtype !== 'audio' && (
                      <div style={{ wordBreak: 'break-word', marginTop: m.mtype ? 5 : 0 }}>{formatWA(m.txt)}</div>
                    )}
                  </>}
              {!m.del && m.reactions?.length > 0 && (() => {
                const g = {};
                m.reactions.forEach(r => { if (r.emoji) g[r.emoji] = (g[r.emoji] || 0) + 1; });
                const entries = Object.entries(g);
                if (!entries.length) return null;
                return (
                  <div className="cav-reactions">
                    {entries.map(([e, n]) => (
                      <span key={e} className="cav-react">{e}{n > 1 && <b>{n}</b>}</span>
                    ))}
                  </div>
                );
              })()}
              <div className="cav-tm">
                {m.tm}{m.out && !m.del && <Tick s={m.ds} />}
              </div>
              {!m.del && (
                <div className="cav-acts" style={{ [m.out ? 'left' : 'right']: 6 }}>
                  <button title="Responder" onClick={() => setReplyTo(m)} style={actBtn}>↩</button>
                  <button title="Reagir" onClick={() => setReagindo(r => r === m.id ? null : m.id)} style={actBtn}>😊</button>
                  {m.out && <button title="Apagar para todos" onClick={() => apagar(m)} style={{ ...actBtn, color: 'var(--red)' }}>🗑️</button>}
                </div>
              )}
              {reagindo === m.id && (
                <div className="cav-emoji-bar" style={{ [m.out ? 'left' : 'right']: 6 }}>
                  {REACOES.map(e => <button key={e} onClick={() => reagir(m, e)}>{e}</button>)}
                </div>
              )}
            </div>
          ))}
        </div>

        {aviso && <div className="cav-aviso">{aviso}</div>}

        {replyTo && (
          <div className="cav-reply-bar">
            <div className="cav-reply-content">
              <div className="cav-reply-who">Respondendo {replyTo.out ? 'você' : (active?.nome || 'cliente')}</div>
              <div className="cav-reply-txt">{replyTo.txt || (replyTo.mtype ? '📎 mídia' : '')}</div>
            </div>
            <button className="cav-reply-cancel" onClick={() => setReplyTo(null)} title="Cancelar resposta">✕</button>
          </div>
        )}

        <div className="cav-composer">
          <input ref={fileRef} type="file" hidden accept="image/*,video/*,application/pdf,audio/*" onChange={onPickFile} />
          <button className="cav-cbtn" title="Anexar mídia" onClick={() => fileRef.current?.click()} disabled={!active || semInstancia}>
            <Ico name="i-clip" size={15} />
          </button>
          <input
            className="cav-input"
            placeholder={
              semInstancia
                ? 'Sem instância WhatsApp conectada'
                : gravando
                  ? 'Gravando áudio… clique no microfone para enviar'
                  : 'Mensagem… (Enter para enviar)'
            }
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onPaste={onPaste}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(); } }}
            disabled={!active || gravando}
          />
          {draft.trim()
            ? <button className="cav-cbtn send" title="Enviar" onClick={enviar} disabled={enviando}><Ico name="i-reply" size={15} /></button>
            : (
              <button
                className={`cav-cbtn mic${gravando ? ' on' : ''}`}
                title={gravando ? 'Parar e enviar áudio' : 'Gravar áudio PTT'}
                onClick={gravarAudio}
                disabled={!active || semInstancia}
                style={gravando ? { background: '#c0392b' } : undefined}
              >
                <Ico name={gravando ? 'i-check' : 'i-mic'} size={15} />
              </button>
            )}
        </div>
      </div>

      {/* ══ COL3 — painel lead ════════════════════════════════════════════ */}
      <div className="cav-col3">
        <h4 className="cav-c3-head">Contato</h4>
        {active ? (
          <>
            <div className="cav-kv"><span>Nome</span><b>{active.nome}</b></div>
            <div className="cav-kv"><span>Tipo</span><b>{active.isGroup ? 'Grupo' : 'WhatsApp direto'}</b></div>
            <div className="cav-kv"><span>Status</span><b>{active.status_v2 || active.status || '—'}</b></div>
            <div className="cav-kv"><span>Depto.</span><b>{deps.find(d => d.id === active.deptId)?.name || '—'}</b></div>
            {customer && (
              <>
                <h4 className="cav-c3-head" style={{ marginTop: 16 }}>Lead</h4>
                <div className="cav-kv"><span>Empresa</span><b>{customer.name || '—'}</b></div>
                {customer.email && <div className="cav-kv"><span>E-mail</span><b style={{ fontSize: 11, wordBreak: 'break-all' }}>{customer.email}</b></div>}
                {customer.phone && <div className="cav-kv"><span>Telefone</span><b>{customer.phone}</b></div>}
                {(customer.city || customer.state) && <div className="cav-kv"><span>Cidade</span><b>{[customer.city, customer.state].filter(Boolean).join('/')}</b></div>}
                {customer.segment && <div className="cav-kv"><span>Segmento</span><b>{customer.segment}</b></div>}
                {customer.pipeline_stage && <div className="cav-kv"><span>Pipeline</span><b>{customer.pipeline_stage}</b></div>}
                {customer.notes && <div className="cav-notes"><b>Notas:</b> {customer.notes}</div>}
              </>
            )}
            {!isCanal && (
              <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {!isFinalizado && (
                  <button className="cv2-btn" style={{ width: '100%', justifyContent: 'center', fontSize: 12 }} onClick={finalizar} disabled={atualizando}> {/* BUG-6 fix */}
                    Finalizar atendimento
                  </button>
                )}
                {isFinalizado && (
                  <button className="cv2-btn sec" style={{ width: '100%', justifyContent: 'center', fontSize: 12 }} onClick={reabrir} disabled={atualizando}> {/* BUG-6 fix */}
                    Reabrir conversa
                  </button>
                )}
              </div>
            )}
          </>
        ) : (
          <div className="cav-empty">Selecione uma conversa.</div>
        )}
      </div>

    </div>
  );
}
