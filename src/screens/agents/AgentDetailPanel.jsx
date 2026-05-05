import AgentAvatar from '../../components/AgentAvatar.jsx';
import Icon from '../../components/Icon.jsx';
import RequireAgent from '../../components/auth/RequireAgent.jsx';
import { fmtRelTime } from './AGENTS_META.js';

export default function AgentDetailPanel({ agent, logs, onClose, onInvoke, userId }) {
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
              <button
                className="btn-primary"
                style={{ width: '100%', justifyContent: 'center', fontSize: 13 }}
                onClick={() => onInvoke && onInvoke(agent)}
              >
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
