import { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { supabase } from '../../lib/supabase.js';

const COLUMNS = [
  { key: 'ai_suggestion', label: 'Sugestões da IA', color: '#8b5cf6', isAI: true },
  { key: 'todo',          label: 'A Fazer',           color: '#6b7280' },
  { key: 'doing',         label: 'Em Andamento',      color: '#3b82f6' },
  { key: 'waiting',       label: 'Aguardando',        color: '#f59e0b' },
  { key: 'blocked',       label: 'Bloqueado',         color: '#ef4444' },
  { key: 'canceled',      label: 'Cancelado',         color: '#374151' },
  { key: 'done',          label: 'Concluído',         color: '#10b981' },
];

const PRIORITY_META = {
  urgent: { label: 'Urgente', color: '#ef4444' },
  high:   { label: 'Alta',    color: '#f97316' },
  normal: { label: 'Normal',  color: '#6b7280' },
  low:    { label: 'Baixa',   color: '#374151' },
};

const LOJA_COLORS = [
  '#7c3aed','#0369a1','#047857','#b45309','#be185d','#0e7490','#4338ca','#b91c1c',
];

function lojaColor(lojaId) {
  if (!lojaId) return '#374151';
  let h = 0;
  for (let i = 0; i < lojaId.length; i++) h = (h * 31 + lojaId.charCodeAt(i)) & 0xffffffff;
  return LOJA_COLORS[Math.abs(h) % LOJA_COLORS.length];
}

function initForm(activeLoja) {
  return {
    title: '',
    loja_id: activeLoja?.id || '',
    due_date: '',
    assignee_id: '',
    priority: 'normal',
  };
}

export default function ChatTasksPanel({ tenantDbId, members = [], currentUserId, onClose, lojas = [], activeLoja }) {
  const [tasks, setTasks]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm]         = useState(() => initForm(activeLoja));
  const [saving, setSaving]     = useState(false);
  const [formErr, setFormErr]   = useState('');

  // Drag-and-drop state
  const [dragId, setDragId]     = useState(null);
  const [hoverCol, setHoverCol] = useState(null);
  const [ghostPos, setGhostPos] = useState(null);

  useEffect(() => { loadTasks(); }, [tenantDbId]);

  async function loadTasks() {
    setLoading(true);
    const { data } = await supabase
      .from('chat_tasks')
      .select('*')
      .eq('tenant_id', tenantDbId)
      .order('created_at', { ascending: false });
    setTasks(data ?? []);
    setLoading(false);
  }

  async function handleAdd() {
    if (!form.title.trim()) { setFormErr('Informe o título'); return; }
    if (!form.loja_id)      { setFormErr('Selecione uma loja'); return; }
    setSaving(true); setFormErr('');
    const { error } = await supabase.from('chat_tasks').insert({
      tenant_id:   tenantDbId,
      title:       form.title.trim(),
      loja_id:     form.loja_id || null,
      due_date:    form.due_date || null,
      assignee_id: form.assignee_id || null,
      priority:    form.priority,
      status:      'todo',
      created_by:  currentUserId || null,
    });
    setSaving(false);
    if (error) { setFormErr(error.message); return; }
    setForm(initForm(activeLoja));
    setShowForm(false);
    loadTasks();
  }

  async function handleStatusChange(taskId, status) {
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status } : t));
    await supabase.from('chat_tasks')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', taskId);
  }

  async function handleAcceptAI(taskId) {
    await handleStatusChange(taskId, 'todo');
  }

  async function handleDelete(taskId) {
    setTasks(prev => prev.filter(t => t.id !== taskId));
    await supabase.from('chat_tasks').delete().eq('id', taskId);
  }

  async function handleTitleEdit(taskId, newTitle) {
    if (!newTitle.trim()) return;
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, title: newTitle.trim() } : t));
    await supabase.from('chat_tasks')
      .update({ title: newTitle.trim(), updated_at: new Date().toISOString() })
      .eq('id', taskId);
  }

  // Drag handlers
  function onDragStart(e, id) {
    setDragId(id);
    e.dataTransfer.effectAllowed = 'move';
    const img = new Image();
    img.src = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';
    e.dataTransfer.setDragImage(img, 0, 0);
  }

  function onDrag(e) {
    if (e.clientX === 0 && e.clientY === 0) return;
    setGhostPos({ x: e.clientX, y: e.clientY });
  }

  function onDragEnd() {
    setDragId(null);
    setHoverCol(null);
    setGhostPos(null);
  }

  function onColDragOver(e, colKey) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (hoverCol !== colKey) setHoverCol(colKey);
  }

  function onColDrop(e, colKey) {
    e.preventDefault();
    if (!dragId) return;
    handleStatusChange(dragId, colKey);
    onDragEnd();
  }

  const tasksByStatus = Object.fromEntries(COLUMNS.map(c => [c.key, []]));
  tasks.forEach(t => {
    const key = t.status || 'todo';
    if (tasksByStatus[key]) tasksByStatus[key].push(t);
  });

  const lojaMap = Object.fromEntries(lojas.map(l => [l.id, l]));
  const totalPending = tasks.filter(t => !['done', 'canceled'].includes(t.status)).length;

  // Ghost card label
  const dragTask = dragId ? tasks.find(t => t.id === dragId) : null;

  const board = (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1100,
      background: '#111',
      display: 'flex', flexDirection: 'column',
      fontFamily: 'inherit',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '14px 20px',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        flexShrink: 0,
        background: '#161616',
      }}>
        <span style={{ fontWeight: 700, fontSize: 16, color: 'white' }}>
          Tarefas
          {totalPending > 0 && (
            <span style={{
              marginLeft: 8, fontSize: 11, fontWeight: 600,
              background: 'rgba(59,130,246,0.2)', color: '#93c5fd',
              borderRadius: 10, padding: '2px 8px',
            }}>{totalPending}</span>
          )}
        </span>
        {activeLoja && (
          <span style={{
            fontSize: 11, padding: '3px 10px', borderRadius: 12,
            background: lojaColor(activeLoja.id) + '33',
            color: lojaColor(activeLoja.id),
            fontWeight: 600, border: `1px solid ${lojaColor(activeLoja.id)}55`,
          }}>
            {activeLoja.nome}
          </span>
        )}
        <div style={{ flex: 1 }} />
        <button
          onClick={() => { setShowForm(true); setForm(initForm(activeLoja)); setFormErr(''); }}
          style={{
            padding: '7px 14px', borderRadius: 7, border: 'none',
            background: '#3b82f6', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}
        >+ Nova Tarefa</button>
        <button
          onClick={onClose}
          style={{
            background: 'rgba(255,255,255,0.07)', border: 'none',
            color: 'rgba(255,255,255,0.5)', fontSize: 20,
            cursor: 'pointer', width: 32, height: 32, borderRadius: 7,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >×</button>
      </div>

      {/* Board */}
      {loading ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.3)', fontSize: 14 }}>
          Carregando…
        </div>
      ) : (
        <div style={{
          flex: 1, overflowX: 'auto', overflowY: 'hidden',
          display: 'flex', gap: 12, padding: '16px 20px',
        }} className="dark-scroll">
          {COLUMNS.map(col => {
            const isHover = hoverCol === col.key;
            return (
              <div
                key={col.key}
                onDragOver={(e) => onColDragOver(e, col.key)}
                onDragLeave={() => setHoverCol(null)}
                onDrop={(e) => onColDrop(e, col.key)}
                style={{
                  minWidth: 272, maxWidth: 272,
                  display: 'flex', flexDirection: 'column',
                  background: isHover ? `${col.color}12` : 'rgba(255,255,255,0.03)',
                  borderRadius: 10,
                  border: isHover
                    ? `1px solid ${col.color}66`
                    : '1px solid rgba(255,255,255,0.07)',
                  borderTop: isHover
                    ? `3px solid ${col.color}`
                    : `1px solid rgba(255,255,255,0.07)`,
                  overflow: 'hidden',
                  flexShrink: 0,
                  transition: 'background 0.15s, border-color 0.15s',
                }}
              >
                {/* Column header */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 7,
                  padding: '10px 12px',
                  borderBottom: '1px solid rgba(255,255,255,0.06)',
                  flexShrink: 0,
                }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: col.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: col.color, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    {col.label}
                  </span>
                  <span style={{ marginLeft: 'auto', fontSize: 11, color: 'rgba(255,255,255,0.3)', fontWeight: 600 }}>
                    {tasksByStatus[col.key].length}
                  </span>
                </div>

                {/* Cards */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }} className="dark-scroll">
                  {tasksByStatus[col.key].length === 0 ? (
                    <div style={{
                      textAlign: 'center', color: 'rgba(255,255,255,0.18)', fontSize: 12, marginTop: 24,
                      border: isHover ? `2px dashed ${col.color}55` : '2px dashed transparent',
                      borderRadius: 8, padding: '20px 8px',
                      transition: 'border-color 0.15s',
                    }}>
                      {col.isAI ? 'Sem sugestões no momento' : 'Solte aqui'}
                    </div>
                  ) : (
                    tasksByStatus[col.key].map(task => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        col={col}
                        members={members}
                        lojaMap={lojaMap}
                        columns={COLUMNS}
                        isDragging={dragId === task.id}
                        onDragStart={onDragStart}
                        onDrag={onDrag}
                        onDragEnd={onDragEnd}
                        onStatusChange={handleStatusChange}
                        onAcceptAI={handleAcceptAI}
                        onDelete={handleDelete}
                        onTitleEdit={handleTitleEdit}
                      />
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* New task modal */}
      {showForm && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 10,
          background: 'rgba(0,0,0,0.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }} onClick={e => { if (e.target === e.currentTarget) setShowForm(false); }}>
          <div style={{
            background: '#1c1c1c', borderRadius: 12,
            border: '1px solid rgba(255,255,255,0.1)',
            padding: 24, width: 400,
            display: 'flex', flexDirection: 'column', gap: 12,
          }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'white', marginBottom: 4 }}>Nova Tarefa</div>

            <input
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              onKeyDown={e => e.key === 'Enter' && handleAdd()}
              placeholder="Título da tarefa *"
              autoFocus
              style={inputStyle}
            />

            <select
              value={form.loja_id}
              onChange={e => setForm(f => ({ ...f, loja_id: e.target.value }))}
              style={inputStyle}
            >
              <option value="">Selecionar loja *</option>
              {lojas.map(l => (
                <option key={l.id} value={l.id}>{l.nome}</option>
              ))}
            </select>

            <div style={{ display: 'flex', gap: 8 }}>
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

            {formErr && <span style={{ color: '#f87171', fontSize: 12 }}>{formErr}</span>}

            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <button
                onClick={handleAdd}
                disabled={saving}
                style={{
                  flex: 1, padding: '9px 0', borderRadius: 7, border: 'none',
                  background: saving ? 'rgba(59,130,246,0.35)' : '#3b82f6',
                  color: 'white', fontSize: 14, fontWeight: 600, cursor: saving ? 'default' : 'pointer',
                }}
              >{saving ? 'Salvando…' : 'Criar Tarefa'}</button>
              <button
                onClick={() => setShowForm(false)}
                style={{
                  padding: '9px 16px', borderRadius: 7,
                  border: '1px solid rgba(255,255,255,0.1)',
                  background: 'none', color: 'rgba(255,255,255,0.5)',
                  fontSize: 14, cursor: 'pointer',
                }}
              >Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* Ghost card ao arrastar */}
      {dragTask && ghostPos && ReactDOM.createPortal(
        <div style={{
          position: 'fixed',
          left: ghostPos.x + 14,
          top: ghostPos.y - 18,
          zIndex: 9999,
          background: '#1e1e2e',
          border: '1px solid rgba(255,255,255,0.15)',
          borderLeft: `3px solid ${(PRIORITY_META[dragTask.priority] ?? PRIORITY_META.normal).color}`,
          borderRadius: 8,
          padding: '8px 12px',
          color: 'rgba(255,255,255,0.9)',
          fontSize: 13,
          pointerEvents: 'none',
          maxWidth: 220,
          opacity: 0.93,
          boxShadow: '0 8px 30px rgba(0,0,0,0.6)',
          fontFamily: 'inherit',
          lineHeight: 1.4,
        }}>
          {dragTask.title}
        </div>,
        document.body
      )}
    </div>
  );

  return ReactDOM.createPortal(board, document.body);
}

function TaskCard({ task, col, members, lojaMap, columns, isDragging, onDragStart, onDrag, onDragEnd, onStatusChange, onAcceptAI, onDelete, onTitleEdit }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft]     = useState(task.title);
  const pm       = PRIORITY_META[task.priority] ?? PRIORITY_META.normal;
  const assignee = members.find(m => m.id === task.assignee_id);
  const loja     = task.loja_id ? lojaMap[task.loja_id] : null;
  const today    = new Date().toISOString().slice(0, 10);
  const overdue  = task.due_date && task.due_date < today && task.status !== 'done';

  return (
    <div
      draggable={!editing}
      onDragStart={(e) => !editing && onDragStart(e, task.id)}
      onDrag={onDrag}
      onDragEnd={onDragEnd}
      style={{
        background: isDragging ? 'rgba(255,255,255,0.04)' : '#1e1e1e',
        borderRadius: 8,
        borderLeft: `3px solid ${pm.color}`,
        padding: '10px 11px',
        marginBottom: 8,
        display: 'flex', flexDirection: 'column', gap: 7,
        opacity: isDragging ? 0.45 : 1,
        cursor: editing ? 'default' : 'grab',
        transition: 'opacity 0.15s, background 0.15s',
        boxShadow: isDragging ? 'none' : '0 1px 4px rgba(0,0,0,0.3)',
      }}
    >
      {/* Loja badge */}
      {loja && (
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          padding: '3px 9px', borderRadius: 12,
          background: lojaColor(loja.id) + '22',
          border: `1px solid ${lojaColor(loja.id)}44`,
          color: lojaColor(loja.id),
          fontSize: 11, fontWeight: 700,
          alignSelf: 'flex-start',
        }}>
          <span style={{ width: 5, height: 5, borderRadius: '50%', background: lojaColor(loja.id) }} />
          {loja.nome}
        </div>
      )}

      {/* Title row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
        {editing ? (
          <input
            autoFocus
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onBlur={() => { onTitleEdit(task.id, draft); setEditing(false); }}
            onKeyDown={e => {
              if (e.key === 'Enter') e.target.blur();
              if (e.key === 'Escape') { setDraft(task.title); setEditing(false); }
            }}
            style={{
              flex: 1, fontSize: 13, background: 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.2)', borderRadius: 4,
              color: 'rgba(255,255,255,0.9)', padding: '2px 6px', outline: 'none',
            }}
          />
        ) : (
          <span
            onClick={() => { setDraft(task.title); setEditing(true); }}
            title="Clique para editar"
            style={{
              flex: 1, fontSize: 13, cursor: 'text', lineHeight: 1.4,
              color: task.status === 'done' ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.9)',
              textDecoration: task.status === 'done' ? 'line-through' : 'none',
            }}
          >{task.title}</span>
        )}
        <button
          onClick={() => onDelete(task.id)}
          style={{
            background: 'none', border: 'none', color: 'rgba(255,255,255,0.2)',
            fontSize: 16, cursor: 'pointer', lineHeight: 1, padding: '0 2px', flexShrink: 0,
          }}
          title="Remover"
        >×</button>
      </div>

      {/* Meta row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        {task.due_date && (
          <span style={{
            fontSize: 11, color: overdue ? '#f87171' : 'rgba(255,255,255,0.35)',
            fontWeight: overdue ? 600 : 400,
          }}>
            {overdue ? '⚠ ' : ''}{formatDate(task.due_date)}
          </span>
        )}
        {assignee && (
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', display: 'flex', alignItems: 'center', gap: 3 }}>
            <span style={{
              width: 16, height: 16, borderRadius: '50%',
              background: '#374151', display: 'inline-flex', alignItems: 'center',
              justifyContent: 'center', fontSize: 9, color: 'white', flexShrink: 0,
            }}>
              {(assignee.full_name || '?')[0].toUpperCase()}
            </span>
            {assignee.full_name?.split(' ')[0]}
          </span>
        )}

        {/* AI column: accept / reject */}
        {col.isAI ? (
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 5 }}>
            <button
              onClick={() => onAcceptAI(task.id)}
              style={{
                padding: '3px 10px', borderRadius: 5, border: 'none',
                background: 'rgba(16,185,129,0.2)', color: '#6ee7b7',
                fontSize: 12, fontWeight: 700, cursor: 'pointer',
              }}
              title="Aceitar sugestão"
            >✓ Aceitar</button>
            <button
              onClick={() => onDelete(task.id)}
              style={{
                padding: '3px 10px', borderRadius: 5, border: 'none',
                background: 'rgba(239,68,68,0.15)', color: '#fca5a5',
                fontSize: 12, fontWeight: 700, cursor: 'pointer',
              }}
              title="Rejeitar sugestão"
            >✗</button>
          </div>
        ) : (
          <select
            value={task.status}
            onChange={e => onStatusChange(task.id, e.target.value)}
            style={{
              marginLeft: 'auto',
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 5, color: 'rgba(255,255,255,0.65)',
              fontSize: 11, padding: '2px 4px', cursor: 'pointer',
            }}
          >
            {columns.filter(c => !c.isAI).map(c => (
              <option key={c.key} value={c.key}>{c.label}</option>
            ))}
          </select>
        )}
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
  borderRadius: 7,
  color: 'white',
  fontSize: 13,
  padding: '8px 11px',
  width: '100%',
  boxSizing: 'border-box',
  outline: 'none',
};
