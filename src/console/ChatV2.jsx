import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase.js';
import { sendTextMessage } from '../lib/evolution.js';
import { Ico } from './CvIcons.jsx';

// ============================================================
// Chat ao Vivo v2 — layout claro idêntico ao protótipo
// (docs/prototipo/console-v2.html · tela chat). Dados reais:
// conversas + mensagens + realtime + envio (reusa lib/evolution).
// "Versão completa" abre o ChatScreen clássico (fallback, nada se perde).
// ============================================================

const COR = ['#B70C00', '#1f4f9c', '#1e7d43', '#9a6a10', '#6d28d9', '#0e7490', '#b45309'];
const cor = s => COR[[...String(s || '?')].reduce((a, c) => a + c.charCodeAt(0), 0) % COR.length];
const hora = ts => ts ? new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
const previewTxt = m => !m ? '' : (m.media_type ? '📎 mídia' : (m.content || m.body || ''));

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
  const threadRef = useRef(null);

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

  // mensagens da conversa + realtime
  const loadMsgs = useCallback(async (convId) => {
    const { data } = await supabase.from('messages')
      .select('id, direction, content, body, created_at, sender_name, media_type')
      .eq('conversation_id', convId).order('created_at', { ascending: true }).limit(80);
    setMsgs((data || []).map(m => ({ id: m.id, out: m.direction === 'outbound', txt: previewTxt(m), who: m.sender_name, tm: hora(m.created_at) })));
  }, []);

  useEffect(() => {
    if (!activeId) return;
    loadMsgs(activeId);
    const ch = supabase.channel('chatv2-' + activeId)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${activeId}` }, payload => {
        const m = payload.new;
        setMsgs(prev => prev.some(x => x.id === m.id) ? prev : [...prev, { id: m.id, out: m.direction === 'outbound', txt: previewTxt(m), who: m.sender_name, tm: hora(m.created_at) }]);
      }).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [activeId, loadMsgs]);

  useEffect(() => { if (threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight; }, [msgs]);

  const active = (convs || []).find(c => c.id === activeId) || null;

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
    } finally { setEnviando(false); }
  }

  const lista = (convs || []).filter(c =>
    (depFiltro === 'Todos' || c.deptId === depFiltro) &&
    (!busca || c.nome.toLowerCase().includes(busca.toLowerCase())));

  const chips = [{ id: 'Todos', name: 'Todos' }, ...deps.map(d => ({ id: d.id, name: d.name }))];

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
          <button className="cv2-btn sec" style={{ padding: '5px 11px', fontSize: 11.5 }} onClick={onFull} title="Abrir o chat completo (mídia, áudio, bots, tarefas)">Versão completa</button>
        </div>
        <div className="thread" ref={threadRef}>
          {active && !msgs.length && <div className="empty">Sem mensagens nesta conversa.</div>}
          {msgs.map(m => (
            <div key={m.id} className={`msg${m.out ? ' me' : ''}`}>
              {m.who && !m.out && <div className="who">{m.who}</div>}
              {m.txt}
              <div className="tm">{m.tm}</div>
            </div>
          ))}
        </div>
        <div className="composer">
          <button className="cbtn" title="Anexo (na versão completa)" onClick={onFull}><Ico name="i-clip" size={15} /></button>
          <input placeholder={instance ? 'Escreva uma mensagem… (Enter envia)' : 'Sem instância WhatsApp conectada — use a versão completa'}
            value={draft} onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(); } }}
            disabled={!active} />
          <button className="cbtn mic" title="Enviar" onClick={enviar} disabled={!draft.trim() || enviando}><Ico name="i-reply" size={15} /></button>
        </div>
      </div>

      {/* col3 — contato */}
      <div className="col3">
        <h4>Contato</h4>
        <div className="kv"><span>Nome</span><b>{active?.nome || '—'}</b></div>
        <div className="kv"><span>Tipo</span><b>{active ? (active.isGroup ? 'Grupo' : 'Direto') : '—'}</b></div>
        <div className="kv"><span>Status</span><b>{active?.status || '—'}</b></div>
        <h4>Monitoramento</h4>
        <div style={{ fontSize: 11.5, color: 'var(--tx2)', lineHeight: 1.7, fontWeight: 500 }}>
          Conversa monitorada pela MIA. Para mídia, áudio, bots, tarefas e transferência, use a <b style={{ color: 'var(--red)', cursor: 'pointer' }} onClick={onFull}>versão completa</b>.
        </div>
      </div>
    </div>
  );
}
