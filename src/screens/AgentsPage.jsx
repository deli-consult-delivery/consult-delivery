import { useState, useEffect } from 'react';
import AgentAvatar from '../components/AgentAvatar.jsx';
import Icon from '../components/Icon.jsx';
import RequireAgent from '../components/auth/RequireAgent.jsx';
import { listAuditLog } from '../lib/api.js';

const AGENTS_META = [
  {
    id: 'deli',
    name: 'DELI',
    role: 'COO Digital',
    color: '#B70C00',
    status: 'ativo',
    desc: 'Orquestra todos os agentes, monitora métricas e propõe ações com semáforo Verde/Amarelo/Vermelho.',
  },
  {
    id: 'cora',
    name: 'CORA',
    role: 'Cobrança Inteligente',
    color: '#10B981',
    status: 'ativo',
    desc: 'Recupera inadimplentes via WhatsApp usando réguas de cobrança configuráveis.',
  },
  {
    id: 'analista-ifood',
    name: 'Analista iFood',
    role: 'Análise de Loja',
    color: '#EA580C',
    status: 'ativo',
    desc: 'Analisa dados da loja no iFood e gera relatório de pontos críticos e oportunidades.',
  },
  {
    id: 'lara',
    name: 'LARA',
    role: 'Marketing & Conteúdo',
    color: '#EC4899',
    status: 'planejado',
    desc: 'Cria campanhas e posts automáticos para redes sociais e iFood.',
  },
  {
    id: 'sofia',
    name: 'SOFIA',
    role: 'SDR / Prospecção',
    color: '#8B5CF6',
    status: 'planejado',
    desc: 'Prospecta novos restaurantes e qualifica leads para a equipe comercial.',
  },
  {
    id: 'breno',
    name: 'BRENO',
    role: 'Atendimento & Suporte',
    color: '#3B82F6',
    status: 'planejado',
    desc: 'Responde dúvidas de clientes e equipe 24/7 via WhatsApp e painel.',
  },
  {
    id: 'max',
    name: 'MAX',
    role: 'Consultor Técnico',
    color: '#F59E0B',
    status: 'planejado',
    desc: 'Otimiza cardápio, fotos e configurações da loja no iFood.',
  },
  {
    id: 'vera',
    name: 'VERA',
    role: 'BI & Relatórios',
    color: '#06B6D4',
    status: 'planejado',
    desc: 'Gera insights e relatórios automáticos a partir dos dados da operação.',
  },
];

function fmtRelTime(iso) {
  if (!iso) return null;
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'agora';
  if (mins < 60) return `há ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `há ${hrs}h`;
  return `há ${Math.floor(hrs / 24)} dias`;
}

function AgentDetailPanel({ agent, logs, onClose, userId }) {
  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(13,13,13,0.4)',
        zIndex: 200, display: 'flex', justifyContent: 'flex-end',
        animation: 'fadeIn 200ms ease',
      }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="slide-right"
        style={{
          width: 420, maxWidth: '95vw', background: 'var(--white)', height: '100vh',
          display: 'flex', flexDirection: 'column',
          boxShadow: '-20px 0 40px rgba(0,0,0,0.15)',
        }}
      >
        <div style={{
          padding: '20px 24px', borderBottom: '1px solid var(--g-200)',
          display: 'flex', alignItems: 'center', gap: 14,
        }}>
          <AgentAvatar id={agent.id} size={48} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--g-900)' }}>{agent.name}</div>
            <div style={{ fontSize: 12, color: agent.color, fontWeight: 600 }}>{agent.role}</div>
          </div>
          <button className="btn-icon" onClick={onClose}><Icon name="x" size={16} /></button>
        </div>

        <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--g-100)' }}>
          <p style={{ fontSize: 13, color: 'var(--g-600)', lineHeight: 1.6, margin: 0 }}>{agent.desc}</p>
          <div style={{ marginTop: 10 }}>
            <span style={{
              fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 10,
              background: agent.status === 'ativo' ? 'rgba(16,185,129,0.12)' : 'var(--g-100)',
              color: agent.status === 'ativo' ? 'var(--success)' : 'var(--g-500)',
            }}>
              {agent.status === 'ativo' ? '● Ativo' : '○ Planejado'}
            </span>
          </div>
        </div>

        {agent.status === 'ativo' && (
          <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--g-100)' }}>
            <RequireAgent agentName={agent.id} userId={userId} fallback={
              <div style={{ fontSize: 12, color: 'var(--g-400)', fontStyle: 'italic' }}>
                Você não tem permissão para invocar este agente.
              </div>
            }>
              <button className="btn-primary" style={{ width: '100%', justifyContent: 'center', fontSize: 13 }}>
                <Icon name="sparkles" size={13} /> Invocar {agent.name}
              </button>
            </RequireAgent>
          </div>
        )}

        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }} className="scroll">
          <div className="label" style={{ marginBottom: 12 }}>Histórico de ações</div>
          {logs.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--g-400)', textAlign: 'center', padding: '24px 0' }}>
              Nenhuma ação registrada ainda.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0, position: 'relative' }}>
              {logs.map((log, i) => (
                <div key={log.id} style={{ display: 'flex', gap: 12, paddingBottom: i < logs.length - 1 ? 16 : 0 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                    <div style={{
                      width: 8, height: 8, borderRadius: '50%', marginTop: 4,
                      background: i === 0 ? agent.color : 'var(--g-300)',
                    }} />
                    {i < logs.length - 1 && (
                      <div style={{ width: 1, flex: 1, background: 'var(--g-200)', marginTop: 4 }} />
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0, paddingBottom: 2 }}>
                    <div style={{ fontSize: 13, color: 'var(--g-900)', lineHeight: 1.5 }}>{log.action}</div>
                    {log.resource && (
                      <div style={{ fontSize: 11, color: 'var(--g-500)', marginTop: 2 }}>{log.resource}</div>
                    )}
                    <div style={{ fontSize: 11, color: 'var(--g-400)', marginTop: 2 }}>
                      {fmtRelTime(log.created_at)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AgentCard({ agent, lastAction, onClick, userId }) {
  const isActive = agent.status === 'ativo';

  return (
    <div
      className="card"
      style={{ padding: 20, cursor: 'pointer', opacity: isActive ? 1 : 0.72, transition: 'transform 120ms, box-shadow 120ms' }}
      onClick={onClick}
      onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(0,0,0,0.08)'; }}
      onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = ''; }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <AgentAvatar id={agent.id} size={44} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--g-900)' }}>{agent.name}</div>
          <div style={{ fontSize: 12, color: agent.color, fontWeight: 600 }}>{agent.role}</div>
        </div>
        <span style={{
          fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 10, flexShrink: 0,
          background: isActive ? 'rgba(16,185,129,0.12)' : 'var(--g-100)',
          color: isActive ? 'var(--success)' : 'var(--g-500)',
        }}>
          {isActive ? '● Ativo' : '○ Planejado'}
        </span>
      </div>

      <p style={{ fontSize: 12, color: 'var(--g-600)', lineHeight: 1.5, margin: '0 0 12px' }}>{agent.desc}</p>

      {lastAction && (
        <div style={{
          fontSize: 11, color: 'var(--g-500)', padding: '8px 10px',
          background: 'var(--g-50)', borderRadius: 6,
          display: 'flex', gap: 6, alignItems: 'flex-start', marginBottom: 12,
        }}>
          <Icon name="info" size={11} style={{ marginTop: 1, flexShrink: 0 }} />
          <span style={{ lineHeight: 1.4 }}>
            <strong>{fmtRelTime(lastAction.created_at)}</strong> · {lastAction.action}
          </span>
        </div>
      )}

      <div style={{ display: 'flex', gap: 6 }}>
        <button
          className="btn-secondary"
          style={{ fontSize: 12, padding: '6px 12px', flex: 1, justifyContent: 'center' }}
          onClick={e => { e.stopPropagation(); onClick(); }}
        >
          <Icon name="eye" size={12} /> Histórico
        </button>
        {isActive && (
          <RequireAgent agentName={agent.id} userId={userId} fallback={null}>
            <button
              className="btn-primary"
              style={{ fontSize: 12, padding: '6px 14px' }}
              onClick={e => e.stopPropagation()}
            >
              <Icon name="sparkles" size={12} /> Invocar
            </button>
          </RequireAgent>
        )}
      </div>
    </div>
  );
}

export default function AgentsPage({ tenantId, userId }) {
  const [logsByAgent, setLogsByAgent] = useState({});
  const [selected, setSelected]       = useState(null);
  const [fullLogs, setFullLogs]       = useState([]);

  useEffect(() => {
    if (!tenantId) return;
    listAuditLog(tenantId, { limit: 100 })
      .then(rows => {
        const byAgent = {};
        rows.forEach(r => {
          if (!r.agent_name) return;
          if (!byAgent[r.agent_name]) byAgent[r.agent_name] = [];
          byAgent[r.agent_name].push(r);
        });
        setLogsByAgent(byAgent);
      })
      .catch(err => console.error('[AgentsPage] audit_log', err));
  }, [tenantId]);

  function openDetail(agent) {
    setSelected(agent);
    setFullLogs(logsByAgent[agent.id] ?? []);
  }

  const activeAgents  = AGENTS_META.filter(a => a.status === 'ativo');
  const plannedAgents = AGENTS_META.filter(a => a.status === 'planejado');

  return (
    <div className="route-enter page-container" style={{ padding: 32, maxWidth: 1200, margin: '0 auto' }}>
      <h1 className="page-h1">Agentes IA</h1>
      <p className="page-sub">Sua equipe digital — agentes trabalhando 24/7 pela plataforma.</p>

      <div style={{ marginTop: 28 }}>
        <div className="label" style={{ marginBottom: 14 }}>Ativos agora</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
          {activeAgents.map(a => (
            <AgentCard
              key={a.id}
              agent={a}
              lastAction={(logsByAgent[a.id] ?? [])[0] ?? null}
              onClick={() => openDetail(a)}
              userId={userId}
            />
          ))}
        </div>
      </div>

      <div style={{ marginTop: 36 }}>
        <div className="label" style={{ marginBottom: 14 }}>Planejados — Milestone v2+</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
          {plannedAgents.map(a => (
            <AgentCard
              key={a.id}
              agent={a}
              lastAction={null}
              onClick={() => openDetail(a)}
              userId={userId}
            />
          ))}
        </div>
      </div>

      {selected && (
        <AgentDetailPanel
          agent={selected}
          logs={fullLogs}
          onClose={() => setSelected(null)}
          userId={userId}
        />
      )}
    </div>
  );
}