import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase.js';

// ============================================================
// T3 · Execucoes (log de agent_runs)
// Fonte: agent_runs + agents (nome)
// P6: limit(1000) — últimos registros, ordenado desc
// Filtros: agente, status, janela temporal (7/15/30d)
// Expand: input/output JSONB inline
// ============================================================

const STATUS_CLS = {
  ok: 'ok', completed: 'ok', success: 'ok',
  failed: 'err', error: 'err', timeout: 'err',
  running: 'warn', pending: 'mut',
};

const JANELAS = [
  { label: '7d', dias: 7 },
  { label: '15d', dias: 15 },
  { label: '30d', dias: 30 },
];

function fmtDur(ms) {
  if (!ms || ms < 0) return '—';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function fmtData(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function JsonBlock({ label, data }) {
  const [aberto, setAberto] = useState(false);
  if (!data) return null;
  const txt = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  const preview = txt.length > 120 ? txt.slice(0, 120) + '…' : txt;
  return (
    <div style={{ marginTop: 6 }}>
      <button
        onClick={() => setAberto(v => !v)}
        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11.5, color: 'var(--tx2)', padding: 0, fontFamily: 'inherit' }}
      >
        {aberto ? '▾' : '▸'} {label}
      </button>
      <pre style={{
        display: aberto ? 'block' : 'none',
        margin: '4px 0 0', padding: '8px 10px',
        background: 'var(--line)', borderRadius: 4,
        fontSize: 11, lineHeight: 1.6,
        whiteSpace: 'pre-wrap', wordBreak: 'break-all',
        maxHeight: 240, overflowY: 'auto',
        color: 'var(--ink)',
      }}>{txt}</pre>
      {!aberto && <div style={{ fontSize: 11, color: 'var(--tx2)', marginTop: 2, fontFamily: 'monospace' }}>{preview}</div>}
    </div>
  );
}

export default function Execucoes({ tenantDbId }) {
  const [runs, setRuns] = useState(null);
  const [agentes, setAgentes] = useState({});
  const [erro, setErro] = useState(null);
  const [janela, setJanela] = useState(15);
  const [filtroAgente, setFiltroAgente] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('');
  const [expandido, setExpandido] = useState(null);

  const carregar = useCallback(async () => {
    if (!tenantDbId) return;
    try {
      const desde = new Date(Date.now() - janela * 86400000).toISOString();
      let q = supabase
        .from('agent_runs')
        .select('id, agent_id, status, cost_usd, duration_ms, created_at, completed_at, input, output, trigger_dev_run_id')
        .eq('tenant_id', tenantDbId)
        .gte('created_at', desde)
        .order('created_at', { ascending: false })
        .limit(1000);
      if (filtroAgente) q = q.eq('agent_id', filtroAgente);
      if (filtroStatus) q = q.eq('status', filtroStatus);

      const [{ data: rows, error: e1 }, { data: ag, error: e2 }] = await Promise.all([
        q,
        supabase.from('agents').select('id, name, letter, color'),
      ]);
      if (e1 || e2) throw (e1 || e2);

      const agMap = {};
      for (const a of (ag ?? [])) agMap[a.id] = a;

      setRuns(rows ?? []);
      setAgentes(agMap);
    } catch (err) {
      setErro(err?.message || 'erro ao carregar');
    }
  }, [tenantDbId, janela, filtroAgente, filtroStatus]);

  useEffect(() => { carregar(); }, [carregar]);

  // ids de agentes distintos nos runs (para o select de filtro)
  const agentesNosPeriodo = runs
    ? [...new Set(runs.map(r => r.agent_id).filter(Boolean))]
    : [];

  const statusNoPeriodo = runs
    ? [...new Set(runs.map(r => r.status).filter(Boolean))]
    : [];

  // KPIs
  const total = runs?.length ?? 0;
  const ok = runs?.filter(r => ['ok', 'completed', 'success'].includes(r.status)).length ?? 0;
  const falhas = runs?.filter(r => ['failed', 'error', 'timeout'].includes(r.status)).length ?? 0;
  const custoTotal = (runs ?? []).reduce((s, r) => s + (Number(r.cost_usd) || 0), 0);
  const durMedia = (() => {
    const comDur = (runs ?? []).filter(r => r.duration_ms > 0);
    if (!comDur.length) return null;
    return comDur.reduce((s, r) => s + r.duration_ms, 0) / comDur.length;
  })();

  const fmt = n => (n ?? 0).toLocaleString('pt-BR');

  return (
    <div>
      <h1>Execucoes <span className="cv2-mock" style={{ background: 'var(--green-soft)', color: 'var(--green)' }}>DADOS REAIS · P6</span></h1>
      <div className="cv2-rule" />
      <div className="cv2-sub">Log de execucoes de agentes deste workspace — max 1000 registros por janela.{erro ? ` · erro: ${erro}` : ''}</div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16, alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 4 }}>
          {JANELAS.map(j => (
            <button
              key={j.dias}
              className={`cv2-btn${janela === j.dias ? '' : ' sec'}`}
              style={{ fontSize: 12, padding: '5px 10px' }}
              onClick={() => setJanela(j.dias)}
            >{j.label}</button>
          ))}
        </div>
        <select
          value={filtroAgente}
          onChange={e => setFiltroAgente(e.target.value)}
          style={{ fontFamily: 'inherit', fontSize: 12.5, padding: '5px 8px', border: '1px solid var(--line)', borderRadius: 4, background: 'var(--bg)', color: 'var(--ink)' }}
        >
          <option value="">Todos os agentes</option>
          {agentesNosPeriodo.map(id => (
            <option key={id} value={id}>{agentes[id]?.name || id}</option>
          ))}
        </select>
        <select
          value={filtroStatus}
          onChange={e => setFiltroStatus(e.target.value)}
          style={{ fontFamily: 'inherit', fontSize: 12.5, padding: '5px 8px', border: '1px solid var(--line)', borderRadius: 4, background: 'var(--bg)', color: 'var(--ink)' }}
        >
          <option value="">Todos os status</option>
          {statusNoPeriodo.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <button className="cv2-btn sec" style={{ fontSize: 12 }} onClick={carregar}>Atualizar</button>
      </div>

      {/* KPIs */}
      <div className="cv2-kpis">
        <div className="cv2-kpi">
          <div className="l">Execucoes no periodo</div>
          <div className="v">{runs ? fmt(total) : '…'}</div>
          <div className="d mut">{janela}d · limit 1000</div>
        </div>
        <div className="cv2-kpi">
          <div className="l">Ok / Falhas</div>
          <div className="v">{runs ? `${fmt(ok)} / ${fmt(falhas)}` : '…'}</div>
          <div className={`d${falhas > 0 ? ' neg' : ' mut'}`}>{runs && total ? `${Math.round((ok / total) * 100)}% sucesso` : ''}</div>
        </div>
        <div className="cv2-kpi">
          <div className="l">Custo total</div>
          <div className="v">{runs ? `US$ ${custoTotal.toFixed(4)}` : '…'}</div>
          <div className="d mut">no periodo filtrado</div>
        </div>
        <div className="cv2-kpi">
          <div className="l">Duracao media</div>
          <div className="v">{runs ? fmtDur(durMedia) : '…'}</div>
          <div className="d mut">runs com duracao registrada</div>
        </div>
      </div>

      {/* Tabela */}
      {!runs && <div style={{ color: 'var(--tx2)', fontSize: 13 }}>Carregando...</div>}
      {runs && !runs.length && (
        <div className="cv2-card" style={{ textAlign: 'center', color: 'var(--tx2)' }}>
          Nenhuma execucao encontrada no periodo com os filtros aplicados.
        </div>
      )}
      {runs && runs.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ minWidth: 700 }}>
            <thead>
              <tr>
                <th style={{ width: 130 }}>Data</th>
                <th>Agente</th>
                <th style={{ width: 90 }}>Status</th>
                <th style={{ width: 80 }}>Duracao</th>
                <th style={{ width: 100 }}>Custo</th>
                <th style={{ width: 60 }}></th>
              </tr>
            </thead>
            <tbody>
              {runs.map(r => {
                const ag = agentes[r.agent_id];
                const isExp = expandido === r.id;
                const stCls = STATUS_CLS[r.status] || 'mut';
                return (
                  <>
                    <tr
                      key={r.id}
                      style={{ cursor: 'pointer', background: isExp ? 'var(--line)' : undefined }}
                      onClick={() => setExpandido(isExp ? null : r.id)}
                    >
                      <td style={{ fontSize: 12, color: 'var(--tx2)' }}>{fmtData(r.created_at)}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          {ag && (
                            <span style={{
                              width: 20, height: 20, borderRadius: 3, flexShrink: 0,
                              background: ag.color || '#0D0D0D', color: '#fff',
                              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                              fontFamily: "'Anton', sans-serif", fontSize: 11,
                            }}>{ag.letter || (ag.id || '?')[0].toUpperCase()}</span>
                          )}
                          <span style={{ fontSize: 13 }}>{ag?.name || r.agent_id || '(sem agente)'}</span>
                        </div>
                      </td>
                      <td><span className={`cv2-bdg ${stCls}`} style={{ fontSize: 11 }}>{r.status || '—'}</span></td>
                      <td style={{ fontSize: 12, color: 'var(--tx2)' }}>{fmtDur(r.duration_ms)}</td>
                      <td style={{ fontSize: 12, fontFamily: 'monospace' }}>{r.cost_usd ? `$${Number(r.cost_usd).toFixed(6)}` : '—'}</td>
                      <td style={{ textAlign: 'right', fontSize: 11, color: 'var(--tx2)' }}>{isExp ? '▾' : '▸'}</td>
                    </tr>
                    {isExp && (
                      <tr key={`${r.id}-exp`} style={{ background: 'var(--line)' }}>
                        <td colSpan={6} style={{ padding: '8px 12px 12px' }}>
                          <div style={{ fontSize: 11.5, color: 'var(--tx2)', marginBottom: 6 }}>
                            <b>ID:</b> <code style={{ fontSize: 11 }}>{r.id}</code>
                            {r.trigger_dev_run_id && <> · <b>Trigger.dev:</b> <code style={{ fontSize: 11 }}>{r.trigger_dev_run_id}</code></>}
                            {r.completed_at && <> · <b>Concluido:</b> {fmtData(r.completed_at)}</>}
                          </div>
                          <JsonBlock label="Input" data={r.input} />
                          <JsonBlock label="Output" data={r.output} />
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
