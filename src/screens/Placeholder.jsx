import Icon from '../components/Icon.jsx';
import AgentAvatar from '../components/AgentAvatar.jsx';

export default function Placeholder({ title, desc, icon, agent }) {
  return (
    <div className="route-enter" style={{ padding: 32, maxWidth: 800, margin: '40px auto', textAlign: 'center' }}>
      <div style={{
        width: 96, height: 96, background: 'var(--g-100)', borderRadius: '50%',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--g-400)', marginBottom: 20,
      }}>
        {agent ? <AgentAvatar id={agent} size={64} /> : <Icon name={icon} size={40} />}
      </div>
      <h1 className="page-h1">{title}</h1>
      <p className="page-sub" style={{ maxWidth: 420, margin: '12px auto 0' }}>{desc}</p>
      <div style={{ marginTop: 28 }}>
        <button className="btn-primary">
          <Icon name="bell" size={14} /> Avise-me quando estiver pronto
        </button>
      </div>
    </div>
  );
}
