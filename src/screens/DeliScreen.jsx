import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase.js';
import Icon from '../components/Icon.jsx';

const BRIDGE_URL = import.meta.env.VITE_BRIDGE_URL || 'https://bridge.consultdelivery.com.br';

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

// ── Componentes ───────────────────────────────────────────────────────────────

function DeliAvatar() {
  return (
    <div style={{
      width: 32, height: 32, borderRadius: '50%',
      background: 'var(--red, #B70C00)', color: '#fff',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 13, fontWeight: 800, flexShrink: 0,
    }}>D</div>
  );
}

function DeliMessage({ msg }) {
  const isUser = msg.role === 'user';
  return (
    <div style={{
      display: 'flex',
      justifyContent: isUser ? 'flex-end' : 'flex-start',
      marginBottom: 12,
      gap: 8,
      alignItems: 'flex-end',
    }}>
      {!isUser && <DeliAvatar />}
      <div style={{
        maxWidth: '72%',
        background: isUser ? 'var(--red, #B70C00)' : 'var(--g-800)',
        color: '#fff',
        borderRadius: isUser ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
        padding: '10px 14px',
        fontSize: 14,
        lineHeight: 1.6,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
      }}>
        <div style={{ opacity: isUser ? 1 : 0.95 }}>{msg.content}</div>
        <div style={{
          fontSize: 10, opacity: 0.55,
          marginTop: 5,
          textAlign: isUser ? 'right' : 'left',
        }}>
          {msg.created_at ? formatTime(msg.created_at) : 'agora'}
        </div>
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, marginBottom: 12 }}>
      <DeliAvatar />
      <div style={{
        background: 'var(--g-800)',
        borderRadius: '16px 16px 16px 4px',
        padding: '12px 16px',
        display: 'flex', gap: 5, alignItems: 'center',
      }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{
            width: 6, height: 6, borderRadius: '50%',
            background: 'var(--g-400)',
            animation: `pulse ${1.2}s ease-in-out ${i * 0.2}s infinite`,
          }} />
        ))}
      </div>
    </div>
  );
}

// ── Tela principal ────────────────────────────────────────────────────────────

const SHORTCUTS = [
  'Resumo do negócio hoje',
  'Quais são as prioridades da semana?',
  'Análise iFood da loja X',
  'Situação atual dos clientes',
];

export default function DeliScreen({ tenantDbId, userId }) {
  const [messages, setMessages]       = useState([]);
  const [input, setInput]             = useState('');
  const [loading, setLoading]         = useState(false);
  const [initialLoad, setInitialLoad] = useState(true);
  const bottomRef  = useRef(null);
  const textareaRef = useRef(null);
  const loadingRef = useRef(false);

  // ── Carregar histórico ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!tenantDbId || !userId) return;
    async function load() {
      const { data } = await supabase
        .from('deli_messages')
        .select('id, role, content, created_at')
        .eq('tenant_id', tenantDbId)
        .eq('user_id', userId)
        .order('created_at', { ascending: true })
        .limit(100);

      if (data?.length) {
        setMessages(data);
      } else {
        setMessages([{
          id: 'welcome',
          role: 'assistant',
          content: 'Olá, Wandson! Sou DELI, sua COO Digital. Estou aqui para monitorar o negócio e propor ações.\n\nO que você precisa hoje? 🟢',
          created_at: new Date().toISOString(),
        }]);
      }
      setInitialLoad(false);
    }
    load();
  }, [tenantDbId, userId]);

  // ── Realtime: captura resposta da DELI ──────────────────────────────────────
  useEffect(() => {
    if (!tenantDbId || !userId) return;

    const channel = supabase
      .channel(`deli-msgs-${tenantDbId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'deli_messages',
        filter: `tenant_id=eq.${tenantDbId}`,
      }, payload => {
        const msg = payload.new;
        if (msg.user_id !== userId) return;
        if (msg.role !== 'assistant') return;

        setMessages(prev => {
          if (prev.some(m => m.id === msg.id)) return prev;
          return [...prev, msg];
        });
        setLoading(false);
        loadingRef.current = false;
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [tenantDbId, userId]);

  // ── Auto-scroll ─────────────────────────────────────────────────────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // ── Enviar mensagem ─────────────────────────────────────────────────────────
  async function sendMessage() {
    const text = input.trim();
    if (!text || loadingRef.current) return;

    setInput('');
    loadingRef.current = true;

    // Mensagem otimista do usuário
    const optimisticMsg = {
      id: `opt-${Date.now()}`,
      role: 'user',
      content: text,
      created_at: new Date().toISOString(),
    };
    setMessages(prev => [...prev, optimisticMsg]);
    setLoading(true);

    // Auto-resize textarea reset
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      const resp = await fetch(`${BRIDGE_URL}/agents/deli-conversa/run`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          tenant_id: tenantDbId,
          payload: {
            user_id: userId,
            message: text,
          },
        }),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: resp.statusText }));
        throw new Error(err.error || `Erro ${resp.status}`);
      }
      // Resposta da DELI chega via Realtime (deli_messages INSERT)
    } catch (err) {
      setLoading(false);
      loadingRef.current = false;
      setMessages(prev => [...prev, {
        id: `err-${Date.now()}`,
        role: 'assistant',
        content: `⚠️ Não consegui me conectar ao servidor. Verifique se o bridge está online.\n\nErro: ${err.message}`,
        created_at: new Date().toISOString(),
      }]);
    }
  }

  function onKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  function onTextareaInput(e) {
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  if (initialLoad) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 12, flexDirection: 'column' }}>
        <DeliAvatar />
        <span style={{ color: 'var(--g-400)', fontSize: 13 }}>Conectando com DELI…</span>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', maxWidth: 720, margin: '0 auto', width: '100%' }}>

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div style={{
        padding: '14px 20px',
        borderBottom: '1px solid var(--g-700)',
        display: 'flex', alignItems: 'center', gap: 12,
        flexShrink: 0,
      }}>
        <div style={{
          width: 40, height: 40, borderRadius: '50%',
          background: 'var(--red, #B70C00)', color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 16, fontWeight: 800,
        }}>D</div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--g-50)' }}>DELI</div>
          <div style={{ fontSize: 12, color: 'var(--g-400)' }}>COO Digital · Trigger.dev</div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#10B981' }} />
          <span style={{ fontSize: 11, color: 'var(--g-400)' }}>online</span>
        </div>
      </div>

      {/* ── Mensagens ───────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 20px 8px' }}>
        {messages.map(msg => <DeliMessage key={msg.id} msg={msg} />)}
        {loading && <TypingIndicator />}
        <div ref={bottomRef} />
      </div>

      {/* ── Atalhos ─────────────────────────────────────────────────────────── */}
      {messages.length <= 1 && (
        <div style={{ padding: '0 20px 8px', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {SHORTCUTS.map(s => (
            <button
              key={s}
              onClick={() => { setInput(s); textareaRef.current?.focus(); }}
              style={{
                background: 'var(--g-800)', border: '1px solid var(--g-600)',
                color: 'var(--g-300)', borderRadius: 12,
                padding: '5px 11px', fontSize: 12, cursor: 'pointer',
                transition: 'background 0.15s',
              }}
            >{s}</button>
          ))}
        </div>
      )}

      {/* ── Composer ────────────────────────────────────────────────────────── */}
      <div style={{
        padding: '10px 20px 20px',
        display: 'flex', gap: 8, alignItems: 'flex-end',
        flexShrink: 0,
        borderTop: '1px solid var(--g-800)',
      }}>
        <textarea
          ref={textareaRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          onInput={onTextareaInput}
          placeholder="Fale com DELI… (Enter para enviar, Shift+Enter para nova linha)"
          disabled={loading}
          rows={1}
          style={{
            flex: 1,
            background: 'var(--g-800)',
            border: '1px solid var(--g-600)',
            borderRadius: 12,
            color: 'var(--g-50)',
            padding: '10px 14px',
            fontSize: 14,
            resize: 'none',
            outline: 'none',
            minHeight: 42,
            maxHeight: 120,
            lineHeight: 1.5,
            fontFamily: 'inherit',
            opacity: loading ? 0.6 : 1,
            transition: 'opacity 0.15s',
          }}
        />
        <button
          onClick={sendMessage}
          disabled={!input.trim() || loading}
          title="Enviar (Enter)"
          style={{
            width: 42, height: 42, flexShrink: 0,
            background: input.trim() && !loading ? 'var(--red, #B70C00)' : 'var(--g-700)',
            border: 'none', borderRadius: 12, cursor: input.trim() && !loading ? 'pointer' : 'default',
            color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'background 0.15s',
          }}
        >
          <Icon name="send" size={16} />
        </button>
      </div>
    </div>
  );
}
