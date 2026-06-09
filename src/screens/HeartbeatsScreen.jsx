import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase.js';

const BRIDGE_URL = import.meta.env.VITE_BRIDGE_URL || 'https://bridge.consultdelivery.com.br';

// ── Constantes ──────────────────────────────────────────────────────────────
const AGENT_OPTIONS = [
  { value: 'deli',         label: 'DELI — COO Digital' },
  { value: 'lara',         label: 'LARA — Marketing' },
  { value: 'vera',         label: 'VERA — BI e Relatórios' },
  { value: 'breno',        label: 'BRENO — Atendimento' },
  { value: 'cora',         label: 'CORA — Cobrança' },
  { value: 'sofia',        label: 'SOFIA — Prospecção' },
  { value: 'max',          label: 'MAX — Suporte Técnico' },
  { value: 'nova',         label: 'NOVA — Automação' },
  { value: 'analise-ifood', label: 'Analista iFood' },
];

const INTERVAL_OPTIONS = [
  { value: 300,   label: 'A cada 5 minutos' },
  { value: 900,   label: 'A cada 15 minutos' },
  { value: 1800,  label: 'A cada 30 minutos' },
  { value: 3600,  label: 'A cada 1 hora' },
  { value: 7200,  label: 'A cada 2 horas' },
  { value: 14400, label: 'A cada 4 horas' },
  { value: 21600, label: 'A cada 6 horas' },
  { value: 86400, label: '1 vez por dia' },
];

const EXECUTION_MODE_OPTIONS = [
  { value: 'api',        label: 'API Anthropic (chave da plataforma)' },
  { value: 'claude_cli', label: 'Claude Code (assinatura do tenant)' },
];

// Estilos compartilhados — tema claro do Console v2 (cv2-*)
const inputStyle  = { display: 'block', width: '100%', marginTop: 4, padding: '8px 12px', background: '#faf9f8', border: '1px solid var(--line)', borderRadius: 4, color: 'var(--tx)', fontSize: 14, boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit' };
const labelStyle  = { color: 'var(--tx2)', fontSize: 13 };
const overlayStyle = { position: 'fixed', inset: 0, background: 'rgba(28,27,26,0.45)', zIndex: 999, display: 'flex' };

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  const diff = d - Date.now();
  if (diff > 0) {
    const min = Math.floor(diff / 60000);
    if (min < 60) return `em ${min}min`;
    const h = Math.floor(min / 60);
    if (h < 24) return `em ${h}h`;
    return `em ${Math.floor(h / 24)}d`;
  }
  const abs = Math.abs(diff);
  const min = Math.floor(abs / 60000);
  if (min < 60) return `há ${min}min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h}h`;
  return `há ${Math.floor(h / 24)}d`;
}

function fmtInterval(seconds) {
  const opt = INTERVAL_OPTIONS.find(o => o.value === seconds);
  if (opt) return opt.label;
  if (seconds < 3600) return `${Math.round(seconds / 60)}min`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h`;
  return `${Math.round(seconds / 86400)}d`;
}

// ── Modal de criação/edição ─────────────────────────────────────────────────
function HeartbeatModal({ heartbeat, onClose, onSaved, bridgeHeaders }) {
  const isEdit = !!heartbeat?.id;
  const [form, setForm] = useState({
    name:             heartbeat?.name             || '',
    description:      heartbeat?.description      || '',
    agent_slug:       heartbeat?.agent_slug        || 'deli',
    prompt:           heartbeat?.prompt            || '',
    decision_prompt:  heartbeat?.decision_prompt   || '',
    interval_seconds: heartbeat?.interval_seconds  || 3600,
    execution_mode:   heartbeat?.execution_mode    || 'api',
    max_tokens:       heartbeat?.max_tokens        || 2048,
    timeout_seconds:  heartbeat?.timeout_seconds   || 120,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  async function handleSave() {
    if (!form.name.trim())   return setError('Nome obrigatório');
    if (!form.prompt.trim()) return setError('Prompt obrigatório');
    setSaving(true);
    setError('');
    try {
      const url    = isEdit ? `${BRIDGE_URL}/api/heartbeats/${heartbeat.id}` : `${BRIDGE_URL}/api/heartbeats`;
      const method = isEdit ? 'PATCH' : 'POST';
      const r = await fetch(url, {
        method,
        headers: { ...bridgeHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          interval_seconds: Number(form.interval_seconds),
          max_tokens:       Number(form.max_tokens),
          timeout_seconds:  Number(form.timeout_seconds),
        }),
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        throw new Error(e.error || `HTTP ${r.status}`);
      }
      const saved = await r.json();
      onSaved(saved, isEdit);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      onClick={e => e.target === e.currentTarget && onClose()}
      style={{ ...overlayStyle, alignItems: 'center', justifyContent: 'center' }}
    >
      <div style={{ maxWidth: 600, width: '95%', maxHeight: '90vh', overflowY: 'auto', background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 8, padding: 24, boxShadow: '0 12px 40px rgba(0,0,0,0.18)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: 'var(--tx)' }}>
            {isEdit ? 'Editar Heartbeat' : 'Novo Heartbeat'}
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--tx2)', fontSize: 20, cursor: 'pointer' }}>×</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Nome */}
          <label style={labelStyle}>
            Nome *
            <input
              value={form.name}
              onChange={e => set('name', e.target.value)}
              placeholder="Ex: Verificar anomalias VERA"
              style={inputStyle}
            />
          </label>

          {/* Descrição */}
          <label style={labelStyle}>
            Descrição
            <input
              value={form.description}
              onChange={e => set('description', e.target.value)}
              placeholder="Para que serve este heartbeat?"
              style={inputStyle}
            />
          </label>

          {/* Agente */}
          <label style={labelStyle}>
            Agente
            <select
              value={form.agent_slug}
              onChange={e => set('agent_slug', e.target.value)}
              style={inputStyle}
            >
              {AGENT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>

          {/* Prompt */}
          <label style={labelStyle}>
            Prompt (tarefa do agente) *
            <textarea
              value={form.prompt}
              onChange={e => set('prompt', e.target.value)}
              rows={4}
              placeholder="O que o agente deve fazer quando acordar? Ex: Verificar se há métricas anômalas nas lojas ativas nas últimas 4 horas..."
              style={{ ...inputStyle, resize: 'vertical' }}
            />
          </label>

          {/* Decision prompt */}
          <label style={labelStyle}>
            Condição para agir <span style={{ color: 'var(--tx2)', fontWeight: 400 }}>(opcional — se preenchido, agente avalia se deve agir)</span>
            <textarea
              value={form.decision_prompt}
              onChange={e => set('decision_prompt', e.target.value)}
              rows={2}
              placeholder="Ex: Só aja se houver alguma anomalia crítica. Caso contrário, responda apenas SKIP."
              style={{ ...inputStyle, resize: 'vertical' }}
            />
          </label>

          {/* Intervalo + Modo */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <label style={labelStyle}>
              Frequência
              <select
                value={form.interval_seconds}
                onChange={e => set('interval_seconds', Number(e.target.value))}
                style={inputStyle}
              >
                {INTERVAL_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>

            <label style={labelStyle}>
              Modo de execução
              <select
                value={form.execution_mode}
                onChange={e => set('execution_mode', e.target.value)}
                style={inputStyle}
              >
                {EXECUTION_MODE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>
          </div>

          {error && (
            <div style={{ color: 'var(--red)', fontSize: 13, padding: '8px 12px', background: 'var(--red-soft)', borderRadius: 6 }}>{error}</div>
          )}

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 6 }}>
            <button onClick={onClose} className="cv2-btn sec">
              Cancelar
            </button>
            <button onClick={handleSave} disabled={saving} className="cv2-btn" style={{ opacity: saving ? 0.7 : 1 }}>
              {saving ? 'Salvando…' : isEdit ? 'Salvar alterações' : 'Criar heartbeat'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── RunsModal — histórico de execuções ────────────────────────────────────
function RunsModal({ heartbeat, onClose, bridgeHeaders }) {
  const [runs, setRuns]       = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${BRIDGE_URL}/api/heartbeats/${heartbeat.id}/runs?limit=20`, { headers: bridgeHeaders })
      .then(r => r.json())
      .then(data => { setRuns(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [heartbeat.id]);

  const statusColor = { success: 'var(--green)', failed: 'var(--red)', skipped: 'var(--tx2)', running: 'var(--amber)' };

  return (
    <div
      onClick={e => e.target === e.currentTarget && onClose()}
      style={{ ...overlayStyle, alignItems: 'flex-start', justifyContent: 'center', paddingTop: '10vh' }}
    >
      <div style={{ width: '90%', maxWidth: 700, maxHeight: '80vh', background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 8, padding: 24, overflowY: 'auto', boxShadow: '0 12px 40px rgba(0,0,0,0.18)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
          <h3 style={{ margin: 0, color: 'var(--tx)', fontSize: 16, fontWeight: 800 }}>Execuções — {heartbeat.name}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--tx2)', fontSize: 20, cursor: 'pointer' }}>×</button>
        </div>

        {loading ? (
          <div style={{ color: 'var(--tx2)', textAlign: 'center', padding: 40 }}>Carregando…</div>
        ) : runs.length === 0 ? (
          <div style={{ color: 'var(--tx2)', textAlign: 'center', padding: 40 }}>Nenhuma execução ainda</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {runs.map(run => (
              <div key={run.id} style={{ background: 'var(--bg)', borderRadius: 6, padding: '12px 16px', border: '1px solid var(--line)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ color: statusColor[run.status] || 'var(--tx)', fontSize: 13, fontWeight: 600, textTransform: 'capitalize' }}>
                    {run.status}
                  </span>
                  <div style={{ display: 'flex', gap: 16, color: 'var(--tx2)', fontSize: 12 }}>
                    {run.tokens_used && <span>{run.tokens_used.toLocaleString()} tokens</span>}
                    {run.cost_usd && <span>${Number(run.cost_usd).toFixed(4)}</span>}
                    {run.duration_ms && <span>{(run.duration_ms / 1000).toFixed(1)}s</span>}
                    <span>{fmtDate(run.started_at)}</span>
                  </div>
                </div>
                {run.action_summary && (
                  <div style={{ color: 'var(--tx)', fontSize: 13, lineHeight: 1.5, whiteSpace: 'pre-wrap', maxHeight: 80, overflow: 'hidden' }}>
                    {run.action_summary}
                  </div>
                )}
                {run.error_message && (
                  <div style={{ color: 'var(--red)', fontSize: 12, marginTop: 4 }}>{run.error_message}</div>
                )}
                <div style={{ color: 'var(--tx2)', fontSize: 11, marginTop: 4, textTransform: 'uppercase' }}>
                  {run.trigger_type} · {run.execution_mode || 'api'}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── HeartbeatCard ──────────────────────────────────────────────────────────
function HeartbeatCard({ hb, onToggle, onTrigger, onEdit, onDelete, onViewRuns, triggering }) {
  const statusDot = hb.enabled
    ? (hb.last_run_at ? 'var(--green)' : 'var(--amber)')
    : '#cbc9c5';

  const agentLabel = AGENT_OPTIONS.find(a => a.value === hb.agent_slug)?.label || hb.agent_slug;

  return (
    <div className="cv2-card" style={{
      borderColor: hb.enabled ? 'rgba(183,12,0,0.28)' : 'var(--line)',
      transition: 'border-color 0.2s',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        {/* Status dot */}
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: statusDot, marginTop: 5, flexShrink: 0 }} />

        {/* Conteúdo */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <h3 style={{ margin: 0, fontSize: 15, color: 'var(--tx)', fontWeight: 700 }}>{hb.name}</h3>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <button
                onClick={() => onToggle(hb)}
                style={{
                  padding: '4px 12px', borderRadius: 20, fontSize: 12, cursor: 'pointer',
                  background: hb.enabled ? 'var(--green-soft)' : 'var(--bg)',
                  border: `1px solid ${hb.enabled ? 'rgba(30,125,67,0.35)' : 'var(--line)'}`,
                  color: hb.enabled ? 'var(--green)' : 'var(--tx2)',
                }}
              >
                {hb.enabled ? 'Ativo' : 'Inativo'}
              </button>
            </div>
          </div>

          {hb.description && (
            <p style={{ margin: '4px 0 8px', color: 'var(--tx2)', fontSize: 13, lineHeight: 1.4 }}>{hb.description}</p>
          )}

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', color: 'var(--tx2)', fontSize: 12, marginTop: 6 }}>
            <span>🤖 {agentLabel}</span>
            <span>⏱ {fmtInterval(hb.interval_seconds)}</span>
            <span>📡 {hb.execution_mode === 'claude_cli' ? 'Claude Assinatura' : 'API'}</span>
            {hb.last_run_at && <span>Último: {fmtDate(hb.last_run_at)}</span>}
            {hb.next_run_at && hb.enabled && <span>Próximo: {fmtDate(hb.next_run_at)}</span>}
            {hb.run_count > 0 && <span>{hb.run_count} runs</span>}
          </div>

          {/* Prompt preview */}
          <div style={{ marginTop: 8, padding: '6px 10px', background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: 6, color: 'var(--tx2)', fontSize: 12, lineHeight: 1.5 }}>
            {hb.prompt.slice(0, 120)}{hb.prompt.length > 120 ? '…' : ''}
          </div>
        </div>
      </div>

      {/* Ações */}
      <div style={{ display: 'flex', gap: 8, marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--line)', flexWrap: 'wrap' }}>
        <button
          onClick={() => onTrigger(hb)}
          disabled={triggering === hb.id}
          className="cv2-btn danger"
          style={{ cursor: triggering === hb.id ? 'not-allowed' : 'pointer', opacity: triggering === hb.id ? 0.6 : 1 }}
        >
          ▶ {triggering === hb.id ? 'Executando…' : 'Executar agora'}
        </button>
        <button onClick={() => onViewRuns(hb)} className="cv2-btn sec">
          📋 Histórico
        </button>
        <button onClick={() => onEdit(hb)} className="cv2-btn sec">
          ✏️ Editar
        </button>
        <button onClick={() => onDelete(hb)} className="cv2-btn danger" style={{ marginLeft: 'auto' }}>
          🗑 Remover
        </button>
      </div>
    </div>
  );
}

// ── HeartbeatsScreen principal ─────────────────────────────────────────────
export default function HeartbeatsScreen({ tenantDbId, onNavigate }) {
  const [heartbeats, setHeartbeats] = useState([]);
  const [loading, setLoading]       = useState(true);
  const [showModal, setShowModal]   = useState(false);
  const [editHb, setEditHb]         = useState(null);
  const [runsHb, setRunsHb]         = useState(null);
  const [triggering, setTriggering] = useState(null);
  const [trigResult, setTrigResult] = useState(null);
  const [headers, setHeaders]       = useState({});

  // Obter JWT uma vez
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const token = data?.session?.access_token;
      if (token) setHeaders({ Authorization: `Bearer ${token}` });
    });
  }, []);

  // Carregar heartbeats
  const loadHeartbeats = useCallback(async () => {
    if (!headers.Authorization) return;
    setLoading(true);
    try {
      const r = await fetch(`${BRIDGE_URL}/api/heartbeats`, { headers });
      const data = await r.json();
      setHeartbeats(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('heartbeats load error', e);
    } finally {
      setLoading(false);
    }
  }, [headers]);

  useEffect(() => { loadHeartbeats(); }, [loadHeartbeats]);

  async function handleToggle(hb) {
    try {
      const r = await fetch(`${BRIDGE_URL}/api/heartbeats/${hb.id}`, {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !hb.enabled }),
      });
      if (r.ok) {
        setHeartbeats(prev => prev.map(h => h.id === hb.id ? { ...h, enabled: !hb.enabled } : h));
      }
    } catch (e) { console.error(e); }
  }

  async function handleTrigger(hb) {
    setTriggering(hb.id);
    setTrigResult(null);
    try {
      const r = await fetch(`${BRIDGE_URL}/api/heartbeats/${hb.id}/trigger`, {
        method: 'POST',
        headers,
      });
      const result = await r.json();
      setTrigResult({ id: hb.id, ...result });
      loadHeartbeats();
    } catch (e) {
      setTrigResult({ id: hb.id, status: 'failed', error: e.message });
    } finally {
      setTriggering(null);
    }
  }

  async function handleDelete(hb) {
    if (!confirm(`Remover heartbeat "${hb.name}"?`)) return;
    try {
      await fetch(`${BRIDGE_URL}/api/heartbeats/${hb.id}`, { method: 'DELETE', headers });
      setHeartbeats(prev => prev.filter(h => h.id !== hb.id));
    } catch (e) { console.error(e); }
  }

  function handleSaved(saved, isEdit) {
    if (isEdit) {
      setHeartbeats(prev => prev.map(h => h.id === saved.id ? saved : h));
    } else {
      setHeartbeats(prev => [saved, ...prev]);
    }
    setShowModal(false);
    setEditHb(null);
  }

  const activeCount   = heartbeats.filter(h => h.enabled).length;
  const inactiveCount = heartbeats.length - activeCount;

  return (
    <div className="cv2-ct" style={{ maxWidth: 900, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1>Heartbeats</h1>
          <div className="cv2-rule" />
          <div className="cv2-sub">
            Agentes proativos que acordam em intervalos e agem quando necessário
          </div>
        </div>
        <button onClick={() => { setEditHb(null); setShowModal(true); }} className="cv2-btn">
          + Novo Heartbeat
        </button>
      </div>

      {/* Stats */}
      {heartbeats.length > 0 && (
        <div className="cv2-kpis" style={{ marginBottom: 20 }}>
          {[
            { label: 'Total',    value: heartbeats.length, color: 'var(--tx)' },
            { label: 'Ativos',   value: activeCount,       color: 'var(--green)' },
            { label: 'Inativos', value: inactiveCount,     color: 'var(--tx2)' },
          ].map(s => (
            <div key={s.label} className="cv2-kpi">
              <div className="l">{s.label}</div>
              <div className="v" style={{ color: s.color }}>{s.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Resultado do último trigger manual */}
      {trigResult && (
        <div style={{
          marginBottom: 16, padding: '12px 16px',
          background: trigResult.status === 'success' ? 'var(--green-soft)' : trigResult.status === 'skipped' ? '#f0eeec' : 'var(--red-soft)',
          border: `1px solid ${trigResult.status === 'success' ? 'rgba(30,125,67,0.3)' : trigResult.status === 'skipped' ? 'var(--line)' : 'rgba(183,12,0,0.3)'}`,
          borderRadius: 6,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: trigResult.status === 'success' ? 'var(--green)' : trigResult.status === 'skipped' ? 'var(--tx2)' : 'var(--red)', fontWeight: 600, fontSize: 13 }}>
              {trigResult.status === 'success' ? '✅ Execução concluída' : trigResult.status === 'skipped' ? '⏭ Skipped — condição não atendida' : '❌ Execução falhou'}
            </span>
            <button onClick={() => setTrigResult(null)} style={{ background: 'none', border: 'none', color: 'var(--tx2)', cursor: 'pointer', fontSize: 16 }}>×</button>
          </div>
          {trigResult.output && (
            <div style={{ marginTop: 8, color: 'var(--tx)', fontSize: 13, lineHeight: 1.5, whiteSpace: 'pre-wrap', maxHeight: 120, overflow: 'hidden' }}>
              {trigResult.output.slice(0, 400)}
            </div>
          )}
          {trigResult.duration_ms && (
            <div style={{ marginTop: 6, color: 'var(--tx2)', fontSize: 12 }}>
              {(trigResult.duration_ms / 1000).toFixed(1)}s · modo: {trigResult.mode || 'api'}
            </div>
          )}
        </div>
      )}

      {/* Lista */}
      {loading ? (
        <div style={{ color: 'var(--tx2)', textAlign: 'center', padding: 60 }}>Carregando heartbeats…</div>
      ) : heartbeats.length === 0 ? (
        <div className="cv2-card" style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--tx2)' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>💓</div>
          <div style={{ fontSize: 16, color: 'var(--tx)', marginBottom: 8, fontWeight: 600 }}>Nenhum heartbeat ainda</div>
          <div style={{ fontSize: 13, marginBottom: 24 }}>Crie o primeiro agente proativo da sua plataforma</div>
          <button onClick={() => { setEditHb(null); setShowModal(true); }} className="cv2-btn">
            Criar primeiro heartbeat
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {heartbeats.map(hb => (
            <HeartbeatCard
              key={hb.id}
              hb={hb}
              onToggle={handleToggle}
              onTrigger={handleTrigger}
              onEdit={h => { setEditHb(h); setShowModal(true); }}
              onDelete={handleDelete}
              onViewRuns={setRunsHb}
              triggering={triggering}
            />
          ))}
        </div>
      )}

      {/* Modais */}
      {showModal && (
        <HeartbeatModal
          heartbeat={editHb}
          onClose={() => { setShowModal(false); setEditHb(null); }}
          onSaved={handleSaved}
          bridgeHeaders={headers}
        />
      )}
      {runsHb && (
        <RunsModal
          heartbeat={runsHb}
          onClose={() => setRunsHb(null)}
          bridgeHeaders={headers}
        />
      )}
    </div>
  );
}
