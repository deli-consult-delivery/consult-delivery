import { useState, useEffect } from 'react';
import Icon from './Icon.jsx';
import AgentAvatar from './AgentAvatar.jsx';
import UserAvatar from './UserAvatar.jsx';
import { TENANTS as MOCK_TENANTS } from '../data.js';
import { supabase } from '../lib/supabase.js';
import { listNotifications, markNotificationRead, markAllNotificationsRead, subscribeToNotifications } from '../lib/api.js';

const ROUTE_LABELS = {
  dashboard: 'Dashboard',
  chat: 'Chat Ao Vivo',
  tasks: 'Tarefas',
  cora: 'CORA — Cobrança',
  crm: 'Clientes / CRM',
  reports: 'Relatórios',
  agents: 'Agentes IA',
  settings: 'Configurações',
};

const THEMES = [
  { id: 'claro',  label: 'Claro',  icon: 'sun'      },
  { id: 'cinza',  label: 'Cinza',  icon: 'contrast' },
  { id: 'escuro', label: 'Escuro', icon: 'moon'     },
];

function fmtTime(isoString) {
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'agora';
  if (mins < 60) return `${mins}min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

export default function Topbar({ route, tenant, setTenant, tenants, theme = 'claro', setTheme, onMenuToggle, tenantId, userId }) {
  const [openTenant, setOpenTenant] = useState(false);
  const [openNotif, setOpenNotif] = useState(false);
  const [openTheme, setOpenTheme] = useState(false);
  const [openUser, setOpenUser] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount]     = useState(0);
  const [currentUser, setCurrentUser]     = useState(null);
  const list = tenants ?? MOCK_TENANTS;
  const cur = list.find(t => t.id === tenant) ?? list[0];

  useEffect(() => {
    if (!tenantId || !userId) return;
    const load = () =>
      listNotifications(tenantId, userId)
        .then(rows => {
          setNotifications(rows);
          setUnreadCount(rows.filter(n => !n.read_at).length);
        })
        .catch(err => console.error('[Topbar] notifications', err));
    load();
    const channel = subscribeToNotifications(tenantId, userId, load);
    return () => supabase.removeChannel(channel);
  }, [tenantId, userId]);

  useEffect(() => {
    if (!userId) { setCurrentUser(null); return; }
    let alive = true;
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!alive || !user) return;
        const [{ data: profile }, { data: member }] = await Promise.all([
          supabase.from('profiles').select('full_name, avatar_url').eq('id', user.id).maybeSingle(),
          supabase.from('tenant_members').select('display_name, role').eq('user_id', user.id).maybeSingle(),
        ]);
        if (!alive) return;
        setCurrentUser({
          id:     user.id,
          email:  user.email,
          name:   member?.display_name || profile?.full_name || user.email?.split('@')[0] || 'Usuário',
          avatar: profile?.avatar_url || null,
          role:   member?.role || null,
        });
      } catch { /* ignore */ }
    })();
    return () => { alive = false; };
  }, [userId]);

  async function handleLogout() {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.error('[Topbar] signOut', err);
    }
    setOpenUser(false);
  }

  return (
    <header className="topbar">
      {/* Hamburguer — visível só no mobile via CSS */}
      <button
        className="btn-icon topbar-menu-btn"
        onClick={onMenuToggle}
        title="Menu"
        style={{ flexShrink: 0 }}
      >
        <Icon name="menu" size={20} />
      </button>

      <div className="topbar-breadcrumb" style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--g-500)', fontSize: 13 }}>
        <span>Plataforma</span>
        <Icon name="chevright" size={14} />
        <span style={{ color: 'var(--g-900)', fontWeight: 600 }}>{ROUTE_LABELS[route] || route}</span>
      </div>

      <div className="topbar-search" style={{ flex: 1, maxWidth: 520, marginLeft: 24, position: 'relative' }}>
        <Icon name="search" size={16} style={{ position: 'absolute', top: 12, left: 14, color: 'var(--g-400)' }} />
        <input
          className="input"
          placeholder="Buscar clientes, pedidos, tarefas, agentes…"
          style={{ paddingLeft: 40, background: 'var(--g-50)', borderColor: 'transparent' }}
        />
        <span style={{
          position: 'absolute', right: 10, top: 10,
          fontSize: 10, color: 'var(--g-400)',
          background: 'var(--white)', border: '1px solid var(--g-300)',
          padding: '2px 6px', borderRadius: 4, fontFamily: 'ui-monospace, monospace',
        }}>⌘K</span>
      </div>

      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
        {/* Tenant selector — oculto no mobile via CSS */}
        <div className="topbar-tenant" style={{ position: 'relative' }}>
          <button
            className="btn-secondary"
            style={{ padding: '8px 12px', minWidth: 200, justifyContent: 'space-between' }}
            onClick={() => setOpenTenant(v => !v)}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{
                width: 22, height: 22, borderRadius: 6,
                background: cur.color + '22',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12,
              }}>{cur.emoji}</span>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{cur.name}</span>
            </span>
            <Icon name="chevdown" size={14} />
          </button>
          {openTenant && (
            <div className="dropdown" style={{ right: 0, minWidth: 280 }} onMouseLeave={() => setOpenTenant(false)}>
              <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--g-100)', fontSize: 11, color: 'var(--g-500)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: 0.5 }}>
                Clientes ({list.length})
              </div>
              {list.map(t => (
                <div
                  key={t.id}
                  className={`dropdown-item ${tenant === t.id ? 'active' : ''}`}
                  onClick={() => { setTenant(t.id); setOpenTenant(false); }}
                >
                  <span style={{ width: 26, height: 26, borderRadius: 6, background: t.color + '22', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{t.emoji}</span>
                  <span style={{ flex: 1 }}>{t.name}</span>
                  {tenant === t.id && <Icon name="check" size={14} />}
                </div>
              ))}
              <div style={{ padding: 10, borderTop: '1px solid var(--g-100)' }}>
                <button className="btn-ghost" style={{ width: '100%', justifyContent: 'center' }}>
                  <Icon name="plus" size={14} /> Novo cliente
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Notifications */}
        <div style={{ position: 'relative' }}>
          <button className="btn-icon" onClick={() => setOpenNotif(v => !v)} style={{ position: 'relative' }}>
            <Icon name="bell" size={18} />
            {unreadCount > 0 && (
              <span style={{
                position: 'absolute', top: 4, right: 4,
                minWidth: 16, height: 16, borderRadius: 8,
                background: 'var(--red)', color: '#fff',
                fontSize: 9, fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '0 3px',
              }}>
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>
          {openNotif && (
            <div className="dropdown" style={{ right: 0, minWidth: 320 }} onMouseLeave={() => setOpenNotif(false)}>
              <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--g-100)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong style={{ fontSize: 13 }}>Notificações</strong>
                <button
                  className="btn-ghost"
                  style={{ fontSize: 11, padding: '2px 8px' }}
                  onClick={() =>
                    markAllNotificationsRead(tenantId, userId).then(() => {
                      setNotifications(prev => prev.map(n => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })));
                      setUnreadCount(0);
                    })
                  }
                >
                  Marcar lidas
                </button>
              </div>
              {notifications.length === 0 && (
                <div style={{ padding: '24px 14px', textAlign: 'center', fontSize: 12, color: 'var(--g-400)' }}>
                  Nenhuma notificação
                </div>
              )}
              {notifications.map(n => (
                <div
                  key={n.id}
                  className="dropdown-item"
                  style={{
                    alignItems: 'flex-start',
                    background: !n.read_at ? 'var(--g-50)' : undefined,
                    cursor: 'pointer',
                    position: 'relative',
                  }}
                  onClick={() => {
                    if (!n.read_at) {
                      markNotificationRead(n.id).then(() => {
                        setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x));
                        setUnreadCount(c => Math.max(0, c - 1));
                      });
                    }
                  }}
                >
                  {!n.read_at && (
                    <span style={{
                      position: 'absolute', left: 6, top: '50%', transform: 'translateY(-50%)',
                      width: 6, height: 6, borderRadius: '50%', background: 'var(--red)', flexShrink: 0,
                    }} />
                  )}
                  <div style={{ marginLeft: !n.read_at ? 8 : 0, flexShrink: 0 }}>
                    {n.agent
                      ? <AgentAvatar id={n.agent} size={28} />
                      : <span style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--g-100)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="bell" size={14} /></span>
                    }
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: !n.read_at ? 600 : 400 }}>{n.title}</div>
                    {n.body && (
                      <div style={{ fontSize: 11, color: 'var(--g-600)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {n.body.length > 60 ? n.body.slice(0, 60) + '…' : n.body}
                      </div>
                    )}
                    <div style={{ fontSize: 10, color: 'var(--g-500)', marginTop: 2 }}>{fmtTime(n.created_at)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Theme switcher */}
        <div style={{ position: 'relative' }}>
          <button
            className="btn-icon"
            title="Tema"
            onClick={() => setOpenTheme(v => !v)}
            style={{ color: theme !== 'claro' ? 'var(--red)' : 'var(--g-600)' }}
          >
            <Icon name={THEMES.find(t => t.id === theme)?.icon || 'sun'} size={18} />
          </button>
          {openTheme && (
            <div className="dropdown" style={{ right: 0, minWidth: 160 }} onMouseLeave={() => setOpenTheme(false)}>
              <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--g-100)', fontSize: 10, fontWeight: 700, color: 'var(--g-500)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Tema
              </div>
              {THEMES.map(t => (
                <div
                  key={t.id}
                  className={`dropdown-item ${theme === t.id ? 'active' : ''}`}
                  onClick={() => { setTheme?.(t.id); setOpenTheme(false); }}
                >
                  <Icon name={t.icon} size={14} />
                  {t.label}
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ width: 1, height: 28, background: 'var(--g-200)' }} />

        {/* User menu */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setOpenUser(v => !v)}
            title={currentUser ? `${currentUser.name} (${currentUser.email})` : 'Conta'}
            style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <UserAvatar
              name={currentUser?.name || 'U'}
              size={36}
              src={currentUser?.avatar || undefined}
            />
            <Icon name="chevdown" size={12} />
          </button>
          {openUser && (
            <div className="dropdown" style={{ right: 0, minWidth: 240 }} onMouseLeave={() => setOpenUser(false)}>
              <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--g-100)', display: 'flex', alignItems: 'center', gap: 10 }}>
                <UserAvatar
                  name={currentUser?.name || 'U'}
                  size={36}
                  src={currentUser?.avatar || undefined}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--g-900)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {currentUser?.name || 'Usuário'}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--g-500)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {currentUser?.email || ''}
                  </div>
                  {currentUser?.role && (
                    <div style={{ fontSize: 10, color: 'var(--g-500)', marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.4, fontWeight: 600 }}>
                      {currentUser.role}
                    </div>
                  )}
                </div>
              </div>
              <div
                className="dropdown-item"
                style={{ color: 'var(--red)', cursor: 'pointer' }}
                onClick={handleLogout}
              >
                <Icon name="logout" size={14} />
                Sair
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
