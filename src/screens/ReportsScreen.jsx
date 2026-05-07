import { useState as uSRep, useMemo as uMRep } from 'react';
import Icon from '../components/Icon.jsx';
import AgentAvatar from '../components/AgentAvatar.jsx';
import UserAvatar from '../components/UserAvatar.jsx';
import { TENANTS, AGENTS, REPORTS_DATA_EXTRA } from '../data.js';

const ReportsScreen = ({ tenant, tenantDbId, userId }) => {
  const data = REPORTS_DATA_EXTRA[tenant] || REPORTS_DATA_EXTRA['pizza-joao'] || {
    revenueTrend30: [], channels: [], sentimentSeries: [], funnel: [], agentPerf: [], insights: [],
  };

  const [period, setPeriod] = uSRep('30d');
  const [tab, setTab]       = uSRep('overview');

  const periods = [
    { id: '7d',  label: '7 dias' },
    { id: '30d', label: '30 dias' },
    { id: '90d', label: '90 dias' },
    { id: 'ytd', label: 'Ano' },
  ];
  const tabs = [
    { id: 'overview',  label: 'Visão geral',  icon: 'chart' },
    { id: 'channels',  label: 'Canais',       icon: 'msg' },
    { id: 'agents',    label: 'Agentes',      icon: 'sparkles' },
    { id: 'funnel',    label: 'Funil',        icon: 'paper' },
    { id: 'sentiment', label: 'Sentimento',   icon: 'heart' },
  ];

  const totalRevenue = (data.revenueTrend30 || []).reduce((s, v) => s + v, 0);
  const lastWeek = (data.revenueTrend30 || []).slice(-7).reduce((s, v) => s + v, 0);
  const prevWeek = (data.revenueTrend30 || []).slice(-14, -7).reduce((s, v) => s + v, 0);
  const growth   = prevWeek ? ((lastWeek - prevWeek) / prevWeek * 100).toFixed(1) : 0;
  const fmt = (n) => 'R$ ' + (n / 1000).toFixed(1) + 'k';
  const fmtBig = (n) => n.toLocaleString('pt-BR', { maximumFractionDigits: 0 });

  const kpis = [
    { label: 'Faturamento',     value: 'R$ ' + fmtBig(totalRevenue),  delta: '+' + growth + '%',  good: true },
    { label: 'Conversas',       value: '1.240',                       delta: '+18%',              good: true },
    { label: 'Ticket médio',    value: 'R$ 89,40',                    delta: '+8%',               good: true },
    { label: 'Conversão',       value: '23,1%',                       delta: '+3,2pp',            good: true },
    { label: 'NPS médio',       value: '8,4',                         delta: '+0,6',              good: true },
    { label: 'SLA quebrado',    value: '8%',                          delta: '+2pp',              good: false },
  ];

  return (
    <div className="route-enter" style={{ padding: '28px 32px 56px', maxWidth: 1480, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-end', marginBottom: 24, flexWrap:'wrap', gap: 16 }}>
        <div>
          <h1 className="page-h1">Relatórios</h1>
          <div className="page-sub" style={{ display:'inline-flex', alignItems:'center', gap: 6 }}>
            Powered by <AgentAvatar id="vera" size={16}/> VERA · análise contínua de toda a operação
          </div>
        </div>
        <div style={{ display:'flex', gap: 8 }}>
          <div className="rep-period">
            {periods.map(p => (
              <button key={p.id} className={`rep-period-btn ${period === p.id ? 'on' : ''}`} onClick={() => setPeriod(p.id)}>{p.label}</button>
            ))}
          </div>
          <button className="btn-secondary"><Icon name="paper" size={14}/> CSV</button>
          <button className="btn-secondary"><Icon name="paper" size={14}/> PDF</button>
        </div>
      </div>

      {/* VERA insight banner */}
      <div className="rep-insight">
        <AgentAvatar id="vera" size={44}/>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color:'#A78BFA', letterSpacing: 1, textTransform:'uppercase', marginBottom: 6 }}>VERA · Análise do período</div>
          <div style={{ fontSize: 14, color:'white', lineHeight: 1.55 }}>
            Faturamento subiu <strong style={{ color:'#10B981' }}>+{growth}%</strong> nos últimos 7 dias.
            DELI está convertendo <strong>72%</strong> dos atendimentos de vendas.
            Ponto de atenção: <strong style={{ color:'#F59E0B' }}>SLA quebrado</strong> em 8% das conversas no horário das 19h–21h.
          </div>
        </div>
        <button className="btn-primary" style={{ background:'white', color:'#0D0D0D', flexShrink: 0 }}>
          Aprofundar <Icon name="arrowright" size={13}/>
        </button>
      </div>

      {/* KPI strip */}
      <div className="rep-kpi-grid">
        {kpis.map(k => (
          <div key={k.label} className="card rep-kpi">
            <div style={{ fontSize: 11, color:'var(--g-500)', textTransform:'uppercase', letterSpacing: 0.5, fontWeight: 700 }}>{k.label}</div>
            <div style={{ fontSize: 24, fontWeight: 800, color:'var(--g-900)', marginTop: 4, fontFeatureSettings:"'tnum'" }}>{k.value}</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: k.good ? '#10B981' : '#EF4444', marginTop: 2 }}>{k.delta}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="rep-tabs">
        {tabs.map(t => (
          <button key={t.id} className={`rep-tab ${tab === t.id ? 'on' : ''}`} onClick={() => setTab(t.id)}>
            <Icon name={t.icon} size={14}/> {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'overview' && (
        <div className="rep-grid-2">
          <div className="chart-card">
            <div className="chart-card-h">
              <div>
                <div className="chart-card-title">Receita · últimos 30 dias</div>
                <div className="chart-card-sub">Total: R$ {fmtBig(totalRevenue)}</div>
              </div>
              <span className="badge badge-green">+{growth}%</span>
            </div>
            <RevenueChart data={data.revenueTrend30 || []}/>
          </div>
          <div className="chart-card">
            <div className="chart-card-h">
              <div>
                <div className="chart-card-title">Mix de canais</div>
                <div className="chart-card-sub">Distribuição por origem</div>
              </div>
            </div>
            <ChannelBars channels={data.channels || []}/>
          </div>
          <div className="chart-card" style={{ gridColumn: '1 / -1' }}>
            <div className="chart-card-h">
              <div>
                <div className="chart-card-title">Insights da VERA</div>
                <div className="chart-card-sub">Padrões detectados automaticamente no período</div>
              </div>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
              {(data.insights || []).map((i, idx) => (
                <div key={idx} style={{
                  display:'flex', gap: 10, alignItems:'flex-start',
                  background:'var(--g-50)', border: '1px solid var(--g-100)',
                  borderRadius: 10, padding: 12,
                }}>
                  <span style={{ width: 24, height: 24, background: '#A78BFA22', color: '#7C3AED', borderRadius: 6, display:'inline-flex', alignItems:'center', justifyContent:'center', flexShrink: 0, fontWeight: 800, fontSize: 11 }}>★</span>
                  <div style={{ fontSize: 13, color:'var(--g-700)', lineHeight: 1.5 }}>{i}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === 'channels' && (
        <div className="chart-card">
          <div className="chart-card-h">
            <div>
              <div className="chart-card-title">Performance por canal</div>
              <div className="chart-card-sub">Volume relativo no período</div>
            </div>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap: 24, alignItems:'center' }}>
            <ChannelBars channels={data.channels || []} large/>
            <DonutChart data={data.channels || []}/>
          </div>
        </div>
      )}

      {tab === 'agents' && (
        <div className="chart-card">
          <div className="chart-card-h">
            <div>
              <div className="chart-card-title">Performance dos agentes IA</div>
              <div className="chart-card-sub">{(data.agentPerf || []).length} agentes ativos no período</div>
            </div>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
            {(data.agentPerf || []).map(a => {
              const agent = AGENTS.find(x => x.id === a.id);
              if (!agent) return null;
              return (
                <div key={a.id} style={{ background:'var(--g-50)', border:'1px solid var(--g-100)', borderRadius: 10, padding: 14 }}>
                  <div style={{ display:'flex', alignItems:'center', gap: 10, marginBottom: 10 }}>
                    <AgentAvatar id={a.id} size={32}/>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 800, color:'var(--g-900)' }}>{agent.name}</div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: agent.color }}>{agent.role}</div>
                    </div>
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap: 8 }}>
                    <Mini label="conversas" value={a.conv}/>
                    <Mini label="sucesso"   value={a.success + '%'}/>
                  </div>
                  <div style={{ marginTop: 10, fontSize: 13, fontWeight: 700, color: 'var(--g-900)' }}>
                    {a.value !== '—' ? a.value : <span style={{ color: 'var(--g-400)', fontWeight: 500 }}>sem receita atribuída</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {tab === 'funnel' && (
        <div className="chart-card">
          <div className="chart-card-h">
            <div>
              <div className="chart-card-title">Funil de conversão</div>
              <div className="chart-card-sub">Da conversa ao pagamento aprovado</div>
            </div>
          </div>
          {(() => {
            const max = Math.max(...(data.funnel || [{ count: 1 }]).map(f => f.count));
            return (data.funnel || []).map((f, i) => {
              const prev = i > 0 ? data.funnel[i - 1].count : null;
              const drop = prev ? Math.round((1 - f.count / prev) * 100) : 0;
              return (
                <div key={f.stage} className="funnel-row">
                  <div className="funnel-label">
                    {f.stage}
                    {prev && drop > 0 && <span style={{ marginLeft: 6, fontSize: 11, color:'#EF4444' }}>−{drop}%</span>}
                  </div>
                  <div className="funnel-bar" style={{ width: ((f.count / max) * 100) + '%', background: `linear-gradient(90deg, var(--red), #FF6F4D)` }}/>
                  <div className="funnel-v">{fmtBig(f.count)}</div>
                </div>
              );
            });
          })()}
        </div>
      )}

      {tab === 'sentiment' && (
        <div className="chart-card">
          <div className="chart-card-h">
            <div>
              <div className="chart-card-title">Sentimento ao longo da semana</div>
              <div className="chart-card-sub">Análise IA de todas as conversas</div>
            </div>
            <div style={{ display:'flex', gap: 12, fontSize: 12 }}>
              <span style={{ display:'inline-flex', alignItems:'center', gap: 4 }}><span style={{ width: 10, height: 10, borderRadius: 2, background:'#10B981' }}/> Positivo</span>
              <span style={{ display:'inline-flex', alignItems:'center', gap: 4 }}><span style={{ width: 10, height: 10, borderRadius: 2, background:'#9CA3AF' }}/> Neutro</span>
              <span style={{ display:'inline-flex', alignItems:'center', gap: 4 }}><span style={{ width: 10, height: 10, borderRadius: 2, background:'#EF4444' }}/> Negativo</span>
            </div>
          </div>
          <SentimentChart data={data.sentimentSeries || []}/>
        </div>
      )}
    </div>
  );
};

const Mini = ({ label, value }) => (
  <div style={{ background: 'white', borderRadius: 6, padding: '6px 10px' }}>
    <div style={{ fontSize: 14, fontWeight: 800, color:'var(--g-900)', fontFeatureSettings:"'tnum'" }}>{value}</div>
    <div style={{ fontSize: 10, color:'var(--g-500)', textTransform:'uppercase', fontWeight: 600 }}>{label}</div>
  </div>
);

const RevenueChart = ({ data }) => {
  if (!data.length) return <div style={{ padding: 40, textAlign:'center', color:'var(--g-400)' }}>Sem dados</div>;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const w = 580, h = 180, pad = 12;
  const xs = data.map((_, i) => pad + (i * (w - pad * 2) / (data.length - 1)));
  const ys = data.map(v => h - pad - ((v - min) / (max - min)) * (h - pad * 2));
  const path = xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${x},${ys[i]}`).join(' ');
  const area = path + ` L${xs[xs.length - 1]},${h} L${xs[0]},${h} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width:'100%', height: 180 }}>
      <defs>
        <linearGradient id="rev-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#B70C00" stopOpacity="0.3"/>
          <stop offset="100%" stopColor="#B70C00" stopOpacity="0"/>
        </linearGradient>
      </defs>
      <path d={area} fill="url(#rev-grad)"/>
      <path d={path} stroke="#B70C00" strokeWidth="2" fill="none"/>
      {xs.map((x, i) => (
        <circle key={i} cx={x} cy={ys[i]} r={i === xs.length - 1 ? 4 : 0} fill="#B70C00"/>
      ))}
    </svg>
  );
};

const ChannelBars = ({ channels, large }) => {
  const total = channels.reduce((s, c) => s + c.value, 0) || 1;
  return (
    <div style={{ display:'flex', flexDirection:'column', gap: large ? 14 : 10 }}>
      {channels.map(c => (
        <div key={c.name}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: 4 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color:'var(--g-700)' }}>{c.name}</span>
            <span style={{ fontSize: 13, fontWeight: 700, color:'var(--g-900)' }}>{c.value}%</span>
          </div>
          <div style={{ height: large ? 14 : 10, background:'var(--g-100)', borderRadius: 999, overflow:'hidden' }}>
            <div style={{ height:'100%', width: ((c.value / total) * 100) + '%', background: c.color, borderRadius: 999 }}/>
          </div>
        </div>
      ))}
    </div>
  );
};

const DonutChart = ({ data }) => {
  const total = data.reduce((s, c) => s + c.value, 0) || 1;
  const r = 80, cx = 110, cy = 110, sw = 30;
  let offset = 0;
  return (
    <svg viewBox="0 0 220 220" style={{ width:'100%', maxWidth: 220 }}>
      {data.map(c => {
        const pct = c.value / total;
        const len = pct * 2 * Math.PI * r;
        const dash = `${len} ${2 * Math.PI * r}`;
        const el = (
          <circle
            key={c.name}
            cx={cx} cy={cy} r={r}
            fill="none"
            stroke={c.color}
            strokeWidth={sw}
            strokeDasharray={dash}
            strokeDashoffset={-offset}
            transform={`rotate(-90 ${cx} ${cy})`}
          />
        );
        offset += len;
        return el;
      })}
      <text x={cx} y={cy - 4} textAnchor="middle" fontSize="14" fill="var(--g-500)" fontWeight="600">Total</text>
      <text x={cx} y={cy + 18} textAnchor="middle" fontSize="22" fill="var(--g-900)" fontWeight="800">{total}%</text>
    </svg>
  );
};

const SentimentChart = ({ data }) => {
  if (!data.length) return <div style={{ padding: 40, textAlign:'center', color:'var(--g-400)' }}>Sem dados</div>;
  const w = 580, h = 220, pad = 24;
  const cw = (w - pad * 2) / data.length;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width:'100%', height: 220 }}>
      {data.map((d, i) => {
        const x = pad + i * cw;
        const cx = x + cw / 2;
        const total = d.pos + d.neu + d.neg;
        const bar = (h - pad * 2) * 0.9;
        const posH = (d.pos / total) * bar;
        const neuH = (d.neu / total) * bar;
        const negH = (d.neg / total) * bar;
        const bw = cw - 14;
        return (
          <g key={d.d}>
            <rect x={cx - bw / 2} y={h - pad - posH}             width={bw} height={posH} fill="#10B981" rx="3"/>
            <rect x={cx - bw / 2} y={h - pad - posH - neuH}      width={bw} height={neuH} fill="#9CA3AF"/>
            <rect x={cx - bw / 2} y={h - pad - posH - neuH - negH} width={bw} height={negH} fill="#EF4444" rx="3"/>
            <text x={cx} y={h - 6} textAnchor="middle" fontSize="11" fill="var(--g-500)" fontWeight="600">{d.d}</text>
          </g>
        );
      })}
    </svg>
  );
};

export default ReportsScreen;
