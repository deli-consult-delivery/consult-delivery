import { useState, useEffect, useRef, useMemo } from 'react';
import Icon from '../components/Icon.jsx';
import AgentAvatar from '../components/AgentAvatar.jsx';
import UserAvatar from '../components/UserAvatar.jsx';
import { AGENTS, TASKS } from '../data.js';

const COLS = [
  { id: 'todo',     label: 'A Fazer',      color: 'var(--g-500)' },
  { id: 'progress', label: 'Em Andamento', color: 'var(--info)' },
  { id: 'review',   label: 'Em Revisão',   color: 'var(--warn)' },
  { id: 'done',     label: 'Concluído',    color: 'var(--success)' },
];

const PRIORITY = {
  high: { label: 'URGENTE', cls: 'badge-red',    bar: 'var(--red)' },
  med:  { label: 'MÉDIA',   cls: 'badge-yellow', bar: 'var(--warn)' },
  low:  { label: 'BAIXA',   cls: 'badge-green',  bar: 'var(--success)' },
};

export default function KanbanScreen({ tenant }) {
  const [tasks, setTasks] = useState(TASKS[tenant] || []);
  const [dragId, setDragId] = useState(null);
  const [hoverCol, setHoverCol] = useState(null);
  const [ghostPos, setGhostPos] = useState(null);

  useEffect(() => { setTasks(TASKS[tenant] || []); }, [tenant]);

  const byCol = useMemo(() => {
    const g = { todo: [], progress: [], review: [], done: [] };
    tasks.forEach(t => { g[t.col]?.push(t); });
    return g;
  }, [tasks]);

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

  const onColDragOver = (e, colId) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (hoverCol !== colId) setHoverCol(colId);
  };

  const onColDrop = (e, colId) => {
    e.preventDefault();
    if (!dragId) return;
    setTasks(ts => ts.map(t => t.id === dragId ? { ...t, col: colId } : t));
    onDragEnd();
  };

  const draggingTask = tasks.find(t => t.id === dragId);

  return (
    <div className="route-enter" style={{ padding: 32, height: 'calc(100vh - 64px)', display: 'flex', flexDirection: 'column', background: 'var(--g-50)' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 20 }}>
        <div>
          <h1 className="page-h1">Tarefas</h1>
          <p className="page-sub">{tasks.length} tarefas · {tasks.filter(t => t.col !== 'done').length} ativas</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-secondary"><Icon name="filter" size={14} /> Filtros</button>
          <button className="btn-secondary"><Icon name="users" size={14} /> Responsável</button>
          <button className="btn-primary"><Icon name="plus" size={14} /> Nova tarefa</button>
        </div>
      </div>

      {/* Filter pills */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        <span className="badge badge-gray" style={{ padding: '6px 12px', fontSize: 12 }}>Todas as prioridades</span>
        <span className="badge badge-red" style={{ padding: '6px 12px', fontSize: 12, cursor: 'pointer' }}>
          <Icon name="x" size={10} style={{ display: 'inline' }} /> Criadas por IA (6)
        </span>
        <span className="badge badge-gray" style={{ padding: '6px 12px', fontSize: 12 }}>Vence hoje</span>
      </div>

      {/* Board */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, flex: 1, overflow: 'hidden' }}>
        {COLS.map(col => (
          <div
            key={col.id}
            className={`kanban-col scroll ${hoverCol === col.id ? 'drop-hover' : ''}`}
            style={{ display: 'flex', flexDirection: 'column', overflowY: 'auto' }}
            onDragOver={(e) => onColDragOver(e, col.id)}
            onDragLeave={() => setHoverCol(null)}
            onDrop={(e) => onColDrop(e, col.id)}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '2px 6px 12px', position: 'sticky', top: 0, background: 'var(--g-100)', zIndex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: col.color }} />
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--g-900)', textTransform: 'uppercase', letterSpacing: 0.3 }}>{col.label}</span>
                <span style={{ fontSize: 12, color: 'var(--g-500)', background: 'white', padding: '2px 8px', borderRadius: 9999 }}>{byCol[col.id].length}</span>
              </div>
              <button className="btn-icon" style={{ width: 24, height: 24 }}><Icon name="plus" size={12} /></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {byCol[col.id].map(t => (
                <TaskCard key={t.id} task={t} isDragging={dragId === t.id}
                  onDragStart={(e) => onDragStart(e, t.id)}
                  onDrag={onDrag}
                  onDragEnd={onDragEnd}
                />
              ))}
              {byCol[col.id].length === 0 && (
                <div style={{ padding: 20, textAlign: 'center', fontSize: 12, color: 'var(--g-400)', border: '2px dashed var(--g-300)', borderRadius: 6 }}>
                  Arraste tarefas pra cá
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Drag ghost */}
      {draggingTask && ghostPos && (
        <div
          className="task-card drag-ghost"
          style={{ left: ghostPos.x - 130, top: ghostPos.y - 30 }}
        >
          <TaskCardBody task={draggingTask} />
        </div>
      )}
    </div>
  );
}

function TaskCard({ task, isDragging, onDragStart, onDrag, onDragEnd }) {
  return (
    <div
      className={`task-card ${isDragging ? 'dragging' : ''}`}
      draggable
      onDragStart={onDragStart}
      onDrag={onDrag}
      onDragEnd={onDragEnd}
    >
      <TaskCardBody task={task} />
    </div>
  );
}

function TaskCardBody({ task }) {
  const p = PRIORITY[task.priority];
  const agent = task.agent ? AGENTS.find(a => a.id === task.agent) : null;
  return (
    <>
      <div style={{
        height: 3, background: p.bar, borderRadius: 2,
        marginBottom: 10,
        width: task.priority === 'high' ? '100%' : task.priority === 'med' ? '60%' : '30%',
      }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span className={`badge ${p.cls}`}>{p.label}</span>
        {agent && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <AgentAvatar id={task.agent} size={18} />
            <span style={{ fontSize: 10, fontWeight: 600, color: agent.color }}>{agent.name}</span>
          </div>
        )}
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--g-900)', marginBottom: 4, lineHeight: 1.35 }}>{task.title}</div>
      {task.desc && <div style={{ fontSize: 11, color: 'var(--g-500)', lineHeight: 1.4, marginBottom: 10 }}>{task.desc}</div>}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 11, color: 'var(--g-500)' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>
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
