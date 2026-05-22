// CSS inline porque projeto usa CSS variables (var(--red), etc),
// não Tailwind. Padrão identificado em LojaWorkspace.jsx.

import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../../lib/supabase.js';
import Icon from '../../components/Icon.jsx';

// ── Constantes ────────────────────────────────────────────────────────────────

const BRIDGE = import.meta.env.VITE_BRIDGE_URL || 'https://bridge.consultdelivery.com.br';

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatRelTime(isoStr) {
  if (!isoStr) return '';
  const diff = Date.now() - new Date(isoStr).getTime();
  const min  = Math.floor(diff / 60000);
  if (min < 1)   return 'agora';
  if (min < 60)  return `${min}min`;
  const h = Math.floor(min / 60);
  if (h < 24)    return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

// Parser inline reutilizado do ChatScreen.jsx (sem dependência nova)
const WA_REGEX = /(\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~|`[^`\n]+`|https?:\/\/[^\s<>"')\]]+|www\.[^\s<>"')\]]+)/g;

function formatWhatsApp(text) {
  if (!text) return null;
  const lines  = text.split('\n');
  const result = [];
  lines.forEach((line, lineIdx) => {
    if (lineIdx > 0) result.push(<br key={`br-${lineIdx}`} />);
    if (!line) return;
    let last = 0;
    let match;
    WA_REGEX.lastIndex = 0;
    while ((match = WA_REGEX.exec(line)) !== null) {
      if (match.index > last) result.push(line.slice(last, match.index));
      const token = match[0];
      const key   = `wa-${lineIdx}-${match.index}`;
      if (token.startsWith('*') && token.endsWith('*')) {
        result.push(<strong key={key} style={{ fontWeight: 700 }}>{token.slice(1, -1)}</strong>);
      } else if (token.startsWith('_') && token.endsWith('_')) {
        result.push(<em key={key}>{token.slice(1, -1)}</em>);
      } else if (token.startsWith('~') && token.endsWith('~')) {
        result.push(<del key={key}>{token.slice(1, -1)}</del>);
      } else if (token.startsWith('`') && token.endsWith('`')) {
        result.push(
          <code key={key} style={{ background: 'rgba(0,0,0,0.08)', borderRadius: 3, padding: '0 4px', fontFamily: 'monospace', fontSize: '0.9em' }}>
            {token.slice(1, -1)}
          </code>
        );
      } else {
        const href = token.startsWith('http') ? token : `https://${token}`;
        result.push(
          <a key={key} href={href} target="_blank" rel="noopener noreferrer"
             style={{ color: 'var(--info)', textDecoration: 'underline', wordBreak: 'break-all' }}>
            {token}
          </a>
        );
      }
      last = match.index + token.length;
    }
    if (last < line.length) result.push(line.slice(last));
  });
  return result.length ? result : null;
}

// ── Bridge helpers ────────────────────────────────────────────────────────────

// Helper padrão: lança erro em qualquer status >= 400
async function bridgeFetch(path, options = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(`${BRIDGE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session?.access_token}`,
      ...options.headers,
    },
  });
  const body = await res.json().catch(() => ({ error: res.statusText }));
  if (res.status >= 400) throw new Error(body.error || res.statusText);
  return body;
}

// Helper especial para POST /messages: retorna { status, body }
// Bridge pode devolver 202 quando task Trigger.dev ainda processa.
async function bridgeFetchRaw(path, options = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(`${BRIDGE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session?.access_token}`,
      ...options.headers,
    },
  });
  const body = await res.json().catch(() => ({ error: res.statusText }));
  if (res.status >= 400) throw new Error(body.error || res.statusText);
  return { status: res.status, body };
}

// ── Sub-componentes ───────────────────────────────────────────────────────────

// FontesBadges — renderiza fontes_consultadas como chips
function FontesBadges({ fontes }) {
  if (!fontes || fontes.length === 0) return null;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
      {fontes.map((f, i) => (
        <span
          key={i}
          title={f.trecho || f.arquivo || ''}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            fontSize: 10, fontWeight: 600, padding: '2px 7px',
            borderRadius: 4, background: 'var(--info-soft)', color: 'var(--info)',
            border: '1px solid rgba(59,130,246,0.2)',
            maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            cursor: f.trecho ? 'help' : 'default',
          }}
        >
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>
          </svg>
          {f.arquivo || f.tipo || `fonte ${i + 1}`}
        </span>
      ))}
    </div>
  );
}

// MessageBubble — bolha de chat
function MessageBubble({ message }) {
  const isUser = message.role === 'user';
  const isOptimistic = message.id === 'temp_user';

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: isUser ? 'flex-end' : 'flex-start',
        marginBottom: 12,
        opacity: isOptimistic ? 0.7 : 1,
      }}
    >
      {!isUser && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <div
            style={{
              width: 20, height: 20, borderRadius: '50%',
              background: 'linear-gradient(135deg, var(--red), #FF4D3D)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, flexShrink: 0,
            }}
            aria-hidden="true"
          >
            AI
          </div>
          <span style={{ fontSize: 11, color: 'var(--g-500)', fontWeight: 600 }}>Loja-GPT</span>
        </div>
      )}

      <div
        style={{
          maxWidth: '82%',
          padding: '9px 13px',
          borderRadius: isUser ? '12px 12px 2px 12px' : '2px 12px 12px 12px',
          background: isUser ? 'rgba(183,12,0,0.12)' : 'var(--white)',
          border: `1px solid ${isUser ? 'rgba(183,12,0,0.25)' : 'var(--g-200)'}`,
          fontSize: 13,
          color: 'var(--g-900)',
          lineHeight: 1.6,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          boxShadow: 'var(--sh-card)',
        }}
      >
        {formatWhatsApp(message.conteudo) || message.conteudo}

        {!isUser && (
          <FontesBadges fontes={message.fontes_consultadas} />
        )}
      </div>

      <span style={{ fontSize: 10, color: 'var(--g-400)', marginTop: 3 }}>
        {message.created_at
          ? new Date(message.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
          : ''}
      </span>
    </div>
  );
}

// TypingIndicator — 3 dots pulsando + texto de espera
function TypingIndicator() {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 12 }}>
      <div
        style={{
          width: 20, height: 20, borderRadius: '50%',
          background: 'linear-gradient(135deg, var(--red), #FF4D3D)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 11, flexShrink: 0,
        }}
        aria-hidden="true"
      >
        AI
      </div>
      <div
        style={{
          background: 'var(--white)', border: '1px solid var(--g-200)',
          borderRadius: '2px 12px 12px 12px', padding: '10px 14px',
          boxShadow: 'var(--sh-card)', display: 'flex', flexDirection: 'column', gap: 4,
        }}
      >
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          {[0, 1, 2].map(i => (
            <span
              key={i}
              style={{
                width: 7, height: 7, borderRadius: '50%',
                background: 'var(--red)', display: 'block',
                animation: `lgpt-bounce 1s ${i * 0.2}s ease-in-out infinite`,
              }}
            />
          ))}
        </div>
        <span style={{ fontSize: 11, color: 'var(--g-500)' }}>
          Aguardando IA... pode levar ate 60s
        </span>
      </div>
    </div>
  );
}

// ChatInput — textarea + botão enviar
function ChatInput({ value, onChange, onSend, disabled }) {
  const ref = useRef(null);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  }

  return (
    <div
      style={{
        padding: '10px 12px 12px',
        borderTop: '1px solid var(--g-200)',
        background: 'var(--white)',
      }}
    >
      <div
        style={{
          display: 'flex', gap: 8, alignItems: 'flex-end',
          background: 'var(--g-50)', border: '1px solid var(--g-300)',
          borderRadius: 10, padding: '8px 10px',
        }}
      >
        <textarea
          ref={ref}
          value={value}
          onChange={e => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Pergunte ao Loja-GPT... (Enter envia, Shift+Enter nova linha)"
          rows={2}
          disabled={disabled}
          aria-label="Pergunta para o Loja-GPT"
          style={{
            flex: 1, background: 'none', border: 'none', outline: 'none',
            color: 'var(--g-900)', fontSize: 13, resize: 'none',
            fontFamily: 'inherit', lineHeight: 1.5,
            maxHeight: 120, overflowY: 'auto',
            cursor: disabled ? 'not-allowed' : 'text',
          }}
        />
        <button
          onClick={onSend}
          disabled={disabled || !value.trim()}
          aria-label="Enviar pergunta"
          style={{
            width: 32, height: 32, borderRadius: 8, flexShrink: 0,
            background: disabled || !value.trim() ? 'var(--g-200)' : 'var(--red)',
            border: 'none', cursor: disabled || !value.trim() ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'background 150ms',
            color: disabled || !value.trim() ? 'var(--g-500)' : '#fff',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="22" y1="2" x2="11" y2="13"/>
            <polygon points="22 2 15 22 11 13 2 9 22 2"/>
          </svg>
        </button>
      </div>
      <div style={{ fontSize: 10, color: 'var(--g-400)', marginTop: 5, textAlign: 'center' }}>
        Enter para enviar · Shift+Enter nova linha
      </div>
    </div>
  );
}

// ConvItem — uma linha de conversation na sidebar
function ConvItem({ conv, isActive, onSelect, onArchive }) {
  return (
    <div
      role="button"
      tabIndex={0}
      aria-selected={isActive}
      aria-label={`Conversa: ${conv.titulo || 'Nova conversa'}`}
      onClick={() => onSelect(conv.id)}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(conv.id); } }}
      style={{
        padding: '10px 12px',
        borderRadius: 8,
        cursor: 'pointer',
        background: isActive ? 'rgba(183,12,0,0.08)' : 'transparent',
        border: isActive ? '1px solid rgba(183,12,0,0.2)' : '1px solid transparent',
        marginBottom: 4,
        transition: 'all 150ms',
        position: 'relative',
      }}
      onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'var(--g-100)'; }}
      onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
    >
      <div
        style={{
          fontSize: 13, fontWeight: isActive ? 600 : 400,
          color: isActive ? 'var(--red)' : 'var(--g-900)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          paddingRight: 24,
        }}
      >
        {conv.titulo || 'Nova conversa'}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
        <span style={{ fontSize: 11, color: 'var(--g-500)' }}>
          {formatRelTime(conv.ultima_message_em)}
        </span>
        {conv.total_messages > 0 && (
          <>
            <span style={{ fontSize: 9, color: 'var(--g-400)' }}>·</span>
            <span style={{ fontSize: 11, color: 'var(--g-500)' }}>
              {conv.total_messages} msg{conv.total_messages !== 1 ? 's' : ''}
            </span>
          </>
        )}
      </div>
      <button
        aria-label="Arquivar conversa"
        onClick={e => { e.stopPropagation(); onArchive(conv.id); }}
        title="Arquivar"
        style={{
          position: 'absolute', top: 10, right: 8,
          background: 'none', border: 'none',
          color: 'var(--g-400)', cursor: 'pointer',
          padding: 2, borderRadius: 4,
          opacity: 0,
          transition: 'opacity 150ms',
          display: 'flex', alignItems: 'center',
        }}
        onMouseEnter={e => e.currentTarget.style.color = 'var(--g-700)'}
        onMouseLeave={e => e.currentTarget.style.color = 'var(--g-400)'}
        onFocus={e => e.currentTarget.style.opacity = '1'}
        onBlur={e => e.currentTarget.style.opacity = '0'}
        ref={el => {
          if (el) {
            const parent = el.closest('[role="button"]');
            if (parent) {
              parent.addEventListener('mouseenter', () => { el.style.opacity = '1'; });
              parent.addEventListener('mouseleave', () => { el.style.opacity = '0'; });
            }
          }
        }}
      >
        <Icon name="x" size={12} />
      </button>
    </div>
  );
}

// ConvSidebar — lista de conversas + botão nova
function ConvSidebar({ conversations, loadingConvs, activeConvId, onSelect, onNew, onArchive, creating }) {
  return (
    <div
      style={{
        width: 220, flexShrink: 0,
        display: 'flex', flexDirection: 'column',
        background: 'var(--g-50)', border: '1px solid var(--g-200)',
        borderRadius: 10, overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div style={{ padding: '12px 12px 8px', borderBottom: '1px solid var(--g-200)' }}>
        <button
          onClick={onNew}
          disabled={creating}
          aria-label="Nova conversa com Loja-GPT"
          style={{
            width: '100%', background: 'var(--red)', color: '#fff',
            border: 'none', borderRadius: 7, padding: '8px 10px',
            fontSize: 12, fontWeight: 600, cursor: creating ? 'not-allowed' : 'pointer',
            opacity: creating ? 0.7 : 1, display: 'flex', alignItems: 'center',
            justifyContent: 'center', gap: 6, transition: 'opacity 150ms',
          }}
        >
          {creating ? (
            'Criando...'
          ) : (
            <>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              Nova conversa
            </>
          )}
        </button>
      </div>

      {/* Lista */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 8 }} className="scroll">
        {loadingConvs && (
          <div style={{ padding: '20px 8px', textAlign: 'center', color: 'var(--g-500)', fontSize: 12 }}>
            Carregando...
          </div>
        )}

        {!loadingConvs && conversations.length === 0 && (
          <div style={{ padding: '24px 8px', textAlign: 'center', color: 'var(--g-400)', fontSize: 12, lineHeight: 1.5 }}>
            Nenhuma conversa ainda.
            <br />Clique em "Nova conversa".
          </div>
        )}

        {!loadingConvs && conversations.map(c => (
          <ConvItem
            key={c.id}
            conv={c}
            isActive={c.id === activeConvId}
            onSelect={onSelect}
            onArchive={onArchive}
          />
        ))}
      </div>
    </div>
  );
}

// ChatArea — mensagens + input
function ChatArea({ messages, loadingMsgs, sending, error, onDismissError, pergunta, setPergunta, onSend, activeConv }) {
  const bottomRef = useRef(null);

  // Auto-scroll sempre que chegam novas mensagens ou entra em sending
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    });
    return () => cancelAnimationFrame(frame);
  }, [messages, sending]);

  return (
    <div
      style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        background: 'var(--white)', border: '1px solid var(--g-200)',
        borderRadius: 10, overflow: 'hidden', minWidth: 0,
      }}
    >
      {/* Header da conversa */}
      <div
        style={{
          padding: '12px 16px', borderBottom: '1px solid var(--g-200)',
          display: 'flex', alignItems: 'center', gap: 10,
          background: 'var(--g-50)',
        }}
      >
        <div
          style={{
            width: 30, height: 30, borderRadius: '50%',
            background: 'linear-gradient(135deg, var(--red), #FF4D3D)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13, color: '#fff', fontWeight: 700, flexShrink: 0,
          }}
          aria-hidden="true"
        >
          AI
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--g-900)' }}>
            {activeConv?.titulo || 'Nova conversa'}
          </div>
          <div style={{ fontSize: 11, color: 'var(--g-500)' }}>Loja-GPT · IA Especialista</div>
        </div>
        {activeConv?.total_messages > 0 && (
          <span
            style={{
              marginLeft: 'auto', fontSize: 11, color: 'var(--g-500)',
              background: 'var(--g-100)', borderRadius: 20, padding: '2px 8px',
              border: '1px solid var(--g-200)',
            }}
          >
            {activeConv.total_messages} msgs
          </span>
        )}
      </div>

      {/* Mensagens */}
      <div
        style={{ flex: 1, overflowY: 'auto', padding: '16px' }}
        className="scroll"
        aria-live="polite"
        aria-label="Mensagens da conversa com Loja-GPT"
      >
        {loadingMsgs && (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--g-500)', fontSize: 13 }}>
            Carregando mensagens...
          </div>
        )}

        {!loadingMsgs && messages.length === 0 && (
          <div
            style={{
              textAlign: 'center', padding: '60px 20px',
              color: 'var(--g-400)', fontSize: 13,
            }}
          >
            <div
              style={{
                width: 64, height: 64, borderRadius: '50%',
                background: 'rgba(183,12,0,0.08)', display: 'flex',
                alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 16px', fontSize: 28,
              }}
              aria-hidden="true"
            >
              AI
            </div>
            <div style={{ fontWeight: 600, color: 'var(--g-600)', marginBottom: 6 }}>
              Loja-GPT pronto para responder
            </div>
            <div style={{ lineHeight: 1.6, maxWidth: 320, margin: '0 auto' }}>
              Faca uma pergunta sobre esta loja. A IA usa contexto real da loja,
              metricas e base de conhecimento iFood.
            </div>
          </div>
        )}

        {!loadingMsgs && messages.map(m => (
          <MessageBubble key={m.id} message={m} />
        ))}

        {sending && <TypingIndicator />}

        <div ref={bottomRef} />
      </div>

      {/* Banner de erro */}
      {error && (
        <div
          role="alert"
          style={{
            margin: '0 16px 8px',
            padding: '10px 14px',
            background: 'rgba(239,68,68,0.08)',
            border: '1px solid rgba(239,68,68,0.25)',
            borderRadius: 8,
            display: 'flex', alignItems: 'flex-start', gap: 10,
          }}
        >
          <svg width="14" height="14" style={{ marginTop: 1, flexShrink: 0, color: '#ef4444' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <span style={{ flex: 1, fontSize: 12, color: '#dc2626', lineHeight: 1.5 }}>{error}</span>
          <button
            onClick={onDismissError}
            aria-label="Fechar aviso de erro"
            style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 0, flexShrink: 0 }}
          >
            <Icon name="x" size={12} />
          </button>
        </div>
      )}

      {/* Input */}
      <ChatInput
        value={pergunta}
        onChange={setPergunta}
        onSend={onSend}
        disabled={sending || loadingMsgs}
      />
    </div>
  );
}

// ── Componente raiz exportado ─────────────────────────────────────────────────

export default function TabIaEspecialista({ lojaId, userId }) {
  const [conversations,  setConversations]  = useState([]);
  const [activeConvId,   setActiveConvId]   = useState(null);
  const [messages,       setMessages]       = useState([]);
  const [loadingConvs,   setLoadingConvs]   = useState(true);
  const [loadingMsgs,    setLoadingMsgs]    = useState(false);
  const [sending,        setSending]        = useState(false);
  const [creating,       setCreating]       = useState(false);
  const [error,          setError]          = useState(null);
  const [pergunta,       setPergunta]       = useState('');

  // ----- Fetch conversations -----

  const loadConversations = useCallback(async () => {
    if (!lojaId) return;
    setLoadingConvs(true);
    try {
      const data = await bridgeFetch(`/api/lojas/${lojaId}/loja-gpt/conversations`);
      setConversations(data.conversations || []);
    } catch (err) {
      setError('Erro ao carregar conversas: ' + err.message);
    } finally {
      setLoadingConvs(false);
    }
  }, [lojaId]);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  // ----- Fetch messages -----

  const loadMessages = useCallback(async (convId) => {
    if (!convId) return;
    setLoadingMsgs(true);
    try {
      const data = await bridgeFetch(`/api/loja-gpt/conversations/${convId}`);
      setMessages(data.messages || []);
    } catch (err) {
      setError('Erro ao carregar mensagens: ' + err.message);
      setMessages([]);
    } finally {
      setLoadingMsgs(false);
    }
  }, []);

  // ----- Selecionar conversa -----

  function selectConversation(convId) {
    setActiveConvId(convId);
    setMessages([]);
    setError(null);
    loadMessages(convId);
  }

  // Seleciona a primeira automaticamente quando carregam as conversations
  useEffect(() => {
    if (!loadingConvs && conversations.length > 0 && !activeConvId) {
      selectConversation(conversations[0].id);
    }
  }, [loadingConvs, conversations]);

  // ----- Nova conversa -----

  async function handleNewConversation() {
    if (creating) return;
    setCreating(true);
    setError(null);
    try {
      const data = await bridgeFetch(`/api/lojas/${lojaId}/loja-gpt/conversations`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      await loadConversations();
      selectConversation(data.id);
    } catch (err) {
      setError('Erro ao criar conversa: ' + err.message);
    } finally {
      setCreating(false);
    }
  }

  // ----- Arquivar conversa -----

  async function handleArchive(convId) {
    setError(null);
    try {
      await bridgeFetch(`/api/loja-gpt/conversations/${convId}`, {
        method: 'PATCH',
        body: JSON.stringify({ arquivada: true }),
      });
      if (convId === activeConvId) {
        setActiveConvId(null);
        setMessages([]);
      }
      await loadConversations();
    } catch (err) {
      setError('Erro ao arquivar conversa: ' + err.message);
    }
  }

  // ----- Enviar mensagem -----

  async function handleSend() {
    const text = pergunta.trim();
    if (!text || sending || !activeConvId) return;

    setSending(true);
    setError(null);
    setPergunta('');

    // Optimistic update: adiciona mensagem do user imediatamente
    const tempMsg = {
      id: 'temp_user',
      role: 'user',
      conteudo: text,
      fontes_consultadas: [],
      created_at: new Date().toISOString(),
    };
    setMessages(prev => [...prev, tempMsg]);

    try {
      const { status } = await bridgeFetchRaw(
        `/api/loja-gpt/conversations/${activeConvId}/messages`,
        {
          method: 'POST',
          body: JSON.stringify({ pergunta: text }),
        }
      );

      if (status === 202) {
        // Task ainda processando. Remove optimistic, pede reload manual.
        setMessages(prev => prev.filter(m => m.id !== 'temp_user'));
        setError('IA ainda processando. Recarregue a conversa em 30s.');
        // TECH DEBT: implementar polling real do run_id (Onda 04+)
      } else {
        // 200 — recarrega mensagens reais (substitui optimistic)
        await loadMessages(activeConvId);
        await loadConversations();
      }
    } catch (err) {
      // Rollback do optimistic update
      setMessages(prev => prev.filter(m => m.id !== 'temp_user'));
      setError('Erro ao enviar: ' + err.message);
      setPergunta(text); // restaura texto para o user poder tentar de novo
    } finally {
      setSending(false);
    }
  }

  // ----- Conversa ativa (objeto completo, para exibir titulo no header) -----

  const activeConv = conversations.find(c => c.id === activeConvId) || null;

  // ----- Guard de auth -----

  if (!lojaId) {
    return (
      <div style={{ padding: 24, textAlign: 'center', color: 'var(--g-500)', fontSize: 13 }}>
        Loja nao identificada.
      </div>
    );
  }

  return (
    <>
      {/* Keyframes para typing indicator — injetados inline uma vez */}
      <style>{`
        @keyframes lgpt-bounce {
          0%, 100% { transform: translateY(0); opacity: 0.5; }
          50%       { transform: translateY(-4px); opacity: 1; }
        }
      `}</style>

      <div
        style={{
          display: 'flex',
          gap: 12,
          height: 560,
          minHeight: 400,
        }}
      >
        <ConvSidebar
          conversations={conversations}
          loadingConvs={loadingConvs}
          activeConvId={activeConvId}
          onSelect={selectConversation}
          onNew={handleNewConversation}
          onArchive={handleArchive}
          creating={creating}
        />

        {activeConvId ? (
          <ChatArea
            messages={messages}
            loadingMsgs={loadingMsgs}
            sending={sending}
            error={error}
            onDismissError={() => setError(null)}
            pergunta={pergunta}
            setPergunta={setPergunta}
            onSend={handleSend}
            activeConv={activeConv}
          />
        ) : (
          <div
            style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'var(--white)', border: '1px solid var(--g-200)',
              borderRadius: 10, color: 'var(--g-400)', fontSize: 13,
              flexDirection: 'column', gap: 8, textAlign: 'center', padding: 32,
            }}
          >
            {loadingConvs ? (
              <span>Carregando...</span>
            ) : (
              <>
                <div style={{ fontSize: 32, marginBottom: 4 }} aria-hidden="true">AI</div>
                <div style={{ fontWeight: 600, color: 'var(--g-600)' }}>Selecione ou crie uma conversa</div>
                <div>para comecar a conversar com o Loja-GPT.</div>
              </>
            )}
          </div>
        )}
      </div>
    </>
  );
}
