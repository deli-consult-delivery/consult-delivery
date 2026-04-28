import { useState, useEffect, useRef } from 'react';
import Icon from '../components/Icon.jsx';
import AgentAvatar from '../components/AgentAvatar.jsx';
import { CONVERSATIONS } from '../data.js';
import { supabase } from '../lib/supabase.js';
import { sendTextMessage, getInstanceStatus } from '../lib/evolution.js';

const HAS_EVO = !!(
  import.meta.env.VITE_EVOLUTION_URL && import.meta.env.VITE_EVOLUTION_KEY
);

export default function ChatScreen({ tenant, onNavigate }) {
  const mockConvs = CONVERSATIONS[tenant] || [];

  // Instâncias Evolution API
  const [instances, setInstances]             = useState([]);
  const [selectedInstance, setSelectedInstance] = useState(null);

  // Conversas (real ou mock)
  const [convs, setConvs]               = useState(mockConvs);
  const [usingRealData, setUsingRealData] = useState(false);

  // UI
  const [tab, setTab]           = useState('all');
  const [activeId, setActiveId] = useState(mockConvs[0]?.id);
  const [search, setSearch]     = useState('');
  const [draft, setDraft]       = useState('');
  const [messages, setMessages] = useState(() => {
    const m = {};
    mockConvs.forEach(c => { m[c.id] = [...c.messages]; });
    return m;
  });
  const [typing, setTyping]           = useState(false);
  const [showInfo, setShowInfo]       = useState(false);
  const [sending, setSending]         = useState(false);
  const [showEmoji, setShowEmoji]     = useState(false);
  const [members, setMembers]         = useState([]);
  const [showNewInternal, setShowNewInternal] = useState(false);

  const scrollRef   = useRef(null);
  const textareaRef = useRef(null);

  // ── Carregar instâncias ao montar ───────────────────────
  useEffect(() => {
    loadInstances();
    loadMembers();
  }, []);

  async function loadMembers() {
    try {
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, email, avatar_url')
        .order('full_name');
      if (data?.length) setMembers(data);
    } catch { /* ignorar */ }
  }

  function insertEmoji(emoji) {
    const ta = textareaRef.current;
    if (!ta) { setDraft(d => d + emoji); return; }
    const start = ta.selectionStart;
    const end   = ta.selectionEnd;
    const newVal = draft.slice(0, start) + emoji + draft.slice(end);
    setDraft(newVal);
    setTimeout(() => {
      ta.selectionStart = start + emoji.length;
      ta.selectionEnd   = start + emoji.length;
      ta.focus();
    }, 0);
  }

  async function createInternalConv(member) {
    const tempId = 'int-' + member.id;
    const initials = (member.full_name || 'TM').split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
    const conv = {
      id:       tempId,
      name:     member.full_name || member.email || 'Membro',
      avatar:   initials,
      type:     'internal',
      preview:  '',
      time:     '',
      unread:   0,
      online:   false,
      messages: [],
      memberId: member.id,
    };
    setConvs(prev => {
      if (prev.find(c => c.id === tempId)) return prev;
      return [conv, ...prev];
    });
    setMessages(m => ({ ...m, [tempId]: [] }));
    setActiveId(tempId);
    setTab('all');
    setShowNewInternal(false);
  }

  // ── Reset ao trocar de tenant ───────────────────────────
  useEffect(() => {
    const c = CONVERSATIONS[tenant] || [];
    setConvs(c);
    setActiveId(c[0]?.id);
    const m = {};
    c.forEach(cv => { m[cv.id] = [...cv.messages]; });
    setMessages(m);
    setDraft('');
    setShowInfo(false);
    setUsingRealData(false);
    setSelectedInstance(null);
  }, [tenant]);

  // ── Carregar conversas reais quando muda instância ──────
  useEffect(() => {
    if (selectedInstance) {
      loadRealtimeConvs(selectedInstance);
    } else {
      const c = CONVERSATIONS[tenant] || [];
      setConvs(c);
      setUsingRealData(false);
    }
  }, [selectedInstance]);

  // ── Realtime: novas mensagens da conversa ativa ─────────
  useEffect(() => {
    if (!activeId || !usingRealData) return;

    const channel = supabase
      .channel('msgs-' + activeId)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${activeId}` },
        payload => {
          const msg = payload.new;
          if (!msg.content) return;
          const time = new Date(msg.created_at || Date.now())
            .toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
          setMessages(m => ({
            ...m,
            [activeId]: [...(m[activeId] || []), {
              id:   msg.id,
              from: msg.direction === 'outbound' ? 'out' : 'in',
              text: msg.content,
              time,
            }],
          }));
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [activeId, usingRealData]);

  // ── Auto-scroll ─────────────────────────────────────────
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, activeId, typing]);

  // ── Funções de dados ────────────────────────────────────
  async function loadInstances() {
    try {
      const { data } = await supabase
        .from('evolution_instances')
        .select('id, instance_name, status, phone, profile_name')
        .order('created_at');
      if (data && data.length > 0) {
        setInstances(data);
        const connected = data.find(i => i.status === 'connected') || data[0];
        setSelectedInstance(connected.instance_name);
      }
    } catch {
      // Tabela ainda não existe — modo demo
    }
  }

  async function loadRealtimeConvs(instanceName) {
    try {
      const { data: inst } = await supabase
        .from('evolution_instances')
        .select('id')
        .eq('instance_name', instanceName)
        .single();

      if (!inst) {
        const fallback = CONVERSATIONS[tenant] || [];
        setConvs(fallback);
        setUsingRealData(false);
        return;
      }

      const { data: rows } = await supabase
        .from('conversations')
        .select('*')
        .eq('instance_id', inst.id)
        .order('updated_at', { ascending: false })
        .limit(50);

      if (rows && rows.length > 0) {
        const mapped = rows.map(c => {
          const phone = c.whatsapp_chat_id ? c.whatsapp_chat_id.split('@')[0] : '';
          const name  = c.group_name || (phone ? `+${phone}` : 'Desconhecido');
          return {
            id:               c.id,
            name,
            avatar:           name.slice(0, 2).toUpperCase(),
            type:             c.is_group ? 'group' : 'whatsapp',
            whatsapp_chat_id: c.whatsapp_chat_id,
            preview:          '',
            time:             c.updated_at
              ? new Date(c.updated_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
              : '',
            unread:   0,
            online:   false,
            messages: [],
          };
        });
        setConvs(mapped);
        setActiveId(mapped[0]?.id);
        setUsingRealData(true);
        if (mapped[0]) loadMsgs(mapped[0].id);
        return;
      }
    } catch { /* ignore */ }
    const fallback = CONVERSATIONS[tenant] || [];
    setConvs(fallback);
    setUsingRealData(false);
  }

  async function loadMsgs(convId) {
    try {
      const { data } = await supabase
        .from('messages')
        .select('id, direction, content, body, created_at, sender_name')
        .eq('conversation_id', convId)
        .order('created_at')
        .limit(100);

      if (data) {
        setMessages(m => ({
          ...m,
          [convId]: data
            .filter(msg => msg.content || msg.body)
            .map(msg => ({
              id:   msg.id,
              from: msg.direction === 'outbound' ? 'out' : 'in',
              text: msg.content || msg.body || '',
              time: new Date(msg.created_at || Date.now())
                .toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
            })),
        }));
      }
    } catch { /* ignore */ }
  }

  // ── Enviar mensagem ─────────────────────────────────────
  const send = async () => {
    const text = (draft || '').trim();
    if (!text || !active || sending) return;

    const now  = new Date();
    const time = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    setMessages(m => ({
      ...m,
      [active.id]: [...(m[active.id] || []), { id: 'tmp-' + Date.now(), from: 'out', text, time }],
    }));
    setDraft('');

    if (HAS_EVO && selectedInstance && active.whatsapp_chat_id) {
      setSending(true);
      try {
        await sendTextMessage(selectedInstance, active.whatsapp_chat_id, text);
        await supabase.from('messages').insert({
          conversation_id: active.id,
          direction:       'outbound',
          content:         text,
          created_at:      now.toISOString(),
        });
      } catch (err) {
        console.error('Falha ao enviar via Evolution:', err);
      } finally {
        setSending(false);
      }
    } else if (active.type === 'whatsapp' || active.type === 'group') {
      // Simulação local
      setTyping(true);
      setTimeout(() => {
        setTyping(false);
        const replies = [
          'Ok, obrigado pela atenção!',
          'Show, vou aguardar então.',
          'Perfeito, muito obrigado 🙏',
          'Beleza, faz sentido.',
        ];
        const r   = replies[Math.floor(Math.random() * replies.length)];
        const t2  = new Date();
        const tm2 = t2.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        setMessages(m => ({
          ...m,
          [active.id]: [...(m[active.id] || []), { id: 'mock-' + t2.getTime(), from: 'in', text: r, time: tm2 }],
        }));
      }, 2400);
    }
  };

  const onKeyDown = e => {
    if (e.key === 'Tab' && showGhost) {
      e.preventDefault();
      setDraft(suggestion);
    } else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  // ── Derivados ───────────────────────────────────────────
  const active     = convs.find(c => c.id === activeId) || convs[0];
  const activeMsgs = messages[activeId] || [];
  const suggestion = active?.deliSuggestion;
  const showGhost  = !draft && suggestion;

  const filtered = convs.filter(c => {
    if (tab === 'wa'     && c.type !== 'whatsapp') return false;
    if (tab === 'groups' && c.type !== 'group')    return false;
    if (tab === 'int'    && !(c.type === 'internal' || c.type === 'agent')) return false;
    if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const unreadCount = convs.reduce((s, c) => s + (c.unread || 0), 0);

  if (!active) {
    return <div style={{ padding: 40, color: 'var(--g-500)', fontSize: 14 }}>Nenhuma conversa</div>;
  }

  return (
    <div className="route-enter" style={{
      display: 'grid',
      gridTemplateColumns: showInfo
        ? 'minmax(220px, 270px) minmax(0, 1fr) 300px'
        : 'minmax(220px, 270px) minmax(0, 1fr)',
      height: 'calc(100vh - 64px)',
      background: 'var(--g-50)',
      overflow: 'hidden',
    }}>

      {/* ── Col 1: Sidebar conversas ───────────────────── */}
      <div style={{
        background: 'white', borderRight: '1px solid var(--g-200)',
        display: 'flex', flexDirection: 'column', minWidth: 0,
      }}>
        <div style={{ padding: '20px 20px 12px' }}>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <h2 className="section-h2" style={{ fontSize: 18 }}>Conversas</h2>
            {unreadCount > 0 && <span className="badge badge-red">{unreadCount} novas</span>}
          </div>

          {/* Seletor de instância */}
          {instances.length > 0 && (
            <select
              value={selectedInstance || ''}
              onChange={e => setSelectedInstance(e.target.value || null)}
              className="input"
              style={{ fontSize: 12, padding: '6px 10px', marginBottom: 10 }}
            >
              <option value="">— Modo demonstração —</option>
              {instances.map(inst => (
                <option key={inst.id} value={inst.instance_name}>
                  {inst.status === 'connected' ? '🟢' : '🔴'} {inst.instance_name}
                  {inst.phone ? ` · ${inst.phone}` : ''}
                </option>
              ))}
            </select>
          )}

          {/* Banner: WhatsApp conectado */}
          {usingRealData && (
            <div style={{
              marginBottom: 10, padding: '6px 10px', borderRadius: 'var(--r-sm)',
              background: 'rgba(37,211,102,0.10)', border: '1px solid rgba(37,211,102,0.28)',
              fontSize: 11, color: '#1a9e50', display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <span style={{ width: 7, height: 7, background: '#25D366', borderRadius: '50%' }} />
              WhatsApp conectado — dados em tempo real
            </div>
          )}

          {/* Busca */}
          <div style={{ position: 'relative', marginBottom: 10 }}>
            <Icon name="search" size={14} style={{ position: 'absolute', top: 11, left: 12, color: 'var(--g-400)' }} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="input"
              placeholder="Buscar conversa…"
              style={{ paddingLeft: 34, background: 'var(--g-50)', borderColor: 'transparent', fontSize: 13 }}
            />
          </div>

          {/* Tabs filtro */}
          <div style={{ display: 'flex', gap: 3, padding: 3, background: 'var(--g-100)', borderRadius: 6 }}>
            {[
              { id: 'wa',     label: 'WhatsApp' },
              { id: 'groups', label: 'Grupos'   },
              { id: 'int',    label: 'Interno'  },
              { id: 'all',    label: 'Todas'    },
            ].map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                style={{
                  flex: 1, padding: '5px 2px', fontSize: 10.5, fontWeight: 600,
                  borderRadius: 4,
                  background: tab === t.id ? 'white' : 'transparent',
                  color:      tab === t.id ? 'var(--g-900)' : 'var(--g-600)',
                  boxShadow:  tab === t.id ? 'var(--sh-card)' : 'none',
                }}
              >{t.label}</button>
            ))}
          </div>
        </div>

        {/* Botão nova conversa interna */}
        {tab === 'int' && (
          <div style={{ padding: '8px 16px 0' }}>
            <button
              className="btn-secondary"
              style={{ width: '100%', justifyContent: 'center', fontSize: 12 }}
              onClick={() => setShowNewInternal(true)}
            >
              <Icon name="plus" size={13} /> Nova conversa interna
            </button>
          </div>
        )}

        {/* Lista de conversas */}
        <div className="scroll" style={{ flex: 1, overflowY: 'auto', paddingBottom: 16 }}>
          {filtered.map(c => (
            <ConvItem
              key={c.id}
              conv={c}
              active={c.id === activeId}
              onClick={() => {
                setActiveId(c.id);
                if (usingRealData && !messages[c.id]?.length) loadMsgs(c.id);
              }}
            />
          ))}
          {filtered.length === 0 && (
            <div style={{ textAlign: 'center', padding: 32, color: 'var(--g-400)', fontSize: 13 }}>
              {tab === 'int' ? 'Nenhuma conversa interna. Crie uma acima.' : 'Nenhuma conversa encontrada'}
            </div>
          )}
        </div>
      </div>

      {/* ── Col 2: Chat aberto ─────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, background: 'var(--g-50)' }}>

        {/* Header do chat */}
        <div style={{
          padding: '14px 20px', background: 'white', borderBottom: '1px solid var(--g-200)',
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <ConvAvatar conv={active} size={40} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--g-900)' }}>{active.name}</div>
            <div style={{ fontSize: 12, color: 'var(--g-500)', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              {active.online
                ? <><span style={{ width: 7, height: 7, background: 'var(--success)', borderRadius: '50%' }} />online agora</>
                : <>visto há 1h</>}
              {active.type === 'whatsapp' && (
                <><span>·</span><Icon name="whatsapp" size={12} style={{ color: '#25D366' }} />WhatsApp</>
              )}
              {active.type === 'group' && (
                <><span>·</span><Icon name="users" size={12} />Grupo WhatsApp</>
              )}
              {active.type === 'internal' && <><span>·</span>Interno</>}
              {active.type === 'agent'    && <><span>·</span>Agente IA</>}
              {active.whatsapp_chat_id && (
                <><span>·</span>
                <code style={{ fontSize: 10, background: 'var(--g-100)', padding: '1px 5px', borderRadius: 3 }}>
                  {active.whatsapp_chat_id.split('@')[0]}
                </code></>
              )}
            </div>
          </div>
          <button className="btn-icon" title="Ligar"><Icon name="phone" size={16} /></button>
          <button
            className="btn-icon"
            onClick={() => setShowInfo(v => !v)}
            style={{
              background: showInfo ? 'var(--red-soft)' : 'transparent',
              color:      showInfo ? 'var(--red)' : 'var(--g-600)',
            }}
            title="Informações do contato"
          >
            <Icon name="info" size={16} />
          </button>
        </div>

        {/* Mensagens */}
        <div ref={scrollRef} className="scroll" style={{
          flex: 1, overflowY: 'auto', padding: '24px 32px',
          display: 'flex', flexDirection: 'column', gap: 10,
        }}>
          {activeMsgs.map((msg, i) => (
            <div
              key={msg.id || i}
              style={{ display: 'flex', flexDirection: 'column', alignItems: msg.from === 'out' ? 'flex-end' : 'flex-start' }}
              className="slide-up"
            >
              <div className={`bubble ${msg.from === 'out' ? 'bubble-out' : 'bubble-in'}`}>
                {msg.text}
              </div>
              <div className="bubble-meta" style={{ color: 'var(--g-500)' }}>{msg.time}</div>
            </div>
          ))}

          {typing && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingLeft: 6 }} className="fade-in">
              <div className="bubble bubble-in" style={{ padding: '10px 14px', display: 'inline-flex', gap: 4 }}>
                <span style={{ width: 6, height: 6, background: 'var(--g-500)', borderRadius: '50%', animation: 'typing 1.2s infinite 0s' }} />
                <span style={{ width: 6, height: 6, background: 'var(--g-500)', borderRadius: '50%', animation: 'typing 1.2s infinite 0.2s' }} />
                <span style={{ width: 6, height: 6, background: 'var(--g-500)', borderRadius: '50%', animation: 'typing 1.2s infinite 0.4s' }} />
              </div>
            </div>
          )}
        </div>

        {/* Área de input */}
        <div style={{ padding: '12px 20px 20px', background: 'white', borderTop: '1px solid var(--g-200)' }}>
          {suggestion && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10,
              padding: '8px 12px',
              background: 'linear-gradient(to right, rgba(183,12,0,0.06), rgba(183,12,0,0.01))',
              border: '1px solid rgba(183,12,0,0.2)',
              borderRadius: 6, fontSize: 12,
            }}>
              <AgentAvatar id="deli" size={22} />
              <span style={{ color: 'var(--g-700)' }}>
                <strong style={{ color: 'var(--red)' }}>DELI sugeriu</strong> uma resposta baseada no histórico
              </span>
              <span className="copilot-hint" style={{ marginLeft: 'auto' }}>
                Pressione <kbd>Tab</kbd> pra aceitar
              </span>
            </div>
          )}

          <div className="copilot-wrap">
            <textarea
              ref={textareaRef}
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={onKeyDown}
              className="copilot-textarea"
              placeholder="Escreva uma mensagem… (Shift+Enter = nova linha)"
              rows={2}
            />
            {showGhost && <div className="copilot-ghost">{suggestion}</div>}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px 10px' }}>
              <div style={{ display: 'flex', gap: 2, position: 'relative' }}>
                <button
                  className="btn-icon"
                  style={{ width: 30, height: 30 }}
                  title="Anexar arquivo"
                  onClick={() => document.getElementById('chat-file-input').click()}
                >
                  <Icon name="paperclip" size={15} />
                </button>
                <input
                  id="chat-file-input"
                  type="file"
                  style={{ display: 'none' }}
                  accept="image/*,video/*,.pdf,.doc,.docx"
                  onChange={e => {
                    const file = e.target.files[0];
                    if (file) setDraft(d => d ? `${d} [${file.name}]` : `[${file.name}]`);
                    e.target.value = '';
                  }}
                />
                <button
                  className="btn-icon"
                  style={{ width: 30, height: 30, background: showEmoji ? 'var(--g-100)' : 'transparent' }}
                  title="Emoji"
                  onClick={() => setShowEmoji(v => !v)}
                >
                  <Icon name="smile" size={15} />
                </button>
                {showEmoji && (
                  <EmojiPicker
                    onSelect={insertEmoji}
                    onClose={() => setShowEmoji(false)}
                  />
                )}
                <button
                  className="btn-icon"
                  style={{ width: 30, height: 30, color: 'var(--red)' }}
                  title="Sugerir resposta com DELI"
                >
                  <Icon name="sparkles" size={15} />
                </button>
              </div>
              <button
                onClick={send}
                className="btn-primary"
                style={{ padding: '8px 14px', fontSize: 13, opacity: draft.trim() && !sending ? 1 : 0.5 }}
                disabled={!draft.trim() || sending}
              >
                {sending ? 'Enviando…' : 'Enviar'} <Icon name="send" size={13} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Modal: nova conversa interna ───────────────── */}
      {showNewInternal && (
        <div
          style={{ position: 'absolute', inset: 0, background: 'rgba(13,13,13,0.35)', zIndex: 20, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setShowNewInternal(false)}
        >
          <NewInternalModal
            members={members}
            onSelect={createInternalConv}
            onClose={() => setShowNewInternal(false)}
          />
        </div>
      )}

      {/* ── Col 3: painel de info do contato ───────────── */}
      {showInfo && (
        <div className="slide-right scroll" style={{
          background: 'white', borderLeft: '1px solid var(--g-200)', overflowY: 'auto',
          display: 'flex', flexDirection: 'column',
        }}>
          <div style={{
            padding: '12px 16px', borderBottom: '1px solid var(--g-200)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            flexShrink: 0,
          }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--g-900)' }}>
              {active.type === 'group' ? 'Informações do grupo' : 'Informações do contato'}
            </span>
            <button className="btn-icon" onClick={() => setShowInfo(false)}>
              <Icon name="x" size={16} />
            </button>
          </div>
          <ContactPanel conv={active} onNavigate={onNavigate} />
        </div>
      )}
    </div>
  );
}

/* ── ConvAvatar ──────────────────────────────────────────── */
function ConvAvatar({ conv, size = 36 }) {
  if (conv.type === 'agent') {
    return <AgentAvatar id={conv.name.toLowerCase()} size={size} />;
  }

  const isGroup = conv.type === 'group';

  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: conv.type === 'internal'
        ? 'var(--g-200)'
        : isGroup
        ? '#0559A8'
        : 'var(--g-900)',
      color: conv.type === 'internal' ? 'var(--g-700)' : 'white',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      fontWeight: 700, fontSize: size * 0.36, flexShrink: 0,
      position: 'relative',
    }}>
      {isGroup
        ? <Icon name="users" size={size * 0.42} />
        : conv.avatar}
      {(conv.type === 'whatsapp' || conv.type === 'group') && (
        <span style={{
          position: 'absolute', bottom: -1, right: -1,
          width: size * 0.38, height: size * 0.38, borderRadius: '50%',
          background: '#25D366', border: '2px solid white',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg width={size * 0.22} height={size * 0.22} viewBox="0 0 24 24" fill="white">
            <path d="M12 2a10 10 0 0 0-8.5 15.2L2 22l4.9-1.5A10 10 0 1 0 12 2Z" />
          </svg>
        </span>
      )}
    </div>
  );
}

/* ── ConvItem ─────────────────────────────────────────────── */
function ConvItem({ conv, active, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        padding: '12px 16px',
        cursor: 'pointer',
        display: 'flex', gap: 12, alignItems: 'flex-start',
        background: active ? 'var(--red-soft)' : 'transparent',
        borderLeft: active ? '3px solid var(--red)' : '3px solid transparent',
        transition: 'all 150ms',
      }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--g-50)'; }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}
    >
      <ConvAvatar conv={conv} size={40} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <div style={{ fontSize: 13, fontWeight: active ? 700 : 600, color: 'var(--g-900)' }} className="truncate">
            {conv.name}
          </div>
          <div style={{ fontSize: 10, color: 'var(--g-500)', flexShrink: 0 }}>{conv.time}</div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 }}>
          <div
            style={{
              fontSize: 12,
              color: conv.unread > 0 ? 'var(--g-900)' : 'var(--g-500)',
              fontWeight: conv.unread > 0 ? 600 : 400,
            }}
            className="truncate"
          >
            {conv.preview}
          </div>
          {conv.unread > 0 && (
            <span style={{
              background: 'var(--red)', color: 'white',
              fontSize: 10, fontWeight: 700,
              padding: '1px 6px', borderRadius: 9999, minWidth: 18, textAlign: 'center',
              flexShrink: 0, marginLeft: 6,
            }}>
              {conv.unread}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── ContactPanel ─────────────────────────────────────────── */
function ContactPanel({ conv, onNavigate }) {
  const isGroup = conv.type === 'group';
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName]   = useState(conv.name);
  const phone = conv.whatsapp_chat_id
    ? `+${conv.whatsapp_chat_id.split('@')[0]}`
    : conv.phone || '';
  const [editPhone, setEditPhone] = useState(phone);
  const [editNote, setEditNote]   = useState(
    conv.type === 'whatsapp' ? 'Cliente sensível a atrasos — oferecer sempre alguma cortesia.' : ''
  );

  return (
    <div style={{ padding: 24 }}>
      {/* Avatar e info */}
      <div style={{ textAlign: 'center', paddingBottom: 20, borderBottom: '1px solid var(--g-200)' }}>
        <div style={{ display: 'inline-block' }}>
          <ConvAvatar conv={conv} size={80} />
        </div>

        {isEditing ? (
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input
              className="input"
              style={{ fontSize: 13, textAlign: 'center' }}
              value={editName}
              onChange={e => setEditName(e.target.value)}
              placeholder="Nome"
            />
            <input
              className="input"
              style={{ fontSize: 13, textAlign: 'center' }}
              value={editPhone}
              onChange={e => setEditPhone(e.target.value)}
              placeholder="Telefone"
            />
            <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginTop: 4 }}>
              <button
                className="btn-primary"
                style={{ padding: '6px 12px', fontSize: 12 }}
                onClick={() => setIsEditing(false)}
              >
                Salvar
              </button>
              <button
                className="btn-secondary"
                style={{ padding: '6px 12px', fontSize: 12 }}
                onClick={() => setIsEditing(false)}
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--g-900)', marginTop: 12 }}>{editName}</div>
            <div style={{ fontSize: 12, color: 'var(--g-500)', marginTop: 4 }}>
              {isGroup ? 'Grupo WhatsApp' : editPhone || conv.role || conv.type}
            </div>
            {conv.tags && (
              <div style={{ display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap', marginTop: 12 }}>
                {conv.tags.map(t => (
                  <span key={t} className={`badge ${t === 'VIP' ? 'badge-red' : 'badge-gray'}`}>{t}</span>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 16, flexWrap: 'wrap' }}>
              {!isGroup && (
                <button className="btn-secondary" style={{ padding: '6px 12px', fontSize: 12 }}>
                  <Icon name="phone" size={12} /> Ligar
                </button>
              )}
              {!isGroup && onNavigate && (
                <button
                  className="btn-primary"
                  style={{ padding: '6px 12px', fontSize: 12 }}
                  onClick={() => onNavigate('crm')}
                >
                  Ver no CRM
                </button>
              )}
              <button
                className="btn-secondary"
                style={{ padding: '6px 12px', fontSize: 12 }}
                onClick={() => setIsEditing(true)}
                title="Editar contato"
              >
                <Icon name="edit" size={12} /> Editar
              </button>
            </div>
          </>
        )}
      </div>

      {/* Últimos pedidos */}
      {conv.orders && (
        <div style={{ marginTop: 20 }}>
          <div className="label" style={{ marginBottom: 10 }}>Últimos pedidos</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {conv.orders.map((o, i) => (
              <div key={i} style={{ padding: 10, background: 'var(--g-50)', borderRadius: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--g-900)' }}>{o.date}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--red)' }}>{o.total}</span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--g-500)', marginTop: 2 }}>{o.items}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Notas internas */}
      <div style={{ marginTop: 20 }}>
        <div className="label" style={{ marginBottom: 10 }}>Notas internas</div>
        <textarea
          className="input"
          placeholder="Adicione uma nota…"
          style={{ minHeight: 80, resize: 'vertical', fontSize: 12 }}
          value={editNote}
          onChange={e => setEditNote(e.target.value)}
        />
      </div>

      {/* Análise DELI */}
      {(conv.type === 'whatsapp' || conv.type === 'group') && (
        <div style={{
          marginTop: 20, padding: 14,
          background: 'linear-gradient(135deg, rgba(183,12,0,0.05), rgba(183,12,0,0.01))',
          border: '1px solid rgba(183,12,0,0.15)', borderRadius: 8,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <Icon name="sparkles" size={14} style={{ color: 'var(--red)' }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--red)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Análise DELI
            </span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--g-700)', lineHeight: 1.5 }}>
            {isGroup
              ? <>Grupo ativo com membros recorrentes. Nível de engajamento: <strong style={{ color: 'var(--success)' }}>bom</strong>.</>
              : <>Cliente <strong>frustrado</strong> por atraso repetido. Sentimento: <strong style={{ color: 'var(--warn)' }}>negativo</strong>.{' '}
                Risco de churn: <strong style={{ color: 'var(--red)' }}>alto</strong>. Recomendo reembolso parcial + cortesia dupla.</>}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── EmojiPicker ──────────────────────────────────────────── */
const EMOJIS = [
  '😀','😂','😊','😍','🤔','😅','😎','😢','😡','🥳',
  '👍','👎','👋','🙌','🤝','❤️','🔥','✅','⭐','🎉',
  '🍕','🚀','💪','🎯','💬','🌟','⚡','💡','🎊','🏆',
  '😆','🤣','😇','🤩','😏','😬','🙄','😴','🤗','😤',
  '👀','💯','🙏','✨','🎶','📱','💰','🏅','🎁','🌹',
];

function EmojiPicker({ onSelect, onClose }) {
  const ref = useRef(null);

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose]);

  return (
    <div
      ref={ref}
      style={{
        position: 'absolute', bottom: 'calc(100% + 4px)', left: 0,
        background: 'white', border: '1px solid var(--g-200)',
        borderRadius: 10, padding: 10, zIndex: 50,
        display: 'grid', gridTemplateColumns: 'repeat(10, 30px)',
        gap: 2, boxShadow: '0 8px 24px rgba(0,0,0,0.14)',
      }}
    >
      {EMOJIS.map(e => (
        <button
          key={e}
          onClick={() => { onSelect(e); onClose(); }}
          style={{
            fontSize: 18, background: 'transparent', borderRadius: 4,
            width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', transition: 'background 100ms',
          }}
          onMouseEnter={ev => ev.currentTarget.style.background = 'var(--g-100)'}
          onMouseLeave={ev => ev.currentTarget.style.background = 'transparent'}
        >
          {e}
        </button>
      ))}
    </div>
  );
}

/* ── NewInternalModal ─────────────────────────────────────── */
function NewInternalModal({ members, onSelect, onClose }) {
  const [search, setSearch] = useState('');
  const filtered = members.filter(m =>
    !search || (m.full_name || m.email || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div
      onClick={e => e.stopPropagation()}
      style={{
        background: 'white', borderRadius: 12, width: 340,
        boxShadow: '0 16px 40px rgba(0,0,0,0.18)',
        display: 'flex', flexDirection: 'column', maxHeight: 440,
      }}
    >
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--g-200)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--g-900)' }}>Nova conversa interna</span>
        <button className="btn-icon" onClick={onClose}><Icon name="x" size={15} /></button>
      </div>
      <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--g-100)' }}>
        <div style={{ position: 'relative' }}>
          <Icon name="search" size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--g-400)', pointerEvents: 'none' }} />
          <input
            className="input"
            style={{ paddingLeft: 32, fontSize: 13 }}
            placeholder="Buscar membro..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            autoFocus
          />
        </div>
      </div>
      <div className="scroll" style={{ flex: 1, overflowY: 'auto' }}>
        {filtered.length === 0 && (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--g-400)', fontSize: 13 }}>
            {members.length === 0 ? 'Nenhum membro encontrado no banco.' : 'Nenhum resultado.'}
          </div>
        )}
        {filtered.map(m => {
          const initials = (m.full_name || 'TM').split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
          return (
            <div
              key={m.id}
              onClick={() => onSelect(m)}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '10px 20px', cursor: 'pointer', transition: 'background 150ms',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--g-50)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <div style={{
                width: 36, height: 36, borderRadius: '50%', background: 'var(--g-200)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 700, fontSize: 13, color: 'var(--g-700)', flexShrink: 0,
              }}>
                {initials}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--g-900)' }}>{m.full_name || 'Sem nome'}</div>
                <div style={{ fontSize: 11, color: 'var(--g-500)' }}>{m.email}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
