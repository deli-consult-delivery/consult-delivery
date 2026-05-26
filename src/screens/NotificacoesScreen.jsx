import { useState, useEffect, useCallback } from 'react';
import Icon from '../components/Icon.jsx';
import AgentAvatar from '../components/AgentAvatar.jsx';
import { supabase } from '../lib/supabase.js';
import {
  listNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
  subscribeToNotifications,
} from '../lib/api.js';

const KIND_META = {
  system:          { icon: 'bell',  color: 'var(--g-500)',   label: 'Sistema'  },
  deli_alert:      { icon: 'bot',   color: '#f59e0b',        label: 'DELI'     },
  channel_message: { icon: 'chat',  color: '#2563eb',        label: 'Chat'     },
  draft_pending:   { icon: 'paper', color: '#ea580c',        label: 'Rascunho' },
};

const LINK_TO_ROUTE = {
  '/configuracoes': 'settings',
  '/settings':      'settings',
  '/chat':          'chat',
  '/deli':          'deli',
  '/dashboard':     'dashboard',
  '/lojas':         'lojas',
  '/drafts':        'drafts-pendentes',
};

const FILTERS = [
  { id: 'all',             label: 'Todas'     },
  { id: 'unread',          label: 'Não lidas' },
  { id: 'system',          label: 'Sistema'   },
  { id: 'deli_alert',      label: 'DELI'      },
  { id: 'channel_message', label: 'Chat'      },
];

function kindMeta(kind) {
  return KIND_META[kind] ?? { icon: 'bell', color: 'var(--g-400)', label: kind ?? '—' };
}

function fmtDate(iso) {
  const d = new Date(iso);
  const mins = Math.floor((Date.now() - d) / 60000);
  if (mins < 1)  return 'agora';
  if (mins < 60) return `${mins}min atrás`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h atrás`;
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function NotificacoesScreen({ tenantDbId, userId, onNavigate }) {
  const [notifs, setNotifs]         = useState([]);
  const [loading, setLoading]       = useState(true);
  const [filter, setFilter]         = useState('all');
  const [markingAll, setMarkingAll] = useState(false);

  const load = useCallback(async () => {
    if (!tenantDbId || !userId) return;
    try {
      const rows = await listNotifications(tenantDbId, userId, { limit: 200 });
      setNotifs(rows);
    } catch (err) {
      console.error('[NotificacoesScreen]', err);
    } finally {
      setLoading(false);
    }
  }, [tenantDbId, userId]);

  useEffect(() => {
    load();
    const channel = subscribeToNotifications(tenantDbId, userId, load, 'screen');
    return () => supabase.removeChannel(channel);
  }, [load]);

  const filtered = notifs.filter(n => {
    if (filter === 'unread') return !n.read_at;
    if (filter !== 'all')   return n.kind === filter;
    return true;
  });

  const unreadCount = notifs.filter(n => !n.read_at).length;

  async function handleClick(n) {
    if (!n.read_at) {
      await markNotificationRead(n.id).catch(() => {});
      setNotifs(prev => prev.map(x => x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x));
    }
    if (n.link && onNavigate) {
      const route = LINK_TO_ROUTE[n.link] ?? n.link.replace(/^\//, '');
      onNavigate(route);
    }
  }

  async function handleDelete(e, id) {
    e.stopPropagation();
    try {
      await deleteNotification(id);
      setNotifs(prev => prev.filter(x => x.id !== id));
    } catch (err) {
      console.error('[NotificacoesScreen] delete', err);
    }
  }

  async function handleMarkAll() {
    if (!unreadCount) return;
    setMarkingAll(true);
    try {
      await markAllNotificationsRead(tenantDbId, userId);
      setNotifs(prev => prev.map(n => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })));
    } catch (err) {
      console.error('[NotificacoesScreen] markAll', err);
    } finally {
      setMarkingAll(false);
    }
  }

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '32px 24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: 'var(--g-900)' }}>Notificações</h1>
          {unreadCount > 0 && (
            <p style={{ fontSize: 12, color: 'var(--g-500)', margin: '4px 0 0' }}>
              {unreadCount} não {unreadCount === 1 ? 'lida' : 'lidas'}
            </p>
          )}
        </div>
        <button
          className="btn-secondary"
          onClick={handleMarkAll}
          disabled={markingAll || !unreadCount}
          style={{ fontSize: 13 }}
        >
          {markingAll ? 'Marcando…' : 'Marcar todas como lidas'}
        </button>
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {FILTERS.map(f => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            style={{
              fontSize: 12, padding: '5px 12px', borderRadius: 20,
              border: '1px solid',
              borderColor: filter === f.id ? 'var(--red)' : 'var(--g-200)',
              background:  filter === f.id ? 'var(--red)' : 'transparent',
              color:        filter === f.id ? '#fff'        : 'var(--g-600)',
              cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4,
            }}
          >
            {f.label}
            {f.id === 'unread' && unreadCount > 0 && (
              <span style={{
                background: filter === f.id ? 'rgba(255,255,255,0.3)' : 'var(--red)',
                color: '#fff', fontSize: 9, fontWeight: 700,
                borderRadius: 8, padding: '1px 5px',
              }}>{unreadCount}</span>
            )}
          </button>
        ))}
      </div>

      {/* Lista */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--g-400)', fontSize: 13 }}>
          Carregando…
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--g-400)' }}>
          <Icon name="bell" size={32} />
          <p style={{ marginTop: 12, fontSize: 14 }}>Nenhuma notificação</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {filtered.map(n => {
            const meta    = kindMeta(n.kind);
            const isUnread = !n.read_at;
            return (
              <div
                key={n.id}
                onClick={() => handleClick(n)}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: 12,
                  padding: '14px 16px', borderRadius: 10,
                  background:   isUnread ? 'var(--g-50)' : 'transparent',
                  border:       '1px solid',
                  borderColor:  isUnread ? 'var(--g-200)' : 'transparent',
                  cursor:       'pointer', transition: 'background 0.12s',
                  position:     'relative',
                }}
              >
                {isUnread && (
                  <div style={{
                    position: 'absolute', left: 5, top: '50%', transform: 'translateY(-50%)',
                    width: 6, height: 6, borderRadius: '50%', background: 'var(--red)',
                  }} />
                )}

                <div style={{ flexShrink: 0, marginLeft: isUnread ? 8 : 0 }}>
                  {n.agent
                    ? <AgentAvatar id={n.agent} size={36} />
                    : (
                      <div style={{
                        width: 36, height: 36, borderRadius: 10,
                        background: 'var(--g-100)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: meta.color,
                      }}>
                        <Icon name={meta.icon} size={16} />
                      </div>
                    )
                  }
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                    <span style={{
                      fontSize: 13,
                      fontWeight:  isUnread ? 600 : 400,
                      color:       isUnread ? 'var(--g-900)' : 'var(--g-700)',
                    }}>{n.title}</span>
                    <span style={{ fontSize: 11, color: 'var(--g-400)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                      {fmtDate(n.created_at)}
                    </span>
                  </div>
                  {n.body && (
                    <p style={{
                      fontSize: 12, color: 'var(--g-500)', margin: '3px 0 0',
                      overflow: 'hidden', textOverflow: 'ellipsis',
                      display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                    }}>{n.body}</p>
                  )}
                  <div style={{ marginTop: 5, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{
                      fontSize: 10, padding: '2px 7px', borderRadius: 4,
                      background: 'var(--g-100)', color: 'var(--g-600)', fontWeight: 500,
                    }}>{meta.label}</span>
                    {n.link && (
                      <span style={{ fontSize: 10, color: 'var(--g-400)' }}>→ {n.link}</span>
                    )}
                  </div>
                </div>

                <button
                  onClick={e => handleDelete(e, n.id)}
                  title="Remover"
                  style={{
                    flexShrink: 0, background: 'none', border: 'none',
                    cursor: 'pointer', color: 'var(--g-400)', padding: 4,
                    opacity: 0.5, display: 'flex', alignItems: 'center',
                  }}
                >
                  <Icon name="x" size={12} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
