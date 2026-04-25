import { useState } from 'react';
import Icon from './Icon.jsx';
import AgentAvatar from './AgentAvatar.jsx';
import UserAvatar from './UserAvatar.jsx';
import { TENANTS } from '../data.js';

const ROUTE_LABELS = {
  dashboard: 'Dashboard',
  chat: 'Chat Unificado',
  tasks: 'Tarefas',
  cora: 'CORA — Cobrança',
  crm: 'Clientes / CRM',
  reports: 'Relatórios',
  agents: 'Agentes IA',
  settings: 'Configurações',
};

const NOTIFICATIONS = [
  { agent: 'cora', text: 'Carlos M. vai pagar R$ 340 em 2x', time: 'agora' },
  { agent: 'max',  text: 'Detectei foto ruim no iFood (Burger House)', time: '20min' },
  { agent: 'deli', text: '3 tarefas foram priorizadas pra hoje', time: '1h' },
];

export default function Topbar({ route, tenant, setTenant }) {
  const [openTenant, setOpenTenant] = useState(false);
  const [openNotif, setOpenNotif] = useState(false);
  const cur = TENANTS.find(t => t.id === tenant);

  return (
    <header className="topbar">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--g-500)', fontSize: 13 }}>
        <span>Plataforma</span>
        <Icon name="chevright" size={14} />
        <span style={{ color: 'var(--g-900)', fontWeight: 600 }}>{ROUTE_LABELS[route] || route}</span>
      </div>

      <div style={{ flex: 1, maxWidth: 520, marginLeft: 24, position: 'relative' }}>
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
        {/* Tenant selector */}
        <div style={{ position: 'relative' }}>
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
                Clientes ({TENANTS.length})
              </div>
              {TENANTS.map(t => (
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
            <span style={{
              position: 'absolute', top: 6, right: 6,
              width: 8, height: 8, borderRadius: '50%', background: 'var(--red)',
            }} className="pulse-red" />
          </button>
          {openNotif && (
            <div className="dropdown" style={{ right: 0, minWidth: 320 }} onMouseLeave={() => setOpenNotif(false)}>
              <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--g-100)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong style={{ fontSize: 13 }}>Notificações</strong>
                <button className="btn-ghost" style={{ fontSize: 11, padding: '2px 8px' }}>Marcar lidas</button>
              </div>
              {NOTIFICATIONS.map((n, i) => (
                <div key={i} className="dropdown-item" style={{ alignItems: 'flex-start' }}>
                  <AgentAvatar id={n.agent} size={28} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12 }}>{n.text}</div>
                    <div style={{ fontSize: 10, color: 'var(--g-500)', marginTop: 2 }}>{n.time}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ width: 1, height: 28, background: 'var(--g-200)' }} />
        <UserAvatar name="WS" size={36} src="/assets/wandson.jpg" />
      </div>
    </header>
  );
}
