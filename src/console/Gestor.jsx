import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase.js';
import Icon from '../components/Icon.jsx';

const BRIDGE = import.meta.env.VITE_BRIDGE_URL || 'https://bridge.consultdelivery.com.br';
const TODAS_LOJAS = '__todas__';

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

const fmtBRL = n => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtNum = n => Number(n || 0).toLocaleString('pt-BR');

// ── Avatar ────────────────────────────────────────────────────────────────────

function GestorAvatar({ size = 32 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: '#EA1D2C', color: '#fff',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size < 36 ? 13 : 16, fontWeight: 800, flexShrink: 0,
    }}>G</div>
  );
}

// ── Chat components ───────────────────────────────────────────────────────────

function GestorMessage({ msg }) {
  const isUser = msg.role === 'user';

  return (
    <div style={{
      display: 'flex',
      justifyContent: isUser ? 'flex-end' : 'flex-start',
      marginBottom: 12,
      gap: 8,
      alignItems: 'flex-end',
    }}>
      {!isUser && <GestorAvatar />}
      <div style={{
        maxWidth: '78%',
        background: isUser ? '#EA1D2C' : '#f3f4f6',
        color: isUser ? '#fff' : 'var(--tx)',
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
          color: isUser ? '#fff' : 'var(--tx2)',
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
      <GestorAvatar />
      <div style={{
        background: '#f3f4f6',
        borderRadius: '16px 16px 16px 4px',
        padding: '12px 16px',
        display: 'flex', gap: 5, alignItems: 'center',
      }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{
            width: 6, height: 6, borderRadius: '50%',
            background: 'var(--tx2)',
            animation: `pulse ${1.2}s ease-in-out ${i * 0.2}s infinite`,
          }} />
        ))}
      </div>
    </div>
  );
}

// ── KPIs da loja selecionada ───────────────────────────────────────────────────

function Kpi({ l, v, d, neg, mut }) {
  return (
    <div className="cv2-kpi">
      <div className="l">{l}</div>
      <div className="v">{v}</div>
      <div className={`d${neg ? ' neg' : ''}${mut ? ' mut' : ''}`}>{d || ' '}</div>
    </div>
  );
}

function KpiFaixa({ lojaId }) {
  const [metricas, setMetricas] = useState(null);

  useEffect(() => {
    if (!lojaId || lojaId === TODAS_LOJAS) { setMetricas(undefined); return; }
    let vivo = true;
    (async () => {
      const desde = new Date();
      desde.setDate(desde.getDate() - 7);
      const { data } = await supabase
        .from('loja_metricas')
        .select('faturamento, pedidos, avaliacao, cancelamentos')
        .eq('loja_id', lojaId)
        .gte('data', desde.toISOString().slice(0, 10))
        .order('data', { ascending: false });
      if (!vivo) return;
      setMetricas(data ?? []);
    })();
    return () => { vivo = false; };
  }, [lojaId]);

  if (!lojaId || lojaId === TODAS_LOJAS) return null;
  if (metricas == null) return null;

  if (metricas.length === 0) {
    return (
      <div style={{ padding: '10px 20px', fontSize: 12, color: 'var(--tx2)' }}>
        Coleta diária ainda não ativa para esta loja.
      </div>
    );
  }

  const faturamento = metricas.reduce((s, m) => s + (Number(m.faturamento) || 0), 0);
  const pedidos = metricas.reduce((s, m) => s + (Number(m.pedidos) || 0), 0);
  const cancelamentos = metricas.reduce((s, m) => s + (Number(m.cancelamentos) || 0), 0);
  const avaliacoes = metricas.filter(m => m.avaliacao != null).map(m => Number(m.avaliacao));
  const avaliacaoMedia = avaliacoes.length ? avaliacoes.reduce((s, v) => s + v, 0) / avaliacoes.length : null;

  return (
    <div style={{ padding: '10px 20px 0' }}>
      <div className="cv2-kpis">
        <Kpi l="Faturamento (7d)" v={fmtBRL(faturamento)} d={`${fmtNum(pedidos)} pedidos`} />
        <Kpi l="Pedidos (7d)" v={fmtNum(pedidos)} />
        <Kpi l="Avaliação média" v={avaliacaoMedia != null ? avaliacaoMedia.toLocaleString('pt-BR') : '—'} mut />
        <Kpi l="Cancelamentos (7d)" v={fmtNum(cancelamentos)} neg={cancelamentos > 0} />
      </div>
    </div>
  );
}

// ── Seletor de loja ────────────────────────────────────────────────────────────

function SeletorLoja({ tenantDbId, lojaId, setLojaId }) {
  const [lojas, setLojas] = useState([]);

  useEffect(() => {
    if (!tenantDbId) return;
    let vivo = true;
    (async () => {
      const { data } = await supabase
        .from('lojas')
        .select('id, nome')
        .eq('tenant_id', tenantDbId)
        .eq('is_consultoria_ativa', true)
        .order('nome');
      if (!vivo) return;
      setLojas(data ?? []);
    })();
    return () => { vivo = false; };
  }, [tenantDbId]);

  return (
    <select
      value={lojaId}
      onChange={e => setLojaId(e.target.value)}
      style={{ padding: '7px 10px', border: '1px solid var(--line)', borderRadius: 4, fontFamily: 'inherit', fontSize: 13, background: '#fff', minWidth: 200 }}
    >
      <option value={TODAS_LOJAS}>Todas / geral</option>
      {lojas.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
    </select>
  );
}

// ── Chat ──────────────────────────────────────────────────────────────────────

const SHORTCUTS = [
  'Como está a loja essa semana?',
  'Sugestões para melhorar avaliação',
  'Analise os cancelamentos recentes',
  'O que priorizar essa semana?',
];

export default function Gestor({ tenantDbId, userId }) {
  const [lojaId, setLojaId] = useState(TODAS_LOJAS);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [initialLoad, setInitialLoad] = useState(true);
  const bottomRef = useRef(null);
  const textareaRef = useRef(null);
  const loadingRef = useRef(false);

  const lojaFiltro = lojaId === TODAS_LOJAS ? null : lojaId;

  useEffect(() => {
    if (!tenantDbId || !userId) return;
    setInitialLoad(true);
    async function load() {
      let query = supabase
        .from('agent_chat_messages')
        .select('id, role, content, created_at')
        .eq('agent_id', 'gestor')
        .eq('tenant_id', tenantDbId)
        .order('created_at', { ascending: true })
        .limit(100);
      query = lojaFiltro ? query.eq('loja_id', lojaFiltro) : query.is('loja_id', null);
      const { data } = await query;

      if (data?.length) {
        setMessages(data);
      } else {
        setMessages([{
          id: 'welcome',
          role: 'assistant',
          content: 'Olá! Sou GESTOR, seu consultor de iFood. Analiso as métricas da loja e sugiro melhorias concretas.\n\nSelecione uma loja acima ou me conte o que precisa.',
          created_at: new Date().toISOString(),
        }]);
      }
      setInitialLoad(false);
    }
    load();
  }, [tenantDbId, userId, lojaFiltro]);

  useEffect(() => {
    if (!tenantDbId || !userId) return;
    const filter = lojaFiltro
      ? `tenant_id=eq.${tenantDbId},loja_id=eq.${lojaFiltro}`
      : `tenant_id=eq.${tenantDbId}`;
    const channel = supabase
      .channel(`gestor-msgs-${tenantDbId}-${lojaFiltro ?? 'geral'}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'agent_chat_messages',
        filter,
      }, payload => {
        const msg = payload.new;
        if (msg.agent_id !== 'gestor') return;
        if (!lojaFiltro && msg.loja_id !== null) return;
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
  }, [tenantDbId, userId, lojaFiltro]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  async function sendMessage() {
    const text = input.trim();
    if (!text || loadingRef.current) return;
    setInput('');
    loadingRef.current = true;
    const optimisticMsg = {
      id: `opt-${Date.now()}`,
      role: 'user',
      content: text,
      created_at: new Date().toISOString(),
    };
    setMessages(prev => [...prev, optimisticMsg]);
    setLoading(true);
    if (textareaRef.current) textareaRef.current.style.height = 'auto';

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const resp = await fetch(`${BRIDGE}/agents/gestor-conversa/run`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          tenant_id: tenantDbId,
          payload: { user_id: userId, message: text, loja_id: lojaFiltro || undefined },
        }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: resp.statusText }));
        throw new Error(err.error || `Erro ${resp.status}`);
      }
    } catch (err) {
      setLoading(false);
      loadingRef.current = false;
      setMessages(prev => [...prev, {
        id: `err-${Date.now()}`,
        role: 'assistant',
        content: `Não consegui me conectar ao servidor. Verifique se o bridge está online.\n\nErro: ${err.message}`,
        created_at: new Date().toISOString(),
      }]);
    }
  }

  function onKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  }

  function onTextareaInput(e) {
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', maxWidth: 720, margin: '0 auto', width: '100%' }}>

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div style={{
        padding: '14px 20px 0',
        borderBottom: '1px solid var(--line)',
        flexShrink: 0,
        background: 'var(--panel)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
          <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#EA1D2C', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: '#fff', fontSize: 22 }}>G</div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 19, color: 'var(--tx)', letterSpacing: '-0.2px' }}>GESTOR</div>
            <div style={{ fontSize: 12, color: 'var(--tx2)' }}>Consultor iFood · Trigger.dev</div>
          </div>
          <div style={{ marginLeft: 'auto' }}>
            <SeletorLoja tenantDbId={tenantDbId} lojaId={lojaId} setLojaId={setLojaId} />
          </div>
        </div>
      </div>

      <KpiFaixa lojaId={lojaId} />

      {/* ── Chat ────────────────────────────────────────────────────────────── */}
      {initialLoad ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, gap: 12, flexDirection: 'column' }}>
          <GestorAvatar size={40} />
          <span style={{ color: 'var(--tx2)', fontSize: 13 }}>Conectando com GESTOR…</span>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px 20px 8px', background: '#faf9f8' }}>
            {messages.map(msg => <GestorMessage key={msg.id} msg={msg} />)}
            {loading && <TypingIndicator />}
            <div ref={bottomRef} />
          </div>

          {messages.length <= 1 && (
            <div style={{ padding: '0 20px 8px', display: 'flex', gap: 6, flexWrap: 'wrap', background: '#faf9f8' }}>
              {SHORTCUTS.map(s => (
                <button
                  key={s}
                  onClick={() => { setInput(s); textareaRef.current?.focus(); }}
                  style={{
                    background: '#fff', border: '1px solid var(--line)',
                    color: 'var(--tx2)', borderRadius: 12,
                    padding: '5px 11px', fontSize: 12, cursor: 'pointer',
                    transition: 'background 0.15s', fontFamily: 'inherit',
                  }}
                >{s}</button>
              ))}
            </div>
          )}

          <div style={{
            padding: '10px 20px 20px',
            display: 'flex', gap: 8, alignItems: 'flex-end',
            flexShrink: 0,
            borderTop: '1px solid var(--line)',
            background: 'var(--panel)',
          }}>
            <textarea
              ref={textareaRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              onInput={onTextareaInput}
              placeholder="Fale com GESTOR… (Enter para enviar, Shift+Enter para nova linha)"
              disabled={loading}
              rows={1}
              style={{
                flex: 1,
                background: '#faf9f8',
                border: '1px solid var(--line)',
                borderRadius: 12,
                color: 'var(--tx)',
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
                background: input.trim() && !loading ? '#EA1D2C' : '#e5e7eb',
                border: 'none', borderRadius: 12,
                cursor: input.trim() && !loading ? 'pointer' : 'default',
                color: input.trim() && !loading ? '#fff' : 'var(--tx2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'background 0.15s',
              }}
            >
              <Icon name="send" size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
