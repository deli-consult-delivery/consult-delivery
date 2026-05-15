import { useMemo as uMDb } from 'react';
import Icon from '../components/Icon.jsx';
import AgentAvatar from '../components/AgentAvatar.jsx';
import UserAvatar from '../components/UserAvatar.jsx';
import { TENANTS, AGENTS, AGENDA } from '../data.js';
import { useDashboardData } from './hooks/useDashboardData.js';
import { useFeedEventos } from './hooks/useFeedEventos.js';

const DashboardScreen = ({ tenant, tenantDbId, onNavigate }) => {
  const tenantMeta = TENANTS.find(t => t.id === tenant) ?? TENANTS[0];
  const { events, loading: feedLoading } = useFeedEventos(tenantDbId);
  const agenda = AGENDA || [];

  const { data: dash, loading } = useDashboardData(tenantDbId);

  // Greeting
  const now = new Date();
  const h = now.getHours();
  const greet = h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
  const dateStr = now.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });

  // Mescla metadata estático (AGENTS: nome, role, color) com status real do Supabase
  const agentStatus = uMDb(() => {
    const statusMap = Object.fromEntries(dash.agentStatus.map(a => [a.id, a]));
    return AGENTS.map(a => ({
      ...a,
      status: statusMap[a.id]?.status ?? 'idle',
      task:   statusMap[a.id]?.task   ?? null,
    }));
  }, [dash.agentStatus]);

  const chart7d = dash.chart7d;
  const chartMax = Math.max(...chart7d, 1); // mínimo 1 para evitar div/0
  const days = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

  const { convs, slaCount, cobrancas, kpis, tasks, deliSummary } = dash;

  const recuperadoFmt = cobrancas.recuperadoHoje > 0
    ? `R$ ${fmtBrl(cobrancas.recuperadoHoje)}`
    : 'R$ 0';

  return (
    <div className="route-enter dash-root" style={{ padding: '28px 32px 56px', maxWidth: 1480, margin: '0 auto' }}>
      {/* ═══════════════ HERO ═══════════════ */}
      <div className="dash-hero">
        <div className="dash-hero-glow"/>
        <div className="dash-hero-grid"/>
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 24, flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 480px', minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.55)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>
                {dateStr} · <span style={{ color: '#34D399' }}>● online</span>
              </div>
              <h1 style={{ fontFamily: 'Oswald, sans-serif', fontWeight: 700, fontSize: 48, color: 'white', lineHeight: 1.05, letterSpacing: '-0.5px', margin: 0 }}>
                {greet}, Wandson <span style={{ display: 'inline-block', animation: 'dot-pulse 2s infinite' }}>👋</span>
              </h1>
              <div style={{ fontSize: 15, color: 'rgba(255,255,255,0.65)', marginTop: 10, maxWidth: 560 }}>
                Você está olhando para a <strong style={{ color: 'white' }}>{tenantMeta.name}</strong>. A DELI cuidou de tudo enquanto você dormia.
              </div>

              {/* DELI summary card */}
              <div className="dash-deli-summary">
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                  <AgentAvatar id="deli" size={40}/>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <span style={{ fontSize: 13, color: 'var(--red-light)', fontWeight: 800, letterSpacing: 0.4 }}>
                        DELI · Resumo das últimas 24h
                      </span>
                      <span className="live-dot"/>
                    </div>
                    <ul className="dash-deli-bullets">
                      {deliSummary.recuperadoHoje > 0
                        ? <li><Icon name="dollar" size={12}/> CORA recuperou <strong style={{ color: '#34D399' }}>{recuperadoFmt}</strong> de {cobrancas.totalAberto} clientes em aberto</li>
                        : <li><Icon name="dollar" size={12}/> Nenhuma cobrança paga hoje — <strong>CORA monitorando {cobrancas.totalAberto} em aberto</strong></li>
                      }
                      <li><Icon name="msg" size={12}/> {convs.total} conversa{convs.total !== 1 ? 's' : ''} ativas — <strong>{deliSummary.criticas} crítica{deliSummary.criticas !== 1 ? 's' : ''}</strong> aguardando você</li>
                      <li><Icon name="check" size={12}/> {tasks.urgentes.length} tarefa{tasks.urgentes.length !== 1 ? 's' : ''} urgente{tasks.urgentes.length !== 1 ? 's' : ''} priorizadas pela DELI</li>
                      {deliSummary.prospectsHoje > 0
                        ? <li><Icon name="sparkles" size={12}/> SOFIA adicionou <strong style={{ color: '#34D399' }}>{deliSummary.prospectsHoje} prospect{deliSummary.prospectsHoje !== 1 ? 's' : ''}</strong> hoje</li>
                        : <li><Icon name="sparkles" size={12}/> Plataforma operando normalmente — todos os agentes online</li>
                      }
                    </ul>
                    <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
                      <button className="dash-deli-cta" onClick={() => onNavigate && onNavigate('agents')}>
                        <Icon name="sparkles" size={13}/> Briefing completo
                      </button>
                      <button className="dash-deli-cta ghost" onClick={() => onNavigate && onNavigate('chat')}>
                        Ver críticos <Icon name="arrowright" size={13}/>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Live counter cluster */}
            <div className="dash-live-cluster">
              <div className="dash-live-row">
                <div className="dash-live-num">{loading ? '…' : convs.total}</div>
                <div>
                  <div className="dash-live-l">conversas ativas</div>
                  <div className="dash-live-s">{loading ? '…' : `${convs.unread} não lidas`}</div>
                </div>
              </div>
              <div className="dash-live-sep"/>
              <div className="dash-live-row">
                <div className="dash-live-num" style={{ color: slaCount > 0 ? '#FBBF24' : '#34D399' }}>
                  {loading ? '…' : slaCount}
                </div>
                <div>
                  <div className="dash-live-l">SLA crítico</div>
                  <div className="dash-live-s">{slaCount === 0 ? 'tudo dentro' : 'estourando'}</div>
                </div>
              </div>
              <div className="dash-live-sep"/>
              <div className="dash-live-row">
                <div className="dash-live-num" style={{ color: '#34D399' }}>
                  {loading ? '…' : recuperadoFmt}
                </div>
                <div>
                  <div className="dash-live-l">recuperado hoje</div>
                  <div className="dash-live-s">CORA · em andamento</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ═══════════════ KPI GRID ═══════════════ */}
      <div className="dash-kpi-grid">
        <KPI label="Pedidos hoje"      value={kpis.pedidos.value}       delta={kpis.pedidos.delta}       trend={kpis.pedidos.trend}       accent icon="paper"  loading={loading}/>
        <KPI label="Ticket médio"      value={kpis.ticket.value}        delta={kpis.ticket.delta}        trend={kpis.ticket.trend}               icon="chart"  loading={loading}/>
        <KPI label="Conversas ativas"  value={loading ? '…' : convs.total}   delta={`${convs.unread} não lidas`} trend="neutral"                icon="chat"   loading={loading}/>
        <KPI label="Tarefas pendentes" value={kpis.tarefas.value}       delta={kpis.tarefas.delta}       trend={kpis.tarefas.trend}              icon="check"  loading={loading}/>
        <KPI label="Inadimplência"     value={kpis.inadimplencia.value} delta={kpis.inadimplencia.delta} trend={kpis.inadimplencia.trend}   warn icon="dollar" loading={loading}/>
        <KPI label="Recuperado hoje"   value={loading ? '…' : recuperadoFmt} delta={`${cobrancas.totalAberto} em aberto`} trend={cobrancas.recuperadoHoje > 0 ? 'up' : 'neutral'} icon="dollar" loading={loading}/>
      </div>

      {/* ═══════════════ QUICK SHORTCUTS ═══════════════ */}
      <div style={{ marginTop: 28 }}>
        <SectionHead title="Atalhos rápidos" subtitle="O que você costuma fazer ao começar o dia"/>
        <div className="dash-shortcuts">
          <ShortcutCard color="#B70C00" icon="msg"      label="Iniciar bate-papo"   sub="Novo contato ou template"  onClick={() => onNavigate && onNavigate('chat')}/>
          <ShortcutCard color="#10B981" icon="dollar"   label="Cobrar inadimplente" sub="Acionar CORA"              onClick={() => onNavigate && onNavigate('cora')}/>
          <ShortcutCard color="#3B82F6" icon="check"    label="Criar tarefa"        sub="Vai pro Kanban"            onClick={() => onNavigate && onNavigate('tasks')}/>
          <ShortcutCard color="#06B6D4" icon="chart"    label="Relatório do dia"    sub="Pedir pra VERA"            onClick={() => onNavigate && onNavigate('reports')}/>
          <ShortcutCard color="#EC4899" icon="sparkles" label="Falar com DELI"      sub="Pergunte qualquer coisa"   onClick={() => onNavigate && onNavigate('agents')}/>
          <ShortcutCard color="#F59E0B" icon="bot"      label="Configurar agente"   sub="Ajustar regras IA"         onClick={() => onNavigate && onNavigate('agents')}/>
        </div>
      </div>

      {/* ═══════════════ AGENTES AO VIVO ═══════════════ */}
      <div className="dash-agents-card" style={{ marginTop: 28 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="live-dot"/>
            <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 800, color: 'rgba(255,255,255,0.7)' }}>Agentes IA · ao vivo</span>
          </div>
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
            {agentStatus.filter(a => a.status === 'working').length} de {AGENTS.length} trabalhando agora
          </span>
        </div>
        <div className="dash-agents-grid">
          {agentStatus.map(a => (
            <div key={a.id} className={`dash-agent-tile ${a.status}`}>
              {a.status === 'working' && <span className="dash-agent-pulse" style={{ background: a.color }}/>}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <AgentAvatar id={a.id} size={36}/>
                <span className={`dash-agent-status ${a.status}`}>{a.status === 'working' ? 'ativo' : 'ocioso'}</span>
              </div>
              <div className="dash-agent-name">{a.name}</div>
              <div className="dash-agent-role">{a.role}</div>
              <div className="dash-agent-task">{a.status === 'working' && a.task ? a.task : '—'}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ═══════════════ MAIN GRID — chart + feed + agenda ═══════════════ */}
      <div className="dash-main-grid">
        {/* Chart */}
        <div className="card" style={{ padding: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
            <div>
              <h2 className="card-h3">Pedidos · últimos 7 dias</h2>
              <p style={{ fontSize: 12, color: 'var(--g-500)', marginTop: 4 }}>
                {loading
                  ? 'Carregando…'
                  : <>Total: <strong style={{ color: 'var(--g-900)' }}>{chart7d.reduce((s, v) => s + v, 0)}</strong> pedidos</>
                }
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
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, height: 220, paddingBottom: 4 }}>
            {chart7d.map((v, i) => {
              const barH = chartMax > 0 ? (v / chartMax) * 100 : 0;
              const isMax = v === chartMax && v > 0;
              const isToday = i === chart7d.length - 1;
              return (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                  <div style={{
                    fontSize: isMax ? 20 : 14,
                    fontWeight: isMax ? 800 : 700,
                    color: isMax ? 'var(--red)' : 'var(--g-900)',
                    fontVariantNumeric: 'tabular-nums',
                  }}>{v || (loading ? '…' : '0')}</div>
                  <div style={{
                    width: '100%', height: `${Math.max(barH, 2)}%`,
                    background: isToday || isMax ? 'var(--red)' : 'var(--g-900)',
                    opacity: isToday || isMax ? 1 : 0.15,
                    borderRadius: '4px 4px 0 0',
                    animation: `slideUp 600ms var(--ease-out) ${i * 70}ms both`,
                  }}/>
                  <div style={{
                    fontSize: 11, fontWeight: isToday ? 700 : 500,
                    color: isToday ? 'var(--red)' : 'var(--g-500)',
                    textTransform: 'uppercase', letterSpacing: 0.5,
                  }}>{days[i]}{isToday ? ' · hoje' : ''}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Event feed — agent_runs reais via useFeedEventos (Realtime ativo) */}
        <div className="card" style={{ padding: 22 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h2 className="card-h3">Feed da plataforma</h2>
            <span className="live-dot"/>
          </div>
          <div className="dash-feed">
            {feedLoading ? (
              <div style={{ fontSize: 13, color: 'var(--g-500)', textAlign: 'center', padding: '16px 0' }}>
                Carregando…
              </div>
            ) : events.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--g-500)', textAlign: 'center', padding: '16px 0' }}>
                Nenhuma ação registrada ainda
              </div>
            ) : events.map((e, i) => {
              const ag = AGENTS.find(a => a.id === e.agente);
              return (
                <div key={e.id} className="dash-feed-item slide-up" style={{ animationDelay: `${i * 60}ms` }}>
                  <AgentAvatar id={e.agente} size={28}/>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: 'var(--g-900)', lineHeight: 1.4 }}>{e.label}</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                      <div style={{ fontSize: 11, color: 'var(--g-500)' }}>
                        <strong style={{ color: ag?.color }}>{ag?.name}</strong> · {e.ts}
                      </div>
                      {e.cta && (
                        <button className="dash-feed-cta" onClick={() => onNavigate?.(e.cta.screen)}>
                          {e.cta.text}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Agenda — mantém mock até ter integração com Google Calendar */}
        <div className="card dash-agenda" style={{ padding: 22 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h2 className="card-h3">Agenda · hoje</h2>
            <button className="btn-ghost" style={{ fontSize: 12, padding: '4px 8px' }}>
              <Icon name="plus" size={12}/> Adicionar
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {agenda.map(a => (
              <div key={a.id} className={`dash-agenda-item ${a.soon ? 'soon' : ''}`}>
                <div className="dash-agenda-time">{a.time}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="dash-agenda-title">{a.title}</div>
                  <div className="dash-agenda-sub">
                    <span className={`dash-agenda-kind k-${a.kind}`}>{a.kind}</span>
                    <span style={{ color: 'var(--g-500)' }}>· {a.who}</span>
                  </div>
                </div>
                {a.soon && <span className="dash-agenda-soon">em breve</span>}
              </div>
            ))}
          </div>
          <button className="btn-ghost" style={{ width: '100%', justifyContent: 'center', marginTop: 14, fontSize: 12 }}>
            Abrir Google Calendar <Icon name="arrowright" size={12}/>
          </button>
        </div>
      </div>

      {/* ═══════════════ TAREFAS URGENTES ═══════════════ */}
      <div style={{ marginTop: 32 }}>
        <SectionHead
          title="Tarefas urgentes"
          subtitle="Priorizadas pela DELI"
          right={<button className="btn-ghost" style={{ fontSize: 13 }} onClick={() => onNavigate && onNavigate('tasks')}>Ver Kanban <Icon name="arrowright" size={12}/></button>}
        />
        <div className="dash-task-grid">
          {tasks.urgentes.length === 0 && !loading && (
            <div style={{ gridColumn: '1/-1', padding: '24px', textAlign: 'center', color: 'var(--g-500)', fontSize: 13, background: 'var(--g-50)', borderRadius: 12, border: '1px dashed var(--g-200)' }}>
              Nenhuma tarefa urgente no momento
            </div>
          )}
          {tasks.urgentes.map(t => (
            <div key={t.id} className="card" style={{ padding: 16, borderLeft: '3px solid var(--red)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <span className="badge badge-red">URGENTE</span>
                {t.due && <span style={{ fontSize: 11, color: 'var(--g-500)' }}>{t.due}</span>}
              </div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--g-900)', marginBottom: 6 }}>{t.title}</div>
              <div style={{ fontSize: 12, color: 'var(--g-500)', lineHeight: 1.4 }}>{t.desc}</div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {t.assignee && <UserAvatar name={t.assignee} size={24}/>}
                  {t.agent && <AgentAvatar id={t.agent} size={24}/>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 11, color: 'var(--g-500)' }}>
                  {t.comments > 0 && <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><Icon name="msg" size={12}/>{t.comments}</span>}
                  {t.attachments > 0 && <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><Icon name="paperclip" size={12}/>{t.attachments}</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ─── Sub-components ───────────────────────────────────────────────────────────

const SectionHead = ({ title, subtitle, right }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 14 }}>
    <div>
      <h2 className="section-h2" style={{ margin: 0 }}>{title}</h2>
      {subtitle && <div style={{ fontSize: 12, color: 'var(--g-500)', marginTop: 4 }}>{subtitle}</div>}
    </div>
    {right}
  </div>
);

const ShortcutCard = ({ icon, label, sub, onClick, color }) => (
  <button className="dash-shortcut" onClick={onClick} style={{ ['--sh-color']: color }}>
    <span className="dash-shortcut-icon"><Icon name={icon} size={16}/></span>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div className="dash-shortcut-label">{label}</div>
      <div className="dash-shortcut-sub">{sub}</div>
    </div>
    <Icon name="arrowright" size={14}/>
  </button>
);

const KPI = ({ label, value, delta, trend, accent, icon, warn, loading }) => (
  <div className={`kpi ${accent ? 'accent' : ''}`}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
      <div className="kpi-label">{label}</div>
      <div style={{
        width: 30, height: 30, borderRadius: 8,
        background: accent ? 'var(--red-soft)' : warn ? 'rgba(245,158,11,0.12)' : 'var(--g-100)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: accent ? 'var(--red)' : warn ? '#D97706' : 'var(--g-500)',
      }}>
        <Icon name={icon} size={14}/>
      </div>
    </div>
    <div className={`kpi-value ${accent ? 'accent' : ''}`} style={{ marginTop: 8 }}>
      {loading ? <span style={{ opacity: 0.4, fontSize: 18 }}>…</span> : value}
    </div>
    <div className={`kpi-delta ${trend}`}>
      <Icon name={trend === 'up' ? 'arrowup' : trend === 'down' ? 'arrowdown' : 'info'} size={11}/>
      {delta}
    </div>
  </div>
);

// ─── Utils ────────────────────────────────────────────────────────────────────

function fmtBrl(value) {
  const n = Number(value);
  if (Number.isNaN(n)) return '–';
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace('.', ',')}k`;
  return n.toFixed(2).replace('.', ',');
}

export default DashboardScreen;
