import { useEffect, useMemo, useState } from 'react';
import Icon from '../components/Icon.jsx';
import AgentAvatar from '../components/AgentAvatar.jsx';
import UserAvatar from '../components/UserAvatar.jsx';
import { AGENTS, TENANTS, TASKS } from '../data.js';
import { getKPIs, getChart7d, getAgentActions, getTenantBySlug } from '../lib/api.js';

const AGENT_TASKS = {
  deli:  'Priorizando tarefas do dia',
  cora:  'Cobrando inadimplentes',
  lara:  'Agendando post Instagram',
  sofia: 'Aguardando briefing',
  breno: 'Respondendo WhatsApp',
  max:   'Analisando cardápio iFood',
  vera:  'Gerando relatório semanal',
};

const DAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const AGENT_STATUSES = ['working', 'working', 'idle', 'working', 'idle', 'working', 'working'];

const EMPTY_KPIS = {
  pedidos:       { value: 0,      delta: '—', trend: 'neutral' },
  ticket:        { value: 'R$ 0', delta: '—', trend: 'neutral' },
  tarefas:       { value: 0,      delta: '—', trend: 'neutral' },
  inadimplencia: { value: 'R$ 0', delta: '—', trend: 'neutral' },
};

function formatBRL(cents) {
  if (cents == null) return 'R$ 0';
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency', currency: 'BRL', maximumFractionDigits: 2,
  }).format((cents ?? 0) / 100);
}

function formatPctDelta(pct) {
  if (pct == null) return '—';
  const n = Number(pct);
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(0)}%`;
}

function trendFromPct(pct) {
  if (pct == null) return 'neutral';
  const n = Number(pct);
  if (n > 0) return 'up';
  if (n < 0) return 'down';
  return 'neutral';
}

function mapKPIs(row) {
  if (!row) return EMPTY_KPIS;
  return {
    pedidos: {
      value: row.pedidos_count ?? 0,
      delta: formatPctDelta(row.pedidos_delta_pct),
      trend: trendFromPct(row.pedidos_delta_pct),
    },
    ticket: {
      value: formatBRL(row.ticket_medio_cents),
      delta: formatPctDelta(row.ticket_delta_pct),
      trend: trendFromPct(row.ticket_delta_pct),
    },
    tarefas: {
      value: row.tarefas_count ?? 0,
      delta: (row.tarefas_urgentes ?? 0) > 0
        ? `${row.tarefas_urgentes} urgentes`
        : 'tudo ok',
      trend: (row.tarefas_urgentes ?? 0) > 0 ? 'neutral' : 'up',
    },
    inadimplencia: {
      value: formatBRL(row.inadimplencia_cents),
      delta: `${row.inadimplencia_clientes ?? 0} clientes`,
      trend: (row.inadimplencia_cents ?? 0) > 0 ? 'down' : 'up',
    },
  };
}

function relativeTime(iso) {
  if (!iso) return '';
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

export default function DashboardScreen({ tenant }) {
  const tenantMeta = TENANTS.find(t => t.id === tenant);

  const [tenantId, setTenantId] = useState(null);
  const [kpis, setKpis] = useState(EMPTY_KPIS);
  const [chart7d, setChart7d] = useState([0, 0, 0, 0, 0, 0, 0]);
  const [recent, setRecent] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getTenantBySlug(tenant)
      .then(t => { if (!cancelled) setTenantId(t?.id ?? null); })
      .catch(err => { console.error('getTenantBySlug', err); if (!cancelled) setTenantId(null); });
    return () => { cancelled = true; };
  }, [tenant]);

  useEffect(() => {
    if (!tenantId) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([
      getKPIs(tenantId),
      getChart7d(tenantId),
      getAgentActions(tenantId, 6),
    ])
      .then(([kpiRow, chart, actions]) => {
        if (cancelled) return;
        setKpis(mapKPIs(kpiRow));
        setChart7d(chart);
        setRecent(actions);
        setLoading(false);
      })
      .catch(err => {
        console.error('dashboard fetch', err);
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [tenantId]);

  const agentStatus = useMemo(() =>
    AGENTS.map((a, i) => ({ ...a, status: AGENT_STATUSES[i], task: AGENT_TASKS[a.id] })),
  []);

  const max = Math.max(1, ...chart7d);

  return (
    <div className="route-enter" style={{ padding: 32, maxWidth: 1400, margin: '0 auto' }}>
      {/* Greeting */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 28 }}>
        <div>
          <h1 className="page-h1">
            Bom dia, Wandson{' '}
            <span style={{ display: 'inline-block', animation: 'dot-pulse 2s infinite' }}>👋</span>
          </h1>
          <p className="page-sub">
            Aqui está o resumo da <strong style={{ color: 'var(--g-900)' }}>{tenantMeta?.name}</strong> hoje · Quinta, 24 de abril
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-secondary"><Icon name="refresh" size={14} /> Atualizar</button>
          <button className="btn-primary"><Icon name="plus" size={14} /> Nova tarefa</button>
        </div>
      </div>

      {/* Agents banner */}
      <div className="card" style={{ padding: 20, marginBottom: 28, background: 'linear-gradient(to right, #0D0D0D, #1A1A1A)', border: 'none', color: 'white' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 8, height: 8, background: 'var(--success)', borderRadius: '50%' }} className="pulse-green" />
            <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700, color: 'rgba(255,255,255,0.6)' }}>Agentes IA · ao vivo</span>
          </div>
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
            {agentStatus.filter(a => a.status === 'working').length} de {AGENTS.length} trabalhando agora
          </span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 12 }}>
          {agentStatus.map(a => (
            <div key={a.id} style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 8,
              padding: 14,
              position: 'relative',
              overflow: 'hidden',
            }}>
              {a.status === 'working' && (
                <div style={{
                  position: 'absolute', top: 8, right: 8,
                  width: 6, height: 6, borderRadius: '50%',
                  background: a.color,
                }} className="live-dot" />
              )}
              <AgentAvatar id={a.id} size={34} />
              <div style={{ marginTop: 10, fontSize: 12, fontWeight: 700, color: 'white' }}>{a.name}</div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>{a.role}</div>
              <div style={{
                marginTop: 10,
                fontSize: 10,
                color: a.status === 'working' ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.35)',
                lineHeight: 1.35,
                minHeight: 28,
              }}>
                {a.status === 'working' ? a.task : 'Ocioso'}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 28 }}>
        <KPI label="Pedidos hoje"       value={kpis.pedidos.value}       delta={kpis.pedidos.delta}       trend={kpis.pedidos.trend}       accent icon="paper" />
        <KPI label="Ticket médio"       value={kpis.ticket.value}        delta={kpis.ticket.delta}        trend={kpis.ticket.trend}        icon="dollar" />
        <KPI label="Tarefas pendentes"  value={kpis.tarefas.value}       delta={kpis.tarefas.delta}       trend={kpis.tarefas.trend}       icon="check" />
        <KPI label="Inadimplência CORA" value={kpis.inadimplencia.value} delta={kpis.inadimplencia.delta} trend={kpis.inadimplencia.trend} icon="dollar" />
      </div>

      {/* Main split */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 20 }}>
        {/* Chart */}
        <div className="card" style={{ padding: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
            <div>
              <h2 className="card-h3">Pedidos · últimos 7 dias</h2>
              <p style={{ fontSize: 12, color: 'var(--g-500)', marginTop: 4 }}>
                Total: <strong style={{ color: 'var(--g-900)' }}>{chart7d.reduce((s, v) => s + v, 0)}</strong> pedidos
              </p>
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              {['7 dias', '30 dias', '90 dias'].map((l, i) => (
                <button key={l} className="btn-ghost" style={{
                  padding: '4px 10px', fontSize: 12,
                  background: i === 0 ? 'var(--g-100)' : 'transparent',
                  color: i === 0 ? 'var(--g-900)' : 'var(--g-500)',
                  fontWeight: i === 0 ? 600 : 500,
                }}>{l}</button>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, height: 260, paddingBottom: 4 }}>
            {chart7d.map((v, i) => {
              const h = (v / max) * 100;
              const isMax = v === max && v > 0;
              const isToday = i === chart7d.length - 1;
              return (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                  <div style={{
                    fontSize: isMax ? 22 : 16,
                    fontWeight: isMax ? 800 : 700,
                    color: isMax ? 'var(--red)' : 'var(--g-900)',
                    fontVariantNumeric: 'tabular-nums',
                    transition: 'all 300ms',
                  }}>{v}</div>
                  <div style={{
                    width: '100%',
                    height: `${h}%`,
                    background: isToday ? 'var(--red)' : isMax ? 'var(--red)' : 'var(--g-900)',
                    opacity: isToday || isMax ? 1 : 0.15,
                    borderRadius: '4px 4px 0 0',
                    transition: 'all 400ms var(--ease-out)',
                    animation: `slideUp 600ms var(--ease-out) ${i * 70}ms both`,
                  }} />
                  <div style={{
                    fontSize: 11,
                    fontWeight: isToday ? 700 : 500,
                    color: isToday ? 'var(--red)' : 'var(--g-500)',
                    textTransform: 'uppercase',
                    letterSpacing: 0.5,
                  }}>{DAYS[i]}{isToday ? ' · hoje' : ''}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Activity feed */}
        <div className="card" style={{ padding: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h2 className="card-h3">Atividade recente dos agentes</h2>
            <span className="live-dot" />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {recent.length === 0 && !loading && (
              <div style={{ fontSize: 12, color: 'var(--g-500)', padding: '12px 0' }}>
                Sem atividade recente.
              </div>
            )}
            {recent.map((r) => {
              const agent = AGENTS.find(a => a.id === r.agent_id);
              return (
                <div key={r.id} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }} className="slide-up">
                  <AgentAvatar id={r.agent_id} size={32} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: 'var(--g-900)', lineHeight: 1.4 }}>{r.text}</div>
                    <div style={{ fontSize: 11, color: 'var(--g-500)', marginTop: 4 }}>
                      <strong style={{ color: agent?.color }}>{agent?.name}</strong> · {relativeTime(r.occurred_at)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <button className="btn-ghost" style={{ width: '100%', justifyContent: 'center', marginTop: 16, fontSize: 12 }}>
            Ver todas as atividades <Icon name="arrowright" size={12} />
          </button>
        </div>
      </div>

      {/* Urgent tasks */}
      <div style={{ marginTop: 28 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h2 className="section-h2">Tarefas urgentes</h2>
          <button className="btn-ghost" style={{ fontSize: 13 }}>Ver no Kanban <Icon name="arrowright" size={12} /></button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          {(TASKS[tenant] || []).filter(t => t.priority === 'high' && t.col !== 'done').slice(0, 3).map(t => (
            <div key={t.id} className="card" style={{ padding: 16, borderLeft: '3px solid var(--red)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <span className="badge badge-red">URGENTE</span>
                <span style={{ fontSize: 11, color: 'var(--g-500)' }}>{t.due}</span>
              </div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--g-900)', marginBottom: 6 }}>{t.title}</div>
              <div style={{ fontSize: 12, color: 'var(--g-500)', lineHeight: 1.4 }}>{t.desc}</div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <UserAvatar name={t.assignee} size={24} />
                  {t.agent && <AgentAvatar id={t.agent} size={24} />}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 11, color: 'var(--g-500)' }}>
                  {t.comments > 0 && <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><Icon name="msg" size={12} />{t.comments}</span>}
                  {t.attachments > 0 && <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><Icon name="paperclip" size={12} />{t.attachments}</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function KPI({ label, value, delta, trend, accent, icon }) {
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
      <div className={`kpi-value ${accent ? 'accent' : ''}`} style={{ marginTop: 8 }}>{value}</div>
      <div className={`kpi-delta ${trend}`}>
        <Icon name={trend === 'up' ? 'arrowup' : trend === 'down' ? 'arrowdown' : 'info'} size={11} />
        {delta}
      </div>
    </div>
  );
}
