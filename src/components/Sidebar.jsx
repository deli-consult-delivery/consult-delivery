import { useState, useEffect } from 'react';
import Icon from './Icon.jsx';
import { usePermissions } from '../hooks/usePermissions.js';

// null = visible to all authenticated users
const NAV_GROUPS = [
  {
    label: 'Início',
    items: [
      { id: 'dashboard', icon: 'home',    label: 'Dashboard' },
      { id: 'deli',      icon: 'bot',     label: 'DELI', pulse: true, roles: ['admin', 'deli_owner'] },
      { id: 'console-v2', icon: 'bot',    label: 'Console v2 · F1', roles: ['admin'] },
    ],
  },
  {
    label: 'Operação',
    items: [
      { id: 'chat',             icon: 'chat',        label: 'Chat Ao Vivo',   roles: ['admin', 'atendimento', 'marketing'] },
      { id: 'lojas',            icon: 'building',    label: 'Lojas' },
      { id: 'crm',              icon: 'users',       label: 'Clientes',       roles: ['admin', 'marketing'] },
      { id: 'contratos',        icon: 'paper',       label: 'Contratos',      roles: ['admin'] },
      { id: 'recontratacao',    icon: 'send',        label: 'Re-contratação', roles: ['admin'] },
      { id: 'tarefas',          icon: 'checkcircle', label: 'Todas Tarefas',  roles: ['admin'] },
      { id: 'tarefas-clientes', icon: 'columns',     label: 'Espaços',        roles: ['admin', 'marketing'] },
      { id: 'onboarding',       icon: 'checkcircle', label: 'Onboarding',     roles: ['admin', 'atendimento', 'marketing'] },
    ],
  },
  {
    label: 'Agentes IA',
    items: [
      { id: 'agents', icon: 'bot', label: 'Painel Agentes', roles: ['admin'] },
    ],
  },
  {
    label: 'Marketing',
    items: [
      { id: 'campanhas',        icon: 'megaphone', label: 'Campanhas', roles: ['admin', 'marketing'] },
      { id: 'drafts-pendentes', icon: 'paper',     label: 'Disparos',  roles: ['admin', 'marketing'] },
    ],
  },
  {
    label: 'Dados',
    items: [
      { id: 'reports', icon: 'chart', label: 'Relatórios', roles: ['admin', 'marketing'] },
    ],
  },
  {
    label: 'Automações',
    items: [
      { id: 'automacoes', icon: 'bot', label: 'Heartbeats', roles: ['admin'] },
    ],
  },
  {
    label: 'Sistema',
    items: [
      { id: 'notificacoes', icon: 'bell', label: 'Notificações' },
    ],
  },
];

const NAV_ADMIN = [
  { id: 'grupos',   icon: 'whatsapp', label: 'Grupos WhatsApp', roles: ['admin', 'atendimento'] },
  { id: 'settings', icon: 'gear',     label: 'Configurações',   roles: ['admin'] },
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

export default function Sidebar({ route, setRoute, counts, isOpen, userId, onClose }) {
  const [expanded, setExpanded] = useState(() => {
    try { return localStorage.getItem('cd-sidebar-expanded') === 'true'; } catch { return false; }
  });
  const [hidden, setHidden] = useState(() => {
    try { return localStorage.getItem('cd-sidebar-hidden') === 'true'; } catch { return false; }
  });

  const { hasRole, loading: permLoading, canAccessScreen } = usePermissions(userId);

  const visible = (item) => {
    if (permLoading) return true;
    const override = canAccessScreen(item.id);
    if (override !== null) return override;
    return !item.roles || item.roles.some(r => hasRole(r));
  };

  useEffect(() => {
    const w = hidden ? '0px' : expanded ? '220px' : '64px';
    document.documentElement.style.setProperty('--sidebar-w', w);
    try {
      localStorage.setItem('cd-sidebar-expanded', String(expanded));
      localStorage.setItem('cd-sidebar-hidden', String(hidden));
    } catch {}
  }, [expanded, hidden]);

  useEffect(() => {
    if (isOpen && hidden) setHidden(false);
  }, [isOpen]);

  const hide = () => setHidden(true);
  const show = () => setHidden(false);

  return (
    <>
      {hidden && (
        <button onClick={show} title="Abrir menu" className="side-reveal-btn">
          <Icon name="arrowright" size={12} />
        </button>
      )}

      <aside
        className={`sidebar dark-scroll${isOpen ? ' open' : ''}${expanded ? ' expanded' : ''}${hidden ? ' hidden' : ''}`}
        style={hidden ? { display: 'none' } : undefined}
      >
        {/* Logo */}
        <div className="sidebar-logo">
          <img src="/assets/rocket-logo.png" alt="Consult Delivery"
            style={{ width: 28, height: 'auto', display: 'block', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))', flexShrink: 0 }} />
          {expanded && (
            <span style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.85)', whiteSpace: 'nowrap', overflow: 'hidden' }}>
              Consult Delivery
            </span>
          )}
          {isOpen && onClose && (
            <button onClick={onClose} className="sidebar-mobile-close" title="Fechar menu">
              <Icon name="x" size={16} />
            </button>
          )}
        </div>

        {/* Grupos de navegação */}
        <nav className="sidebar-nav scrollbar-hidden">
          {NAV_GROUPS.map((group, gi) => {
            const visibleItems = group.items.filter(visible);
            if (!visibleItems.length) return null;
            return (
              <div key={gi} style={{ width: '100%' }}>
                {gi > 0 && <div className="side-divider" />}
                {expanded && <div className="side-section">{group.label}</div>}
                {visibleItems.map(item => (
                  <SidebarItem key={item.id} item={item} route={route} setRoute={setRoute} badge={counts[item.id]} expanded={expanded} />
                ))}
              </div>
            );
          })}
        </nav>

        {/* Rodapé — Admin */}
        <div className="sidebar-footer">
          <div className="side-divider" />
          {expanded && <div className="side-section">Admin</div>}
          {NAV_ADMIN.filter(visible).map(item => (
            <SidebarItem key={item.id} item={item} route={route} setRoute={setRoute} expanded={expanded} />
          ))}
          <button className="side-expand-btn" onClick={() => setExpanded(v => !v)} title={expanded ? 'Recolher menu' : 'Expandir menu'}>
            <Icon name={expanded ? 'chevleft' : 'arrowright'} size={14} />
          </button>
          <button className="side-hide-btn" onClick={hide} title="Fechar menu">
            <Icon name="x" size={13} />
          </button>
        </div>
      </aside>
    </>
  );
}
