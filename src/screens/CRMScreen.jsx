import { useState } from 'react';
import Icon from '../components/Icon.jsx';
import AgentAvatar from '../components/AgentAvatar.jsx';
import UserAvatar from '../components/UserAvatar.jsx';
import { CRM_DATA, AGENTS } from '../data.js';

const STATUS_MAP = {
  vip:       { label: 'VIP',        cls: 'badge-yellow' },
  recurrent: { label: 'Recorrente', cls: 'badge-blue'   },
  new:       { label: 'Novo',       cls: 'badge-green'  },
  inactive:  { label: 'Inativo',    cls: 'badge-gray'   },
};

const TABS = [
  { id: 'all',       label: 'Todos'      },
  { id: 'vip',       label: 'VIP'        },
  { id: 'recurrent', label: 'Recorrentes'},
  { id: 'new',       label: 'Novos'      },
  { id: 'inactive',  label: 'Inativos'   },
];

export default function CRMScreen({ tenant }) {
  const data = CRM_DATA[tenant] || { kpis: { total: 0, ativos: 0, ticket: 'R$ 0', nps: 0 }, clients: [] };
  const [tab, setTab] = useState('all');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState(null);

  const filtered = data.clients.filter(c => {
    const matchesTab = tab === 'all' || c.status === tab;
    const matchesSearch = c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.phone.includes(search);
    return matchesTab && matchesSearch;
  });

  const selectedClient = data.clients.find(c => c.id === selectedId);

  const npsColor = data.kpis.nps >= 80 ? 'var(--success)' : data.kpis.nps >= 60 ? 'var(--warn)' : 'var(--red)';

  return (
    <div className="route-enter" style={{ padding: 32, maxWidth: 1400, margin: '0 auto', position: 'relative' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 24 }}>
        <div>
          <h1 className="page-h1">Clientes / CRM</h1>
          <p className="page-sub">{data.kpis.total} clientes cadastrados · {data.kpis.ativos} ativos este mes</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-secondary"><Icon name="filter" size={14} /> Importar</button>
          <button className="btn-primary"><Icon name="plus" size={14} /> Novo cliente</button>
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
        <div className="kpi">
          <div className="kpi-label">Total de clientes</div>
          <div className="kpi-value" style={{ marginTop: 8 }}>{data.kpis.total}</div>
          <div className="kpi-delta up" style={{ marginTop: 10 }}><Icon name="arrowup" size={11} />{data.kpis.ativos} ativos</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Clientes ativos</div>
          <div className="kpi-value" style={{ marginTop: 8, color: 'var(--success)' }}>{data.kpis.ativos}</div>
          <div className="kpi-delta up" style={{ marginTop: 10 }}><Icon name="arrowup" size={11} />Ultimo mes</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Ticket medio</div>
          <div className="kpi-value" style={{ marginTop: 8 }}>{data.kpis.ticket}</div>
          <div className="kpi-delta up" style={{ marginTop: 10 }}><Icon name="arrowup" size={11} />+5% vs mes passado</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">NPS</div>
          <div className="kpi-value" style={{ marginTop: 8, color: npsColor }}>{data.kpis.nps}</div>
          <div className="kpi-delta neutral" style={{ marginTop: 10 }}>
            <Icon name="info" size={11} />
            {data.kpis.nps >= 80 ? 'Excelente' : data.kpis.nps >= 60 ? 'Bom' : 'Atencao'}
          </div>
        </div>
      </div>

      {/* Search + Tabs */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 0 }}>
        <div style={{ display: 'flex', gap: 2, borderBottom: '1px solid var(--g-200)' }}>
          {TABS.map(t => {
            const count = t.id === 'all' ? data.clients.length : data.clients.filter(c => c.status === t.id).length;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                style={{
                  padding: '12px 16px', fontSize: 13,
                  fontWeight: tab === t.id ? 700 : 500,
                  color: tab === t.id ? 'var(--red)' : 'var(--g-600)',
                  borderBottom: tab === t.id ? '2px solid var(--red)' : '2px solid transparent',
                  marginBottom: -1,
                  transition: 'all 150ms',
                  whiteSpace: 'nowrap',
                }}
              >
                {t.label}
                <span style={{ marginLeft: 6, color: 'var(--g-500)', fontSize: 12 }}>{count}</span>
              </button>
            );
          })}
        </div>
        <div style={{ position: 'relative', marginBottom: -1 }}>
          <Icon name="search" size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--g-400)', pointerEvents: 'none' }} />
          <input
            className="input"
            style={{ paddingLeft: 34, width: 240, fontSize: 13 }}
            placeholder="Buscar cliente ou telefone..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Table */}
      <div className="card" style={{ overflow: 'hidden', marginTop: 16 }}>
        <table className="tbl">
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Telefone</th>
              <th>Status</th>
              <th>Pedidos</th>
              <th>Total gasto</th>
              <th>Ultimo pedido</th>
              <th>Cliente desde</th>
              <th>Agente</th>
              <th style={{ textAlign: 'right' }}>Acoes</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(c => {
              const s = STATUS_MAP[c.status];
              const agent = c.agent ? AGENTS.find(a => a.id === c.agent) : null;
              return (
                <tr key={c.id} onClick={() => setSelectedId(c.id)}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <UserAvatar name={c.avatar} size={34} />
                      <div>
                        <div style={{ fontWeight: 600, color: 'var(--g-900)' }}>{c.name}</div>
                      </div>
                    </div>
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--g-600)', fontVariantNumeric: 'tabular-nums' }}>{c.phone}</td>
                  <td>
                    <span className={`badge ${s.cls}`}>{s.label}</span>
                  </td>
                  <td style={{ fontWeight: 600, color: 'var(--g-900)', textAlign: 'center' }}>{c.totalOrders}</td>
                  <td style={{ fontWeight: 700, color: 'var(--g-900)', fontVariantNumeric: 'tabular-nums' }}>{c.totalSpent}</td>
                  <td style={{ fontSize: 12, color: 'var(--g-600)' }}>{c.lastOrder}</td>
                  <td style={{ fontSize: 12, color: 'var(--g-600)' }}>{c.since}</td>
                  <td>
                    {agent
                      ? <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <AgentAvatar id={agent.id} size={22} />
                          <span style={{ fontSize: 12, color: 'var(--g-600)' }}>{agent.name}</span>
                        </div>
                      : <span style={{ fontSize: 12, color: 'var(--g-400)' }}>—</span>
                    }
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button
                      className="btn-ghost"
                      style={{ fontSize: 12 }}
                      onClick={e => { e.stopPropagation(); setSelectedId(c.id); }}
                    >
                      <Icon name="eye" size={12} /> Ver perfil
                    </button>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={9} style={{ textAlign: 'center', padding: 48, color: 'var(--g-500)' }}>
                  Nenhum cliente encontrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Drawer */}
      {selectedClient && (
        <ClientDrawer
          client={selectedClient}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}

function ClientDrawer({ client, onClose }) {
  const s = STATUS_MAP[client.status];
  const agent = client.agent ? AGENTS.find(a => a.id === client.agent) : null;

  const ORDERS_MOCK = [
    { date: '22/04/2026', value: 'R$ 89,00', items: '2 pizzas + refri', status: 'Entregue' },
    { date: '15/04/2026', value: 'R$ 52,00', items: '1 pizza + borda',  status: 'Entregue' },
    { date: '08/04/2026', value: 'R$ 67,00', items: '1 pizza + suco',   status: 'Entregue' },
  ];

  return (
    <div
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(13,13,13,0.4)',
        zIndex: 200,
        display: 'flex', justifyContent: 'flex-end',
        animation: 'fadeIn 200ms ease',
      }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="slide-right scroll"
        style={{
          width: 440, background: 'white', height: '100vh',
          display: 'flex', flexDirection: 'column',
          boxShadow: '-20px 0 40px rgba(0,0,0,0.15)',
          overflowY: 'auto',
        }}
      >
        {/* Drawer Header */}
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid var(--g-200)',
          display: 'flex', alignItems: 'center', gap: 16,
          background: 'var(--g-50)',
        }}>
          <button className="btn-icon" onClick={onClose}><Icon name="x" size={16} /></button>
          <UserAvatar name={client.avatar} size={48} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--g-900)' }}>{client.name}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
              <span className={`badge ${s.cls}`}>{s.label}</span>
              <span style={{ fontSize: 12, color: 'var(--g-500)' }}>desde {client.since}</span>
            </div>
          </div>
        </div>

        <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* Contato */}
          <div>
            <div className="label" style={{ marginBottom: 12 }}>Contato</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Icon name="phone" size={14} style={{ color: 'var(--g-400)' }} />
                <span style={{ fontSize: 13, color: 'var(--g-700)' }}>{client.phone}</span>
                <button className="btn-ghost" style={{ fontSize: 11, padding: '4px 8px', marginLeft: 'auto' }}>
                  <Icon name="whatsapp" size={12} /> WhatsApp
                </button>
              </div>
            </div>
          </div>

          {/* Stats */}
          <div>
            <div className="label" style={{ marginBottom: 12 }}>Resumo</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              {[
                { label: 'Pedidos', value: client.totalOrders },
                { label: 'Total gasto', value: client.totalSpent },
                { label: 'Ticket medio', value: calcTicket(client) },
              ].map(item => (
                <div key={item.label} style={{
                  background: 'var(--g-50)', border: '1px solid var(--g-200)',
                  borderRadius: 'var(--r-md)', padding: '12px 14px',
                }}>
                  <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--g-500)', marginBottom: 6 }}>{item.label}</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--g-900)' }}>{item.value}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Agente responsavel */}
          <div>
            <div className="label" style={{ marginBottom: 12 }}>Agente responsavel</div>
            {agent
              ? <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', background: 'var(--g-50)', border: '1px solid var(--g-200)', borderRadius: 'var(--r-md)' }}>
                  <AgentAvatar id={agent.id} size={36} />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--g-900)' }}>{agent.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--g-500)' }}>{agent.role}</div>
                  </div>
                </div>
              : <div style={{ padding: '12px 14px', background: 'var(--g-50)', border: '1px solid var(--g-200)', borderRadius: 'var(--r-md)', fontSize: 13, color: 'var(--g-500)' }}>
                  Nenhum agente atribuido
                  <button className="btn-ghost" style={{ fontSize: 12, marginLeft: 8, padding: '2px 8px' }}>Atribuir</button>
                </div>
            }
          </div>

          {/* Ultimos pedidos */}
          <div>
            <div className="label" style={{ marginBottom: 12 }}>Ultimos pedidos</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {ORDERS_MOCK.map((o, i) => (
                <div key={i} style={{
                  padding: '12px 14px',
                  background: 'var(--white)', border: '1px solid var(--g-200)',
                  borderRadius: 'var(--r-md)',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                  <div>
                    <div style={{ fontSize: 12, color: 'var(--g-900)', fontWeight: 600 }}>{o.items}</div>
                    <div style={{ fontSize: 11, color: 'var(--g-500)', marginTop: 2 }}>{o.date}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--g-900)' }}>{o.value}</div>
                    <span className="badge badge-green" style={{ marginTop: 4 }}>{o.status}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Acoes rapidas */}
          <div>
            <div className="label" style={{ marginBottom: 12 }}>Acoes rapidas</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button className="btn-secondary" style={{ justifyContent: 'flex-start' }}>
                <Icon name="chat" size={14} /> Abrir conversa no chat
              </button>
              <button className="btn-secondary" style={{ justifyContent: 'flex-start' }}>
                <Icon name="sparkles" size={14} /> Pedir analise a VERA
              </button>
              <button className="btn-secondary" style={{ justifyContent: 'flex-start', color: 'var(--red)', borderColor: 'var(--red-soft)' }}>
                <Icon name="bell" size={14} /> Enviar para CORA (cobranca)
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function calcTicket(client) {
  const raw = client.totalSpent.replace('R$ ', '').replace('.', '').replace(',', '.');
  const total = parseFloat(raw);
  const ticket = total / client.totalOrders;
  return 'R$ ' + ticket.toFixed(2).replace('.', ',');
}
