import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase.js';
import Icon from '../components/Icon.jsx';

const BRIDGE = import.meta.env.VITE_BRIDGE_URL || 'https://bridge.consultdelivery.com.br';

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

function relativeTime(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return `${min}min atrás`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h atrás`;
  return `${Math.floor(h / 24)}d atrás`;
}

// ── Avatares ──────────────────────────────────────────────────────────────────

function DeliAvatar({ size = 32 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: '#B70C00', color: '#fff',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size < 36 ? 13 : 16, fontWeight: 800, flexShrink: 0,
    }}>D</div>
  );
}

function LaraAvatar({ size = 32 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: '#7C3AED', color: '#fff',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 13, fontWeight: 800, flexShrink: 0,
    }}>L</div>
  );
}

// ── Chat components ───────────────────────────────────────────────────────────

function DeliMessage({ msg }) {
  const isUser       = msg.role === 'user';
  const isLaraReport = !isUser && msg.metadata?.source_agent === 'lara';

  const avatar = isLaraReport ? <LaraAvatar /> : <DeliAvatar />;
  const bg     = isUser ? '#B70C00' : isLaraReport ? '#ede9fe' : '#f3f4f6';
  const border = isLaraReport ? '1px solid #c4b5fd' : 'none';
  const textColor = isUser ? '#fff' : isLaraReport ? '#4c1d95' : 'var(--tx)';

  return (
    <div style={{
      display: 'flex',
      justifyContent: isUser ? 'flex-end' : 'flex-start',
      marginBottom: 12,
      gap: 8,
      alignItems: 'flex-end',
    }}>
      {!isUser && avatar}
      <div style={{
        maxWidth: '78%',
        background: bg,
        border,
        color: textColor,
        borderRadius: isUser ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
        padding: '10px 14px',
        fontSize: 14,
        lineHeight: 1.6,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
      }}>
        {isLaraReport && (
          <div style={{ fontSize: 10, fontWeight: 700, color: '#7C3AED', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1 }}>
            LARA · relatório
          </div>
        )}
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
      <DeliAvatar />
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

// ── Painel components ─────────────────────────────────────────────────────────

const AGENT_META = {
  deli:  { label: 'DELI',  color: '#B70C00', desc: 'COO Digital' },
  lara:  { label: 'LARA',  color: '#7C3AED', desc: 'CRM & Marketing' },
  vera:  { label: 'VERA',  color: '#0EA5E9', desc: 'BI & Relatórios' },
  cora:  { label: 'CORA',  color: '#F59E0B', desc: 'Cobrança' },
  sofia: { label: 'SOFIA', color: '#10B981', desc: 'SDR/Prospecção' },
  breno: { label: 'BRENO', color: '#6366F1', desc: 'Atendimento' },
};

function AgentStatusCard({ agentId, run }) {
  const meta   = AGENT_META[agentId] ?? { label: agentId.toUpperCase(), color: '#6B7280', desc: '' };
  const status = run?.status ?? 'sem dados';
  const ok     = status === 'success';
  const failed = status === 'failed';

  return (
    <div className="cv2-card" style={{
      border: failed ? '1px solid #fca5a5' : undefined,
      display: 'flex', flexDirection: 'column', gap: 6,
      marginBottom: 0,
      padding: '14px 16px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{
          width: 28, height: 28, borderRadius: '50%',
          background: meta.color, color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 11, fontWeight: 800, flexShrink: 0,
        }}>{meta.label[0]}</div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--tx)' }}>{meta.label}</div>
          <div style={{ fontSize: 11, color: 'var(--tx2)' }}>{meta.desc}</div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5 }}>
          <div style={{
            width: 7, height: 7, borderRadius: '50%',
            background: ok ? '#10B981' : failed ? '#EF4444' : '#9CA3AF',
          }} />
          <span style={{ fontSize: 11, color: ok ? '#10B981' : failed ? '#EF4444' : 'var(--tx2)' }}>
            {ok ? 'ok' : failed ? 'falhou' : 'sem dados'}
          </span>
        </div>
      </div>
      {run && (
        <div style={{ fontSize: 11, color: 'var(--tx2)', display: 'flex', gap: 12 }}>
          <span>{relativeTime(run.completed_at)}</span>
          {run.duration_ms && <span>{(run.duration_ms / 1000).toFixed(1)}s</span>}
          {run.cost_usd != null && <span>${run.cost_usd.toFixed(4)}</span>}
        </div>
      )}
    </div>
  );
}

function AnomaliaCard({ anomalia, onResolve }) {
  const sevColor = anomalia.severidade === 'alta' ? '#dc2626'
    : anomalia.severidade === 'media' ? '#D97706' : '#6B7280';

  return (
    <div className="cv2-card" style={{
      border: `1px solid ${sevColor}44`,
      display: 'flex', alignItems: 'flex-start', gap: 10,
      marginBottom: 0,
      padding: '12px 14px',
    }}>
      <div style={{
        width: 6, height: 6, borderRadius: '50%',
        background: sevColor, marginTop: 5, flexShrink: 0,
      }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, color: 'var(--tx)', fontWeight: 600 }}>{anomalia.tipo}</div>
        <div style={{ fontSize: 12, color: 'var(--tx2)', marginTop: 2, wordBreak: 'break-word' }}>{anomalia.descricao}</div>
        <div style={{ fontSize: 11, color: 'var(--tx2)', marginTop: 4, opacity: 0.7 }}>{relativeTime(anomalia.created_at)}</div>
      </div>
      <button
        onClick={() => onResolve(anomalia.id)}
        className="cv2-btn sec"
        style={{ fontSize: 11, padding: '4px 10px', flexShrink: 0 }}
      >Resolver</button>
    </div>
  );
}

function RevisaoCard({ revisao }) {
  const [expanded, setExpanded] = useState(false);
  const alertas = revisao.alertas ?? [];
  const acoes   = revisao.acoes_sugeridas ?? [];

  return (
    <div className="cv2-card" style={{
      cursor: 'pointer',
      marginBottom: 0,
      padding: '12px 14px',
    }} onClick={() => setExpanded(e => !e)}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 12, color: 'var(--tx2)' }}>{formatDate(revisao.created_at)}</span>
        {alertas.length > 0 && (
          <span className="cv2-bdg err">
            {alertas.length} alerta{alertas.length > 1 ? 's' : ''}
          </span>
        )}
        <div style={{ marginLeft: 'auto' }}>
          <Icon name={expanded ? 'chevron-up' : 'chevron-down'} size={14} style={{ color: 'var(--tx2)' }} />
        </div>
      </div>
      <div style={{
        fontSize: 13, color: 'var(--tx)', marginTop: 6,
        display: expanded ? 'block' : '-webkit-box',
        WebkitLineClamp: expanded ? undefined : 2,
        WebkitBoxOrient: 'vertical',
        overflow: expanded ? undefined : 'hidden',
        whiteSpace: 'pre-wrap',
      }}>
        {revisao.resumo}
      </div>
      {expanded && acoes.length > 0 && (
        <div style={{ marginTop: 10, borderTop: '1px solid var(--line)', paddingTop: 8 }}>
          <div style={{ fontSize: 11, color: 'var(--tx2)', fontWeight: 700, marginBottom: 4 }}>AÇÕES SUGERIDAS</div>
          {acoes.map((a, i) => (
            <div key={i} style={{ fontSize: 12, color: 'var(--tx)', padding: '2px 0' }}>→ {a}</div>
          ))}
        </div>
      )}
    </div>
  );
}

function PainelTab({ tenantDbId, userId }) {
  const [agentRuns,  setAgentRuns]  = useState({});
  const [anomalias,  setAnomalias]  = useState([]);
  const [revisoes,   setRevisoes]   = useState([]);
  const [loadingBtn, setLoadingBtn] = useState(false);
  const [loading,    setLoading]    = useState(true);

  useEffect(() => {
    if (!tenantDbId) return;
    load();
  }, [tenantDbId]);

  async function load() {
    setLoading(true);
    await Promise.all([loadAgentRuns(), loadAnomalias(), loadRevisoes()]);
    setLoading(false);
  }

  async function loadAgentRuns() {
    const agentIds = ['deli', 'lara', 'vera', 'cora', 'sofia', 'breno'];
    const runMap = {};
    for (const agentId of agentIds) {
      const { data } = await supabase
        .from('agent_runs')
        .select('status, completed_at, duration_ms, cost_usd')
        .eq('tenant_id', tenantDbId)
        .eq('agent_id', agentId)
        .order('completed_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      runMap[agentId] = data ?? null;
    }
    setAgentRuns(runMap);
  }

  async function loadAnomalias() {
    const { data } = await supabase
      .from('vera_anomalias')
      .select('id, tipo, descricao, severidade, created_at')
      .eq('tenant_id', tenantDbId)
      .eq('resolvida', false)
      .order('created_at', { ascending: false })
      .limit(10);
    setAnomalias(data ?? []);
  }

  async function loadRevisoes() {
    const { data } = await supabase
      .from('deli_agenda')
      .select('id, resumo, alertas, acoes_sugeridas, created_at')
      .eq('tenant_id', tenantDbId)
      .eq('tipo', 'revisao_matinal')
      .order('created_at', { ascending: false })
      .limit(7);
    setRevisoes(data ?? []);
  }

  async function resolveAnomalia(id) {
    await supabase.from('vera_anomalias').update({ resolvida: true }).eq('id', id);
    setAnomalias(prev => prev.filter(a => a.id !== id));
  }

  async function triggerRevisao() {
    if (loadingBtn) return;
    setLoadingBtn(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      await fetch(`${BRIDGE}/agents/deli-revisao-matinal/run`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ tenant_id: tenantDbId, payload: { triggered_by: userId } }),
      });
      setTimeout(() => { loadRevisoes(); setLoadingBtn(false); }, 8000);
    } catch {
      setLoadingBtn(false);
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: 'var(--tx2)', fontSize: 13 }}>
        Carregando painel…
      </div>
    );
  }

  return (
    <div style={{ padding: '16px 20px', overflowY: 'auto', flex: 1 }}>

      {/* Status dos agentes */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--tx2)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
          Status dos Agentes
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
          {Object.keys(AGENT_META).map(agentId => (
            <AgentStatusCard key={agentId} agentId={agentId} run={agentRuns[agentId]} />
          ))}
        </div>
      </div>

      {/* Anomalias ativas */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--tx2)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
          Anomalias Ativas
          {anomalias.length > 0 && (
            <span className="cv2-bdg err">{anomalias.length}</span>
          )}
        </div>
        {anomalias.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--tx2)', padding: '10px 0' }}>Nenhuma anomalia ativa</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {anomalias.map(a => (
              <AnomaliaCard key={a.id} anomalia={a} onResolve={resolveAnomalia} />
            ))}
          </div>
        )}
      </div>

      {/* Revisões matinais */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--tx2)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
          Revisões Matinais
          <button
            onClick={triggerRevisao}
            disabled={loadingBtn}
            className="cv2-btn"
            style={{
              fontSize: 11, padding: '4px 12px',
              opacity: loadingBtn ? 0.6 : 1,
              cursor: loadingBtn ? 'default' : 'pointer',
            }}
          >{loadingBtn ? 'Gerando…' : '+ Gerar agora'}</button>
        </div>
        {revisoes.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--tx2)', padding: '10px 0' }}>Nenhuma revisão disponível. Clique em "Gerar agora".</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {revisoes.map(r => <RevisaoCard key={r.id} revisao={r} />)}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Chat Tab ──────────────────────────────────────────────────────────────────

const SHORTCUTS = [
  'Resumo do negócio hoje',
  'Quais são as prioridades da semana?',
  'Análise iFood da loja X',
  'Situação atual dos clientes',
];

function ChatTab({ tenantDbId, userId }) {
  const [messages, setMessages]       = useState([]);
  const [input, setInput]             = useState('');
  const [loading, setLoading]         = useState(false);
  const [initialLoad, setInitialLoad] = useState(true);
  const bottomRef   = useRef(null);
  const textareaRef = useRef(null);
  const loadingRef  = useRef(false);

  useEffect(() => {
    if (!tenantDbId || !userId) return;
    async function load() {
      const { data } = await supabase
        .from('deli_messages')
        .select('id, role, content, created_at, metadata')
        .eq('tenant_id', tenantDbId)
        .or(`user_id.eq.${userId},user_id.is.null`)
        .order('created_at', { ascending: true })
        .limit(100);

      if (data?.length) {
        setMessages(data);
      } else {
        setMessages([{
          id: 'welcome',
          role: 'assistant',
          content: 'Olá, Wandson! Sou DELI, sua COO Digital. Estou aqui para monitorar o negócio e propor ações.\n\nO que você precisa hoje?',
          created_at: new Date().toISOString(),
        }]);
      }
      setInitialLoad(false);
    }
    load();
  }, [tenantDbId, userId]);

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
        const isOwn   = msg.user_id === userId;
        const isAgent = msg.user_id === null && msg.role === 'assistant';
        if (!isOwn && !isAgent) return;
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
      const resp = await fetch(`${BRIDGE}/agents/deli-conversa/run`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          tenant_id: tenantDbId,
          payload: { user_id: userId, message: text },
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

  if (initialLoad) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 12, flexDirection: 'column' }}>
        <DeliAvatar size={40} />
        <span style={{ color: 'var(--tx2)', fontSize: 13 }}>Conectando com DELI…</span>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 20px 8px', background: '#faf9f8' }}>
        {messages.map(msg => <DeliMessage key={msg.id} msg={msg} />)}
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
          placeholder="Fale com DELI… (Enter para enviar, Shift+Enter para nova linha)"
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
            background: input.trim() && !loading ? '#B70C00' : '#e5e7eb',
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
  );
}

// ── Tela principal ────────────────────────────────────────────────────────────

const TABS = [
  { id: 'chat',   label: 'Chat' },
  { id: 'painel', label: 'Painel' },
];

export default function Deli({ tenantDbId, userId }) {
  const [activeTab, setActiveTab] = useState('chat');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', maxWidth: 720, margin: '0 auto', width: '100%' }}>

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div style={{
        padding: '14px 20px 0',
        borderBottom: '1px solid var(--line)',
        flexShrink: 0,
        background: 'var(--panel)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#B70C00', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: '#fff', fontSize: 22 }}>D</div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 19, color: 'var(--tx)', letterSpacing: '-0.2px' }}>DELI</div>
            <div style={{ fontSize: 12, color: 'var(--tx2)' }}>COO Digital · Trigger.dev</div>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#10B981' }} />
            <span style={{ fontSize: 11, color: 'var(--tx2)' }}>online</span>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 0 }}>
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                background: 'none',
                border: 'none',
                borderBottom: activeTab === tab.id ? '2px solid #B70C00' : '2px solid transparent',
                color: activeTab === tab.id ? 'var(--tx)' : 'var(--tx2)',
                padding: '6px 16px 10px',
                fontSize: 13,
                fontWeight: activeTab === tab.id ? 700 : 500,
                cursor: 'pointer',
                transition: 'color 0.15s',
                fontFamily: 'inherit',
              }}
            >{tab.label}</button>
          ))}
        </div>
      </div>

      {/* ── Conteúdo da aba ─────────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {activeTab === 'chat'   && <ChatTab   tenantDbId={tenantDbId} userId={userId} />}
        {activeTab === 'painel' && <PainelTab tenantDbId={tenantDbId} userId={userId} />}
      </div>
    </div>
  );
}
