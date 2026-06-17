import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase.js';

const BRIDGE = import.meta.env.VITE_BRIDGE_URL || 'https://bridge.consultdelivery.com.br';

const STATUS_COLORS = {
  open:        { bg: 'var(--bg)',          text: 'var(--tx2)',  label: 'Aberto' },
  in_progress: { bg: '#e6effd',            text: '#1d4ed8',     label: 'Em andamento' },
  blocked:     { bg: 'var(--amber-soft)',  text: 'var(--amber)', label: 'Bloqueado' },
  review:      { bg: '#f1e9fb',            text: '#7c3aed',     label: 'Revisão' },
  resolved:    { bg: 'var(--green-soft)',  text: 'var(--green)', label: 'Resolvido' },
  closed:      { bg: 'var(--bg)',          text: 'var(--tx2)',  label: 'Fechado' },
};

const PRIORITY_COLORS = {
  urgent: '#ef4444',
  high:   '#f97316',
  medium: '#eab308',
  low:    '#6b7280',
};

const PRIORITY_LABELS = { urgent: 'Urgente', high: 'Alta', medium: 'Média', low: 'Baixa' };

const STATUS_WORKFLOW = ['open', 'in_progress', 'blocked', 'review', 'resolved', 'closed'];

async function authHeader() {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
}

async function apiFetch(path, opts = {}) {
  const r = await fetch(`${BRIDGE}/api${path}`, {
    headers: { 'Content-Type': 'application/json', ...(await authHeader()), ...(opts.headers || {}) },
    ...opts,
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({ error: r.statusText }));
    throw new Error(err.error || r.statusText);
  }
  return r.json();
}

function StatusBadge({ status }) {
  const s = STATUS_COLORS[status] || STATUS_COLORS.open;
  return (
    <span className="cv2-bdg" style={{
      background: s.bg, color: s.text,
      padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600,
      whiteSpace: 'nowrap',
    }}>
      {s.label}
    </span>
  );
}

function PriorityDot({ priority }) {
  return (
    <span style={{
      display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
      background: PRIORITY_COLORS[priority] || PRIORITY_COLORS.medium,
      marginRight: 4, flexShrink: 0,
    }} />
  );
}

function TicketCard({ ticket, selected, onClick }) {
  const isLocked = !!ticket.locked_at;
  return (
    <div
      className="cv2-card"
      onClick={onClick}
      style={{
        padding: '12px 14px',
        borderRadius: 6,
        border: `1px solid ${selected ? '#B70C00' : 'var(--line)'}`,
        background: selected ? 'var(--red-soft)' : 'var(--panel)',
        cursor: 'pointer',
        marginBottom: 6,
        transition: 'border-color 0.15s, background 0.15s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
        <PriorityDot priority={ticket.priority} />
        <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: 'var(--tx)', lineHeight: 1.4 }}>
          {ticket.title}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <StatusBadge status={ticket.status} />
        {ticket.assignee_agent && (
          <span style={{
            background: 'var(--bg)', color: 'var(--tx2)',
            padding: '1px 7px', borderRadius: 4, fontSize: 11,
          }}>
            {ticket.assignee_agent}
          </span>
        )}
        {isLocked && (
          <span style={{ fontSize: 11, color: 'var(--amber)' }}>
            Locked: {ticket.locked_by}
          </span>
        )}
      </div>
    </div>
  );
}

function TicketDetail({ ticket, onUpdate, onClose }) {
  const [timeline, setTimeline]   = useState([]);
  const [comment, setComment]     = useState('');
  const [saving, setSaving]       = useState(false);
  const [editing, setEditing]     = useState(false);
  const [editTitle, setEditTitle] = useState(ticket.title);
  const [editDesc,  setEditDesc]  = useState(ticket.description || '');

  const loadTimeline = useCallback(async () => {
    try {
      const data = await apiFetch(`/agent-tickets/${ticket.id}/timeline`);
      setTimeline(data);
    } catch (_) {}
  }, [ticket.id]);

  useEffect(() => {
    setEditTitle(ticket.title);
    setEditDesc(ticket.description || '');
    loadTimeline();
  }, [ticket.id, loadTimeline]);

  async function handleStatusChange(newStatus) {
    try {
      const updated = await apiFetch(`/agent-tickets/${ticket.id}`, {
        method: 'PATCH', body: JSON.stringify({ status: newStatus }),
      });
      onUpdate(updated);
    } catch (err) {
      // swallow — UI stays as-is
    }
  }

  async function handleAssigneeChange(e) {
    const val = e.target.value;
    try {
      const updated = await apiFetch(`/agent-tickets/${ticket.id}`, {
        method: 'PATCH', body: JSON.stringify({ assignee_agent: val || null }),
      });
      onUpdate(updated);
    } catch (err) {
      // swallow
    }
  }

  async function handleSaveEdit() {
    setSaving(true);
    try {
      const updated = await apiFetch(`/agent-tickets/${ticket.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ title: editTitle, description: editDesc }),
      });
      onUpdate(updated);
      setEditing(false);
    } catch (err) {
      // swallow
    } finally {
      setSaving(false);
    }
  }

  async function handleComment() {
    if (!comment.trim()) return;
    setSaving(true);
    try {
      await apiFetch(`/agent-tickets/${ticket.id}/comments`, {
        method: 'POST',
        body: JSON.stringify({ body: comment.trim(), author: 'human' }),
      });
      setComment('');
      await loadTimeline();
    } catch (err) {
      // swallow
    } finally {
      setSaving(false);
    }
  }

  const AGENTS = ['deli', 'lara', 'vera', 'breno', 'cora', 'sofia', 'max'];

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', padding: '20px 24px', overflowY: 'auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        {editing ? (
          <input
            value={editTitle}
            onChange={e => setEditTitle(e.target.value)}
            style={{
              flex: 1, background: 'var(--panel)', border: '1px solid var(--line)',
              borderRadius: 6, padding: '8px 12px', color: 'var(--tx)', fontSize: 16, fontWeight: 600,
              outline: 'none', fontFamily: 'inherit',
            }}
          />
        ) : (
          <h2 style={{ flex: 1, margin: 0, fontSize: 16, fontWeight: 600, color: 'var(--tx)' }}>
            {ticket.title}
          </h2>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          {editing ? (
            <>
              <button onClick={handleSaveEdit} disabled={saving} className="cv2-btn" style={{ padding: '6px 14px', fontSize: 12 }}>
                {saving ? '...' : 'Salvar'}
              </button>
              <button onClick={() => setEditing(false)} className="cv2-btn sec" style={{ padding: '6px 14px', fontSize: 12 }}>Cancelar</button>
            </>
          ) : (
            <button onClick={() => setEditing(true)} className="cv2-btn sec" style={{ padding: '6px 14px', fontSize: 12 }}>Editar</button>
          )}
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--tx2)', cursor: 'pointer', fontSize: 18 }}>×</button>
        </div>
      </div>

      {/* Status selector */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {STATUS_WORKFLOW.map(s => (
          <button
            key={s}
            onClick={() => handleStatusChange(s)}
            className={ticket.status === s ? 'cv2-btn' : 'cv2-btn sec'}
            style={{ padding: '4px 10px', fontSize: 12 }}
          >
            {STATUS_COLORS[s]?.label}
          </button>
        ))}
      </div>

      {/* Assignee */}
      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: 11, color: 'var(--tx2)', display: 'block', marginBottom: 4 }}>Agente responsável</label>
        <select
          value={ticket.assignee_agent || ''}
          onChange={handleAssigneeChange}
          style={{
            background: 'var(--panel)', border: '1px solid var(--line)',
            borderRadius: 6, padding: '6px 10px', color: 'var(--tx)', fontSize: 13,
            outline: 'none', cursor: 'pointer',
          }}
        >
          <option value="">Nenhum</option>
          {AGENTS.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>

      {/* Descrição */}
      {editing ? (
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 11, color: 'var(--tx2)', display: 'block', marginBottom: 4 }}>Descrição</label>
          <textarea
            value={editDesc}
            onChange={e => setEditDesc(e.target.value)}
            rows={4}
            style={{
              width: '100%', background: 'var(--panel)', border: '1px solid var(--line)',
              borderRadius: 6, padding: '8px 12px', color: 'var(--tx)', fontSize: 13, resize: 'vertical',
              boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit',
            }}
          />
        </div>
      ) : ticket.description ? (
        <p style={{ fontSize: 13, color: 'var(--tx2)', marginBottom: 16, lineHeight: 1.6 }}>
          {ticket.description}
        </p>
      ) : null}

      {/* Lock status */}
      {ticket.locked_at && (
        <div style={{ background: 'var(--amber-soft)', border: '1px solid #ecd9a8', borderRadius: 6, padding: '8px 12px', marginBottom: 16, fontSize: 12, color: 'var(--amber)' }}>
          Em checkout por: <strong>{ticket.locked_by}</strong>
        </div>
      )}

      {/* Timeline */}
      <div style={{ flex: 1, marginBottom: 16 }}>
        <h4 style={{ margin: '0 0 10px', fontSize: 12, color: 'var(--tx2)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
          Timeline
        </h4>
        {timeline.length === 0 && (
          <p style={{ fontSize: 12, color: 'var(--tx2)' }}>Nenhum evento ainda.</p>
        )}
        {timeline.map((item, i) => (
          <div key={item.id || i} style={{ display: 'flex', gap: 10, marginBottom: 10, alignItems: 'flex-start' }}>
            <span style={{
              width: 8, height: 8, borderRadius: '50%', marginTop: 4, flexShrink: 0,
              background: item._type === 'comment' ? '#1d4ed8' : 'var(--tx2)',
            }} />
            <div style={{ flex: 1 }}>
              {item._type === 'comment' ? (
                <>
                  <span style={{ fontSize: 11, color: 'var(--tx2)' }}>{item.author} · {new Date(item.created_at).toLocaleString('pt-BR')}</span>
                  <p style={{ margin: '2px 0 0', fontSize: 13, color: 'var(--tx)' }}>{item.body}</p>
                </>
              ) : (
                <span style={{ fontSize: 12, color: 'var(--tx2)' }}>
                  <strong style={{ color: 'var(--tx)' }}>{item.actor}</strong> — {item.event_type}
                  {item.new_value ? ` → ${item.new_value}` : ''}
                  <span style={{ marginLeft: 8, color: 'var(--tx2)' }}>{new Date(item.created_at).toLocaleString('pt-BR')}</span>
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Campo de comentário */}
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          value={comment}
          onChange={e => setComment(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleComment()}
          placeholder="Adicionar comentário..."
          style={{
            flex: 1, background: 'var(--panel)', border: '1px solid var(--line)',
            borderRadius: 6, padding: '8px 12px', color: 'var(--tx)', fontSize: 13,
            outline: 'none', fontFamily: 'inherit',
          }}
        />
        <button onClick={handleComment} disabled={saving || !comment.trim()} className="cv2-btn" style={{ padding: '6px 14px', fontSize: 12 }}>
          Enviar
        </button>
      </div>
    </div>
  );
}

export default function AgentInbox({ tenantDbId, userId, onNavigate }) {
  const [tickets, setTickets]           = useState([]);
  const [loading, setLoading]           = useState(true);
  const [selected, setSelected]         = useState(null);
  const [filterAgent, setFilterAgent]   = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [showNew, setShowNew]           = useState(false);
  const [newTitle, setNewTitle]         = useState('');
  const [newAgent, setNewAgent]         = useState('');
  const [newPriority, setNewPriority]   = useState('medium');
  const [creating, setCreating]         = useState(false);

  const loadTickets = useCallback(async () => {
    setLoading(true);
    setSelected(null);
    try {
      let path = '/agent-tickets?';
      if (tenantDbId)   path += `tenant_id=${encodeURIComponent(tenantDbId)}&`;
      if (filterAgent)  path += `assignee_agent=${encodeURIComponent(filterAgent)}&`;
      if (filterStatus) path += `status=${encodeURIComponent(filterStatus)}&`;
      const data = await apiFetch(path);
      setTickets(data);
    } catch (err) {
      // swallow
    } finally {
      setLoading(false);
    }
  }, [tenantDbId, filterAgent, filterStatus]);

  useEffect(() => { loadTickets(); }, [loadTickets]);

  const stats = {
    open:        tickets.filter(t => t.status === 'open').length,
    in_progress: tickets.filter(t => t.status === 'in_progress').length,
    blocked:     tickets.filter(t => t.status === 'blocked').length,
    resolved:    tickets.filter(t => t.status === 'resolved').length,
  };

  async function handleCreate() {
    if (!newTitle.trim()) return;
    setCreating(true);
    try {
      const ticket = await apiFetch('/agent-tickets', {
        method: 'POST',
        body: JSON.stringify({
          title: newTitle.trim(),
          assignee_agent: newAgent || undefined,
          priority: newPriority,
        }),
      });
      setTickets(prev => [ticket, ...prev]);
      setNewTitle('');
      setNewAgent('');
      setNewPriority('medium');
      setShowNew(false);
    } catch (err) {
      // swallow
    } finally {
      setCreating(false);
    }
  }

  function handleUpdate(updated) {
    setTickets(prev => prev.map(t => t.id === updated.id ? updated : t));
    setSelected(updated);
  }

  const AGENTS = ['deli', 'lara', 'vera', 'breno', 'cora', 'sofia', 'max'];

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)', color: 'var(--tx)' }}>
      {/* Header com avatar + título */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px', borderBottom: '1px solid var(--line)' }}>
        <div style={{
          width: 56, height: 56, borderRadius: '50%',
          background: '#B70C00',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 22, fontWeight: 700, color: '#fff', flexShrink: 0,
        }}>A</div>
        <div>
          <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--tx)' }}>
            Agent Inbox
          </h1>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--tx2)' }}>
            Tickets de agentes — acompanhe, atribua e resolva
          </p>
        </div>
      </div>

      {/* KPIs */}
      <div className="cv2-kpis" style={{ display: 'flex', gap: 12, padding: '16px 20px', borderBottom: '1px solid var(--line)' }}>
        {[
          { label: 'Abertos',      value: stats.open,        color: 'var(--tx2)' },
          { label: 'Em andamento', value: stats.in_progress, color: '#1d4ed8' },
          { label: 'Bloqueados',   value: stats.blocked,     color: 'var(--amber)' },
          { label: 'Resolvidos',   value: stats.resolved,    color: 'var(--green)' },
        ].map(s => (
          <div key={s.label} className="cv2-kpi" style={{
            background: 'var(--panel)', borderRadius: 8, padding: '10px 16px',
            border: '1px solid var(--line)', minWidth: 80, textAlign: 'center',
          }}>
            <div className="cv2-kpi v" style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.value}</div>
            <div className="cv2-kpi l" style={{ fontSize: 11, color: 'var(--tx2)' }}>{s.label}</div>
          </div>
        ))}
        <div style={{ flex: 1 }} />
        <button
          onClick={() => setShowNew(v => !v)}
          className="cv2-btn"
          style={{ alignSelf: 'center', padding: '8px 16px', fontSize: 13 }}
        >
          + Novo Ticket
        </button>
      </div>

      {/* New ticket form */}
      {showNew && (
        <div style={{ padding: '12px 20px', background: 'var(--panel)', borderBottom: '1px solid var(--line)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
            placeholder="Título do ticket..."
            onKeyDown={e => e.key === 'Enter' && handleCreate()}
            style={{
              flex: 1, minWidth: 200, background: 'var(--bg)', border: '1px solid var(--line)',
              borderRadius: 6, padding: '8px 12px', color: 'var(--tx)', fontSize: 13,
              outline: 'none', fontFamily: 'inherit',
            }}
          />
          <select value={newAgent} onChange={e => setNewAgent(e.target.value)} style={selectStyle()}>
            <option value="">Agente</option>
            {AGENTS.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          <select value={newPriority} onChange={e => setNewPriority(e.target.value)} style={selectStyle()}>
            {Object.entries(PRIORITY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <button onClick={handleCreate} disabled={creating || !newTitle.trim()} className="cv2-btn" style={{ padding: '6px 14px', fontSize: 12 }}>
            {creating ? '...' : 'Criar'}
          </button>
        </div>
      )}

      {/* Main body: lista + detalhe */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {/* Lista */}
        <div style={{
          width: selected ? 320 : '100%', maxWidth: selected ? 360 : '100%',
          borderRight: selected ? '1px solid var(--line)' : 'none',
          display: 'flex', flexDirection: 'column',
          transition: 'width 0.2s',
        }}>
          {/* Filtros */}
          <div style={{ padding: '10px 14px', display: 'flex', gap: 8, borderBottom: '1px solid var(--line)' }}>
            <select value={filterAgent} onChange={e => setFilterAgent(e.target.value)} style={selectStyle()}>
              <option value="">Todos agentes</option>
              {AGENTS.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={selectStyle()}>
              <option value="">Todos status</option>
              {Object.entries(STATUS_COLORS).map(([v, s]) => <option key={v} value={v}>{s.label}</option>)}
            </select>
          </div>

          {/* Lista de tickets */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '10px 14px' }}>
            {loading ? (
              <p style={{ color: 'var(--tx2)', fontSize: 13, textAlign: 'center', marginTop: 40 }}>Carregando...</p>
            ) : tickets.length === 0 ? (
              <p style={{ color: 'var(--tx2)', fontSize: 13, textAlign: 'center', marginTop: 40 }}>
                Nenhum ticket encontrado.
              </p>
            ) : (
              tickets.map(t => (
                <TicketCard
                  key={t.id}
                  ticket={t}
                  selected={selected?.id === t.id}
                  onClick={() => setSelected(t)}
                />
              ))
            )}
          </div>
        </div>

        {/* Detalhe */}
        {selected && (
          <div style={{ flex: 1, overflowY: 'auto' }}>
            <TicketDetail
              ticket={selected}
              onUpdate={handleUpdate}
              onClose={() => setSelected(null)}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function selectStyle() {
  return {
    background: 'var(--panel)', border: '1px solid var(--line)',
    borderRadius: 6, padding: '6px 10px', color: 'var(--tx)', fontSize: 12,
    outline: 'none', cursor: 'pointer',
  };
}
