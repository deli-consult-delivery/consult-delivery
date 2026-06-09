import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase.js';
import { sendTextMessage, sendMediaMessage, sendAudioMessage, sendReaction, deleteWhatsAppMessage } from '../lib/evolution.js';
import { Ico } from './CvIcons.jsx';

// ============================================================
// Chat ao Vivo v2 — layout claro idêntico ao protótipo
// (docs/prototipo/console-v2.html · tela chat). Dados reais:
// conversas + mensagens + realtime + envio (reusa lib/evolution).
// Surface completo: mídia (img/vídeo/áudio/doc), formatação
// WhatsApp, status de entrega, citação/reply, reações, apagar,
// transferir e finalizar — sem depender da versão clássica.
// ============================================================

const COR = ['#B70C00', '#1f4f9c', '#1e7d43', '#9a6a10', '#6d28d9', '#0e7490', '#b45309'];
const cor = s => COR[[...String(s || '?')].reduce((a, c) => a + c.charCodeAt(0), 0) % COR.length];
const hora = ts => ts ? new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
const previewTxt = m => !m ? '' : (m.deleted_at ? '🚫 mensagem apagada' : (m.media_type ? '📎 mídia' : (m.content || m.body || '')));

// tipo de mídia a partir do MIME (igual ao ChatScreen)
const mediaTipo = mime => /^image\//.test(mime) ? 'image' : /^video\//.test(mime) ? 'video' : /^audio\//.test(mime) ? 'audio' : 'document';
// base64 puro (sem o prefixo data:...;base64,)
const toBase64 = file => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(String(r.result).split(',')[1] || '');
  r.onerror = rej;
  r.readAsDataURL(file);
});

const REACOES = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

// ─── formatação WhatsApp (negrito *…*, itálico _…_, ~tachado~, `code`, links) ──
const WA_REGEX = /(\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~|`[^`\n]+`|https?:\/\/[^\s<>"')\]]+|www\.[^\s<>"')\]]+)/g;
function formatWA(text) {
  if (!text) return null;
  const out = [];
  text.split('\n').forEach((line, li) => {
    if (li > 0) out.push(<br key={`br-${li}`} />);
    if (!line) return;
    let last = 0, match;
    WA_REGEX.lastIndex = 0;
    while ((match = WA_REGEX.exec(line)) !== null) {
      if (match.index > last) out.push(line.slice(last, match.index));
      const t = match[0], key = `wa-${li}-${match.index}`;
      if (t.startsWith('*') && t.endsWith('*')) out.push(<strong key={key} style={{ fontWeight: 700 }}>{t.slice(1, -1)}</strong>);
      else if (t.startsWith('_') && t.endsWith('_')) out.push(<em key={key}>{t.slice(1, -1)}</em>);
      else if (t.startsWith('~') && t.endsWith('~')) out.push(<del key={key}>{t.slice(1, -1)}</del>);
      else if (t.startsWith('`') && t.endsWith('`')) out.push(<code key={key} style={{ background: 'rgba(0,0,0,0.06)', borderRadius: 3, padding: '0 3px', fontFamily: 'monospace', fontSize: '0.9em' }}>{t.slice(1, -1)}</code>);
      else { const href = t.startsWith('http') ? t : `https://${t}`; out.push(<a key={key} href={href} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--red)', textDecoration: 'underline', wordBreak: 'break-all' }}>{t}</a>); }
      last = match.index + t.length;
    }
    if (last < line.length) out.push(line.slice(last));
  });
  return out.length ? out : null;
}

// ─── citação (quoted_content): aceita formato próprio e formato Evolution ──
function quotedText(q) {
  if (!q) return null;
  if (typeof q.text === 'string') return q.text;
  const msg = q.message;
  if (!msg) return '📎 Mídia';
  if (msg.conversation) return msg.conversation;
  if (msg.extendedTextMessage?.text) return msg.extendedTextMessage.text;
  if (msg.imageMessage) return msg.imageMessage.caption || '🖼 Imagem';
  if (msg.videoMessage) return msg.videoMessage.caption || '🎬 Vídeo';
  if (msg.audioMessage) return '🎵 Áudio';
  if (msg.documentMessage) return `📄 ${msg.documentMessage.fileName || 'Documento'}`;
  return '📎 Mídia';
}
function quotedSender(q) {
  if (!q) return null;
  if (q.agentName) return q.agentName;
  if (q.from === 'out' || q.key?.fromMe) return 'Você';
  return q.pushName || 'Cliente';
}

// ─── tick de entrega (0=erro 1=pendente 2=enviado 3=entregue 4=lido) ──
function Tick({ s }) {
  if (s === 0) return <span title="erro ao enviar" style={{ color: 'var(--red)', fontWeight: 700 }}>!</span>;
  const color = (s >= 4) ? '#53BDEB' : 'var(--tx2)';
  if (s === null || s === undefined || s === 1)
    return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--tx2)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-label="pendente"><circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15 14" /></svg>;
  if (s === 2)
    return <svg width="14" height="12" viewBox="0 0 20 16" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-label="enviado"><polyline points="4 8 8 12 16 4" /></svg>;
  return <svg width="16" height="12" viewBox="0 0 24 16" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-label={s >= 4 ? 'lido' : 'entregue'}><polyline points="3 8 7 12 15 4" /><polyline points="9 12 13 16 21 8" /></svg>;
}

// ─── documento (data: URL precisa virar Blob para abrir/baixar) ──
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

// ─── render de mídia da bolha (tema claro) ──
function Media({ m }) {
  if (!m.mtype) return null;
  const url = m.murl;
  if (m.mtype === 'image' || (m.mtype === 'document' && url?.startsWith('data:image/'))) {
    return url
      ? <img src={url} alt={m.txt || 'imagem'} style={{ maxWidth: 220, maxHeight: 220, borderRadius: 6, display: 'block', cursor: 'pointer' }} onClick={() => window.open(url, '_blank')} />
      : <span style={{ fontSize: 12, color: 'var(--tx2)' }}>🖼️ carregando imagem…</span>;
  }
  if (m.mtype === 'sticker') return url ? <img src={url} alt="figurinha" style={{ width: 110, height: 110, objectFit: 'contain' }} /> : <span style={{ fontSize: 26 }}>🔖</span>;
  if (m.mtype === 'video') return url ? <video src={url} controls style={{ maxWidth: 240, borderRadius: 6, display: 'block' }} /> : <span style={{ fontSize: 12, color: 'var(--tx2)' }}>🎬 carregando vídeo…</span>;
  if (m.mtype === 'audio') return url ? <audio src={url} controls style={{ height: 36, maxWidth: 230 }} /> : <span style={{ fontSize: 12, color: 'var(--tx2)' }}>🎙️ carregando áudio…</span>;
  // documento
  return (
    <div onClick={() => abrirDoc(url, m.txt)} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: url ? 'pointer' : 'default', padding: '7px 9px', background: 'rgba(0,0,0,0.04)', borderRadius: 6, fontSize: 12 }}>
      <span>📄</span><span style={{ flex: 1 }}>{m.txt || 'Documento'}</span>
      {!url && <span style={{ fontSize: 10, opacity: 0.5 }}>carregando…</span>}
      {url && <Ico name="i-clip" size={12} />}
    </div>
  );
}

export default function ChatV2({ tenantDbId, userId, onFull }) {
  const [convs, setConvs] = useState(null);
  const [activeId, setActiveId] = useState(null);
  const [msgs, setMsgs] = useState([]);
  const [draft, setDraft] = useState('');
  const [busca, setBusca] = useState('');
  const [depFiltro, setDepFiltro] = useState('Todos');
  const [deps, setDeps] = useState([]);
  const [instance, setInstance] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [gravando, setGravando] = useState(false);
  const [aviso, setAviso] = useState('');
  const [replyTo, setReplyTo] = useState(null);
  const [reagindo, setReagindo] = useState(null); // id da msg com a barra de emoji aberta
  const threadRef = useRef(null);
  const fileRef = useRef(null);
  const recRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);

  // conversas do tenant + preview da última mensagem
  const loadConvs = useCallback(async () => {
    if (!tenantDbId) return;
    const { data } = await supabase.from('conversations')
      .select('id, whatsapp_chat_id, group_name, contact_name, push_name, is_group, updated_at, status, department_id, customer_id')
      .eq('tenant_id', tenantDbId).order('updated_at', { ascending: false }).limit(60);
    const rows = data || [];
    const prev = await Promise.all(rows.map(r =>
      supabase.from('messages').select('content, body, direction, media_type, deleted_at, created_at').eq('conversation_id', r.id).order('created_at', { ascending: false }).limit(1).maybeSingle()));
    const mapped = rows.map((c, i) => {
      const phone = c.whatsapp_chat_id ? c.whatsapp_chat_id.split('@')[0] : '';
      const gname = c.group_name && !/^\d{10,}$/.test(c.group_name) ? c.group_name : null;
      const nome = c.contact_name || gname || c.push_name || phone || 'Conversa';
      return {
        id: c.id, nome, chatId: c.whatsapp_chat_id, isGroup: c.is_group,
        prev: previewTxt(prev[i]?.data), hora: hora(c.updated_at),
        status: c.status, deptId: c.department_id || null, customerId: c.customer_id || null,
      };
    });
    setConvs(mapped);
    setActiveId(a => a || mapped[0]?.id || null);
  }, [tenantDbId]);

  useEffect(() => { loadConvs(); }, [loadConvs]);

  useEffect(() => {
    if (!tenantDbId) return;
    supabase.from('departments').select('id, name').eq('tenant_id', tenantDbId).then(({ data }) => setDeps(data || []));
  }, [tenantDbId]);

  useEffect(() => {
    supabase.from('evolution_instances').select('instance_name, status, evolution_url, api_key').order('created_at')
      .then(({ data }) => { const arr = data || []; setInstance(arr.find(i => /conn|open/i.test(i.status || '')) || arr[0] || null); });
  }, []);

  // limpa o microfone se o componente desmontar gravando
  useEffect(() => () => { streamRef.current?.getTracks().forEach(t => t.stop()); }, []);

  const mapMsg = m => ({
    id: m.id, out: m.direction === 'outbound', txt: m.content || m.body || '',
    mtype: m.media_type || null, murl: m.media_url || null,
    who: m.sender_name, tm: hora(m.created_at),
    reactions: Array.isArray(m.reactions) ? m.reactions : [],
    quoted: m.quoted_content || null,
    ds: m.delivery_status, del: !!m.deleted_at, waId: m.whatsapp_msg_id || null,
  });

  // mensagens da conversa + realtime (INSERT novas, UPDATE p/ reações/ticks/apagar)
  const loadMsgs = useCallback(async (convId) => {
    const { data } = await supabase.from('messages')
      .select('id, direction, content, body, created_at, sender_name, media_type, media_url, reactions, quoted_content, delivery_status, deleted_at, whatsapp_msg_id')
      .eq('conversation_id', convId).order('created_at', { ascending: true }).limit(80);
    setMsgs((data || []).map(mapMsg));
  }, []);

  useEffect(() => {
    if (!activeId) return;
    loadMsgs(activeId);
    const ch = supabase.channel('chatv2-' + activeId)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${activeId}` }, payload => {
        const nm = mapMsg(payload.new);
        setMsgs(prev => prev.some(x => x.id === nm.id) ? prev : [...prev, nm]);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter: `conversation_id=eq.${activeId}` }, payload => {
        const nm = mapMsg(payload.new);
        setMsgs(prev => prev.map(x => x.id === nm.id ? nm : x));
      }).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [activeId, loadMsgs]);

  useEffect(() => { if (threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight; }, [msgs]);

  const active = (convs || []).find(c => c.id === activeId) || null;

  function flash(t) { setAviso(t); setTimeout(() => setAviso(''), 2600); }

  async function enviar() {
    const text = draft.trim();
    if (!text || !active || enviando) return;
    const quoting = replyTo;
    setDraft('');
    setReplyTo(null);
    setEnviando(true);
    try {
      // quoted_content para nosso render + payload Evolution
      const quotedContent = quoting
        ? { waMsgId: quoting.waId, from: quoting.out ? 'out' : 'in', text: quoting.txt || quotedText(quoting.quoted) || '', mediaType: quoting.mtype || undefined }
        : null;
      // salva no banco ANTES (dedup do webhook) — o realtime renderiza a msg
      await supabase.from('messages').insert({
        tenant_id: tenantDbId, conversation_id: active.id, direction: 'outbound',
        content: text, sender_name: null, quoted_content: quotedContent, created_at: new Date().toISOString(),
      });
      if (instance && active.chatId) {
        const evoQuoted = quoting && quoting.waId
          ? { key: { id: quoting.waId, fromMe: quoting.out, remoteJid: active.chatId }, message: { conversation: quoting.txt || '' } }
          : null;
        await sendTextMessage(instance.instance_name, active.chatId, text, evoQuoted, instance.evolution_url, instance.api_key);
      }
    } catch (err) {
      console.error('ChatV2 envio:', err);
      flash('Falha ao enviar mensagem.');
    } finally { setEnviando(false); }
  }

  // ---- mídia (imagem / vídeo / documento) ----
  async function enviarMidia(file) {
    if (!file || !active) return;
    if (!instance || !active.chatId) { flash('Sem instância WhatsApp conectada.'); return; }
    setEnviando(true);
    try {
      const tipo = mediaTipo(file.type || '');
      const b64 = await toBase64(file);
      await supabase.from('messages').insert({
        tenant_id: tenantDbId, conversation_id: active.id, direction: 'outbound',
        content: file.name, media_type: tipo, sender_name: null, created_at: new Date().toISOString(),
      });
      await sendMediaMessage(instance.instance_name, active.chatId, b64, tipo, file.type, '', file.name);
    } catch (err) {
      console.error('ChatV2 mídia:', err);
      flash('Falha ao enviar mídia.');
    } finally { setEnviando(false); }
  }

  function onPickFile(e) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (f) enviarMidia(f);
  }

  // colar imagem do clipboard → envia como mídia
  function onPaste(e) {
    const item = [...(e.clipboardData?.items || [])].find(i => i.type.startsWith('image/'));
    if (!item) return;
    const f = item.getAsFile();
    if (f) { e.preventDefault(); enviarMidia(f); }
  }

  // ---- áudio PTT (grava ogg/opus → base64 → sendWhatsAppAudio) ----
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
            tenant_id: tenantDbId, conversation_id: active.id, direction: 'outbound',
            content: 'Áudio', media_type: 'audio', sender_name: null, created_at: new Date().toISOString(),
          });
          await sendAudioMessage(instance.instance_name, active.chatId, b64);
        } catch (err) {
          console.error('ChatV2 áudio:', err);
          flash('Falha ao enviar áudio.');
        } finally { setEnviando(false); }
      };
      rec.start();
      setGravando(true);
    } catch (err) {
      console.error('ChatV2 microfone:', err);
      flash('Microfone indisponível.');
    }
  }

  // ---- reagir a uma mensagem ----
  async function reagir(m, emoji) {
    setReagindo(null);
    if (!active || !m.waId) { flash('Mensagem sem ID do WhatsApp.'); return; }
    if (!instance || !active.chatId) { flash('Sem instância WhatsApp conectada.'); return; }
    // otimista: registra a reação do operador (jid 'me')
    const nova = [...(m.reactions || []).filter(r => r.jid !== 'me'), { jid: 'me', emoji, name: 'Você' }];
    setMsgs(prev => prev.map(x => x.id === m.id ? { ...x, reactions: nova } : x));
    try {
      await supabase.from('messages').update({ reactions: nova }).eq('id', m.id).eq('tenant_id', tenantDbId);
      await sendReaction(instance.instance_name, active.chatId, m.waId, emoji, m.out);
    } catch (err) {
      console.error('ChatV2 reação:', err);
      flash('Falha ao reagir.');
    }
  }

  // ---- apagar mensagem (revoke no WhatsApp + soft-delete no banco) ----
  async function apagar(m) {
    if (!active) return;
    if (!window.confirm('Apagar esta mensagem para todos?')) return;
    setMsgs(prev => prev.map(x => x.id === m.id ? { ...x, del: true } : x));
    try {
      if (instance && active.chatId && m.waId) {
        await deleteWhatsAppMessage(instance.instance_name, active.chatId, m.waId, m.out);
      }
      await supabase.from('messages').update({ deleted_at: new Date().toISOString() }).eq('id', m.id).eq('tenant_id', tenantDbId);
    } catch (err) {
      console.error('ChatV2 apagar:', err);
      flash('Falha ao apagar mensagem.');
    }
  }

  // ---- transferir (muda o departamento da conversa) ----
  async function transferir(deptId) {
    if (!active || !deptId) return;
    const { error } = await supabase.from('conversations')
      .update({ department_id: deptId }).eq('id', active.id).eq('tenant_id', tenantDbId);
    if (error) { console.error('ChatV2 transferir:', error); flash('Falha ao transferir.'); return; }
    setConvs(cs => (cs || []).map(c => c.id === active.id ? { ...c, deptId } : c));
    flash('Conversa transferida para ' + (deps.find(d => d.id === deptId)?.name || 'departamento') + '.');
  }

  // ---- finalizar (fecha a conversa) ----
  async function finalizar() {
    if (!active || enviando) return;
    setEnviando(true);
    try {
      const { error } = await supabase.from('conversations')
        .update({ status: 'finalizado', status_v2: 'closed', finished_by: userId || null })
        .eq('id', active.id).eq('tenant_id', tenantDbId);
      if (error) throw error;
      setConvs(cs => (cs || []).map(c => c.id === active.id ? { ...c, status: 'finalizado' } : c));
      flash('Conversa finalizada.');
    } catch (err) {
      console.error('ChatV2 finalizar:', err);
      flash('Falha ao finalizar.');
    } finally { setEnviando(false); }
  }

  const lista = (convs || []).filter(c =>
    (depFiltro === 'Todos' || c.deptId === depFiltro) &&
    (!busca || c.nome.toLowerCase().includes(busca.toLowerCase())));

  const chips = [{ id: 'Todos', name: 'Todos' }, ...deps.map(d => ({ id: d.id, name: d.name }))];
  const semInstancia = !instance;

  return (
    <div className="cv2-chat">
      {/* col1 — lista de conversas */}
      <div className="col1">
        <div className="hd"><input className="search" style={{ width: '100%', maxWidth: 'none', background: '#faf9f8', border: '1px solid var(--line)', borderRadius: 4, padding: '8px 12px', fontSize: 13, fontFamily: 'inherit', fontWeight: 500, outline: 'none' }}
          placeholder="Buscar conversa…" value={busca} onChange={e => setBusca(e.target.value)} /></div>
        <div className="filters">{chips.map(d => (
          <span key={d.id} className={`chip${depFiltro === d.id ? ' on' : ''}`} onClick={() => setDepFiltro(d.id)}>{d.name}</span>
        ))}</div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {convs == null && <div className="empty">Carregando conversas…</div>}
          {convs && !lista.length && <div className="empty">Nenhuma conversa.</div>}
          {lista.map(c => (
            <div key={c.id} className={`conv${c.id === activeId ? ' on' : ''}`} onClick={() => setActiveId(c.id)}>
              <div className="cav" style={{ background: cor(c.nome) }}>{(c.nome || '?').slice(0, 1).toUpperCase()}</div>
              <div style={{ minWidth: 0 }}>
                <div className="nm">{c.nome}</div>
                <div className="pv">{c.prev || (c.isGroup ? 'Grupo' : 'Conversa')}</div>
              </div>
              <div className="mt">{c.hora}</div>
            </div>
          ))}
        </div>
      </div>

      {/* col2 — thread + composer */}
      <div className="col2">
        <div className="hd">
          {active ? (
            <>
              <div className="cav" style={{ width: 32, height: 32, borderRadius: '50%', background: cor(active.nome), color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13 }}>{(active.nome || '?').slice(0, 1).toUpperCase()}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <b style={{ fontSize: 13 }}>{active.nome}</b>
                <div style={{ fontSize: 11, color: 'var(--tx2)', fontWeight: 600 }}>{active.isGroup ? 'Grupo' : 'WhatsApp'}{active.status ? ` · ${active.status}` : ''}</div>
              </div>
            </>
          ) : <b style={{ fontSize: 13 }}>Selecione uma conversa</b>}
          {active && (
            <select className="cv2-btn sec" style={{ padding: '5px 8px', fontSize: 11.5, maxWidth: 150 }} value=""
              onChange={e => { transferir(e.target.value); e.target.value = ''; }} title="Transferir para departamento">
              <option value="">Transferir…</option>
              {deps.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          )}
          {active && <button className="cv2-btn sec" style={{ padding: '5px 11px', fontSize: 11.5 }} onClick={finalizar} disabled={enviando} title="Finalizar conversa">Finalizar</button>}
          <button className="cv2-btn sec" style={{ padding: '5px 11px', fontSize: 11.5 }} onClick={onFull} title="Abrir o chat completo (bots, tarefas)">Versão completa</button>
        </div>
        <div className="thread" ref={threadRef}>
          {active && !msgs.length && <div className="empty">Sem mensagens nesta conversa.</div>}
          {msgs.map(m => (
            <div key={m.id} className={`msg${m.out ? ' me' : ''}`} style={{ position: 'relative' }}
              onMouseLeave={() => setReagindo(r => r === m.id ? null : r)}>
              {m.who && !m.out && <div className="who">{m.who}</div>}
              {/* citação */}
              {m.quoted && !m.del && (
                <div style={{ marginBottom: 5, padding: '4px 9px', borderLeft: '3px solid var(--red)', background: 'rgba(0,0,0,0.04)', borderRadius: '0 5px 5px 0', fontSize: 11, maxWidth: 260, overflow: 'hidden' }}>
                  <div style={{ color: 'var(--red)', fontWeight: 700, marginBottom: 1, whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>{quotedSender(m.quoted)}</div>
                  <div style={{ color: 'var(--tx2)', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>{quotedText(m.quoted) || '📎 Mídia'}</div>
                </div>
              )}
              {/* corpo */}
              {m.del
                ? <span style={{ fontStyle: 'italic', color: 'var(--tx2)' }}>🚫 mensagem apagada</span>
                : <>
                    <Media m={m} />
                    {m.txt && m.mtype !== 'document' && m.mtype !== 'audio' && <div style={{ wordBreak: 'break-word', marginTop: m.mtype ? 5 : 0 }}>{formatWA(m.txt)}</div>}
                  </>}
              {/* reações agregadas */}
              {!m.del && m.reactions?.length > 0 && (() => {
                const g = {};
                m.reactions.forEach(r => { if (r.emoji) g[r.emoji] = (g[r.emoji] || 0) + 1; });
                const entries = Object.entries(g);
                if (!entries.length) return null;
                return (
                  <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
                    {entries.map(([emoji, n]) => (
                      <span key={emoji} style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 12, padding: '0 6px', fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                        {emoji}{n > 1 && <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--tx2)' }}>{n}</span>}
                      </span>
                    ))}
                  </div>
                );
              })()}
              {/* rodapé: hora + tick */}
              <div className="tm" style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end' }}>
                {m.tm}{m.out && !m.del && <Tick s={m.ds} />}
              </div>
              {/* ações (hover) */}
              {!m.del && (
                <div className="cv2-msg-acts" style={{ position: 'absolute', top: -10, [m.out ? 'left' : 'right']: 6, display: 'flex', gap: 2, background: '#fff', border: '1px solid var(--line)', borderRadius: 999, padding: '1px 4px' }}>
                  <button title="Responder" onClick={() => setReplyTo(m)} style={actBtn}><Ico name="i-reply" size={12} /></button>
                  <button title="Reagir" onClick={() => setReagindo(r => r === m.id ? null : m.id)} style={actBtn}>😊</button>
                  {m.out && <button title="Apagar" onClick={() => apagar(m)} style={{ ...actBtn, color: 'var(--red)' }}>🗑️</button>}
                </div>
              )}
              {/* barra de emojis */}
              {reagindo === m.id && (
                <div style={{ position: 'absolute', top: -34, [m.out ? 'left' : 'right']: 6, display: 'flex', gap: 2, background: '#fff', border: '1px solid var(--line)', borderRadius: 999, padding: '3px 6px', boxShadow: '0 2px 8px rgba(0,0,0,.12)', zIndex: 5 }}>
                  {REACOES.map(e => <button key={e} onClick={() => reagir(m, e)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: 1 }}>{e}</button>)}
                </div>
              )}
            </div>
          ))}
        </div>
        {aviso && <div style={{ padding: '4px 14px', fontSize: 11.5, color: 'var(--red)', fontWeight: 600 }}>{aviso}</div>}
        {/* barra de citação ativa */}
        {replyTo && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 14px', borderTop: '1px solid var(--line)', background: '#faf9f8', fontSize: 11.5 }}>
            <div style={{ borderLeft: '3px solid var(--red)', paddingLeft: 8, flex: 1, minWidth: 0 }}>
              <div style={{ color: 'var(--red)', fontWeight: 700 }}>Respondendo {replyTo.out ? 'você' : (active?.nome || 'cliente')}</div>
              <div style={{ color: 'var(--tx2)', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>{replyTo.txt || (replyTo.mtype ? '📎 mídia' : '')}</div>
            </div>
            <button onClick={() => setReplyTo(null)} style={{ ...actBtn, fontSize: 14 }} title="Cancelar">✕</button>
          </div>
        )}
        <div className="composer">
          <input ref={fileRef} type="file" hidden
            accept="image/*,video/*,application/pdf,audio/*" onChange={onPickFile} />
          <button className="cbtn" title="Anexar mídia" onClick={() => fileRef.current?.click()} disabled={!active || semInstancia}><Ico name="i-clip" size={15} /></button>
          <input placeholder={semInstancia ? 'Sem instância WhatsApp conectada' : (gravando ? 'Gravando áudio… toque no microfone para enviar' : 'Escreva uma mensagem… (Enter envia)')}
            value={draft} onChange={e => setDraft(e.target.value)} onPaste={onPaste}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(); } }}
            disabled={!active || gravando} />
          {draft.trim()
            ? <button className="cbtn mic" title="Enviar" onClick={enviar} disabled={enviando}><Ico name="i-reply" size={15} /></button>
            : <button className={`cbtn mic${gravando ? ' on' : ''}`} title={gravando ? 'Parar e enviar áudio' : 'Gravar áudio'} onClick={gravarAudio} disabled={!active || semInstancia}
                style={gravando ? { background: 'var(--red)', color: '#fff' } : undefined}><Ico name={gravando ? 'i-check' : 'i-mic'} size={15} /></button>}
        </div>
      </div>

      {/* col3 — contato */}
      <div className="col3">
        <h4>Contato</h4>
        <div className="kv"><span>Nome</span><b>{active?.nome || '—'}</b></div>
        <div className="kv"><span>Tipo</span><b>{active ? (active.isGroup ? 'Grupo' : 'Direto') : '—'}</b></div>
        <div className="kv"><span>Status</span><b>{active?.status || '—'}</b></div>
        <div className="kv"><span>Depto.</span><b>{deps.find(d => d.id === active?.deptId)?.name || '—'}</b></div>
        <h4>Monitoramento</h4>
        <div style={{ fontSize: 11.5, color: 'var(--tx2)', lineHeight: 1.7, fontWeight: 500 }}>
          Conversa monitorada pela MIA. Mídia, áudio, citação, reações, status de entrega e apagar já funcionam aqui. Para bots e tarefas, use a <b style={{ color: 'var(--red)', cursor: 'pointer' }} onClick={onFull}>versão completa</b>.
        </div>
      </div>
    </div>
  );
}

const actBtn = { background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, lineHeight: 1, padding: '2px 3px', color: 'var(--tx2)' };
