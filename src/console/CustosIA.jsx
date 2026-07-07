import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase.js';
import RequireRole from '../components/auth/RequireRole.jsx';
import { usePermissions } from '../hooks/usePermissions';

// ============================================================
// Console v2 — T1/GAP-4: Custos de IA
// Fonte: agent_runs.cost_usd por agente/dia/tenant, janela 30d
// P6: paginacao completa via .range() — sem limit(1000), sem subestimar
// tenants com >1000 runs/30d (auditoria GAPs T3 2026-07-05)
// ============================================================

const PAGE = 1000;

// ponytail: paginação por offset (.range) sem tiebreaker nem teto de páginas —
// correta para o volume atual (~1.7k runs/mês em TODOS os tenants). Se um tenant
// passar de poucos milhares de runs/mês, ou inserts concorrentes durante o scan
// virarem problema real, trocar por RPC de agregação no Postgres (sum/group by).
export async function buscarTodosRuns(tenantDbId, desdeIso) {
  let rows = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await supabase
      .from('agent_runs')
      .select('agent_id, cost_usd, created_at, status')
      .eq('tenant_id', tenantDbId)
      .gte('created_at', desdeIso)
      .order('created_at', { ascending: false })
      .range(offset, offset + PAGE - 1);
    if (error) throw error;
    rows = rows.concat(data ?? []);
    if (!data || data.length < PAGE) break;
    offset += PAGE;
  }
  return rows;
}

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

export default function CustosIA({ tenantDbId, userId }) {
  const [rows, setRows] = useState(null);
  const [agentes, setAgentes] = useState(null);
  const [erro, setErro] = useState(null);
  const [expandidoAg, setExpandidoAg] = useState(null);

  // "Por tenant" — agregação server-side via RPC (custo_por_tenant_agente),
  // não pagina agent_runs cru: sempre <= (nº tenants acessíveis x nº agentes),
  // bem abaixo do cap de 1000 do PostgREST mesmo com muitos tenants. RLS
  // hierárquica de agent_runs decide o que aparece (admin de agência vê as
  // lojas filhas; usuário de 1 loja só vê a própria). Fetch e render são
  // gateados por role admin (isAdmin abaixo) — RLS na função (SECURITY
  // INVOKER) é a segunda camada, não a única.
  const [porTenant, setPorTenant] = useState(null);
  const [tenantsMap, setTenantsMap] = useState({});
  const [erroTenant, setErroTenant] = useState(null);
  const { hasRole, loading: loadingPerms } = usePermissions(userId, tenantDbId);
  const isAdmin = !loadingPerms && hasRole('admin');

  useEffect(() => {
    if (!tenantDbId) return;
    let alive = true;
    (async () => {
      try {
        const desde = new Date(Date.now() - 30 * 86400000).toISOString();
        const [runs, { data: ags, error: e2 }] = await Promise.all([
          buscarTodosRuns(tenantDbId, desde),
          supabase.from('agents').select('id, name, category'),
        ]);
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

  useEffect(() => {
    if (!isAdmin) return;
    let alive = true;
    (async () => {
      try {
        const { data, error } = await supabase.rpc('custo_por_tenant_agente', { dias_atras: 30 });
        if (error) throw error;
        const linhas = data ?? [];
        if (!alive) return;
        setPorTenant(linhas);
        const tenantIds = [...new Set(linhas.map(r => r.tenant_id))];
        if (tenantIds.length) {
          const { data: tRows, error: eT } = await supabase
            .from('tenants')
            .select('id, name, slug')
            .in('id', tenantIds);
          if (eT) throw eT;
          const map = {};
          (tRows ?? []).forEach(t => { map[t.id] = t; });
          if (alive) setTenantsMap(map);
        }
      } catch (err) {
        if (alive) setErroTenant(err?.message || 'erro ao carregar custo por tenant');
      }
    })();
    return () => { alive = false; };
  }, [isAdmin]);

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
        {rows.length.toLocaleString('pt-BR')} execucoes carregadas (paginacao completa, sem limite)
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
          <div className="cv2-tbl-wrap">
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
          </div>
        )}
      </div>

      <div className="cv2-card">
        <h3>Por dia (decrescente)</h3>
        {diasList.length === 0 ? (
          <div style={{ color: 'var(--tx2)', fontSize: 13 }}>
            Nenhum dado de custo no periodo.
          </div>
        ) : (
          <div className="cv2-tbl-wrap">
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
          </div>
        )}
        <div style={{ fontSize: 11.5, color: 'var(--tx2)', marginTop: 8 }}>
          PICO = dia com custo &gt; {PICO_MULT}x a media diaria do periodo.
        </div>
      </div>

      <RequireRole roles={['admin']} userId={userId} tenantId={tenantDbId} fallback={null}>
        <PorTenant dados={porTenant} tenantsMap={tenantsMap} erro={erroTenant} />
      </RequireRole>
    </div>
  );
}

// --- Card "Por tenant" (admin only — ve custo de todas as lojas acessiveis) ---
function PorTenant({ dados, tenantsMap, erro }) {
  if (erro) {
    return (
      <div className="cv2-card">
        <h3>Por tenant</h3>
        <div style={{ color: 'var(--red)', fontSize: 13 }}>Erro: {erro}</div>
      </div>
    );
  }
  if (!dados) {
    return (
      <div className="cv2-card">
        <h3>Por tenant</h3>
        <div style={{ color: 'var(--tx2)', fontSize: 13 }}>Carregando...</div>
      </div>
    );
  }

  // Rollup por tenant (soma dos agentes) pra ordenar e exibir subtotal.
  const porTenantId = {};
  for (const r of dados) {
    const id = r.tenant_id;
    if (!porTenantId[id]) porTenantId[id] = { execucoes: 0, custo: 0, agentes: [] };
    porTenantId[id].execucoes += Number(r.execucoes) || 0;
    porTenantId[id].custo += Number(r.custo_total) || 0;
    porTenantId[id].agentes.push(r);
  }
  const tenantsList = Object.entries(porTenantId).sort((a, b) => b[1].custo - a[1].custo);

  return (
    <div className="cv2-card">
      <h3>Por tenant (30 dias)</h3>
      {tenantsList.length === 0 ? (
        <div style={{ color: 'var(--tx2)', fontSize: 13 }}>
          Nenhum tenant acessivel com execucoes no periodo.
        </div>
      ) : (
        <div className="cv2-tbl-wrap">
          <table>
            <thead>
              <tr>
                <th>Tenant</th>
                <th>Agente</th>
                <th>Execucoes</th>
                <th>Custo total (US$)</th>
                <th>Media / run (US$)</th>
              </tr>
            </thead>
            <tbody>
              {tenantsList.map(([tenantId, resumo]) => {
                const t = tenantsMap[tenantId];
                const agentesOrdenados = [...resumo.agentes].sort(
                  (a, b) => Number(b.custo_total) - Number(a.custo_total)
                );
                return agentesOrdenados.map((r, i) => (
                  <tr key={`${tenantId}-${r.agent_id}`}>
                    <td>{i === 0 ? (t?.name || t?.slug || tenantId) : ''}</td>
                    <td>{r.agent_id}</td>
                    <td>{Number(r.execucoes).toLocaleString('pt-BR')}</td>
                    <td>{fmt(r.custo_total)}</td>
                    <td>{fmt(r.custo_medio)}</td>
                  </tr>
                ));
              })}
            </tbody>
          </table>
        </div>
      )}
      <div style={{ fontSize: 11.5, color: 'var(--tx2)', marginTop: 8 }}>
        Agregado no Postgres (custo_por_tenant_agente) — respeita a mesma RLS hierarquica
        de agent_runs, sem limite de linhas do PostgREST.
      </div>
    </div>
  );
}
