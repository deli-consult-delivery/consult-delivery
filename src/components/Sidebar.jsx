import Logo from './Logo.jsx';
import Icon from './Icon.jsx';
import UserAvatar from './UserAvatar.jsx';

const NAV_ITEMS = [
  { id: 'dashboard', icon: 'home',      label: 'Dashboard' },
  { id: 'chat',      icon: 'chat',      label: 'Chat Unificado' },
  { id: 'grupos',    icon: 'whatsapp',  label: 'Grupos' },
  { id: 'tasks',     icon: 'check',     label: 'Tarefas' },
  { id: 'cora',          icon: 'dollar', label: 'CORA — Cobrança', pulse: true },
  { id: 'analise-ifood', icon: 'chart',  label: 'Análise iFood' },
  { id: 'crm',           icon: 'users',  label: 'Clientes / CRM' },
  { id: 'reports',   icon: 'chart',     label: 'Relatórios' },
  { id: 'agents',    icon: 'bot',       label: 'Agentes IA' },
  { id: 'settings',  icon: 'gear',      label: 'Configurações' },
];

export default function Sidebar({ route, setRoute, counts, isOpen }) {
  return (
    <aside className={`sidebar dark-scroll${isOpen ? ' open' : ''}`}>
      <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <Logo />
      </div>
      <nav style={{ flex: 1, paddingTop: 12, overflowY: 'auto' }} className="dark-scroll">
        {NAV_ITEMS.map(item => {
          const badge = counts[item.id];
          return (
            <div
              key={item.id}
              className={`side-item ${route === item.id ? 'active' : ''}`}
              onClick={() => setRoute(item.id)}
            >
              <Icon name={item.icon} size={18} />
              <span>{item.label}</span>
              {badge ? (
                <span className={`side-badge ${item.pulse ? 'pulse-red' : ''}`}>{badge}</span>
              ) : null}
            </div>
          );
        })}
      </nav>
      <div style={{ padding: 16, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <UserAvatar name="WS" size={38} src="/assets/wandson.jpg" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: 'white', fontSize: 13, fontWeight: 600, lineHeight: 1.2 }}>Wandson Silva</div>
            <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, marginTop: 2 }}>CEO · Consult Delivery</div>
          </div>
          <button className="btn-icon" style={{ color: 'rgba(255,255,255,0.6)' }} title="Sair">
            <Icon name="logout" size={16} />
          </button>
        </div>
      </div>
    </aside>
  );
}
