import { useState, useEffect, useRef } from 'react';
import Icon from '../components/Icon.jsx';
import AgentAvatar from '../components/AgentAvatar.jsx';
import UserAvatar from '../components/UserAvatar.jsx';
import { CONVERSATIONS } from '../data.js';

export default function ChatScreen({ tenant }) {
  const allConvs = CONVERSATIONS[tenant] || [];

  const [tab, setTab] = useState('all');
  const [activeId, setActiveId] = useState(allConvs[0]?.id);
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState(() => {
    const m = {};
    allConvs.forEach(c => { m[c.id] = [...c.messages]; });
    return m;
  });
  const [typing, setTyping] = useState(false);
  const [showInfo, setShowInfo] = useState(false);

  useEffect(() => {
    const convs = CONVERSATIONS[tenant] || [];
    const first = convs[0];
    setActiveId(first?.id);
    const m = {};
    convs.forEach(c => { m[c.id] = [...c.messages]; });
    setMessages(m);
    setDraft('');
    setShowInfo(false);
  }, [tenant]);

  const filtered = allConvs.filter(c => {
    if (tab === 'wa' && c.type !== 'whatsapp') return false;
    if (tab === 'int' && !(c.type === 'internal' || c.type === 'agent')) return false;
    if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const active = allConvs.find(c => c.id === activeId) || allConvs[0];
  const activeMsgs = messages[activeId] || [];
  const suggestion = active?.deliSuggestion;
  const showGhost = !draft && suggestion;

  const onKeyDown = (e) => {
    if (e.key === 'Tab' && showGhost) {
      e.preventDefault();
      setDraft(suggestion);
    } else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const send = () => {
    const text = (draft || '').trim();
    if (!text || !active) return;
    const now = new Date();
    const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    setMessages(m => ({
      ...m,
      [active.id]: [...(m[active.id] || []), { from: 'out', text, time }],
    }));
    setDraft('');
    if (active.type === 'whatsapp') {
      setTyping(true);
      setTimeout(() => {
        setTyping(false);
        const replies = [
          'Ok, obrigado pela atenção!',
          'Show, vou aguardar então.',
          'Perfeito, muito obrigado 🙏',
          'Beleza, faz sentido.',
        ];
        const r = replies[Math.floor(Math.random() * replies.length)];
        const t2 = new Date();
        const time2 = `${String(t2.getHours()).padStart(2, '0')}:${String(t2.getMinutes()).padStart(2, '0')}`;
        setMessages(m => ({
          ...m,
          [active.id]: [...(m[active.id] || []), { from: 'in', text: r, time: time2 }],
        }));
      }, 2400);
    }
  };

  const scrollRef = useRef(null);
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [activeMsgs.length, activeId, typing]);

  const unreadCount = allConvs.reduce((s, c) => s + (c.unread || 0), 0);

  if (!active) {
    return <div style={{ padding: 40 }}>Nenhuma conversa</div>;
  }

  return (
    <div className="route-enter" style={{
      display: 'grid',
      gridTemplateColumns: 'minmax(220px, 260px) minmax(0, 1fr)',
      height: 'calc(100vh - 64px)',
      background: 'var(--g-50)',
      overflow: 'hidden',
      position: 'relative',
    }}>
      {/* COL 1 — Conversations */}
      <div style={{ background: 'white', borderRight: '1px solid var(--g-200)', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <div style={{ padding: '20px 20px 12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <h2 className="section-h2" style={{ fontSize: 18 }}>Conversas</h2>
            <span className="badge badge-red">{unreadCount} novas</span>
          </div>
          <div style={{ position: 'relative' }}>
            <Icon name="search" size={14} style={{ position: 'absolute', top: 11, left: 12, color: 'var(--g-400)' }} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="input"
              placeholder="Buscar conversa…"
              style={{ paddingLeft: 34, background: 'var(--g-50)', borderColor: 'transparent', fontSize: 13 }}
            />
          </div>
          <div style={{ display: 'flex', gap: 4, marginTop: 12, padding: 3, background: 'var(--g-100)', borderRadius: 6 }}>
            {[
              { id: 'wa', label: 'WhatsApp' },
              { id: 'int', label: 'Interno' },
              { id: 'all', label: 'Todas' },
            ].map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                style={{
                  flex: 1, padding: '6px 8px', fontSize: 12, fontWeight: 600,
                  borderRadius: 4,
                  background: tab === t.id ? 'white' : 'transparent',
                  color: tab === t.id ? 'var(--g-900)' : 'var(--g-600)',
                  boxShadow: tab === t.id ? 'var(--sh-card)' : 'none',
                }}
              >{t.label}</button>
            ))}
          </div>
        </div>

        <div className="scroll" style={{ flex: 1, overflowY: 'auto', paddingBottom: 16 }}>
          {filtered.map(c => (
            <ConvItem key={c.id} conv={c} active={c.id === activeId} onClick={() => setActiveId(c.id)} />
          ))}
          {filtered.length === 0 && (
            <div style={{ textAlign: 'center', padding: 32, color: 'var(--g-400)', fontSize: 13 }}>
              Nenhuma conversa encontrada
            </div>
          )}
        </div>
      </div>

      {/* COL 2 — Open chat */}
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, background: 'var(--g-50)' }}>
        {/* Chat header */}
        <div style={{
          padding: '14px 20px', background: 'white', borderBottom: '1px solid var(--g-200)',
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <ConvAvatar conv={active} size={40} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--g-900)' }}>{active.name}</div>
            <div style={{ fontSize: 12, color: 'var(--g-500)', display: 'flex', alignItems: 'center', gap: 6 }}>
              {active.online ? (
                <><span style={{ width: 7, height: 7, background: 'var(--success)', borderRadius: '50%' }} /> online agora</>
              ) : <>visto há 1h</>}
              {active.type === 'whatsapp' && <><span>·</span> <Icon name="whatsapp" size={12} style={{ color: '#25D366' }} /> WhatsApp</>}
              {active.type === 'internal' && <><span>·</span> Interno</>}
              {active.type === 'agent' && <><span>·</span> Agente IA</>}
            </div>
          </div>
          <button className="btn-icon"><Icon name="phone" size={16} /></button>
          <button
            className="btn-icon"
            onClick={() => setShowInfo(v => !v)}
            style={{ background: showInfo ? 'var(--red-soft)' : 'transparent', color: showInfo ? 'var(--red)' : 'var(--g-600)' }}
          >
            <Icon name="info" size={16} />
          </button>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="scroll" style={{
          flex: 1, overflowY: 'auto', padding: '24px 32px',
          display: 'flex', flexDirection: 'column', gap: 10,
        }}>
          {activeMsgs.map((m, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: m.from === 'out' ? 'flex-end' : 'flex-start' }} className="slide-up">
              <div className={`bubble ${m.from === 'out' ? 'bubble-out' : 'bubble-in'}`}>
                {m.text}
              </div>
              <div className="bubble-meta" style={{ color: 'var(--g-500)' }}>{m.time}</div>
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

        {/* Input w/ Copilot */}
        <div style={{ padding: '12px 20px 20px', background: 'white', borderTop: '1px solid var(--g-200)' }}>
          {suggestion && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10,
              padding: '8px 12px',
              background: 'linear-gradient(to right, rgba(183,12,0,0.06), rgba(183,12,0,0.01))',
              border: '1px solid rgba(183,12,0,0.2)',
              borderRadius: 6,
              fontSize: 12,
            }}>
              <AgentAvatar id="deli" size={22} />
              <span style={{ color: 'var(--g-700)' }}>
                <strong style={{ color: 'var(--red)' }}>DELI sugeriu</strong> uma resposta baseada no histórico do Carlos
              </span>
              <span className="copilot-hint" style={{ marginLeft: 'auto' }}>Pressione <kbd>Tab</kbd> pra aceitar</span>
            </div>
          )}
          <div className="copilot-wrap">
            <textarea
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={onKeyDown}
              className="copilot-textarea"
              placeholder="Escreva uma mensagem… (Shift+Enter = nova linha)"
              rows={2}
            />
            {showGhost && (
              <div className="copilot-ghost">{suggestion}</div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px 10px' }}>
              <div style={{ display: 'flex', gap: 2 }}>
                <button className="btn-icon" style={{ width: 30, height: 30 }}><Icon name="paperclip" size={15} /></button>
                <button className="btn-icon" style={{ width: 30, height: 30 }}><Icon name="smile" size={15} /></button>
                <button className="btn-icon" style={{ width: 30, height: 30, color: 'var(--red)' }} title="Sugerir com DELI"><Icon name="sparkles" size={15} /></button>
              </div>
              <button
                onClick={send}
                className="btn-primary"
                style={{ padding: '8px 14px', fontSize: 13, opacity: draft.trim() ? 1 : 0.5 }}
                disabled={!draft.trim()}
              >
                Enviar <Icon name="send" size={13} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Contact info drawer */}
      {showInfo && (
        <>
          <div
            onClick={() => setShowInfo(false)}
            style={{ position: 'absolute', inset: 0, background: 'rgba(13,13,13,0.25)', zIndex: 10, animation: 'fadeIn 180ms ease' }}
          />
          <div className="slide-right scroll" style={{
            position: 'absolute', top: 0, right: 0, bottom: 0, width: 300, maxWidth: '90%',
            background: 'white', borderLeft: '1px solid var(--g-200)', overflowY: 'auto',
            zIndex: 11, boxShadow: '-8px 0 24px rgba(0,0,0,0.08)',
          }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--g-200)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--g-900)' }}>Informações do contato</span>
              <button className="btn-icon" onClick={() => setShowInfo(false)}><Icon name="x" size={16} /></button>
            </div>
            <ContactPanel conv={active} />
          </div>
        </>
      )}
    </div>
  );
}

function ConvAvatar({ conv, size = 36 }) {
  if (conv.type === 'agent') {
    return <AgentAvatar id={conv.name.toLowerCase()} size={size} />;
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: conv.type === 'internal' ? 'var(--g-200)' : 'var(--g-900)',
      color: conv.type === 'internal' ? 'var(--g-700)' : 'white',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      fontWeight: 700, fontSize: size * 0.36, flexShrink: 0,
      position: 'relative',
    }}>
      {conv.avatar}
      {conv.type === 'whatsapp' && (
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
      onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = 'var(--g-50)'; }}
      onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent'; }}
    >
      <ConvAvatar conv={conv} size={40} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <div style={{ fontSize: 13, fontWeight: active ? 700 : 600, color: 'var(--g-900)' }} className="truncate">{conv.name}</div>
          <div style={{ fontSize: 10, color: 'var(--g-500)', flexShrink: 0 }}>{conv.time}</div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 }}>
          <div style={{ fontSize: 12, color: conv.unread > 0 ? 'var(--g-900)' : 'var(--g-500)', fontWeight: conv.unread > 0 ? 600 : 400 }} className="truncate">{conv.preview}</div>
          {conv.unread > 0 && (
            <span style={{
              background: 'var(--red)', color: 'white',
              fontSize: 10, fontWeight: 700,
              padding: '1px 6px', borderRadius: 9999, minWidth: 18, textAlign: 'center',
              flexShrink: 0, marginLeft: 6,
            }}>{conv.unread}</span>
          )}
        </div>
      </div>
    </div>
  );
}

function ContactPanel({ conv }) {
  return (
    <div style={{ padding: 24 }}>
      <div style={{ textAlign: 'center', paddingBottom: 20, borderBottom: '1px solid var(--g-200)' }}>
        <div style={{ display: 'inline-block' }}>
          <ConvAvatar conv={conv} size={80} />
        </div>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--g-900)', marginTop: 12 }}>{conv.name}</div>
        <div style={{ fontSize: 12, color: 'var(--g-500)', marginTop: 4 }}>
          {conv.type === 'whatsapp' ? '+55 11 98765-4321' : conv.role || conv.type}
        </div>
        {conv.tags && (
          <div style={{ display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap', marginTop: 12 }}>
            {conv.tags.map(t => (
              <span key={t} className={`badge ${t === 'VIP' ? 'badge-red' : 'badge-gray'}`}>{t}</span>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 16 }}>
          <button className="btn-secondary" style={{ padding: '6px 12px', fontSize: 12 }}><Icon name="phone" size={12} /> Ligar</button>
          <button className="btn-primary" style={{ padding: '6px 12px', fontSize: 12 }}>Ver no CRM</button>
        </div>
      </div>

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

      <div style={{ marginTop: 20 }}>
        <div className="label" style={{ marginBottom: 10 }}>Notas internas</div>
        <textarea
          className="input"
          placeholder="Adicione uma nota…"
          style={{ minHeight: 80, resize: 'vertical', fontSize: 12 }}
          defaultValue={conv.type === 'whatsapp' ? 'Cliente sensível a atrasos — oferecer sempre alguma cortesia.' : ''}
        />
      </div>

      {conv.type === 'whatsapp' && (
        <div style={{ marginTop: 20, padding: 14, background: 'linear-gradient(135deg, rgba(183,12,0,0.05), rgba(183,12,0,0.01))', border: '1px solid rgba(183,12,0,0.15)', borderRadius: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <Icon name="sparkles" size={14} style={{ color: 'var(--red)' }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--red)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Análise DELI</span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--g-700)', lineHeight: 1.5 }}>
            Cliente <strong>frustrado</strong> por atraso repetido. Sentimento: <strong style={{ color: 'var(--warn)' }}>negativo</strong>.
            Risco de churn: <strong style={{ color: 'var(--red)' }}>alto</strong>. Recomendo reembolso parcial + cortesia dupla.
          </div>
        </div>
      )}
    </div>
  );
}
