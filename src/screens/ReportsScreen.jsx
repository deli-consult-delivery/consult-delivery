import { useState } from 'react';
import Icon from '../components/Icon.jsx';
import AgentAvatar from '../components/AgentAvatar.jsx';
import { REPORTS_DATA, AGENTS } from '../data.js';

const DAYS_7  = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

const REPORT_STATUS = {
  ready:      { label: 'Pronto',  cls: 'badge-green'  },
  generating: { label: 'Gerando', cls: 'badge-yellow' },
  scheduled:  { label: 'Agendado', cls: 'badge-gray'  },
};

export default function ReportsScreen({ tenant }) {
  const data = REPORTS_DATA[tenant] || {
    periodo: '—', kpis: {
      receita:    { value: 'R$ 0', delta: '—', trend: 'neutral' },
      pedidos:    { value: '0',    delta: '—', trend: 'neutral' },
      ticket:     { value: 'R$ 0', delta: '—', trend: 'neutral' },
      recuperado: { value: 'R$ 0', delta: '—', trend: 'neutral' },
    },
    chart7d: [0,0,0,0,0,0,0], chart30d: Array(30).fill(0),
    topItems: [], reports: [], veraActions: [], insights: [],
  };

  const [period, setPeriod] = useState('7d');

  const chart = period === '7d' ? data.chart7d : data.chart30d;
  const max   = Math.max(1, ...chart);
  const generating = data.reports.find(r => r.status === 'generating');

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
                {generating
                  ? ` · ${generating.title}`
                  : ' · Todos os relatórios em dia'}
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
        <KPI label="Receita do mês"   value={data.kpis.receita.value}    delta={data.kpis.receita.delta}    trend={data.kpis.receita.trend}    icon="dollar" accent />
        <KPI label="Pedidos do mês"   value={data.kpis.pedidos.value}    delta={data.kpis.pedidos.delta}    trend={data.kpis.pedidos.trend}    icon="paper" />
        <KPI label="Ticket médio"     value={data.kpis.ticket.value}     delta={data.kpis.ticket.delta}     trend={data.kpis.ticket.trend}     icon="chart" />
        <KPI label="Recuperado CORA"  value={data.kpis.recuperado.value} delta={data.kpis.recuperado.delta} trend={data.kpis.recuperado.trend} icon="sparkles" />
      </div>

      {/* Main 2-col layout */}
      <div className="two-col" style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 24, marginBottom: 28 }}>

        {/* Left */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Chart */}
          <div className="card" style={{ padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
              <div>
                <h2 className="card-h3">Pedidos · {period === '7d' ? 'últimos 7 dias' : 'últimos 30 dias'}</h2>
                <p style={{ fontSize: 12, color: 'var(--g-500)', marginTop: 4 }}>
                  Total: <strong style={{ color: 'var(--g-900)' }}>{chart.reduce((s, v) => s + v, 0).toLocaleString('pt-BR')}</strong> pedidos
                </p>
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                {['7d', '30d'].map(p => (
                  <button
                    key={p}
                    className="btn-ghost"
                    onClick={() => setPeriod(p)}
                    style={{
                      padding: '4px 12px', fontSize: 12,
                      background: period === p ? 'var(--g-100)' : 'transparent',
                      color: period === p ? 'var(--g-900)' : 'var(--g-500)',
                      fontWeight: period === p ? 600 : 500,
                    }}
                  >
                    {p === '7d' ? '7 dias' : '30 dias'}
                  </button>
                ))}
              </div>
            </div>

            {period === '7d' ? (
              <div className="chart-wrap" style={{ display: 'flex', alignItems: 'flex-end', gap: 16, height: 220 }}>
                {chart.map((v, i) => {
                  const h    = (v / max) * 100;
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
            ) : (
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 220 }}>
                {chart.map((v, i) => {
                  const h       = (v / max) * 100;
                  const isToday = i === chart.length - 1;
                  const showLabel = [0, 6, 13, 20, 29].includes(i);
                  return (
                    <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                      <div style={{
                        width: '100%', height: `${h}%`,
                        background: isToday ? 'var(--red)' : 'var(--g-900)',
                        opacity: isToday ? 1 : 0.15,
                        borderRadius: '2px 2px 0 0',
                        animation: `slideUp 600ms var(--ease-out) ${i * 20}ms both`,
                      }} />
                      <div style={{
                        fontSize: 9, color: showLabel ? 'var(--g-500)' : 'transparent',
                        fontWeight: 600, letterSpacing: 0.3,
                      }}>{showLabel ? `D${i + 1}` : '·'}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Top produtos */}
          <div className="card" style={{ padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 className="card-h3">Produtos mais vendidos</h2>
              <span style={{ fontSize: 12, color: 'var(--g-500)' }}>{data.periodo}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {data.topItems.map((item, i) => (
                <div key={i}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{
                        width: 22, height: 22, borderRadius: '50%',
                        background: i === 0 ? 'var(--red)' : 'var(--g-100)',
                        color: i === 0 ? 'white' : 'var(--g-600)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 10, fontWeight: 700, flexShrink: 0,
                      }}>{i + 1}</span>
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--g-900)' }}>{item.name}</span>
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--g-700)', fontVariantNumeric: 'tabular-nums' }}>
                      {item.orders.toLocaleString('pt-BR')} pedidos
                    </span>
                  </div>
                  <div style={{ height: 6, background: 'var(--g-100)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', width: `${item.pct}%`,
                      background: i === 0 ? 'var(--red)' : 'var(--g-300)',
                      borderRadius: 3,
                      transition: 'width 600ms var(--ease-out)',
                      animationDelay: `${i * 80}ms`,
                    }} />
                  </div>
                </div>
              ))}
              {data.topItems.length === 0 && (
                <div style={{ textAlign: 'center', padding: 24, color: 'var(--g-500)', fontSize: 13 }}>
                  Sem dados de produtos neste período.
                </div>
              )}
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
              {data.veraActions.map((a, i) => (
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
              {data.veraActions.length === 0 && (
                <div style={{ textAlign: 'center', padding: 16, color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>
                  Nenhuma ação agora.
                </div>
              )}
            </div>
          </div>

          {/* Insights */}
          <div className="card" style={{ padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <Icon name="sparkles" size={14} style={{ color: 'var(--cyan)' }} />
              <span className="label">Insights da VERA</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {data.insights.map((text, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <div style={{
                    width: 6, height: 6, borderRadius: '50%',
                    background: 'var(--cyan)', marginTop: 6, flexShrink: 0,
                  }} />
                  <span style={{ fontSize: 12, color: 'var(--g-700)', lineHeight: 1.5 }}>{text}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Agentes que geraram relatórios */}
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
          <span style={{ fontSize: 12, color: 'var(--g-500)' }}>{data.reports.length} relatórios</span>
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
              {data.reports.map(r => {
                const s     = REPORT_STATUS[r.status] || REPORT_STATUS.ready;
                const agent = AGENTS.find(a => a.id === r.agent);
                return (
                  <tr key={r.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{
                          width: 34, height: 34, borderRadius: 8,
                          background: r.status === 'generating' ? 'var(--warn-soft)' : 'var(--g-100)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          color: r.status === 'generating' ? 'var(--warn)' : 'var(--g-500)',
                          flexShrink: 0,
                        }}>
                          <Icon name="paper" size={16} />
                        </div>
                        <span style={{ fontWeight: 600, color: 'var(--g-900)' }}>{r.title}</span>
                      </div>
                    </td>
                    <td>
                      {agent && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <AgentAvatar id={agent.id} size={22} />
                          <span style={{ fontSize: 12, color: 'var(--g-600)' }}>{agent.name}</span>
                        </div>
                      )}
                    </td>
                    <td>
                      <span className={`badge ${s.cls}`} style={{ position: 'relative' }}>
                        {r.status === 'generating' && (
                          <span style={{
                            width: 6, height: 6, background: 'var(--warn)',
                            borderRadius: '50%', display: 'inline-block',
                          }} className="pulse-amber" />
                        )}
                        {s.label}
                      </span>
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--g-600)' }}>{r.date}</td>
                    <td style={{ textAlign: 'right' }}>
                      {r.status === 'ready' ? (
                        <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                          <button className="btn-ghost" style={{ fontSize: 12 }}>
                            <Icon name="eye" size={12} /> Ver
                          </button>
                          <button className="btn-ghost" style={{ fontSize: 12 }}>
                            <Icon name="paper" size={12} /> Baixar
                          </button>
                        </div>
                      ) : (
                        <span style={{ fontSize: 12, color: 'var(--g-400)' }}>Aguardando...</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {data.reports.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: 48, color: 'var(--g-500)' }}>
                    Nenhum relatório gerado ainda.
                  </td>
                </tr>
              )}
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
