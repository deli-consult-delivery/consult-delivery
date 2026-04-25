import AgentAvatar from '../components/AgentAvatar.jsx';
import Icon from '../components/Icon.jsx';
import { AGENTS } from '../data.js';

export default function AgentsPage() {
  return (
    <div className="route-enter" style={{ padding: 32, maxWidth: 1200, margin: '0 auto' }}>
      <h1 className="page-h1">Agentes IA</h1>
      <p className="page-sub">Sua equipe digital — 7 agentes trabalhando 24/7 pela plataforma.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16, marginTop: 28 }}>
        {AGENTS.map(a => (
          <div key={a.id} className="card" style={{ padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <AgentAvatar id={a.id} size={44} />
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--g-900)' }}>{a.name}</div>
                <div style={{ fontSize: 12, color: a.color, fontWeight: 600 }}>{a.role}</div>
              </div>
              <span className="badge badge-green" style={{ marginLeft: 'auto' }}>Ativo</span>
            </div>
            <p style={{ fontSize: 13, color: 'var(--g-600)', lineHeight: 1.5 }}>{a.desc}</p>
            <div style={{ display: 'flex', gap: 6, marginTop: 14 }}>
              <button className="btn-secondary" style={{ fontSize: 12, padding: '6px 12px', flex: 1, justifyContent: 'center' }}>Configurar</button>
              <button className="btn-ghost" style={{ fontSize: 12, padding: '6px 12px' }}>Histórico</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
