import Icon from './Icon.jsx';
import UserAvatar from './UserAvatar.jsx';

const NAV_TOP = [
  { id: 'dashboard',       icon: 'home',      label: 'Dashboard',      tooltip: 'Dashboard' },
  { id: 'analise-ifood',   icon: 'chart',     label: 'Análise iFood',  tooltip: 'Análise iFood' },
  { id: 'chat',            icon: 'chat',      label: 'Chat Unificado', tooltip: 'Chat Unificado' },
  { id: 'grupos',          icon: 'whatsapp',  label: 'Grupos',         tooltip: 'Grupos WhatsApp' },
  { id: 'tasks',           icon: 'check',     label: 'Tarefas',        tooltip: 'Tarefas (Kanban)' },
  { id: 'tarefas-cliente', icon: 'paper',     label: 'Tarefas Cliente', tooltip: 'Tarefas do Cliente' },
  { id: 'crm',             icon: 'users',     label: 'Clientes / CRM', tooltip: 'Clientes / CRM' },
  { id: 'cora',            icon: 'dollar',    label: 'CORA',           tooltip: 'CORA — Cobrança', pulse: true },
  { id: 'reports',         icon: 'chart',     label: 'Relatórios',     tooltip: 'Relatórios' },
  { id: 'agents',          icon: 'bot',       label: 'Agentes IA',     tooltip: 'Agentes IA' },
];

const NAV_BOTTOM = [
  { id: 'settings',        icon: 'gear',      label: 'Configurações',  tooltip: 'Configurações' },
];

function SidebarItem({ item, route, setRoute, badge }) {
  const active = route === item.id;
  return (
    <div
      className={`side-item ${active ? 'active' : ''} ${item.pulse ? 'pulse-red' : ''}`}
      onClick={() => setRoute(item.id)}
      title={item.tooltip}
    >
      <div className="side-icon-wrap">
        <Icon name={item.icon} size={20} />
        {badge ? <span className="side-badge-compact">{badge}</span> : null}
      </div>
      {active && <div className="side-active-indicator" />}
    </div>
  );
}

export default function Sidebar({ route, setRoute, counts, isOpen }) {
  return (
    <aside className={`sidebar dark-scroll${isOpen ? ' open' : ''}`}>
      {/* Logo compacto */}
      <div className="sidebar-logo">
        <img
          src="/assets/rocket-logo.png"
          alt="Consult Delivery"
          style={{ width: 28, height: 'auto', display: 'block', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))' }}
        />
      </div>

      {/* Itens principais */}
      <nav className="sidebar-nav">
        {NAV_TOP.map(item => (
          <SidebarItem
            key={item.id}
            item={item}
            route={route}
            setRoute={setRoute}
            badge={counts[item.id]}
          />
        ))}
      </nav>

      {/* Rodapé */}
      <div className="sidebar-footer">
        {NAV_BOTTOM.map(item => (
          <SidebarItem
            key={item.id}
            item={item}
            route={route}
            setRoute={setRoute}
          />
        ))}
        <div className="side-avatar-footer" title="Wandson Silva — CEO">
          <UserAvatar name="WS" size={28} src="/assets/wandson.jpg" />
        </div>
      </div>
    </aside>
  );
}
