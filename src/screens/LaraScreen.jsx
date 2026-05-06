import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase.js';

const BRIDGE_BASE = import.meta.env.VITE_BRIDGE_URL || 'http://45.39.210.183:3001';

function getSessionId(lojaId) {
  const key = `lara-session-${lojaId}`;
  let sid = localStorage.getItem(key);
  if (!sid) {
    sid = crypto.randomUUID();
    localStorage.setItem(key, sid);
  }
  return sid;
}

function StageIndicator({ stage, label }) {
  if (!stage) return null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', background: 'var(--surface2)', borderRadius: 8, fontSize: 12, color: 'var(--text2)' }}>
      <svg width="14" height="14" viewBox="0 0 24 24" style={{ animation: 'spin 0.8s linear infinite', flexShrink: 0 }}>
        <circle cx="12" cy="12" r="10" fill="none" stroke="var(--red)" strokeWidth="3" strokeDasharray="60" strokeDashoffset="20" />
      </svg>
      {label || stage}
    </div>
  );
}

function Message({ msg }) {
  const isLara = msg.role === 'assistant';
  return (
    <div style={{
      display: 'flex',
      flexDirection: isLara ? 'row' : 'row-reverse',
      gap: 10,
      marginBottom: 16,
      alignItems: 'flex-start',
    }}>
      {isLara && (
        <div style={{
          width: 32, height: 32, borderRadius: '50%', background: 'var(--red)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0, fontSize: 14, fontWeight: 700, color: '#fff',
        }}>L</div>
      )}
      <div style={{
        maxWidth: '72%',
        background: isLara ? 'var(--surface2)' : 'var(--red)',
        color: isLara ? 'var(--text1)' : '#fff',
        borderRadius: isLara ? '4px 12px 12px 12px' : '12px 4px 12px 12px',
        padding: '10px 14px',
        fontSize: 14,
        lineHeight: 1.55,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
      }}>
        {msg.text}
      </div>
    </div>
  );
}

export default function LaraScreen({ tenantDbId, userId }) {
  const [lojas, setLojas]       = useState([]);
  const [lojaId, setLojaId]     = useState('');
  const [messages, setMessages] = useState([]);
  const [input, setInput]       = useState('');
  const [stage, setStage]       = useState(null);
  const [stageLabel, setStageLabel] = useState('');
  const [loading, setLoading]   = useState(false);
  const bottomRef               = useRef(null);

  useEffect(() => {
    if (!tenantDbId) return;
    supabase.from('lojas').select('id, nome').eq('tenant_id', tenantDbId).order('nome')
      .then(({ data }) => {
        if (data?.length) {
          setLojas(data);
          setLojaId(data[0].id);
        }
      });
  }, [tenantDbId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, stage]);

  async function sendMessage() {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text }]);
    setLoading(true);
    setStage('verifying');
    setStageLabel('Conectando com a LARA...');

    const { data: { session } } = await supabase.auth.getSession();
    const jwt = session?.access_token;

    try {
      const res = await fetch(`${BRIDGE_BASE}/invoke/lara`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
        },
        body: JSON.stringify({
          tenant_id:  tenantDbId,
          loja_id:    lojaId || null,
          session_id: lojaId ? getSessionId(lojaId) : undefined,
          message:    text,
        }),
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Bridge: ${res.status} — ${err}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop();

        let curEvent = null;
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            curEvent = line.slice(7).trim();
          } else if (line.startsWith('data: ')) {
            try {
              const payload = JSON.parse(line.slice(6));
              if (curEvent === 'stage') {
                setStage(payload.stage);
                setStageLabel(payload.label || payload.stage);
              } else if (curEvent === 'message') {
                setMessages(prev => [...prev, { role: 'assistant', text: payload.text }]);
              } else if (curEvent === 'done' || curEvent === 'error') {
                if (curEvent === 'error') {
                  setMessages(prev => [...prev, { role: 'assistant', text: `Erro: ${payload.message}` }]);
                }
              }
            } catch (_) {}
            curEvent = null;
          }
        }
      }
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', text: `Não consegui falar com a LARA: ${err.message}` }]);
    } finally {
      setLoading(false);
      setStage(null);
      setStageLabel('');
    }
  }

  function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  function clearSession() {
    if (lojaId) localStorage.removeItem(`lara-session-${lojaId}`);
    setMessages([]);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', maxWidth: 760, margin: '0 auto', padding: '24px 16px 0' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--red)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 18 }}>L</div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 16 }}>LARA</div>
          <div style={{ fontSize: 12, color: 'var(--text2)' }}>Agente de Régua de Disparo</div>
        </div>

        {lojas.length > 0 && (
          <select
            value={lojaId}
            onChange={e => { setLojaId(e.target.value); setMessages([]); }}
            style={{ marginLeft: 'auto', padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text1)', fontSize: 13 }}
          >
            {lojas.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
          </select>
        )}

        {messages.length > 0 && (
          <button
            onClick={clearSession}
            title="Nova conversa"
            style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text2)', fontSize: 12, cursor: 'pointer' }}
          >
            Nova conversa
          </button>
        )}
      </div>

      {/* Empty state */}
      {messages.length === 0 && !loading && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, color: 'var(--text2)', textAlign: 'center' }}>
          <div style={{ fontSize: 40 }}>💬</div>
          <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--text1)' }}>Fale com a LARA</div>
          <div style={{ fontSize: 13, maxWidth: 380 }}>
            {lojas.length === 0
              ? 'Nenhuma loja cadastrada. Cadastre uma loja no CRM para começar.'
              : 'Peça uma régua de disparo, pergunte sobre campanhas ou passe dados da loja.'}
          </div>
          {lojas.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
              {['Preciso de uma régua para essa loja', 'Como está o histórico de campanhas?', 'Quais dados você já tem sobre essa loja?'].map(s => (
                <button key={s} onClick={() => { setInput(s); }} style={{ padding: '8px 14px', borderRadius: 20, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text1)', fontSize: 13, cursor: 'pointer', textAlign: 'left' }}>
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Messages */}
      {messages.length > 0 && (
        <div style={{ flex: 1, overflowY: 'auto', paddingRight: 4 }} className="dark-scroll">
          {messages.map((m, i) => <Message key={i} msg={m} />)}
          {stage && <StageIndicator stage={stage} label={stageLabel} />}
          <div ref={bottomRef} />
        </div>
      )}

      {stage && messages.length === 0 && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <StageIndicator stage={stage} label={stageLabel} />
        </div>
      )}

      {/* Input */}
      <div style={{ padding: '12px 0 16px', borderTop: '1px solid var(--border)', marginTop: 8 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Mensagem para a LARA... (Enter para enviar)"
            rows={2}
            disabled={loading}
            style={{
              flex: 1, padding: '10px 14px', borderRadius: 12, border: '1px solid var(--border)',
              background: 'var(--surface2)', color: 'var(--text1)', fontSize: 14,
              resize: 'none', outline: 'none', lineHeight: 1.5,
              opacity: loading ? 0.6 : 1,
            }}
          />
          <button
            onClick={sendMessage}
            disabled={loading || !input.trim()}
            style={{
              padding: '10px 18px', borderRadius: 12, border: 'none',
              background: loading || !input.trim() ? 'var(--surface3)' : 'var(--red)',
              color: loading || !input.trim() ? 'var(--text2)' : '#fff',
              fontWeight: 600, fontSize: 14, cursor: loading || !input.trim() ? 'not-allowed' : 'pointer',
              flexShrink: 0, transition: 'background 0.15s',
            }}
          >
            {loading ? '...' : 'Enviar'}
          </button>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6 }}>
          LARA é um agente interno. Nenhuma mensagem vai direto ao cliente — tudo passa por aprovação.
        </div>
      </div>
    </div>
  );
}
