import { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { supabase } from '../../lib/supabase.js';

const STATUS_GROUPS = [
  { key: 'todo',    label: 'A Fazer',      color: '#6b7280' },
  { key: 'doing',   label: 'Em Andamento', color: '#3b82f6' },
  { key: 'waiting', label: 'Aguardando',   color: '#f59e0b' },
  { key: 'done',    label: 'Concluído',    color: '#10b981' },
];

const PRIORITY_META = {
  urgent: { label: 'Urgente', color: '#ef4444' },
  high:   { label: 'Alta',    color: '#f97316' },
  normal: { label: 'Normal',  color: '#6b7280' },
  low:    { label: 'Baixa',   color: '#374151' },
};

function initForm() {
  return { title: '', contact_name: '', due_date: '', assignee_id: '', priority: 'normal' };
}

export default function ChatTasksPanel({ tenantDbId, members = [], currentUserId, onClose }) {
  const [tasks, setTasks]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [form, setForm]         = useState(initForm());
  const [saving, setSaving]     = useState(false);
  const [formErr, setFormErr]   = useState('');
  const [showForm, setShowForm] = useState(false);

  useEffect(() => { loadTasks(); }, [tenantDbId]);

  async function loadTasks() {
    setLoading(true);
    const { data } = await supabase
      .from('chat_tasks')
      .select('*')
      .eq('tenant_id', tenantDbId)
      .neq('status', 'canceled')
      .order('created_at', { ascending: false });
    setTasks(data ?? []);
    setLoading(false);
  }

  async function handleAdd() {
    if (!form.title.trim()) { setFormErr('Informe o título'); return; }
    setSaving(true); setFormErr('');
    const { error } = await supabase.from('chat_tasks').insert({
      tenant_id:    tenantDbId,
      title:        form.title.trim(),
      contact_name: form.contact_name.trim() || null,
      due_date:     form.due_date || null,
      assignee_id:  form.assignee_id || null,
      priority:     form.priority,
      created_by:   currentUserId || null,
    });
    setSaving(false);
    if (error) { setFormErr(error.message); return; }
    setForm(initForm());
    setShowForm(false);
    loadTasks();
  }

  async function handleStatusChange(taskId, status) {
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status } : t));
    await supabase.from('chat_tasks')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', taskId);
  }

  async function handleDelete(taskId) {
    setTasks(prev => prev.filter(t => t.id !== taskId));
    await supabase.from('chat_tasks').delete().eq('id', taskId);
  }

  const pending = tasks.filter(t => t.status !== 'done').length;

  const panel = (
    <div style={{
      position: 'fixed', right: 0, top: 0,
      height: '100vh', width: 440,
      background: '#181818',
      borderLeft: '1px solid rgba(255,255,255,0.1)',
      zIndex: 1100,
      display: 'flex', flexDirection: 'column',
      fontFamily: 'inherit',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '14px 16px',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        flexShrink: 0,
      }}>
        <span style={{ fontWeight: 700, fontSize: 14, color: 'white', flex: 1 }}>
          Tarefas
          {pending > 0 && (
            <span style={{
              marginLeft: 8, fontSize: 11, fontWeight: 600,
              background: 'rgba(59,130,246,0.25)', color: '#93c5fd',
              borderRadius: 10, padding: '1px 7px',
            }}>{pending}</span>
          )}
        </span>
        <button
          onClick={() => { setShowForm(v => !v); setFormErr(''); }}
          style={{
            background: showForm ? 'rgba(59,130,246,0.25)' : 'rgba(255,255,255,0.08)',
            border: 'none', borderRadius: 6,
            color: showForm ? '#93c5fd' : 'rgba(255,255,255,0.7)',
            fontSize: 20, lineHeight: 1, cursor: 'pointer',
            width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          title="Nova tarefa"
        >+</button>
        <button
          onClick={onClose}
          style={{
            background: 'none', border: 'none',
            color: 'rgba(255,255,255,0.4)', fontSize: 18,
            cursor: 'pointer', lineHeight: 1,
            width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >×</button>
      </div>

      {/* Quick-add form */}
      {showForm && (
        <div style={{
          padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)',
          display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0,
          background: 'rgba(255,255,255,0.03)',
        }}>
          <input
            value={form.title}
            onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
            placeholder="Título da tarefa *"
            autoFocus
            style={inputStyle}
          />
          <input
            value={form.contact_name}
            onChange={e => setForm(f => ({ ...f, contact_name: e.target.value }))}
            placeholder="Contato / cliente (opcional)"
            style={inputStyle}
          />
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              type="date"
              value={form.due_date}
              onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))}
              style={{ ...inputStyle, flex: 1, colorScheme: 'dark' }}
            />
            <select
              value={form.priority}
              onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}
              style={{ ...inputStyle, flex: 1 }}
            >
              {Object.entries(PRIORITY_META).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
          </div>
          <select
            value={form.assignee_id}
            onChange={e => setForm(f => ({ ...f, assignee_id: e.target.value }))}
            style={inputStyle}
          >
            <option value="">Responsável (opcional)</option>
            {members.map(m => (
              <option key={m.id} value={m.id}>{m.full_name || m.email}</option>
            ))}
          </select>
          {formErr && (
            <span style={{ color: '#f87171', fontSize: 12 }}>{formErr}</span>
          )}
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={handleAdd}
              disabled={saving}
              style={{
                flex: 1, padding: '7px 0', borderRadius: 6, border: 'none',
                background: saving ? 'rgba(59,130,246,0.35)' : '#3b82f6',
                color: 'white', fontSize: 13, fontWeight: 600, cursor: saving ? 'default' : 'pointer',
              }}
            >{saving ? 'Salvando…' : 'Adicionar'}</button>
            <button
              onClick={() => { setShowForm(false); setForm(initForm()); setFormErr(''); }}
              style={{
                padding: '7px 14px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)',
                background: 'none', color: 'rgba(255,255,255,0.5)', fontSize: 13, cursor: 'pointer',
              }}
            >Cancelar</button>
          </div>
        </div>
      )}

      {/* Task list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }} className="dark-scroll">
        {loading ? (
          <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: 13, marginTop: 32 }}>
            Carregando…
          </div>
        ) : tasks.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.25)', fontSize: 13, marginTop: 40 }}>
            Nenhuma tarefa. Clique em + para criar.
          </div>
        ) : (
          STATUS_GROUPS.map(group => {
            const groupTasks = tasks.filter(t => t.status === group.key);
            if (groupTasks.length === 0) return null;
            return (
              <div key={group.key} style={{ marginBottom: 4 }}>
                <div style={{
                  padding: '6px 16px 4px',
                  fontSize: 11, fontWeight: 700,
                  color: group.color,
                  textTransform: 'uppercase', letterSpacing: 0.6,
                  display: 'flex', alignItems: 'center', gap: 6,
                }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: group.color, flexShrink: 0 }} />
                  {group.label}
                  <span style={{ fontWeight: 400, color: 'rgba(255,255,255,0.3)', fontSize: 11 }}>
                    {groupTasks.length}
                  </span>
                </div>
                {groupTasks.map(task => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    members={members}
                    onStatusChange={handleStatusChange}
                    onDelete={handleDelete}
                  />
                ))}
              </div>
            );
          })
        )}
      </div>
    </div>
  );

  return ReactDOM.createPortal(panel, document.body);
}

function TaskCard({ task, members, onStatusChange, onDelete }) {
  const pm      = PRIORITY_META[task.priority] ?? PRIORITY_META.normal;
  const assignee = members.find(m => m.id === task.assignee_id);
  const today   = new Date().toISOString().slice(0, 10);
  const overdue = task.due_date && task.due_date < today && task.status !== 'done';

  return (
    <div style={{
      margin: '2px 10px',
      background: 'rgba(255,255,255,0.04)',
      borderRadius: 8,
      borderLeft: `3px solid ${pm.color}`,
      padding: '9px 10px',
      display: 'flex', flexDirection: 'column', gap: 5,
    }}>
      {/* Title row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
        <span style={{
          flex: 1, fontSize: 13, color: task.status === 'done' ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.9)',
          textDecoration: task.status === 'done' ? 'line-through' : 'none',
          lineHeight: 1.35,
        }}>{task.title}</span>
        <button
          onClick={() => onDelete(task.id)}
          style={{
            background: 'none', border: 'none', color: 'rgba(255,255,255,0.25)',
            fontSize: 16, cursor: 'pointer', lineHeight: 1, padding: '0 2px', flexShrink: 0,
          }}
          title="Remover tarefa"
        >×</button>
      </div>

      {/* Meta row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        {task.contact_name && (
          <span style={{
            fontSize: 11, padding: '1px 7px', borderRadius: 10,
            background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.6)',
          }}>{task.contact_name}</span>
        )}
        {task.due_date && (
          <span style={{
            fontSize: 11, color: overdue ? '#f87171' : 'rgba(255,255,255,0.4)',
            fontWeight: overdue ? 600 : 400,
          }}>
            {overdue ? '⚠ ' : ''}{formatDate(task.due_date)}
          </span>
        )}
        {assignee && (
          <span style={{
            fontSize: 11, color: 'rgba(255,255,255,0.5)',
            display: 'flex', alignItems: 'center', gap: 3,
          }}>
            <span style={{
              width: 14, height: 14, borderRadius: '50%',
              background: '#374151', display: 'inline-flex', alignItems: 'center',
              justifyContent: 'center', fontSize: 9, color: 'white', flexShrink: 0,
            }}>
              {(assignee.full_name || '?')[0].toUpperCase()}
            </span>
            {assignee.full_name?.split(' ')[0]}
          </span>
        )}
        <select
          value={task.status}
          onChange={e => onStatusChange(task.id, e.target.value)}
          style={{
            marginLeft: 'auto',
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 5, color: 'rgba(255,255,255,0.7)',
            fontSize: 11, padding: '2px 4px', cursor: 'pointer',
          }}
        >
          {STATUS_GROUPS.map(g => (
            <option key={g.key} value={g.key}>{g.label}</option>
          ))}
          <option value="canceled">Cancelado</option>
        </select>
      </div>
    </div>
  );
}

function formatDate(dateStr) {
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

const inputStyle = {
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 6,
  color: 'white',
  fontSize: 13,
  padding: '7px 10px',
  width: '100%',
  boxSizing: 'border-box',
  outline: 'none',
};