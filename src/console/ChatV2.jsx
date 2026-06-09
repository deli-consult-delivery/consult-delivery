import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase.js';
import { sendTextMessage, sendMediaMessage, sendAudioMessage } from '../lib/evolution.js';
import { Ico } from './CvIcons.jsx';

// ============================================================
// Chat ao Vivo v2 — layout claro idêntico ao protótipo
// (docs/prototipo/console-v2.html · tela chat). Dados reais:
// conversas + mensagens + realtime + envio (reusa lib/evolution).
// Mídia, áudio (PTT), transferir e finalizar reusam a mesma
// lógica do ChatScreen clássico. "Versão completa" segue como
// fallback para bots/tarefas/reações.
// ============================================================

const COR = ['#B70C00', '#1f4f9c', '#1e7d43', '#9a6a10', '#6d28d9', '#0e7490', '#b45309'];
const cor = s => COR[[...String(s || '?')].reduce((a, c) => a + c.charCodeAt(0), 0) % COR.length];
const hora = ts => ts ? new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
const previewTxt = m => !m ? '' : (m.media_type ? '📎 mídia' : (m.content || m.body || ''));

// tipo de mídia a partir do MIME (igual ao ChatScreen)
const mediaTipo = mime => /^image\//.test(mime) ? 'image' : /^video\//.test(mime) ? 'video' : /^audio\//.test(mime) ? 'audio' : 'document';
// base64 puro (sem o prefixo data:...;base64,)
const toBase64 = file => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(String(r.result).split(',')[1] || '');
  r.onerror = rej;
  r.readAsDataURL(file);
});
// rótulo da mídia na thread
const midiaLabel = m => m.mtype === 'audio' ? '🎙️ Áudio'
  : m.mtype === 'video' ? '🎬 Vídeo'
  : m.mtype === 'document' ? `📄 ${m.txt || 'Documento'}`
  : m.mtype === 'image' ? (m.txt || '🖼️ Imagem')
  : m.txt;

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
      supabase.from('messages').select('content, body, direction, media_type, created_at').eq('conversation_id', r.id).order('created_at', { ascending: false }).limit(1).maybeSingle()));
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
  });

  // mensagens da conversa + realtime
  const loadMsgs = useCallback(async (convId) => {
    const { data } = await supabase.from('messages')
      .select('id, direction, content, body, created_at, sender_name, media_type, media_url')
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
      }).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [activeId, loadMsgs]);

  useEffect(() => { if (threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight; }, [msgs]);

  const active = (convs || []).find(c => c.id === activeId) || null;

  function flash(t) { setAviso(t); setTimeout(() => setAviso(''), 2600); }

  async function enviar() {
    const text = draft.trim();
    if (!text || !active || enviando) return;
    setDraft('');
    setEnviando(true);
    try {
      // salva no banco ANTES (dedup do webhook) — o realtime renderiza a msg
      await supabase.from('messages').insert({
        tenant_id: tenantDbId, conversation_id: active.id, direction: 'outbound',
        content: text, sender_name: null, created_at: new Date().toISOString(),
      });
      if (instance && active.chatId) {
        await sendTextMessage(instance.instance_name, active.chatId, text, null, instance.evolution_url, instance.api_key);
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
          <button className="cv2-btn sec" style={{ padding: '5px 11px', fontSize: 11.5 }} onClick={onFull} title="Abrir o chat completo (bots, tarefas, reações)">Versão completa</button>
        </div>
        <div className="thread" ref={threadRef}>
          {active && !msgs.length && <div className="empty">Sem mensagens nesta conversa.</div>}
          {msgs.map(m => (
            <div key={m.id} className={`msg${m.out ? ' me' : ''}`}>
              {m.who && !m.out && <div className="who">{m.who}</div>}
              {m.mtype === 'image' && m.murl
                ? <img src={m.murl} alt={m.txt || 'imagem'} style={{ maxWidth: 220, borderRadius: 6, display: 'block' }} />
                : (m.mtype ? midiaLabel(m) : m.txt)}
              <div className="tm">{m.tm}</div>
            </div>
          ))}
        </div>
        {aviso && <div style={{ padding: '4px 14px', fontSize: 11.5, color: 'var(--red)', fontWeight: 600 }}>{aviso}</div>}
        <div className="composer">
          <input ref={fileRef} type="file" hidden
            accept="image/*,video/*,application/pdf,audio/*" onChange={onPickFile} />
          <button className="cbtn" title="Anexar mídia" onClick={() => fileRef.current?.click()} disabled={!active || semInstancia}><Ico name="i-clip" size={15} /></button>
          <input placeholder={semInstancia ? 'Sem instância WhatsApp conectada' : (gravando ? 'Gravando áudio… toque no microfone para enviar' : 'Escreva uma mensagem… (Enter envia)')}
            value={draft} onChange={e => setDraft(e.target.value)}
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
          Conversa monitorada pela MIA. Mídia, áudio, transferência e finalização já funcionam aqui. Para bots, tarefas e reações, use a <b style={{ color: 'var(--red)', cursor: 'pointer' }} onClick={onFull}>versão completa</b>.
        </div>
      </div>
    </div>
  );
}
