import { useState, useEffect, useMemo, useRef } from 'react';
import Icon from '../components/Icon.jsx';
import AgentAvatar from '../components/AgentAvatar.jsx';
import UserAvatar from '../components/UserAvatar.jsx';
import { AGENTS, TASKS, SETTINGS_DATA } from '../data.js';

const COLS = [
  { id: 'todo',     label: 'A Fazer',      color: 'var(--g-500)'   },
  { id: 'progress', label: 'Em Andamento', color: 'var(--info)'    },
  { id: 'review',   label: 'Em Revisão',   color: 'var(--warn)'    },
  { id: 'done',     label: 'Concluído',    color: 'var(--success)' },
];

const PRIORITY = {
  high: { label: 'URGENTE', cls: 'badge-red',    bar: 'var(--red)'     },
  med:  { label: 'MÉDIA',   cls: 'badge-yellow', bar: 'var(--warn)'    },
  low:  { label: 'BAIXA',   cls: 'badge-green',  bar: 'var(--success)' },
};

const MEMBERS = SETTINGS_DATA.users;

function newId() { return 't' + Date.now(); }

/* ─── Main ────────────────────────────────────────────── */
export default function KanbanScreen({ tenant }) {
  const [tasks,          setTasks]        = useState(TASKS[tenant] || []);
  const [dragId,         setDragId]       = useState(null);
  const [hoverCol,       setHoverCol]     = useState(null);
  const [ghostPos,       setGhostPos]     = useState(null);

  // modals
  const [showModal,      setShowModal]    = useState(false); // 'new' | 'edit'
  const [editTarget,     setEditTarget]   = useState(null);  // task object
  const [defaultCol,     setDefaultCol]   = useState('todo');

  // filters
  const [filterPriority, setFilterPriority] = useState('all');
  const [filterAssignee, setFilterAssignee] = useState('all');
  const [filterAI,       setFilterAI]       = useState(false);
  const [filterToday,    setFilterToday]    = useState(false);
  const [showFiltDrop,   setShowFiltDrop]   = useState(false);
  const [showRespDrop,   setShowRespDrop]   = useState(false);
  const filtRef = useRef(null);
  const respRef = useRef(null);

  useEffect(() => { setTasks(TASKS[tenant] || []); }, [tenant]);

  // close dropdowns on outside click
  useEffect(() => {
    function handler(e) {
      if (filtRef.current && !filtRef.current.contains(e.target)) setShowFiltDrop(false);
      if (respRef.current && !respRef.current.contains(e.target)) setShowRespDrop(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = useMemo(() => {
    let t = tasks;
    if (filterPriority !== 'all') t = t.filter(x => x.priority === filterPriority);
    if (filterAssignee !== 'all') t = t.filter(x => x.assignee === filterAssignee);
    if (filterAI)    t = t.filter(x => !!x.agent);
    if (filterToday) t = t.filter(x => x.due === 'Hoje');
    return t;
  }, [tasks, filterPriority, filterAssignee, filterAI, filterToday]);

  const byCol = useMemo(() => {
    const g = { todo: [], progress: [], review: [], done: [] };
    filtered.forEach(t => { g[t.col]?.push(t); });
    return g;
  }, [filtered]);

  /* ── drag ── */
  const onDragStart = (e, id) => {
    setDragId(id);
    e.dataTransfer.effectAllowed = 'move';
    const img = new Image();
    img.src = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';
    e.dataTransfer.setDragImage(img, 0, 0);
  };
  const onDrag = (e) => {
    if (e.clientX === 0 && e.clientY === 0) return;
    setGhostPos({ x: e.clientX, y: e.clientY });
  };
  const onDragEnd = () => { setDragId(null); setHoverCol(null); setGhostPos(null); };
  const onColDragOver = (e, colId) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (hoverCol !== colId) setHoverCol(colId); };
  const onColDrop = (e, colId) => { e.preventDefault(); if (!dragId) return; setTasks(ts => ts.map(t => t.id === dragId ? { ...t, col: colId } : t)); onDragEnd(); };

  /* ── CRUD ── */
  function openNew(col = 'todo') { setDefaultCol(col); setEditTarget(null); setShowModal(true); }
  function openEdit(task) { setEditTarget(task); setShowModal(true); }
  function closeModal() { setShowModal(false); setEditTarget(null); }

  function saveTask(data) {
    if (editTarget) {
      setTasks(ts => ts.map(t => t.id === editTarget.id ? { ...t, ...data } : t));
    } else {
      setTasks(ts => [...ts, { ...data, id: newId(), comments: 0, attachments: 0, checklist: null }]);
    }
    closeModal();
  }

  function deleteTask(id) {
    setTasks(ts => ts.filter(t => t.id !== id));
  }

  /* ── filter pills ── */
  const activeFilters = [];
  if (filterPriority !== 'all') activeFilters.push({ label: PRIORITY[filterPriority]?.label, clear: () => setFilterPriority('all') });
  if (filterAssignee !== 'all') { const m = MEMBERS.find(u => u.avatar === filterAssignee); activeFilters.push({ label: m?.name || filterAssignee, clear: () => setFilterAssignee('all') }); }
  if (filterAI)    activeFilters.push({ label: 'Criadas por IA', clear: () => setFilterAI(false) });
  if (filterToday) activeFilters.push({ label: 'Vence hoje',     clear: () => setFilterToday(false) });

  const draggingTask = tasks.find(t => t.id === dragId);
  const activeCount  = tasks.filter(t => t.col !== 'done').length;

  return (
    <div className="route-enter page-container" style={{ padding: 32, height: 'calc(100vh - 64px)', display: 'flex', flexDirection: 'column', background: 'var(--g-50)' }}>

      {/* Header */}
      <div className="header-wrap" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 16 }}>
        <div>
          <h1 className="page-h1">Tarefas</h1>
          <p className="page-sub">{tasks.length} tarefas · {activeCount} ativas</p>
        </div>
        <div className="btn-wrap" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>

          {/* Filtros dropdown */}
          <div ref={filtRef} style={{ position: 'relative' }}>
            <button
              className="btn-secondary"
              onClick={() => { setShowFiltDrop(v => !v); setShowRespDrop(false); }}
              style={{ background: filterPriority !== 'all' || filterAI || filterToday ? 'var(--red-soft)' : undefined, borderColor: filterPriority !== 'all' || filterAI || filterToday ? 'var(--red)' : undefined, color: filterPriority !== 'all' || filterAI || filterToday ? 'var(--red)' : undefined }}
            >
              <Icon name="filter" size={14} /> Filtros
              {(filterPriority !== 'all' || filterAI || filterToday) && (
                <span style={{ marginLeft: 4, background: 'var(--red)', color: 'white', borderRadius: 9999, fontSize: 10, padding: '1px 6px', fontWeight: 700 }}>
                  {[filterPriority !== 'all', filterAI, filterToday].filter(Boolean).length}
                </span>
              )}
            </button>
            {showFiltDrop && (
              <div style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, background: 'var(--white)', border: '1px solid var(--g-200)', borderRadius: 'var(--r-md)', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', padding: 12, zIndex: 200, minWidth: 200 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--g-500)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Prioridade</div>
                {[['all','Todas'],['high','Urgente'],['med','Média'],['low','Baixa']].map(([v, l]) => (
                  <button key={v} onClick={() => { setFilterPriority(v); setShowFiltDrop(false); }}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '7px 8px', borderRadius: 'var(--r-sm)', fontSize: 13, fontWeight: filterPriority === v ? 700 : 400, color: filterPriority === v ? 'var(--red)' : 'var(--g-800)', background: filterPriority === v ? 'var(--red-soft)' : 'transparent', textAlign: 'left', marginBottom: 2 }}>
                    {v !== 'all' && <span style={{ width: 8, height: 8, borderRadius: '50%', background: PRIORITY[v]?.bar, flexShrink: 0 }} />}
                    {l}
                  </button>
                ))}
                <div style={{ height: 1, background: 'var(--g-100)', margin: '10px 0' }} />
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--g-500)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Outras opções</div>
                <button onClick={() => { setFilterAI(v => !v); }}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '7px 8px', borderRadius: 'var(--r-sm)', fontSize: 13, fontWeight: filterAI ? 700 : 400, color: filterAI ? 'var(--red)' : 'var(--g-800)', background: filterAI ? 'var(--red-soft)' : 'transparent', textAlign: 'left', marginBottom: 2 }}>
                  <Icon name="bot" size={12} /> Criadas por IA
                </button>
                <button onClick={() => { setFilterToday(v => !v); }}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '7px 8px', borderRadius: 'var(--r-sm)', fontSize: 13, fontWeight: filterToday ? 700 : 400, color: filterToday ? 'var(--red)' : 'var(--g-800)', background: filterToday ? 'var(--red-soft)' : 'transparent', textAlign: 'left' }}>
                  <Icon name="calendar" size={12} /> Vence hoje
                </button>
              </div>
            )}
          </div>

          {/* Responsável dropdown */}
          <div ref={respRef} style={{ position: 'relative' }}>
            <button
              className="btn-secondary"
              onClick={() => { setShowRespDrop(v => !v); setShowFiltDrop(false); }}
              style={{ background: filterAssignee !== 'all' ? 'var(--red-soft)' : undefined, borderColor: filterAssignee !== 'all' ? 'var(--red)' : undefined, color: filterAssignee !== 'all' ? 'var(--red)' : undefined }}
            >
              <Icon name="users" size={14} /> Responsável
            </button>
            {showRespDrop && (
              <div style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, background: 'var(--white)', border: '1px solid var(--g-200)', borderRadius: 'var(--r-md)', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', padding: 8, zIndex: 200, minWidth: 180 }}>
                <button onClick={() => { setFilterAssignee('all'); setShowRespDrop(false); }}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '7px 10px', borderRadius: 'var(--r-sm)', fontSize: 13, fontWeight: filterAssignee === 'all' ? 700 : 400, color: filterAssignee === 'all' ? 'var(--red)' : 'var(--g-800)', background: filterAssignee === 'all' ? 'var(--red-soft)' : 'transparent', textAlign: 'left', marginBottom: 2 }}>
                  Todos
                </button>
                {MEMBERS.map(u => (
                  <button key={u.avatar} onClick={() => { setFilterAssignee(u.avatar); setShowRespDrop(false); }}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '7px 10px', borderRadius: 'var(--r-sm)', fontSize: 13, fontWeight: filterAssignee === u.avatar ? 700 : 400, color: filterAssignee === u.avatar ? 'var(--red)' : 'var(--g-800)', background: filterAssignee === u.avatar ? 'var(--red-soft)' : 'transparent', textAlign: 'left', marginBottom: 2 }}>
                    <UserAvatar name={u.avatar} size={22} />
                    {u.name.split(' ')[0]}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button className="btn-primary" onClick={() => openNew('todo')}>
            <Icon name="plus" size={14} /> Nova tarefa
          </button>
        </div>
      </div>

      {/* Filter pills */}
      {activeFilters.length > 0 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
          {activeFilters.map((f, i) => (
            <button key={i} onClick={f.clear}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 9999, fontSize: 12, fontWeight: 600, background: 'var(--red-soft)', color: 'var(--red)', border: '1px solid var(--red)', cursor: 'pointer' }}>
              {f.label} <Icon name="x" size={10} />
            </button>
          ))}
          <button onClick={() => { setFilterPriority('all'); setFilterAssignee('all'); setFilterAI(false); setFilterToday(false); }}
            style={{ padding: '5px 10px', borderRadius: 9999, fontSize: 12, color: 'var(--g-500)', background: 'var(--g-100)', border: '1px solid var(--g-200)', cursor: 'pointer' }}>
            Limpar tudo
          </button>
        </div>
      )}

      {/* Board */}
      <div className="kanban-board" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, flex: 1, overflow: 'hidden' }}>
        {COLS.map(col => (
          <div
            key={col.id}
            className={`kanban-col scroll ${hoverCol === col.id ? 'drop-hover' : ''}`}
            style={{ display: 'flex', flexDirection: 'column', overflowY: 'auto' }}
            onDragOver={(e) => onColDragOver(e, col.id)}
            onDragLeave={() => setHoverCol(null)}
            onDrop={(e) => onColDrop(e, col.id)}
          >
            {/* Col header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '2px 6px 12px', position: 'sticky', top: 0, background: 'var(--g-100)', zIndex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: col.color }} />
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--g-900)', textTransform: 'uppercase', letterSpacing: 0.3 }}>{col.label}</span>
                <span style={{ fontSize: 12, color: 'var(--g-500)', background: 'var(--white)', padding: '2px 8px', borderRadius: 9999 }}>{byCol[col.id].length}</span>
              </div>
              <button className="btn-icon" style={{ width: 24, height: 24 }} onClick={() => openNew(col.id)}>
                <Icon name="plus" size={12} />
              </button>
            </div>

            {/* Cards */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {byCol[col.id].map(t => (
                <TaskCard
                  key={t.id}
                  task={t}
                  isDragging={dragId === t.id}
                  onDragStart={(e) => onDragStart(e, t.id)}
                  onDrag={onDrag}
                  onDragEnd={onDragEnd}
                  onEdit={() => openEdit(t)}
                  onDelete={() => deleteTask(t.id)}
                />
              ))}
              {byCol[col.id].length === 0 && (
                <button
                  onClick={() => openNew(col.id)}
                  style={{ padding: 20, textAlign: 'center', fontSize: 12, color: 'var(--g-400)', border: '2px dashed var(--g-300)', borderRadius: 6, background: 'transparent', cursor: 'pointer', width: '100%' }}
                >
                  + Adicionar tarefa
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Drag ghost */}
      {draggingTask && ghostPos && (
        <div className="task-card drag-ghost" style={{ left: ghostPos.x - 130, top: ghostPos.y - 30 }}>
          <TaskCardBody task={draggingTask} />
        </div>
      )}

      {/* Modal Nova / Editar */}
      {showModal && (
        <TaskModal
          task={editTarget}
          defaultCol={defaultCol}
          onSave={saveTask}
          onClose={closeModal}
        />
      )}
    </div>
  );
}

/* ─── TaskCard ────────────────────────────────────────── */
function TaskCard({ task, isDragging, onDragStart, onDrag, onDragEnd, onEdit, onDelete }) {
  const [hovered, setHovered] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);

  return (
    <div
      className={`task-card ${isDragging ? 'dragging' : ''}`}
      draggable
      onDragStart={onDragStart}
      onDrag={onDrag}
      onDragEnd={onDragEnd}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setConfirmDel(false); }}
      style={{ position: 'relative' }}
    >
      <TaskCardBody task={task} />

      {/* Hover actions */}
      {hovered && !isDragging && (
        <div style={{
          position: 'absolute', top: 8, right: 8,
          display: 'flex', gap: 4,
          opacity: 1,
        }}>
          <button
            onMouseDown={e => { e.stopPropagation(); onEdit(); }}
            style={{ width: 26, height: 26, borderRadius: 6, background: 'var(--white)', border: '1px solid var(--g-200)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 1px 4px rgba(0,0,0,0.1)' }}
            title="Editar"
          >
            <Icon name="edit" size={12} style={{ color: 'var(--g-600)' }} />
          </button>
          {!confirmDel ? (
            <button
              onMouseDown={e => { e.stopPropagation(); setConfirmDel(true); }}
              style={{ width: 26, height: 26, borderRadius: 6, background: 'var(--white)', border: '1px solid var(--g-200)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 1px 4px rgba(0,0,0,0.1)' }}
              title="Excluir"
            >
              <Icon name="trash" size={12} style={{ color: 'var(--g-600)' }} />
            </button>
          ) : (
            <button
              onMouseDown={e => { e.stopPropagation(); onDelete(); }}
              style={{ height: 26, padding: '0 8px', borderRadius: 6, background: 'var(--red)', border: 'none', display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', fontSize: 11, fontWeight: 700, color: 'white', boxShadow: '0 1px 4px rgba(0,0,0,0.15)' }}
            >
              <Icon name="trash" size={11} style={{ color: 'white' }} /> Confirmar
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── TaskCardBody ────────────────────────────────────── */
function TaskCardBody({ task }) {
  const p     = PRIORITY[task.priority];
  const agent = task.agent ? AGENTS.find(a => a.id === task.agent) : null;
  const barW  = task.priority === 'high' ? '100%' : task.priority === 'med' ? '60%' : '30%';

  return (
    <>
      <div style={{ height: 3, background: p.bar, borderRadius: 2, marginBottom: 10, width: barW }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span className={`badge ${p.cls}`}>{p.label}</span>
        {agent && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <AgentAvatar id={task.agent} size={18} />
            <span style={{ fontSize: 10, fontWeight: 600, color: agent.color }}>{agent.name}</span>
          </div>
        )}
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--g-900)', marginBottom: 4, lineHeight: 1.35, paddingRight: 50 }}>{task.title}</div>
      {task.desc && <div style={{ fontSize: 11, color: 'var(--g-500)', lineHeight: 1.4, marginBottom: 10 }}>{task.desc}</div>}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 11, color: 'var(--g-500)' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" />
            </svg>
            {task.due}
          </span>
          {task.comments > 0 && <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><Icon name="msg" size={11} />{task.comments}</span>}
          {task.attachments > 0 && <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><Icon name="paperclip" size={11} />{task.attachments}</span>}
          {task.checklist && <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><Icon name="check" size={11} />{task.checklist[0]}/{task.checklist[1]}</span>}
        </div>
        <UserAvatar name={task.assignee} size={22} />
      </div>
    </>
  );
}

/* ─── TaskModal ───────────────────────────────────────── */
function TaskModal({ task, defaultCol, onSave, onClose }) {
  const isEdit = !!task;
  const [form, setForm] = useState({
    title:    task?.title    || '',
    desc:     task?.desc     || '',
    priority: task?.priority || 'med',
    assignee: task?.assignee || MEMBERS[0]?.avatar || 'W',
    due:      task?.due      || 'Hoje',
    col:      task?.col      || defaultCol,
    agent:    task?.agent    || '',
  });
  const [err, setErr] = useState('');

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  function submit() {
    if (!form.title.trim()) { setErr('Título é obrigatório.'); return; }
    onSave({ ...form, agent: form.agent || null });
  }

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(13,13,13,0.45)', zIndex: 300 }} />
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
        background: 'var(--white)', borderRadius: 'var(--r-lg)', padding: 28,
        zIndex: 301, width: 480, boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
        maxHeight: '90vh', overflowY: 'auto',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22 }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--g-900)' }}>
            {isEdit ? 'Editar tarefa' : 'Nova tarefa'}
          </div>
          <button className="btn-icon" onClick={onClose}><Icon name="x" size={16} /></button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Título */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--g-600)', display: 'block', marginBottom: 6 }}>Título *</label>
            <input
              className="input"
              placeholder="Ex: Revisar cardápio iFood"
              value={form.title}
              onChange={e => set('title', e.target.value)}
              autoFocus
            />
            {err && <div style={{ fontSize: 11, color: 'var(--red)', marginTop: 4 }}>{err}</div>}
          </div>

          {/* Descrição */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--g-600)', display: 'block', marginBottom: 6 }}>Descrição</label>
            <textarea
              className="input"
              placeholder="Detalhes da tarefa..."
              value={form.desc}
              onChange={e => set('desc', e.target.value)}
              rows={2}
              style={{ resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }}
            />
          </div>

          {/* Prioridade + Coluna */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--g-600)', display: 'block', marginBottom: 6 }}>Prioridade</label>
              <select className="input" value={form.priority} onChange={e => set('priority', e.target.value)}>
                <option value="high">🔴 Urgente</option>
                <option value="med">🟡 Média</option>
                <option value="low">🟢 Baixa</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--g-600)', display: 'block', marginBottom: 6 }}>Coluna</label>
              <select className="input" value={form.col} onChange={e => set('col', e.target.value)}>
                {COLS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </div>
          </div>

          {/* Responsável + Prazo */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--g-600)', display: 'block', marginBottom: 6 }}>Responsável</label>
              <select className="input" value={form.assignee} onChange={e => set('assignee', e.target.value)}>
                {MEMBERS.map(u => <option key={u.avatar} value={u.avatar}>{u.name.split(' ')[0]}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--g-600)', display: 'block', marginBottom: 6 }}>Prazo</label>
              <input className="input" placeholder="Ex: Hoje, Amanhã, 30/04" value={form.due} onChange={e => set('due', e.target.value)} />
            </div>
          </div>

          {/* Agente IA */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--g-600)', display: 'block', marginBottom: 6 }}>Agente IA (opcional)</label>
            <select className="input" value={form.agent} onChange={e => set('agent', e.target.value)}>
              <option value="">— Nenhum —</option>
              {AGENTS.map(a => <option key={a.id} value={a.id}>{a.name} · {a.role}</option>)}
            </select>
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8, marginTop: 22, justifyContent: 'flex-end' }}>
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" onClick={submit}>
            <Icon name="check" size={14} /> {isEdit ? 'Salvar alterações' : 'Criar tarefa'}
          </button>
        </div>
      </div>
    </>
  );
}
