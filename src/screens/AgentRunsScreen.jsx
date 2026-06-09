import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase.js';

const BRIDGE_URL = import.meta.env.VITE_BRIDGE_URL || 'https://bridge.consultdelivery.com.br';

const AGENT_OPTIONS = [
  { value: '',               label: 'Todos os agentes' },
  { value: 'deli',           label: 'DELI' },
  { value: 'lara',           label: 'LARA' },
  { value: 'vera',           label: 'VERA' },
  { value: 'breno',          label: 'BRENO' },
  { value: 'cora',           label: 'CORA' },
  { value: 'sofia',          label: 'SOFIA' },
  { value: 'max',            label: 'MAX' },
  { value: 'nova',           label: 'NOVA' },
  { value: 'analise-ifood',  label: 'Analista iFood' },
  { value: 'chat-ai',        label: 'Chat AI' },
];

const STATUS_OPTIONS = [
  { value: '',        label: 'Todos os status' },
  { value: 'success', label: 'Sucesso' },
  { value: 'failed',  label: 'Falhou' },
  { value: 'running', label: 'Em execução' },
  { value: 'queued',  label: 'Na fila' },
];

function statusBadge(status) {
  const map = {
    success: { bg: 'var(--green-soft)', color: 'var(--green)', label: 'Sucesso' },
    failed:  { bg: 'var(--red-soft)', color: 'var(--red)', label: 'Falhou' },
    running: { bg: 'var(--amber-soft)', color: 'var(--amber)', label: 'Executando' },
    queued:  { bg: '#e6effd', color: '#1d4ed8', label: 'Na fila' },
  };
  return map[status] || { bg: 'var(--bg)', color: 'var(--tx2)', label: status };
}

function fmtCost(val) {
  if (val == null) return '—';
  const n = parseFloat(val);
  if (isNaN(n)) return '—';
  if (n === 0) return '$0.00';
  if (n < 0.001) return `$${n.toFixed(6)}`;
  return `$${n.toFixed(4)}`;
}

function fmtDuration(ms) {
  if (ms == null) return '—';
  if (ms < 1000)  return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// ── Card de stat ─────────────────────────────────────────────────────────────
function StatCard({ label, value, color }) {
  return (
    <div style={{
      background: 'var(--panel)', border: '1px solid var(--line)',
      borderRadius: 10, padding: '16px 20px', flex: '1 1 160px',
    }}>
      <div style={{ fontSize: 11, color: 'var(--tx2)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color: color || 'var(--tx)' }}>{value}</div>
    </div>
  );
}

// ── JSON expandido ────────────────────────────────────────────────────────────
function JsonBlock({ data }) {
  if (data == null) return <span style={{ color: 'var(--tx2)' }}>—</span>;
  try {
    const text = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
    return (
      <pre style={{
        margin: 0, fontSize: 11, color: 'var(--tx)', background: '#faf9f8',
        borderRadius: 6, padding: 10, overflowX: 'auto', maxHeight: 200,
        border: '1px solid var(--line)',
      }}>
        {text}
      </pre>
    );
  } catch {
    return <span style={{ color: 'var(--tx2)', fontSize: 12 }}>{String(data)}</span>;
  }
}

// ── Tela principal ────────────────────────────────────────────────────────────
export default function AgentRunsScreen({ tenantDbId }) {
  const [runs,        setRuns]        = useState([]);
  const [stats,       setStats]       = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState('');
  const [filterAgent, setFilterAgent] = useState('');
  const [filterStatus,setFilterStatus]= useState('');
  const [page,        setPage]        = useState(0);
  const [expanded,    setExpanded]    = useState({}); // id → bool
  const [bridgeHeaders, setBridgeHeaders] = useState({});

  const PAGE_SIZE = 50;

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const token = data?.session?.access_token;
      if (token) setBridgeHeaders({ Authorization: `Bearer ${token}` });
    });
  }, []);

  const loadStats = useCallback(async () => {
    try {
      const r = await fetch(`${BRIDGE_URL}/api/agent-runs/stats`, { headers: bridgeHeaders });
      if (!r.ok) return;
      setStats(await r.json());
    } catch { /* stats são opcionais */ }
  }, [bridgeHeaders]);

  const loadRuns = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = [`limit=${PAGE_SIZE}`, `offset=${page * PAGE_SIZE}`];
      if (filterAgent)  params.push(`agent_slug=${encodeURIComponent(filterAgent)}`);
      if (filterStatus) params.push(`status=${encodeURIComponent(filterStatus)}`);

      const r = await fetch(`${BRIDGE_URL}/api/agent-runs?${params.join('&')}`, { headers: bridgeHeaders });
      if (!r.ok) { const d = await r.json(); throw new Error(d.error || r.statusText); }
      setRuns(await r.json());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [filterAgent, filterStatus, page, bridgeHeaders]);

  useEffect(() => {
    if (Object.keys(bridgeHeaders).length) {
      loadStats();
      loadRuns();
    }
  }, [loadStats, loadRuns, bridgeHeaders]);

  // Resetar página ao mudar filtros
  useEffect(() => { setPage(0); }, [filterAgent, filterStatus]);

  const s = {
    screen:  { padding: '24px 20px', color: 'var(--tx)', fontFamily: 'inherit' },
    title:   { margin: '0 0 20px', fontSize: 22, fontWeight: 700 },
    stats:   { display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' },
    filters: { display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' },
    sel:     { background: '#faf9f8', border: '1px solid var(--line)', borderRadius: 6,
               padding: '7px 10px', color: 'var(--tx)', fontSize: 13, cursor: 'pointer' },
    table:   { width: '100%', borderCollapse: 'collapse' },
    th:      { textAlign: 'left', padding: '10px 12px', fontSize: 11, color: 'var(--tx2)',
               textTransform: 'uppercase', letterSpacing: 0.8, borderBottom: '1px solid var(--line)' },
    td:      { padding: '10px 12px', fontSize: 13, borderBottom: '1px solid var(--line)', verticalAlign: 'top' },
    pagination: { display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16, alignItems: 'center' },
    pageBtn: { padding: '6px 14px', borderRadius: 6, background: 'var(--panel)', border: '1px solid var(--line)', color: 'var(--tx2)', cursor: 'pointer', fontSize: 13 },
  };

  return (
    <div style={s.screen}>
      <h1 style={s.title}>Histórico de Execuções</h1>

      {/* Stats cards */}
      {stats && (
        <div style={s.stats}>
          <StatCard label="Total de runs"    value={stats.total_runs}                                   />
          <StatCard label="Taxa de sucesso"  value={`${stats.success_rate}%`}   color="var(--green)"    />
          <StatCard label="Custo total"      value={fmtCost(stats.total_cost_usd)} color="var(--amber)" />
          <StatCard label="Runs hoje"        value={stats.runs_today}            color="#1d4ed8"         />
        </div>
      )}

      {/* Filtros */}
      <div style={s.filters}>
        <select style={s.sel} value={filterAgent} onChange={e => setFilterAgent(e.target.value)}>
          {AGENT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select style={s.sel} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      {loading && <p style={{ color: 'var(--tx2)' }}>Carregando...</p>}
      {error   && <p style={{ color: 'var(--red)' }}>Erro: {error}</p>}

      {!loading && !error && runs.length === 0 && (
        <p style={{ color: 'var(--tx2)', marginTop: 40, textAlign: 'center' }}>Nenhuma execução encontrada.</p>
      )}

      {!loading && runs.length > 0 && (
        <>
          <div style={{ overflowX: 'auto' }}>
            <table style={s.table}>
              <thead>
                <tr>
                  <th style={s.th}>Agente</th>
                  <th style={s.th}>Status</th>
                  <th style={s.th}>Duração</th>
                  <th style={s.th}>Custo</th>
                  <th style={s.th}>Data</th>
                </tr>
              </thead>
              <tbody>
                {runs.map(run => {
                  const badge   = statusBadge(run.status);
                  const isOpen  = expanded[run.id];
                  return (
                    <React.Fragment key={run.id}>
                      <tr
                        onClick={() => setExpanded(prev => ({ ...prev, [run.id]: !isOpen }))}
                        style={{ cursor: 'pointer', background: isOpen ? 'rgba(0,0,0,0.03)' : 'transparent' }}
                      >
                        <td style={s.td}>
                          <span style={{ fontWeight: 600 }}>{(run.agent_id || '—').toUpperCase()}</span>
                        </td>
                        <td style={s.td}>
                          <span style={{
                            display: 'inline-block', padding: '3px 8px', borderRadius: 4,
                            background: badge.bg, color: badge.color, fontSize: 12, fontWeight: 600,
                          }}>
                            {badge.label}
                          </span>
                        </td>
                        <td style={{ ...s.td, color: 'var(--tx2)' }}>{fmtDuration(run.duration_ms)}</td>
                        <td style={{ ...s.td, color: 'var(--amber)' }}>{fmtCost(run.cost_usd)}</td>
                        <td style={{ ...s.td, color: 'var(--tx2)', fontSize: 12 }}>{fmtDate(run.created_at)}</td>
                      </tr>

                      {isOpen && (
                        <tr style={{ background: 'var(--bg)' }}>
                          <td colSpan={5} style={{ padding: '12px 16px' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                              <div>
                                <div style={{ fontSize: 11, color: 'var(--tx2)', marginBottom: 6, textTransform: 'uppercase' }}>Input</div>
                                <JsonBlock data={run.input} />
                              </div>
                              <div>
                                <div style={{ fontSize: 11, color: 'var(--tx2)', marginBottom: 6, textTransform: 'uppercase' }}>Output</div>
                                <JsonBlock data={run.output} />
                              </div>
                            </div>
                            <div style={{ marginTop: 8, fontSize: 11, color: 'var(--tx2)' }}>
                              ID: {run.id}
                              {run.completed_at && ` · Concluído: ${fmtDate(run.completed_at)}`}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Paginação */}
          <div style={s.pagination}>
            <span style={{ fontSize: 12, color: 'var(--tx2)' }}>Página {page + 1}</span>
            <button style={s.pageBtn} disabled={page === 0} onClick={() => setPage(p => Math.max(0, p - 1))}>
              ← Anterior
            </button>
            <button style={s.pageBtn} disabled={runs.length < PAGE_SIZE} onClick={() => setPage(p => p + 1)}>
              Próxima →
            </button>
          </div>
        </>
      )}
    </div>
  );
}
