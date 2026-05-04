import { useState, useEffect } from 'react';
import Icon from '../components/Icon.jsx';
import AgentAvatar from '../components/AgentAvatar.jsx';
import { AGENTS } from '../data.js';
import { getKPIs, getChart7d, getAgentActions } from '../lib/api.js';

const DAYS_7 = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

const REPORT_STATUS = {
  ready:      { label: 'Pronto',   cls: 'badge-green'  },
  generating: { label: 'Gerando',  cls: 'badge-yellow' },
  scheduled:  { label: 'Agendado', cls: 'badge-gray'   },
};

function fmt(v, type) {
  if (v == null) return '—';
  if (type === 'currency') return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  if (type === 'integer')  return Number(v).toLocaleString('pt-BR');
  return String(v);
}
function fmtTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}
function mapKpis(raw) {
  return {
    receita:    { value: fmt(raw?.receita_mes,    'currency'), delta: '—', trend: 'neutral' },
    pedidos:    { value: fmt(raw?.pedidos_mes,    'integer'),  delta: '—', trend: 'neutral' },
    ticket:     { value: fmt(raw?.ticket_medio,   'currency'), delta: '—', trend: 'neutral' },
    recuperado: { value: fmt(raw?.recuperado_cora,'currency'), delta: '—', trend: 'neutral' },
  };
}

export default function ReportsScreen({ tenant, tenantDbId }) {
  const [kpis, setKpis]           = useState(mapKpis(null));
  const [chart7d, setChart7d]     = useState([0,0,0,0,0,0,0]);
  const [veraActions, setVeraActions] = useState([]);

  useEffect(() => {
    if (!tenantDbId) return;
    Promise.all([
      getKPIs(tenantDbId),
      getChart7d(tenantDbId),
      getAgentActions(tenantDbId, 5),
    ]).then(([rawKpis, chart, actions]) => {
      setKpis(mapKpis(rawKpis));
      setChart7d(chart);
      setVeraActions(actions.map(a => ({ text: a.text ?? '', time: fmtTime(a.occurred_at) })));
    }).catch(err => console.error('[ReportsScreen]', err));
  }, [tenantDbId]);

  const [period, setPeriod] = useState('7d');
  const chart = chart7d;
  const max   = Math.max(1, ...chart);

  return (
    <div className="route-enter page-container" style={{ padding: 32, maxWidth: 1400, margin: '0 auto' }}>

      {/* Header */}
      <div className="header-wrap" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <AgentAvatar id="vera" size={56} />
          <div>
            <h1 className="page-h1">Relatórios</h1>
            <p className="page-sub">
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 7, height: 7, background: 'var(--cyan)', borderRadius: '50%' }} className="pulse-green" />
                <strong style={{ color: 'var(--cyan)' }}>VERA ativa</strong>
                {' · Todos os relatórios em dia'}
              </span>
            </p>
          </div>
        </div>
        <div className="btn-wrap" style={{ display: 'flex', gap: 8 }}>
          <button className="btn-secondary btn-full-mobile"><Icon name="paper" size={14} /> Exportar PDF</button>
          <button className="btn-primary"><Icon name="plus" size={14} /> Novo relatório</button>
        </div>
      </div>

      {/* KPIs */}
      <div className="kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
        <KPI label="Receita do mês"   value={kpis.receita.value}    delta={kpis.receita.delta}    trend={kpis.receita.trend}    icon="dollar"   accent />
        <KPI label="Pedidos do mês"   value={kpis.pedidos.value}    delta={kpis.pedidos.delta}    trend={kpis.pedidos.trend}    icon="paper" />
        <KPI label="Ticket médio"     value={kpis.ticket.value}     delta={kpis.ticket.delta}     trend={kpis.ticket.trend}     icon="chart" />
        <KPI label="Recuperado CORA"  value={kpis.recuperado.value} delta={kpis.recuperado.delta} trend={kpis.recuperado.trend} icon="sparkles" />
      </div>

      {/* Main 2-col layout */}
      <div className="two-col" style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 24, marginBottom: 28 }}>

        {/* Left */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Chart */}
          <div className="card" style={{ padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
              <div>
                <h2 className="card-h3">Pedidos · últimos 7 dias</h2>
                <p style={{ fontSize: 12, color: 'var(--g-500)', marginTop: 4 }}>
                  Total: <strong style={{ color: 'var(--g-900)' }}>{chart.reduce((s, v) => s + v, 0).toLocaleString('pt-BR')}</strong> pedidos
                </p>
              </div>
            </div>

            <div className="chart-wrap" style={{ display: 'flex', alignItems: 'flex-end', gap: 16, height: 220 }}>
              {chart.map((v, i) => {
                const h       = max > 0 ? (v / max) * 100 : 0;
                const isMax   = v === max && v > 0;
                const isToday = i === chart.length - 1;
                return (
                  <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                    <div style={{
                      fontSize: isMax ? 20 : 15, fontWeight: isMax ? 800 : 700,
                      color: isMax ? 'var(--red)' : 'var(--g-900)',
                      fontVariantNumeric: 'tabular-nums',
                    }}>{v}</div>
                    <div style={{
                      width: '100%', height: `${h}%`,
                      background: isToday || isMax ? 'var(--red)' : 'var(--g-900)',
                      opacity: isToday || isMax ? 1 : 0.13,
                      borderRadius: '4px 4px 0 0',
                      animation: `slideUp 600ms var(--ease-out) ${i * 70}ms both`,
                    }} />
                    <div style={{
                      fontSize: 11, fontWeight: isToday ? 700 : 500,
                      color: isToday ? 'var(--red)' : 'var(--g-500)',
                      textTransform: 'uppercase', letterSpacing: 0.5,
                    }}>{DAYS_7[i]}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Top produtos — sem dados ainda (sem view no Supabase) */}
          <div className="card" style={{ padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 className="card-h3">Produtos mais vendidos</h2>
            </div>
            <div style={{ textAlign: 'center', padding: 24, color: 'var(--g-500)', fontSize: 13 }}>
              Sem dados de produtos neste período.
            </div>
          </div>
        </div>

        {/* Right */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* VERA ao vivo */}
          <div className="card" style={{
            padding: 20,
            background: 'linear-gradient(to bottom, #0D0D0D, #1A1A1A)',
            border: 'none', color: 'white',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <span className="live-dot" style={{ background: 'var(--cyan)' }} />
              <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700, color: 'rgba(255,255,255,0.6)' }}>
                VERA em ação agora
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {veraActions.map((a, i) => (
                <div key={i} style={{
                  padding: 12,
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 8,
                }} className="slide-right">
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--cyan)' }}>VERA</span>
                    <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>{a.time}</span>
                  </div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.75)', lineHeight: 1.45 }}>{a.text}</div>
                </div>
              ))}
              {veraActions.length === 0 && (
                <div style={{ textAlign: 'center', padding: 16, color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>
                  Nenhuma ação agora.
                </div>
              )}
            </div>
          </div>

          {/* Agentes analistas */}
          <div className="card" style={{ padding: 20 }}>
            <div className="label" style={{ marginBottom: 14 }}>Agentes analistas</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                { id: 'vera', desc: 'Gera todos os relatórios e dashboards' },
                { id: 'cora', desc: 'Relatórios de inadimplência e cobrança' },
                { id: 'max',  desc: 'Análise de performance no iFood' },
              ].map(a => {
                const agent = AGENTS.find(ag => ag.id === a.id);
                return (
                  <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <AgentAvatar id={a.id} size={30} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--g-900)' }}>{agent?.name}</div>
                      <div style={{ fontSize: 10, color: 'var(--g-500)', lineHeight: 1.3 }}>{a.desc}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Histórico de relatórios */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 className="section-h2">Histórico de relatórios</h2>
        </div>
        <div className="card tbl-wrap" style={{ overflow: 'hidden' }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>Relatório</th>
                <th>Gerado por</th>
                <th>Status</th>
                <th>Data</th>
                <th style={{ textAlign: 'right' }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', padding: 48, color: 'var(--g-500)' }}>
                  Nenhum relatório gerado ainda.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function KPI({ label, value, delta, trend, icon, accent }) {
  return (
    <div className="kpi">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div className="kpi-label">{label}</div>
        <div style={{
          width: 30, height: 30, borderRadius: 8,
          background: accent ? 'var(--red-soft)' : 'var(--g-100)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: accent ? 'var(--red)' : 'var(--g-500)',
        }}>
          <Icon name={icon} size={14} />
        </div>
      </div>
      <div className={`kpi-value${accent ? ' accent' : ''}`} style={{ marginTop: 8 }}>{value}</div>
      <div className={`kpi-delta ${trend}`} style={{ marginTop: 8 }}>
        <Icon name={trend === 'up' ? 'arrowup' : trend === 'down' ? 'arrowdown' : 'info'} size={11} />
        {delta}
      </div>
    </div>
  );
}
