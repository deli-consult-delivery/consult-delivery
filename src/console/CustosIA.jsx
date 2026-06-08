import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase.js';

// ============================================================
// Console v2 — T1/GAP-4: Custos de IA
// Fonte: agent_runs.cost_usd por agente/dia/tenant, janela 30d
// P6: limit(1000) — agregacao cliente-side apos fetch limitado
// ============================================================

function fmt(n, casas = 4) {
  return Number(n || 0).toFixed(casas);
}
function fmtDataLong(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function Kpi({ l, v, d, mut }) {
  return (
    <div className="cv2-kpi">
      <div className="l">{l}</div>
      <div className="v">{v}</div>
      <div className={`d${mut ? ' mut' : ''}`}>{d || ' '}</div>
    </div>
  );
}

export default function CustosIA({ tenantDbId }) {
  const [rows, setRows] = useState(null);
  const [agentes, setAgentes] = useState(null);
  const [erro, setErro] = useState(null);
  const [expandidoAg, setExpandidoAg] = useState(null);

  useEffect(() => {
    if (!tenantDbId) return;
    let alive = true;
    (async () => {
      try {
        const desde = new Date(Date.now() - 30 * 86400000).toISOString();
        const [{ data: runs, error: e1 }, { data: ags, error: e2 }] = await Promise.all([
          supabase
            .from('agent_runs')
            .select('agent_id, cost_usd, created_at, status')
            .eq('tenant_id', tenantDbId)
            .gte('created_at', desde)
            .order('created_at', { ascending: false })
            .limit(1000),
          supabase.from('agents').select('id, name, category'),
        ]);
        if (e1) throw e1;
        if (e2) throw e2;
        if (alive) {
          setRows(runs ?? []);
          const agMap = {};
          (ags ?? []).forEach(a => { agMap[a.id] = a; });
          setAgentes(agMap);
        }
      } catch (err) {
        if (alive) setErro(err?.message || 'erro ao carregar');
      }
    })();
    return () => { alive = false; };
  }, [tenantDbId]);

  if (!rows) {
    return (
      <div>
        <h1>Custos de IA</h1>
        <div className="cv2-rule" />
        <div className="cv2-sub">{erro ? `Erro: ${erro}` : 'Carregando...'}</div>
      </div>
    );
  }

  // --- Agregacao por agente ---
  const porAgente = {};
  for (const r of rows) {
    const id = r.agent_id || '(sem agente)';
    if (!porAgente[id]) porAgente[id] = { runs: 0, custo: 0 };
    porAgente[id].runs++;
    porAgente[id].custo += Number(r.cost_usd) || 0;
  }
  const agentesList = Object.entries(porAgente).sort((a, b) => b[1].custo - a[1].custo);

  // --- Agregacao por dia ---
  const porDia = {};
  for (const r of rows) {
    const dia = r.created_at?.slice(0, 10);
    if (!dia) continue;
    if (!porDia[dia]) porDia[dia] = 0;
    porDia[dia] += Number(r.cost_usd) || 0;
  }
  const diasList = Object.entries(porDia).sort((a, b) => b[0].localeCompare(a[0]));
  const avgDiario = diasList.length
    ? diasList.reduce((s, [, c]) => s + c, 0) / diasList.length
    : 0;
  const PICO_MULT = 2;
  const picoDia = diasList.find(([, c]) => c > avgDiario * PICO_MULT);

  // --- KPIs globais ---
  const totalCusto = rows.reduce((s, r) => s + (Number(r.cost_usd) || 0), 0);
  const totalRuns = rows.length;
  const agentesComGasto = agentesList.filter(([, v]) => v.custo > 0).length;

  return (
    <div>
      <h1>
        Custos de IA{' '}
        <span
          className="cv2-mock"
          style={{ background: 'var(--green-soft)', color: 'var(--green)' }}
        >
          DADOS REAIS · ULTIMOS 30 DIAS
        </span>
      </h1>
      <div className="cv2-rule" />
      <div className="cv2-sub">
        Agregacao de <b>agent_runs.cost_usd</b> por agente e dia ·{' '}
        {rows.length} execucoes carregadas (limite 1000/janela)
        {erro && <span style={{ color: 'var(--red)' }}> · Erro: {erro}</span>}
      </div>

      {picoDia && (
        <div
          className="cv2-card"
          style={{
            borderLeft: '3px solid var(--amber)',
            background: 'var(--amber-soft)',
            marginBottom: 14,
          }}
        >
          <b style={{ color: 'var(--amber)' }}>Alerta de pico detectado</b>
          <span style={{ color: 'var(--tx)', fontSize: 13, marginLeft: 10 }}>
            {fmtDataLong(picoDia[0] + 'T12:00:00')}: US${' '}
            {fmt(picoDia[1])} — mais de {PICO_MULT}x a media diaria (US${' '}
            {fmt(avgDiario)}/dia)
          </span>
        </div>
      )}

      <div className="cv2-kpis">
        <Kpi l="Custo total (30d)" v={`US$ ${fmt(totalCusto)}`} d="todos os agentes" mut />
        <Kpi
          l="Execucoes"
          v={totalRuns.toLocaleString('pt-BR')}
          d={`${agentesComGasto} agente${agentesComGasto !== 1 ? 's' : ''} com gasto`}
          mut
        />
        <Kpi
          l="Custo medio / run"
          v={totalRuns ? `US$ ${fmt(totalCusto / totalRuns)}` : '—'}
          d="30d"
          mut
        />
        <Kpi
          l="Media diaria"
          v={diasList.length ? `US$ ${fmt(avgDiario)}` : '—'}
          d={`${diasList.length} dias com dados`}
          mut
        />
      </div>

      <div className="cv2-card">
        <h3>Por agente</h3>
        {agentesList.length === 0 ? (
          <div style={{ color: 'var(--tx2)', fontSize: 13 }}>
            Nenhuma execucao com custo no periodo.
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Agente</th>
                <th>Categoria</th>
                <th>Execucoes</th>
                <th>Custo total (US$)</th>
                <th>Media / run (US$)</th>
              </tr>
            </thead>
            <tbody>
              {agentesList.map(([agId, v]) => {
                const ag = agentes?.[agId];
                const exp = expandidoAg === agId;
                return (
                  <tr
                    key={agId}
                    style={{ cursor: 'pointer' }}
                    onClick={() => setExpandidoAg(exp ? null : agId)}
                  >
                    <td>
                      <b>{ag?.name || agId}</b>
                      {exp && (
                        <div style={{ color: 'var(--tx2)', fontSize: 11, marginTop: 4 }}>
                          slug: <code>{agId}</code>
                          {ag?.category && <> · categoria: {ag.category}</>}
                        </div>
                      )}
                    </td>
                    <td>
                      <span className="cv2-bdg mut">{ag?.category || '—'}</span>
                    </td>
                    <td>{v.runs.toLocaleString('pt-BR')}</td>
                    <td>{fmt(v.custo)}</td>
                    <td>{v.runs ? fmt(v.custo / v.runs) : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="cv2-card">
        <h3>Por dia (decrescente)</h3>
        {diasList.length === 0 ? (
          <div style={{ color: 'var(--tx2)', fontSize: 13 }}>
            Nenhum dado de custo no periodo.
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Data</th>
                <th>Custo (US$)</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {diasList.map(([dia, custo]) => {
                const isPico = custo > avgDiario * PICO_MULT;
                return (
                  <tr key={dia}>
                    <td>{fmtDataLong(dia + 'T12:00:00')}</td>
                    <td>{fmt(custo)}</td>
                    <td>
                      {isPico && <span className="cv2-bdg err">PICO</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <div style={{ fontSize: 11.5, color: 'var(--tx2)', marginTop: 8 }}>
          PICO = dia com custo &gt; {PICO_MULT}x a media diaria do periodo.
        </div>
      </div>
    </div>
  );
}
