import { useState, useRef, useEffect } from 'react';
import { supabase } from '../lib/supabase.js';
import Icon from '../components/Icon.jsx';

const BRIDGE_URL = import.meta.env.VITE_BRIDGE_URL || 'https://bridge.consultdelivery.com.br';

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

// ── Componentes utilitários ───────────────────────────────────────────────────

function MaxAvatar({ size = 32 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: '#0F766E', color: '#fff',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: Math.round(size * 0.4), fontWeight: 800, flexShrink: 0,
    }}>M</div>
  );
}

function PrioridadeBadge({ prioridade }) {
  const map = {
    critica:      { color: '#DC2626', bg: '#450A0A', label: 'Crítica' },
    alta:         { color: '#EA580C', bg: '#431407', label: 'Alta' },
    media:        { color: '#CA8A04', bg: '#422006', label: 'Média' },
    baixa:        { color: '#16A34A', bg: '#052E16', label: 'Baixa' },
  };
  const s = map[prioridade] ?? map.media;
  return (
    <span style={{
      background: s.bg, color: s.color,
      border: `1px solid ${s.color}44`,
      borderRadius: 8, padding: '3px 9px', fontSize: 11, fontWeight: 700,
    }}>{s.label}</span>
  );
}

function StatusBadge({ status }) {
  const map = {
    pending:   { color: '#CA8A04', label: 'Pendente' },
    running:   { color: '#2563EB', label: 'Processando' },
    success:   { color: '#16A34A', label: 'Concluído' },
    failed:    { color: '#DC2626', label: 'Erro' },
  };
  const s = map[status] ?? map.pending;
  return (
    <span style={{
      color: s.color,
      fontSize: 11, fontWeight: 700,
      display: 'flex', alignItems: 'center', gap: 4,
    }}>
      <div style={{ width: 6, height: 6, borderRadius: '50%', background: s.color }} />
      {s.label}
    </span>
  );
}

function LoadingSpinner() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, padding: '48px 0' }}>
      <MaxAvatar size={48} />
      <div style={{ display: 'flex', gap: 5 }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{
            width: 7, height: 7, borderRadius: '50%',
            background: '#0F766E',
            animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite`,
          }} />
        ))}
      </div>
      <span style={{ color: 'var(--g-400)', fontSize: 13 }}>MAX processando…</span>
    </div>
  );
}

// ── Abas ──────────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'diagnostico', label: 'Diagnóstico',  icon: 'search'    },
  { id: 'tutorial',    label: 'Tutorial',     icon: 'paper'     },
  { id: 'escalar',     label: 'Escalar',      icon: 'warning'   },
  { id: 'historico',   label: 'Histórico',    icon: 'list'      },
];

const SISTEMAS = [
  { value: '',          label: 'Todos os sistemas' },
  { value: 'ifood',     label: 'iFood' },
  { value: 'whatsapp',  label: 'WhatsApp Business' },
  { value: 'pdv',       label: 'PDV / Caixa' },
  { value: 'delivery',  label: 'Delivery / App' },
  { value: 'geral',     label: 'Geral' },
];

const NIVEIS = [
  { value: 'basico',        label: 'Básico — para iniciantes' },
  { value: 'intermediario', label: 'Intermediário' },
  { value: 'avancado',      label: 'Avançado — técnico' },
];

// ── Seção Diagnóstico ─────────────────────────────────────────────────────────

function DiagnosticoTab({ tenantDbId, userId }) {
  const [msg, setMsg]         = useState('');
  const [sistema, setSistema] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult]   = useState(null);
  const [error, setError]     = useState(null);
  const pendingRef            = useRef(null);

  useEffect(() => {
    if (!tenantDbId) return;
    const channel = supabase
      .channel(`max-diag-${tenantDbId}-${userId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'agent_runs',
        filter: `tenant_id=eq.${tenantDbId}`,
      }, payload => {
        const run = payload.new;
        if (run.trigger_dev_run_id !== pendingRef.current) return;
        if (run.status === 'success' && run.output) {
          setResult(run.output);
          setLoading(false);
          pendingRef.current = null;
        } else if (run.status === 'failed') {
          setError('MAX encontrou um erro. Tente novamente.');
          setLoading(false);
          pendingRef.current = null;
        }
      })
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [tenantDbId, userId]);

  async function submit() {
    if (!msg.trim() || loading) return;
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const payload = { user_id: userId, message: msg.trim() };
      if (sistema) payload.sistema = sistema;

      const r = await fetch(`${BRIDGE_URL}/agents/max-diagnostico/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ tenant_id: tenantDbId, payload }),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error || `Erro ${r.status}`);
      pendingRef.current = body.run_id ?? null;
    } catch (e) {
      setError(e.message);
      setLoading(false);
    }
  }

  const shortcuts = [
    'Minha loja está offline no iFood',
    'Não estou recebendo pedidos',
    'Como alterar preço de um produto?',
    'Problemas com avaliações negativas',
    'Como configurar horário de funcionamento?',
  ];

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', width: '100%' }}>
      {/* Form */}
      <div style={{ background: 'var(--g-800)', border: '1px solid var(--g-700)', borderRadius: 12, padding: 20, marginBottom: 16 }}>
        <label style={{ fontSize: 12, color: 'var(--g-400)', fontWeight: 600, display: 'block', marginBottom: 6 }}>
          SISTEMA (opcional)
        </label>
        <select
          value={sistema}
          onChange={e => setSistema(e.target.value)}
          style={{ background: 'var(--g-700)', border: '1px solid var(--g-600)', color: 'var(--g-100)', borderRadius: 8, padding: '8px 12px', fontSize: 13, width: '100%', marginBottom: 14, outline: 'none' }}
        >
          {SISTEMAS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>

        <label style={{ fontSize: 12, color: 'var(--g-400)', fontWeight: 600, display: 'block', marginBottom: 6 }}>
          DESCREVA O PROBLEMA
        </label>
        <textarea
          value={msg}
          onChange={e => setMsg(e.target.value)}
          placeholder="Ex: Minha loja aparece fechada no iFood mas eu já configurei o horário…"
          rows={4}
          style={{
            width: '100%', background: 'var(--g-700)', border: '1px solid var(--g-600)',
            color: 'var(--g-50)', borderRadius: 8, padding: '10px 12px', fontSize: 14,
            resize: 'vertical', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
          }}
        />

        {/* Atalhos */}
        {!msg && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
            {shortcuts.map(s => (
              <button key={s} onClick={() => setMsg(s)} style={{
                background: 'var(--g-700)', border: '1px solid var(--g-600)',
                color: 'var(--g-300)', borderRadius: 20, padding: '4px 12px',
                fontSize: 12, cursor: 'pointer',
              }}>{s}</button>
            ))}
          </div>
        )}

        <button
          onClick={submit}
          disabled={!msg.trim() || loading}
          style={{
            marginTop: 14, background: msg.trim() && !loading ? '#0F766E' : 'var(--g-700)',
            color: '#fff', border: 'none', borderRadius: 8, padding: '10px 20px',
            fontSize: 13, fontWeight: 700, cursor: msg.trim() && !loading ? 'pointer' : 'default',
            display: 'flex', alignItems: 'center', gap: 8,
          }}
        >
          <Icon name="search" size={15} />
          Diagnosticar
        </button>
      </div>

      {loading && <LoadingSpinner />}

      {error && (
        <div style={{ background: '#450A0A', border: '1px solid #DC262644', borderRadius: 10, padding: 16, color: '#F87171', fontSize: 13 }}>
          ⚠️ {error}
        </div>
      )}

      {result && (
        <div style={{ background: 'var(--g-800)', border: '1px solid #0F766E44', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ background: '#0F766E22', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid #0F766E33' }}>
            <MaxAvatar size={28} />
            <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--g-100)' }}>Diagnóstico MAX</span>
            {result.needs_escalation && (
              <span style={{ marginLeft: 'auto', background: '#450A0A', color: '#FCA5A5', border: '1px solid #DC262644', borderRadius: 8, padding: '2px 10px', fontSize: 11, fontWeight: 700 }}>
                ⚠️ Requer escalação
              </span>
            )}
          </div>
          <div style={{ padding: 18 }}>
            <div style={{ fontSize: 14, color: 'var(--g-100)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
              {result.solution}
            </div>
            {result.citations?.length > 0 && (
              <div style={{ marginTop: 12, fontSize: 11, color: 'var(--g-500)' }}>
                Fontes: {result.citations.join(', ')} da base de conhecimento
              </div>
            )}
            {result.needs_escalation && (
              <div style={{ marginTop: 14, padding: '10px 14px', background: '#450A0A', borderRadius: 8, border: '1px solid #DC262644', fontSize: 13, color: '#FCA5A5' }}>
                🔴 MAX recomenda escalar este problema para o Eduardo. Use a aba <strong>Escalar</strong> para criar um ticket.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Seção Tutorial ────────────────────────────────────────────────────────────

function TutorialTab({ tenantDbId, userId }) {
  const [topico, setTopico]   = useState('');
  const [sistema, setSistema] = useState('ifood');
  const [nivel, setNivel]     = useState('basico');
  const [loading, setLoading] = useState(false);
  const [result, setResult]   = useState(null);
  const [error, setError]     = useState(null);
  const pendingRef            = useRef(null);

  useEffect(() => {
    if (!tenantDbId) return;
    const channel = supabase
      .channel(`max-tut-${tenantDbId}-${userId}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'agent_runs',
        filter: `tenant_id=eq.${tenantDbId}`,
      }, payload => {
        const run = payload.new;
        if (run.trigger_dev_run_id !== pendingRef.current) return;
        if (run.status === 'success' && run.output) {
          setResult(run.output);
          setLoading(false);
          pendingRef.current = null;
        } else if (run.status === 'failed') {
          setError('MAX encontrou um erro. Tente novamente.');
          setLoading(false);
          pendingRef.current = null;
        }
      })
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [tenantDbId, userId]);

  async function submit() {
    if (!topico.trim() || loading) return;
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const r = await fetch(`${BRIDGE_URL}/agents/max-tutorial/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ tenant_id: tenantDbId, payload: { user_id: userId, topico: topico.trim(), sistema: sistema || undefined, nivel } }),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error || `Erro ${r.status}`);
      pendingRef.current = body.run_id ?? null;
    } catch (e) {
      setError(e.message);
      setLoading(false);
    }
  }

  const shortcuts = [
    'Como alterar horário de funcionamento no iFood',
    'Como responder uma avaliação negativa',
    'Como pausar um produto temporariamente',
    'Como configurar tempo de preparo no iFood',
    'Como ativar mensagem automática no WhatsApp',
  ];

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', width: '100%' }}>
      <div style={{ background: 'var(--g-800)', border: '1px solid var(--g-700)', borderRadius: 12, padding: 20, marginBottom: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
          <div>
            <label style={{ fontSize: 12, color: 'var(--g-400)', fontWeight: 600, display: 'block', marginBottom: 6 }}>SISTEMA</label>
            <select value={sistema} onChange={e => setSistema(e.target.value)}
              style={{ background: 'var(--g-700)', border: '1px solid var(--g-600)', color: 'var(--g-100)', borderRadius: 8, padding: '8px 12px', fontSize: 13, width: '100%', outline: 'none' }}>
              {SISTEMAS.slice(1).map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 12, color: 'var(--g-400)', fontWeight: 600, display: 'block', marginBottom: 6 }}>NÍVEL</label>
            <select value={nivel} onChange={e => setNivel(e.target.value)}
              style={{ background: 'var(--g-700)', border: '1px solid var(--g-600)', color: 'var(--g-100)', borderRadius: 8, padding: '8px 12px', fontSize: 13, width: '100%', outline: 'none' }}>
              {NIVEIS.map(n => <option key={n.value} value={n.value}>{n.label}</option>)}
            </select>
          </div>
        </div>

        <label style={{ fontSize: 12, color: 'var(--g-400)', fontWeight: 600, display: 'block', marginBottom: 6 }}>TÓPICO DO TUTORIAL</label>
        <input
          type="text"
          value={topico}
          onChange={e => setTopico(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && submit()}
          placeholder="Ex: Como alterar o preço de um produto no iFood"
          style={{ width: '100%', background: 'var(--g-700)', border: '1px solid var(--g-600)', color: 'var(--g-50)', borderRadius: 8, padding: '10px 12px', fontSize: 14, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}
        />

        {!topico && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
            {shortcuts.map(s => (
              <button key={s} onClick={() => setTopico(s)} style={{
                background: 'var(--g-700)', border: '1px solid var(--g-600)',
                color: 'var(--g-300)', borderRadius: 20, padding: '4px 12px', fontSize: 12, cursor: 'pointer',
              }}>{s}</button>
            ))}
          </div>
        )}

        <button onClick={submit} disabled={!topico.trim() || loading}
          style={{
            marginTop: 14, background: topico.trim() && !loading ? '#0F766E' : 'var(--g-700)',
            color: '#fff', border: 'none', borderRadius: 8, padding: '10px 20px',
            fontSize: 13, fontWeight: 700, cursor: topico.trim() && !loading ? 'pointer' : 'default',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
          <Icon name="paper" size={15} />
          Gerar Tutorial
        </button>
      </div>

      {loading && <LoadingSpinner />}
      {error && (
        <div style={{ background: '#450A0A', border: '1px solid #DC262644', borderRadius: 10, padding: 16, color: '#F87171', fontSize: 13 }}>
          ⚠️ {error}
        </div>
      )}

      {result && (
        <div style={{ background: 'var(--g-800)', border: '1px solid #0F766E44', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ background: '#0F766E22', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid #0F766E33', flexWrap: 'wrap' }}>
            <MaxAvatar size={28} />
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--g-100)' }}>{result.titulo}</div>
              <div style={{ fontSize: 11, color: 'var(--g-400)' }}>{result.sistema} · {result.nivel} · {result.tempo_estimado}</div>
            </div>
          </div>
          <div style={{ padding: 18 }}>
            {result.introducao && (
              <p style={{ fontSize: 13, color: 'var(--g-300)', marginBottom: 18, lineHeight: 1.6 }}>{result.introducao}</p>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {result.passos?.map((step) => (
                <div key={step.passo} style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%', background: '#0F766E',
                    color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, fontWeight: 800, flexShrink: 0,
                  }}>{step.passo}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--g-100)', marginBottom: 4 }}>{step.titulo}</div>
                    <div style={{ fontSize: 13, color: 'var(--g-300)', lineHeight: 1.6 }}>{step.descricao}</div>
                    {step.dica && (
                      <div style={{ marginTop: 6, padding: '6px 12px', background: '#0F766E11', border: '1px solid #0F766E33', borderRadius: 6, fontSize: 12, color: '#34D399' }}>
                        💡 {step.dica}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {result.dica_final && (
              <div style={{ marginTop: 16, padding: '10px 14px', background: 'var(--g-700)', borderRadius: 8, fontSize: 13, color: 'var(--g-300)' }}>
                ✅ <strong>Dica final:</strong> {result.dica_final}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Seção Escalar ─────────────────────────────────────────────────────────────

function EscalarTab({ tenantDbId, userId }) {
  const [problema, setProblema]               = useState('');
  const [solucoesTentadas, setSolucoesTentadas] = useState('');
  const [loading, setLoading]                 = useState(false);
  const [result, setResult]                   = useState(null);
  const [error, setError]                     = useState(null);
  const pendingRef                            = useRef(null);

  useEffect(() => {
    if (!tenantDbId) return;
    const channel = supabase
      .channel(`max-esc-${tenantDbId}-${userId}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'agent_runs',
        filter: `tenant_id=eq.${tenantDbId}`,
      }, payload => {
        const run = payload.new;
        if (run.trigger_dev_run_id !== pendingRef.current) return;
        if (run.status === 'success' && run.output) {
          setResult(run.output);
          setLoading(false);
          pendingRef.current = null;
        } else if (run.status === 'failed') {
          setError('Erro ao processar escalação. Tente novamente.');
          setLoading(false);
          pendingRef.current = null;
        }
      })
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [tenantDbId, userId]);

  async function submit() {
    if (!problema.trim() || loading) return;
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const payload = { user_id: userId, problema: problema.trim() };
      if (solucoesTentadas.trim()) payload.solucoes_tentadas = solucoesTentadas.trim();

      const r = await fetch(`${BRIDGE_URL}/agents/max-escalonar/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ tenant_id: tenantDbId, payload }),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error || `Erro ${r.status}`);
      pendingRef.current = body.run_id ?? null;
    } catch (e) {
      setError(e.message);
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', width: '100%' }}>
      <div style={{ background: '#450A0A11', border: '1px solid #DC262633', borderRadius: 10, padding: '12px 16px', marginBottom: 16, fontSize: 13, color: 'var(--g-300)' }}>
        🔴 Use esta aba quando MAX não conseguiu resolver o problema e você precisa que <strong>Eduardo</strong> atenda diretamente.
        MAX irá criar um ticket de escalação com prioridade automática.
      </div>

      <div style={{ background: 'var(--g-800)', border: '1px solid var(--g-700)', borderRadius: 12, padding: 20, marginBottom: 16 }}>
        <label style={{ fontSize: 12, color: 'var(--g-400)', fontWeight: 600, display: 'block', marginBottom: 6 }}>DESCREVA O PROBLEMA</label>
        <textarea
          value={problema}
          onChange={e => setProblema(e.target.value)}
          placeholder="Descreva detalhadamente o problema que o cliente está enfrentando…"
          rows={4}
          style={{ width: '100%', background: 'var(--g-700)', border: '1px solid var(--g-600)', color: 'var(--g-50)', borderRadius: 8, padding: '10px 12px', fontSize: 14, resize: 'vertical', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}
        />

        <label style={{ fontSize: 12, color: 'var(--g-400)', fontWeight: 600, display: 'block', marginTop: 14, marginBottom: 6 }}>O QUE JÁ FOI TENTADO? (opcional)</label>
        <textarea
          value={solucoesTentadas}
          onChange={e => setSolucoesTentadas(e.target.value)}
          placeholder="Ex: Reiniciei o app, verifiquei o horário de funcionamento, liguei para o suporte iFood…"
          rows={3}
          style={{ width: '100%', background: 'var(--g-700)', border: '1px solid var(--g-600)', color: 'var(--g-50)', borderRadius: 8, padding: '10px 12px', fontSize: 14, resize: 'vertical', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}
        />

        <button onClick={submit} disabled={!problema.trim() || loading}
          style={{
            marginTop: 14, background: problema.trim() && !loading ? '#DC2626' : 'var(--g-700)',
            color: '#fff', border: 'none', borderRadius: 8, padding: '10px 20px',
            fontSize: 13, fontWeight: 700, cursor: problema.trim() && !loading ? 'pointer' : 'default',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
          <Icon name="warning" size={15} />
          Criar Escalação
        </button>
      </div>

      {loading && <LoadingSpinner />}
      {error && (
        <div style={{ background: '#450A0A', border: '1px solid #DC262644', borderRadius: 10, padding: 16, color: '#F87171', fontSize: 13 }}>⚠️ {error}</div>
      )}

      {result && (
        <div style={{ background: 'var(--g-800)', border: '1px solid var(--g-600)', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ background: 'var(--g-700)', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid var(--g-600)', flexWrap: 'wrap' }}>
            <MaxAvatar size={28} />
            <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--g-100)' }}>Análise de Escalação</span>
            <PrioridadeBadge prioridade={result.prioridade} />
          </div>
          <div style={{ padding: 18 }}>
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, color: 'var(--g-400)', fontWeight: 700, marginBottom: 4 }}>DECISÃO</div>
              <div style={{ fontSize: 14, color: result.precisa_humano ? '#FCA5A5' : '#6EE7B7', fontWeight: 600 }}>
                {result.precisa_humano ? '🔴 Requer atendimento humano (Eduardo)' : '✅ MAX pode resolver — tente o diagnóstico novamente'}
              </div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, color: 'var(--g-400)', fontWeight: 700, marginBottom: 4 }}>JUSTIFICATIVA</div>
              <div style={{ fontSize: 13, color: 'var(--g-200)', lineHeight: 1.6 }}>{result.motivo}</div>
            </div>

            {result.precisa_humano && (
              <>
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 11, color: 'var(--g-400)', fontWeight: 700, marginBottom: 4 }}>RESUMO PARA EDUARDO</div>
                  <div style={{ fontSize: 13, color: 'var(--g-200)', lineHeight: 1.6, background: 'var(--g-700)', padding: '10px 12px', borderRadius: 8 }}>{result.resumo_ticket}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--g-400)', fontWeight: 700, marginBottom: 4 }}>PRÓXIMO PASSO</div>
                  <div style={{ fontSize: 13, color: 'var(--g-200)', lineHeight: 1.6 }}>{result.proximo_passo}</div>
                </div>
                <div style={{ marginTop: 14, padding: '10px 14px', background: '#052E1611', border: '1px solid #16A34A33', borderRadius: 8, fontSize: 12, color: '#4ADE80' }}>
                  ✅ Ticket criado em <strong>Drafts Pendentes</strong> — Eduardo será notificado.
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Seção Histórico ───────────────────────────────────────────────────────────

function HistoricoTab({ tenantDbId }) {
  const [runs, setRuns]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    if (!tenantDbId) return;
    (async () => {
      const { data } = await supabase
        .from('agent_runs')
        .select('id, trigger_dev_run_id, status, input, output, created_at, completed_at, duration_ms, agent_id')
        .eq('tenant_id', tenantDbId)
        .eq('agent_id', 'max')
        .order('created_at', { ascending: false })
        .limit(50);
      setRuns(data ?? []);
      setLoading(false);
    })();
  }, [tenantDbId]);

  const taskLabel = { 'max-diagnostico': 'Diagnóstico', 'max-tutorial': 'Tutorial', 'max-escalonar': 'Escalação' };

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: 'var(--g-400)', fontSize: 13 }}>
      Carregando histórico…
    </div>
  );

  if (!runs.length) return (
    <div style={{ textAlign: 'center', color: 'var(--g-500)', padding: '48px 24px' }}>
      <MaxAvatar size={48} />
      <p style={{ marginTop: 12, fontSize: 14 }}>Nenhuma execução do MAX ainda.</p>
      <p style={{ fontSize: 12, color: 'var(--g-600)' }}>Use Diagnóstico, Tutorial ou Escalar para começar.</p>
    </div>
  );

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', width: '100%' }}>
      {selected ? (
        <div>
          <button onClick={() => setSelected(null)}
            style={{ background: 'none', border: 'none', color: '#0F766E', cursor: 'pointer', fontSize: 13, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon name="chevleft" size={14} /> Voltar
          </button>
          <div style={{ background: 'var(--g-800)', border: '1px solid var(--g-700)', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ background: 'var(--g-700)', padding: '12px 16px', borderBottom: '1px solid var(--g-600)' }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--g-100)' }}>
                {taskLabel[selected.agent_id] ?? selected.agent_id}
              </div>
              <div style={{ fontSize: 11, color: 'var(--g-400)', marginTop: 2 }}>
                {formatDate(selected.created_at)} · {selected.duration_ms ? `${(selected.duration_ms / 1000).toFixed(1)}s` : '—'} · <StatusBadge status={selected.status} />
              </div>
            </div>
            <div style={{ padding: 16 }}>
              {selected.output?.solution && (
                <div>
                  <div style={{ fontSize: 11, color: 'var(--g-400)', fontWeight: 700, marginBottom: 6 }}>SOLUÇÃO</div>
                  <div style={{ fontSize: 13, color: 'var(--g-200)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{selected.output.solution}</div>
                </div>
              )}
              {selected.output?.passos && (
                <div>
                  <div style={{ fontSize: 11, color: 'var(--g-400)', fontWeight: 700, marginBottom: 8 }}>TUTORIAL: {selected.output.titulo}</div>
                  {selected.output.passos.map(s => (
                    <div key={s.passo} style={{ marginBottom: 10, paddingLeft: 12, borderLeft: '2px solid #0F766E44' }}>
                      <strong style={{ fontSize: 13, color: 'var(--g-100)' }}>{s.passo}. {s.titulo}</strong>
                      <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--g-300)' }}>{s.descricao}</p>
                    </div>
                  ))}
                </div>
              )}
              {selected.output?.resumo_ticket && (
                <div>
                  <div style={{ fontSize: 11, color: 'var(--g-400)', fontWeight: 700, marginBottom: 6 }}>RESUMO DA ESCALAÇÃO</div>
                  <div style={{ fontSize: 13, color: 'var(--g-200)', lineHeight: 1.6 }}>{selected.output.resumo_ticket}</div>
                  <PrioridadeBadge prioridade={selected.output.prioridade} />
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {runs.map(run => (
            <div key={run.id} onClick={() => setSelected(run)}
              style={{
                background: 'var(--g-800)', border: '1px solid var(--g-700)', borderRadius: 10,
                padding: '12px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center',
                gap: 12, transition: 'border-color 0.15s',
              }}
              onMouseEnter={e => e.currentTarget.style.borderColor = '#0F766E66'}
              onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--g-700)'}
            >
              <MaxAvatar size={32} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--g-100)' }}>
                  {taskLabel[run.agent_id] ?? run.agent_id}
                </div>
                <div style={{ fontSize: 11, color: 'var(--g-500)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {run.input?.message ?? run.input?.topico ?? run.input?.problema ?? '—'}
                </div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <StatusBadge status={run.status} />
                <div style={{ fontSize: 10, color: 'var(--g-600)', marginTop: 3 }}>{formatTime(run.created_at)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Tela principal ────────────────────────────────────────────────────────────

export default function MaxScreen({ tenantDbId, userId }) {
  const [tab, setTab] = useState('diagnostico');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

      {/* Header */}
      <div style={{
        padding: '14px 20px', borderBottom: '1px solid var(--g-700)',
        display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0,
      }}>
        <MaxAvatar size={40} />
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--g-50)' }}>MAX</div>
          <div style={{ fontSize: 12, color: 'var(--g-400)' }}>Consultor Técnico · Suporte a Sistemas</div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#10B981' }} />
          <span style={{ fontSize: 11, color: 'var(--g-400)' }}>online</span>
        </div>
      </div>

      {/* Abas */}
      <div style={{ display: 'flex', gap: 0, padding: '0 20px', borderBottom: '1px solid var(--g-700)', flexShrink: 0 }}>
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              padding: '12px 16px', fontSize: 13, fontWeight: 600,
              color: tab === t.id ? '#0F766E' : 'var(--g-400)',
              borderBottom: `2px solid ${tab === t.id ? '#0F766E' : 'transparent'}`,
              display: 'flex', alignItems: 'center', gap: 7, transition: 'color 0.15s',
            }}
          >
            <Icon name={t.icon} size={14} />
            {t.label}
          </button>
        ))}
      </div>

      {/* Conteúdo */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 20px' }}>
        {tab === 'diagnostico' && <DiagnosticoTab tenantDbId={tenantDbId} userId={userId} />}
        {tab === 'tutorial'    && <TutorialTab    tenantDbId={tenantDbId} userId={userId} />}
        {tab === 'escalar'     && <EscalarTab      tenantDbId={tenantDbId} userId={userId} />}
        {tab === 'historico'   && <HistoricoTab    tenantDbId={tenantDbId} />}
      </div>
    </div>
  );
}
