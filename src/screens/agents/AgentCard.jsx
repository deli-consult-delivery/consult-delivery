import AgentAvatar from '../../components/AgentAvatar.jsx';
import Icon from '../../components/Icon.jsx';
import RequireAgent from '../../components/auth/RequireAgent.jsx';
import { fmtRelTime } from './AGENTS_META.js';

export default function AgentCard({ agent, lastAction, onClick, onInvoke, userId }) {
  const isActive = agent.status === 'ativo';

  return (
    <div
      className="card"
      style={{
        padding: 20,
        cursor: 'pointer',
        opacity: isActive ? 1 : 0.72,
        transition: 'transform 120ms, box-shadow 120ms',
      }}
      onClick={onClick}
      onMouseEnter={e => {
        e.currentTarget.style.transform = 'translateY(-2px)';
        e.currentTarget.style.boxShadow = '0 6px 20px rgba(0,0,0,0.08)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = '';
        e.currentTarget.style.boxShadow = '';
      }}
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
        {isActive ? (
          <RequireAgent agentName={agent.id} userId={userId} fallback={null}>
            <button
              className="btn-primary"
              style={{ fontSize: 12, padding: '6px 14px' }}
              onClick={e => { e.stopPropagation(); onInvoke && onInvoke(agent); }}
            >
              <Icon name="sparkles" size={12} /> Invocar
            </button>
          </RequireAgent>
        ) : (
          <button
            className="btn-primary"
            style={{ fontSize: 12, padding: '6px 14px', opacity: 0.45, cursor: 'not-allowed' }}
            disabled
            title="Agente planejado — disponível no Milestone v2"
            onClick={e => e.stopPropagation()}
          >
            <Icon name="sparkles" size={12} /> Invocar
          </button>
        )}
      </div>
    </div>
  );
}
