import { useState, useEffect } from 'react';
import Icon from './Icon.jsx';
import UserAvatar from './UserAvatar.jsx';

const NAV_GROUPS = [
  {
    label: 'Início',
    items: [
      { id: 'dashboard',     icon: 'home',     label: 'Dashboard'      },
      { id: 'analise-ifood', icon: 'chart',    label: 'Análise iFood'  },
    ],
  },
  {
    label: 'Comunicação',
    items: [
      { id: 'chat',   icon: 'chat',     label: 'Chat Ao Vivo'    },
      { id: 'grupos', icon: 'whatsapp', label: 'Grupos WhatsApp' },
    ],
  },
  {
    label: 'Trabalho',
    items: [
      { id: 'tasks',           icon: 'check', label: 'Tarefas'          },
      { id: 'tarefas-cliente', icon: 'paper', label: 'Tarefas Cliente'  },
      { id: 'crm',             icon: 'users', label: 'Clientes / CRM'   },
    ],
  },
  {
    label: 'Financeiro & IA',
    items: [
      { id: 'cora',    icon: 'dollar', label: 'CORA',       pulse: true },
      { id: 'reports', icon: 'chart',  label: 'Relatórios'              },
      { id: 'agents',  icon: 'bot',    label: 'Agentes IA'              },
    ],
  },
  {
    label: 'Marketing',
    items: [
      { id: 'campanhas', icon: 'megaphone', label: 'Campanhas'        },
      { id: 'lara',      icon: 'bot',       label: 'Régua de Disparo', pulse: true },
    ],
  },
];

const NAV_BOTTOM = [
  { id: 'settings', icon: 'gear', label: 'Configurações' },
];

function SidebarItem({ item, route, setRoute, badge, expanded }) {
  const active = route === item.id;
  return (
    <div
      className={`side-item${active ? ' active' : ''}${item.pulse ? ' pulse-red' : ''}`}
      onClick={() => setRoute(item.id)}
      title={expanded ? undefined : item.label}
    >
      <div className="side-icon-wrap">
        <Icon name={item.icon} size={18} />
        {badge && !expanded ? <span className="side-badge-compact">{badge}</span> : null}
      </div>
      <span className="side-label">{item.label}</span>
      {badge && expanded ? <span className="side-badge-label">{badge}</span> : null}
      {active && !expanded && <div className="side-active-indicator" />}
    </div>
  );
}

export default function Sidebar({ route, setRoute, counts, isOpen }) {
  const [expanded, setExpanded] = useState(() => {
    try { return localStorage.getItem('cd-sidebar-expanded') === 'true'; } catch { return false; }
  });

  useEffect(() => {
    const w = route === 'chat' ? '0px' : (expanded ? '220px' : '64px');
    document.documentElement.style.setProperty('--sidebar-w', w);
    try { localStorage.setItem('cd-sidebar-expanded', String(expanded)); } catch {}
  }, [expanded, route]);

  return (
    <aside className={`sidebar dark-scroll${isOpen ? ' open' : ''}${expanded ? ' expanded' : ''}`}>
      {/* Logo */}
      <div className="sidebar-logo">
        <img
          src="/assets/rocket-logo.png"
          alt="Consult Delivery"
          style={{ width: 28, height: 'auto', display: 'block', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))', flexShrink: 0 }}
        />
        {expanded && (
          <span style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.85)', whiteSpace: 'nowrap', overflow: 'hidden' }}>
            Consult Delivery
          </span>
        )}
      </div>

      {/* Grupos de navegação */}
      <nav className="sidebar-nav scrollbar-hidden">
        {NAV_GROUPS.map((group, gi) => (
          <div key={gi} style={{ width: '100%' }}>
            {gi > 0 && <div className="side-divider" />}
            {expanded && <div className="side-section">{group.label}</div>}
            {group.items.map(item => (
              <SidebarItem
                key={item.id}
                item={item}
                route={route}
                setRoute={setRoute}
                badge={counts[item.id]}
                expanded={expanded}
              />
            ))}
          </div>
        ))}
      </nav>

      {/* Rodapé */}
      <div className="sidebar-footer">
        <div className="side-divider" />
        {NAV_BOTTOM.map(item => (
          <SidebarItem
            key={item.id}
            item={item}
            route={route}
            setRoute={setRoute}
            expanded={expanded}
          />
        ))}
        <div
          className="side-avatar-footer"
          title={expanded ? undefined : 'Wandson Silva — CEO'}
        >
          <UserAvatar name="WS" size={28} src="/assets/wandson.jpg" />
          {expanded && (
            <div style={{ overflow: 'hidden' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.85)', whiteSpace: 'nowrap' }}>Wandson Silva</div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', whiteSpace: 'nowrap' }}>CEO · admin</div>
            </div>
          )}
        </div>
        <button
          className="side-expand-btn"
          onClick={() => setExpanded(v => !v)}
          title={expanded ? 'Recolher menu' : 'Expandir menu'}
        >
          <Icon name={expanded ? 'chevleft' : 'arrowright'} size={14} />
        </button>
      </div>
    </aside>
  );
}
