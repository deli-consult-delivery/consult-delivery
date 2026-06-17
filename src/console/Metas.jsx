import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase.js';

const BRIDGE = import.meta.env.VITE_BRIDGE_URL || 'https://bridge.consultdelivery.com.br';

// ── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_OPTIONS = [
  { value: 'active',    label: 'Ativo' },
  { value: 'achieved',  label: 'Concluído' },
  { value: 'on_hold',   label: 'Em pausa' },
  { value: 'cancelled', label: 'Cancelado' },
];

const PRIORITY_OPTIONS = [
  { value: 'urgent', label: 'Urgente' },
  { value: 'high',   label: 'Alta' },
  { value: 'medium', label: 'Média' },
  { value: 'low',    label: 'Baixa' },
];

const METRIC_TYPE_OPTIONS = [
  { value: 'count',      label: 'Contagem' },
  { value: 'currency',   label: 'Moeda (R$)' },
  { value: 'percentage', label: 'Porcentagem (%)' },
  { value: 'boolean',    label: 'Booleano (sim/não)' },
];

const PRIORITY_COLORS = {
  urgent: '#ef4444',
  high:   '#f97316',
  medium: '#eab308',
  low:    '#6b7280',
};

const STATUS_COLORS = {
  active:    '#22c55e',
  achieved:  '#3b82f6',
  on_hold:   '#f59e0b',
  cancelled: '#6b7280',
};

function progressColor(pct) {
  if (pct < 30) return '#B70C00';
  if (pct < 70) return '#f59e0b';
  return '#22c55e';
}

function fmtMetric(goal) {
  const cur = goal.current_value ?? 0;
  const tgt = goal.target_value ?? 0;
  switch (goal.metric_type) {
    case 'currency':
      return `R$ ${Number(cur).toLocaleString('pt-BR')} / R$ ${Number(tgt).toLocaleString('pt-BR')}`;
    case 'percentage':
      return `${cur}% / ${tgt}%`;
    case 'boolean':
      return cur >= 1 ? 'Concluído' : 'Pendente';
    default:
      return `${cur} / ${tgt}`;
  }
}

function calcPct(goal) {
  const tgt = goal.target_value ?? 0;
  if (!tgt) return 0;
  return Math.min(100, Math.round(((goal.current_value ?? 0) / tgt) * 100));
}

function fmtDate(iso) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString('pt-BR');
}

// ── Shared input styles ───────────────────────────────────────────────────────
const INPUT_STYLE = {
  display: 'block', width: '100%', marginTop: 4, padding: '8px 12px',
  background: 'var(--panel)', border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 8, color: 'var(--tx)', fontSize: 14, boxSizing: 'border-box',
};
const SELECT_STYLE = { ...INPUT_STYLE };
const LABEL_STYLE  = { color: 'var(--tx2)', fontSize: 13 };

// ── ProgressBar ───────────────────────────────────────────────────────────────
function ProgressBar({ pct, height = 6 }) {
  const color = progressColor(pct);
  return (
    <div style={{ height, background: 'rgba(255,255,255,0.08)', borderRadius: height, overflow: 'hidden' }}>
      <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: height, transition: 'width 0.3s' }} />
    </div>
  );
}

// ── Modal base ────────────────────────────────────────────────────────────────
function Modal({ title, onClose, children }) {
  return (
    <div
      onClick={e => e.target === e.currentTarget && onClose()}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <div style={{ maxWidth: 560, width: '95%', maxHeight: '90vh', overflowY: 'auto', background: 'var(--panel)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 18, color: 'var(--tx)' }}>{title}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--tx2)', fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ModalActions({ onClose, onSave, saving, saveLabel }) {
  return (
    <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
      <button onClick={onClose} className="cv2-btn sec">
        Cancelar
      </button>
      <button onClick={onSave} disabled={saving} className="cv2-btn" style={{ opacity: saving ? 0.7 : 1, cursor: saving ? 'not-allowed' : 'pointer' }}>
        {saving ? 'Salvando…' : saveLabel}
      </button>
    </div>
  );
}

function ErrorBanner({ msg }) {
  if (!msg) return null;
  return (
    <div style={{ color: '#ef4444', fontSize: 13, padding: '8px 12px', background: 'rgba(239,68,68,0.1)', borderRadius: 6, marginTop: 8 }}>
      {msg}
    </div>
  );
}

// ── MissionModal ──────────────────────────────────────────────────────────────
function MissionModal({ mission, onClose, onSaved, headers }) {
  const isEdit = !!mission?.id;
  const [form, setForm] = useState({
    title:       mission?.title       || '',
    description: mission?.description || '',
    due_date:    mission?.due_date    || '',
    status:      mission?.status      || 'active',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  async function handleSave() {
    if (!form.title.trim()) return setError('Título obrigatório');
    setSaving(true); setError('');
    try {
      const url    = isEdit ? `${BRIDGE}/api/goals/missions/${mission.id}` : `${BRIDGE}/api/goals/missions`;
      const method = isEdit ? 'PATCH' : 'POST';
      const r = await fetch(url, {
        method, headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || `HTTP ${r.status}`); }
      onSaved(await r.json(), isEdit);
    } catch (e) { setError(e.message); } finally { setSaving(false); }
  }

  return (
    <Modal title={isEdit ? 'Editar Missão' : 'Nova Missão'} onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <label style={LABEL_STYLE}>
          Título *
          <input value={form.title} onChange={e => set('title', e.target.value)} placeholder="Ex: Atingir R$ 1M de MRR em 2026" style={INPUT_STYLE} />
        </label>
        <label style={LABEL_STYLE}>
          Descrição
          <input value={form.description} onChange={e => set('description', e.target.value)} placeholder="Contexto da missão" style={INPUT_STYLE} />
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <label style={LABEL_STYLE}>
            Prazo
            <input type="date" value={form.due_date} onChange={e => set('due_date', e.target.value)} style={INPUT_STYLE} />
          </label>
          <label style={LABEL_STYLE}>
            Status
            <select value={form.status} onChange={e => set('status', e.target.value)} style={SELECT_STYLE}>
              {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
        </div>
        <ErrorBanner msg={error} />
        <ModalActions onClose={onClose} onSave={handleSave} saving={saving} saveLabel={isEdit ? 'Salvar' : 'Criar missão'} />
      </div>
    </Modal>
  );
}

// ── ProjectModal ──────────────────────────────────────────────────────────────
function ProjectModal({ project, missions, onClose, onSaved, headers }) {
  const isEdit = !!project?.id;
  const [form, setForm] = useState({
    mission_id:  project?.mission_id  || missions[0]?.id || '',
    title:       project?.title       || '',
    description: project?.description || '',
    status:      project?.status      || 'active',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  async function handleSave() {
    if (!form.title.trim())      return setError('Título obrigatório');
    if (!form.mission_id)        return setError('Selecione uma missão');
    setSaving(true); setError('');
    try {
      const url    = isEdit ? `${BRIDGE}/api/goals/projects/${project.id}` : `${BRIDGE}/api/goals/projects`;
      const method = isEdit ? 'PATCH' : 'POST';
      const r = await fetch(url, {
        method, headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || `HTTP ${r.status}`); }
      onSaved(await r.json(), isEdit);
    } catch (e) { setError(e.message); } finally { setSaving(false); }
  }

  return (
    <Modal title={isEdit ? 'Editar Projeto' : 'Novo Projeto'} onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <label style={LABEL_STYLE}>
          Missão *
          <select value={form.mission_id} onChange={e => set('mission_id', e.target.value)} style={SELECT_STYLE}>
            <option value="">Selecione…</option>
            {missions.map(m => <option key={m.id} value={m.id}>{m.title}</option>)}
          </select>
        </label>
        <label style={LABEL_STYLE}>
          Título *
          <input value={form.title} onChange={e => set('title', e.target.value)} placeholder="Ex: Evo AI" style={INPUT_STYLE} />
        </label>
        <label style={LABEL_STYLE}>
          Descrição
          <input value={form.description} onChange={e => set('description', e.target.value)} placeholder="Contexto do projeto" style={INPUT_STYLE} />
        </label>
        <label style={LABEL_STYLE}>
          Status
          <select value={form.status} onChange={e => set('status', e.target.value)} style={SELECT_STYLE}>
            {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
        <ErrorBanner msg={error} />
        <ModalActions onClose={onClose} onSave={handleSave} saving={saving} saveLabel={isEdit ? 'Salvar' : 'Criar projeto'} />
      </div>
    </Modal>
  );
}

// ── GoalModal ─────────────────────────────────────────────────────────────────
function GoalModal({ goal, projects, onClose, onSaved, headers }) {
  const isEdit = !!goal?.id;
  const [form, setForm] = useState({
    project_id:   goal?.project_id   || projects[0]?.id || '',
    title:        goal?.title        || '',
    description:  goal?.description  || '',
    metric_type:  goal?.metric_type  || 'count',
    target_value: goal?.target_value || '',
    due_date:     goal?.due_date     || '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  async function handleSave() {
    if (!form.title.trim())  return setError('Título obrigatório');
    if (!form.project_id)    return setError('Selecione um projeto');
    setSaving(true); setError('');
    try {
      const url    = isEdit ? `${BRIDGE}/api/goals/goals/${goal.id}` : `${BRIDGE}/api/goals/goals`;
      const method = isEdit ? 'PATCH' : 'POST';
      const r = await fetch(url, {
        method, headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, target_value: Number(form.target_value) || 0 }),
      });
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || `HTTP ${r.status}`); }
      onSaved(await r.json(), isEdit);
    } catch (e) { setError(e.message); } finally { setSaving(false); }
  }

  return (
    <Modal title={isEdit ? 'Editar Meta' : 'Nova Meta'} onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <label style={LABEL_STYLE}>
          Projeto *
          <select value={form.project_id} onChange={e => set('project_id', e.target.value)} style={SELECT_STYLE}>
            <option value="">Selecione…</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
          </select>
        </label>
        <label style={LABEL_STYLE}>
          Título *
          <input value={form.title} onChange={e => set('title', e.target.value)} placeholder="Ex: 100 clientes pagantes até Jun/30" style={INPUT_STYLE} />
        </label>
        <label style={LABEL_STYLE}>
          Descrição
          <input value={form.description} onChange={e => set('description', e.target.value)} placeholder="Detalhes opcionais" style={INPUT_STYLE} />
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <label style={LABEL_STYLE}>
            Tipo de métrica
            <select value={form.metric_type} onChange={e => set('metric_type', e.target.value)} style={SELECT_STYLE}>
              {METRIC_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
          <label style={LABEL_STYLE}>
            Valor alvo
            <input type="number" value={form.target_value} onChange={e => set('target_value', e.target.value)} placeholder="100" style={INPUT_STYLE} />
          </label>
        </div>
        <label style={LABEL_STYLE}>
          Prazo
          <input type="date" value={form.due_date} onChange={e => set('due_date', e.target.value)} style={INPUT_STYLE} />
        </label>
        <ErrorBanner msg={error} />
        <ModalActions onClose={onClose} onSave={handleSave} saving={saving} saveLabel={isEdit ? 'Salvar' : 'Criar meta'} />
      </div>
    </Modal>
  );
}

// ── TaskModal ─────────────────────────────────────────────────────────────────
function TaskModal({ task, goals, onClose, onSaved, headers }) {
  const isEdit = !!task?.id;
  const [form, setForm] = useState({
    goal_id:        task?.goal_id        || goals[0]?.id || '',
    title:          task?.title          || '',
    description:    task?.description    || '',
    priority:       task?.priority       || 'medium',
    assignee_agent: task?.assignee_agent || '',
    due_date:       task?.due_date       || '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  async function handleSave() {
    if (!form.title.trim()) return setError('Título obrigatório');
    if (!form.goal_id)      return setError('Selecione uma meta');
    setSaving(true); setError('');
    try {
      const url    = isEdit ? `${BRIDGE}/api/goals/tasks/${task.id}` : `${BRIDGE}/api/goals/tasks`;
      const method = isEdit ? 'PATCH' : 'POST';
      const r = await fetch(url, {
        method, headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || `HTTP ${r.status}`); }
      onSaved(await r.json(), isEdit);
    } catch (e) { setError(e.message); } finally { setSaving(false); }
  }

  return (
    <Modal title={isEdit ? 'Editar Tarefa' : 'Nova Tarefa'} onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <label style={LABEL_STYLE}>
          Meta *
          <select value={form.goal_id} onChange={e => set('goal_id', e.target.value)} style={SELECT_STYLE}>
            <option value="">Selecione…</option>
            {goals.map(g => <option key={g.id} value={g.id}>{g.title}</option>)}
          </select>
        </label>
        <label style={LABEL_STYLE}>
          Título *
          <input value={form.title} onChange={e => set('title', e.target.value)} placeholder="Ex: Integrar gateway de pagamento" style={INPUT_STYLE} />
        </label>
        <label style={LABEL_STYLE}>
          Descrição
          <input value={form.description} onChange={e => set('description', e.target.value)} placeholder="Detalhes opcionais" style={INPUT_STYLE} />
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <label style={LABEL_STYLE}>
            Prioridade
            <select value={form.priority} onChange={e => set('priority', e.target.value)} style={SELECT_STYLE}>
              {PRIORITY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
          <label style={LABEL_STYLE}>
            Agente responsável
            <input value={form.assignee_agent} onChange={e => set('assignee_agent', e.target.value)} placeholder="Ex: deli" style={INPUT_STYLE} />
          </label>
        </div>
        <label style={LABEL_STYLE}>
          Prazo
          <input type="date" value={form.due_date} onChange={e => set('due_date', e.target.value)} style={INPUT_STYLE} />
        </label>
        <ErrorBanner msg={error} />
        <ModalActions onClose={onClose} onSave={handleSave} saving={saving} saveLabel={isEdit ? 'Salvar' : 'Criar tarefa'} />
      </div>
    </Modal>
  );
}

// ── TaskRow ───────────────────────────────────────────────────────────────────
function TaskRow({ task, onToggleDone, onEdit, onDelete }) {
  const done = task.status === 'done';
  const [toggling, setToggling] = useState(false);

  async function handleCheck() {
    if (toggling) return;
    setToggling(true);
    await onToggleDone(task);
    setToggling(false);
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, padding: '7px 12px',
      borderRadius: 6,
      background: done ? 'rgba(34,197,94,0.05)' : 'var(--panel)',
      border: `1px solid ${done ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.06)'}`,
    }}>
      <button
        onClick={handleCheck}
        disabled={toggling}
        style={{
          width: 18, height: 18, flexShrink: 0, borderRadius: 4, cursor: toggling ? 'not-allowed' : 'pointer',
          background: done ? '#22c55e' : 'rgba(255,255,255,0.06)',
          border: `2px solid ${done ? '#22c55e' : 'rgba(255,255,255,0.15)'}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontSize: 11, padding: 0,
        }}
      >
        {done && '✓'}
      </button>
      <span style={{ flex: 1, fontSize: 13, color: done ? 'var(--tx2)' : 'var(--tx)', textDecoration: done ? 'line-through' : 'none' }}>
        {task.title}
      </span>
      {task.assignee_agent && (
        <span className="cv2-bdg">{task.assignee_agent}</span>
      )}
      {task.priority && task.priority !== 'medium' && (
        <span style={{ fontSize: 11, color: PRIORITY_COLORS[task.priority] || 'var(--tx2)', background: 'rgba(255,255,255,0.06)', borderRadius: 4, padding: '2px 6px', textTransform: 'capitalize' }}>
          {PRIORITY_OPTIONS.find(p => p.value === task.priority)?.label || task.priority}
        </span>
      )}
      <button
        onClick={() => onEdit(task)}
        style={{ background: 'none', border: 'none', color: 'var(--tx2)', cursor: 'pointer', fontSize: 13, padding: '2px 4px', lineHeight: 1 }}
        title="Editar"
      >✏️</button>
      <button
        onClick={() => onDelete(task)}
        style={{ background: 'none', border: 'none', color: 'var(--tx2)', cursor: 'pointer', fontSize: 13, padding: '2px 4px', lineHeight: 1 }}
        title="Remover"
      >🗑</button>
    </div>
  );
}

// ── GoalCard ──────────────────────────────────────────────────────────────────
function GoalCard({ goal, onEditGoal, onDeleteGoal, onAddTask, onEditTask, onDeleteTask, onToggleTaskDone }) {
  const [open, setOpen] = useState(false);
  const pct = calcPct(goal);
  const tasks = goal.tasks || [];

  return (
    <div className="cv2-card" style={{ marginLeft: 20, marginBottom: 8, padding: 0, overflow: 'hidden' }}>
      {/* Goal header */}
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', cursor: 'pointer', background: 'var(--panel)' }}
        onClick={() => setOpen(o => !o)}
      >
        <span style={{ color: 'var(--tx2)', fontSize: 12, flexShrink: 0 }}>{open ? '▼' : '▶'}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 14, color: 'var(--tx)', fontWeight: 500 }}>{goal.title}</span>
            <span style={{ fontSize: 12, color: 'var(--tx2)' }}>{fmtMetric(goal)}</span>
            {goal.due_date && <span style={{ fontSize: 11, color: 'var(--tx2)' }}>até {fmtDate(goal.due_date)}</span>}
          </div>
          <div style={{ marginTop: 4 }}>
            <ProgressBar pct={pct} height={4} />
          </div>
        </div>
        <span style={{ fontSize: 12, color: progressColor(pct), fontWeight: 600, flexShrink: 0 }}>{pct}%</span>
        <div style={{ display: 'flex', gap: 4 }} onClick={e => e.stopPropagation()}>
          <button
            onClick={() => onAddTask(goal)}
            style={{ fontSize: 11, padding: '3px 8px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 5, color: 'var(--tx2)', cursor: 'pointer' }}
          >
            + Tarefa
          </button>
          <button onClick={() => onEditGoal(goal)} style={{ background: 'none', border: 'none', color: 'var(--tx2)', cursor: 'pointer', fontSize: 13, padding: '2px 4px' }} title="Editar meta">✏️</button>
          <button onClick={() => onDeleteGoal(goal)} style={{ background: 'none', border: 'none', color: 'var(--tx2)', cursor: 'pointer', fontSize: 13, padding: '2px 4px' }} title="Remover meta">🗑</button>
        </div>
      </div>

      {/* Tasks */}
      {open && (
        <div style={{ padding: '8px 14px 12px', background: 'var(--bg)' }}>
          {tasks.length === 0 ? (
            <div style={{ color: 'var(--tx2)', fontSize: 12, fontStyle: 'italic', padding: '4px 0' }}>Nenhuma tarefa ainda</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {tasks.map(t => (
                <TaskRow
                  key={t.id}
                  task={t}
                  onToggleDone={onToggleTaskDone}
                  onEdit={onEditTask}
                  onDelete={onDeleteTask}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── ProjectCard ───────────────────────────────────────────────────────────────
function ProjectCard({ project, allGoals, onEditProject, onDeleteProject, onAddGoal, onEditGoal, onDeleteGoal, onAddTask, onEditTask, onDeleteTask, onToggleTaskDone }) {
  const [open, setOpen] = useState(false);
  const goals = allGoals.filter(g => g.project_id === project.id);

  const totalTasks = goals.reduce((acc, g) => acc + (g.tasks?.length || 0), 0);
  const doneTasks  = goals.reduce((acc, g) => acc + (g.tasks?.filter(t => t.status === 'done').length || 0), 0);
  const pct = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

  return (
    <div className="cv2-card" style={{ marginLeft: 16, marginBottom: 8, padding: 0, overflow: 'hidden' }}>
      {/* Project header */}
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', cursor: 'pointer', background: 'var(--panel)' }}
        onClick={() => setOpen(o => !o)}
      >
        <span style={{ color: 'var(--tx2)', fontSize: 12, flexShrink: 0 }}>{open ? '▼' : '▶'}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 14, color: 'var(--tx)', fontWeight: 500 }}>{project.title}</span>
            <span style={{ fontSize: 12, color: 'var(--tx2)' }}>{goals.length} meta{goals.length !== 1 ? 's' : ''}</span>
          </div>
          {goals.length > 0 && <div style={{ marginTop: 4 }}><ProgressBar pct={pct} height={3} /></div>}
        </div>
        <div style={{ display: 'flex', gap: 4 }} onClick={e => e.stopPropagation()}>
          <button
            onClick={() => onAddGoal(project)}
            style={{ fontSize: 11, padding: '3px 8px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 5, color: 'var(--tx2)', cursor: 'pointer' }}
          >
            + Meta
          </button>
          <button onClick={() => onEditProject(project)} style={{ background: 'none', border: 'none', color: 'var(--tx2)', cursor: 'pointer', fontSize: 13, padding: '2px 4px' }} title="Editar projeto">✏️</button>
          <button onClick={() => onDeleteProject(project)} style={{ background: 'none', border: 'none', color: 'var(--tx2)', cursor: 'pointer', fontSize: 13, padding: '2px 4px' }} title="Remover projeto">🗑</button>
        </div>
      </div>

      {/* Goals */}
      {open && (
        <div style={{ padding: '8px 0 4px', background: 'var(--bg)' }}>
          {goals.length === 0 ? (
            <div style={{ color: 'var(--tx2)', fontSize: 12, fontStyle: 'italic', padding: '4px 30px' }}>Nenhuma meta ainda</div>
          ) : (
            <div style={{ padding: '0 8px' }}>
              {goals.map(g => (
                <GoalCard
                  key={g.id}
                  goal={g}
                  onEditGoal={onEditGoal}
                  onDeleteGoal={onDeleteGoal}
                  onAddTask={onAddTask}
                  onEditTask={onEditTask}
                  onDeleteTask={onDeleteTask}
                  onToggleTaskDone={onToggleTaskDone}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── MissionCard ───────────────────────────────────────────────────────────────
function MissionCard({ mission, projects, goals, onEditMission, onDeleteMission, onAddProject, onEditProject, onDeleteProject, onAddGoal, onEditGoal, onDeleteGoal, onAddTask, onEditTask, onDeleteTask, onToggleTaskDone }) {
  const [open, setOpen] = useState(true);

  const mProjects = projects.filter(p => p.mission_id === mission.id);
  const mGoals    = goals.filter(g => mProjects.some(p => p.id === g.project_id));
  const totalTasks = mGoals.reduce((acc, g) => acc + (g.tasks?.length || 0), 0);
  const doneTasks  = mGoals.reduce((acc, g) => acc + (g.tasks?.filter(t => t.status === 'done').length || 0), 0);
  const pct = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

  const statusColor = STATUS_COLORS[mission.status] || '#6b7280';
  const statusLabel = STATUS_OPTIONS.find(s => s.value === mission.status)?.label || mission.status;

  return (
    <div className="cv2-card" style={{ marginBottom: 16, padding: 0, overflow: 'hidden' }}>
      {/* Mission header */}
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', cursor: 'pointer' }}
        onClick={() => setOpen(o => !o)}
      >
        <span style={{ color: 'var(--tx2)', fontSize: 13, flexShrink: 0 }}>{open ? '▼' : '▶'}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h3 style={{ margin: 0, fontSize: 16, color: 'var(--tx)', fontWeight: 600 }}>{mission.title}</h3>
            <span className="cv2-bdg" style={{ color: statusColor, background: `${statusColor}18` }}>
              {statusLabel}
            </span>
            {mission.due_date && (
              <span style={{ fontSize: 12, color: 'var(--tx2)' }}>até {fmtDate(mission.due_date)}</span>
            )}
          </div>
          {mission.description && (
            <p style={{ margin: '2px 0 0', color: 'var(--tx2)', fontSize: 13 }}>{mission.description}</p>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
            <div style={{ flex: 1, maxWidth: 300 }}>
              <ProgressBar pct={pct} height={5} />
            </div>
            <span style={{ fontSize: 12, color: progressColor(pct), fontWeight: 600 }}>{pct}%</span>
            <span style={{ fontSize: 12, color: 'var(--tx2)' }}>
              {doneTasks}/{totalTasks} tarefas · {mProjects.length} projeto{mProjects.length !== 1 ? 's' : ''} · {mGoals.length} meta{mGoals.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }} onClick={e => e.stopPropagation()}>
          <button
            onClick={() => onAddProject(mission)}
            style={{ fontSize: 12, padding: '5px 12px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, color: 'var(--tx2)', cursor: 'pointer' }}
          >
            + Projeto
          </button>
          <button onClick={() => onEditMission(mission)} style={{ background: 'none', border: 'none', color: 'var(--tx2)', cursor: 'pointer', fontSize: 15, padding: '4px' }} title="Editar missão">✏️</button>
          <button onClick={() => onDeleteMission(mission)} style={{ background: 'none', border: 'none', color: 'var(--tx2)', cursor: 'pointer', fontSize: 15, padding: '4px' }} title="Remover missão">🗑</button>
        </div>
      </div>

      {/* Projects */}
      {open && (
        <div style={{ padding: '4px 8px 12px', borderTop: '1px solid rgba(255,255,255,0.06)', background: 'var(--bg)' }}>
          {mProjects.length === 0 ? (
            <div style={{ color: 'var(--tx2)', fontSize: 13, fontStyle: 'italic', padding: '12px 10px' }}>
              Nenhum projeto nesta missão.
            </div>
          ) : (
            mProjects.map(p => (
              <ProjectCard
                key={p.id}
                project={p}
                allGoals={goals}
                onEditProject={onEditProject}
                onDeleteProject={onDeleteProject}
                onAddGoal={onAddGoal}
                onEditGoal={onEditGoal}
                onDeleteGoal={onDeleteGoal}
                onAddTask={onAddTask}
                onEditTask={onEditTask}
                onDeleteTask={onDeleteTask}
                onToggleTaskDone={onToggleTaskDone}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ── Metas principal ───────────────────────────────────────────────────────────
export default function Metas({ tenantDbId, userId, onNavigate }) {
  const [missions,  setMissions]  = useState([]);
  const [projects,  setProjects]  = useState([]);
  const [goals,     setGoals]     = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState('');
  const [headers,   setHeaders]   = useState({});

  // Modal state: { type: 'mission'|'project'|'goal'|'task', item: null|object, context: null|object }
  const [modal, setModal] = useState(null);

  // Obter JWT
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const token = data?.session?.access_token;
      if (token) setHeaders({ Authorization: `Bearer ${token}` });
    });
  }, []);

  // Carregar cascata completa via /goals/summary
  const loadData = useCallback(async () => {
    if (!headers.Authorization) return;
    setLoading(true); setError('');
    try {
      const r = await fetch(`${BRIDGE}/api/goals/summary`, { headers });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      setMissions(data.missions  || []);
      setProjects(data.projects  || []);
      setGoals(data.goals        || []);
    } catch (e) {
      // fallback: load each endpoint separately
      try {
        const [mR, pR, gR] = await Promise.all([
          fetch(`${BRIDGE}/api/goals/missions`,  { headers }),
          fetch(`${BRIDGE}/api/goals/projects`,  { headers }),
          fetch(`${BRIDGE}/api/goals/goals`,     { headers }),
        ]);
        const [mData, pData, gData] = await Promise.all([mR.json(), pR.json(), gR.json()]);
        // For each goal, load its tasks
        const goalsWithTasks = await Promise.all(
          (Array.isArray(gData) ? gData : []).map(async g => {
            try {
              const tr = await fetch(`${BRIDGE}/api/goals/tasks?goal_id=${g.id}`, { headers });
              const tasks = await tr.json();
              return { ...g, tasks: Array.isArray(tasks) ? tasks : [] };
            } catch { return { ...g, tasks: [] }; }
          })
        );
        setMissions(Array.isArray(mData) ? mData : []);
        setProjects(Array.isArray(pData) ? pData : []);
        setGoals(goalsWithTasks);
      } catch (e2) {
        setError(`Erro ao carregar dados: ${e2.message}`);
      }
    } finally {
      setLoading(false);
    }
  }, [headers]);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Delete helpers ───────────────────────────────────────────────────────
  async function deleteMission(m) {
    if (!confirm(`Remover missão "${m.title}"? Todos os projetos e metas serão excluídos.`)) return;
    try {
      const r = await fetch(`${BRIDGE}/api/goals/missions/${m.id}`, { method: 'DELETE', headers });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setMissions(prev => prev.filter(x => x.id !== m.id));
    } catch (e) { setError(e.message); }
  }

  async function deleteProject(p) {
    if (!confirm(`Remover projeto "${p.title}"?`)) return;
    try {
      const r = await fetch(`${BRIDGE}/api/goals/projects/${p.id}`, { method: 'DELETE', headers });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setProjects(prev => prev.filter(x => x.id !== p.id));
    } catch (e) { setError(e.message); }
  }

  async function deleteGoal(g) {
    if (!confirm(`Remover meta "${g.title}"?`)) return;
    try {
      const r = await fetch(`${BRIDGE}/api/goals/goals/${g.id}`, { method: 'DELETE', headers });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setGoals(prev => prev.filter(x => x.id !== g.id));
    } catch (e) { setError(e.message); }
  }

  async function deleteTask(t) {
    if (!confirm(`Remover tarefa "${t.title}"?`)) return;
    try {
      const r = await fetch(`${BRIDGE}/api/goals/tasks/${t.id}`, { method: 'DELETE', headers });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setGoals(prev => prev.map(g => ({
        ...g,
        tasks: (g.tasks || []).filter(x => x.id !== t.id),
      })));
    } catch (e) { setError(e.message); }
  }

  async function toggleTaskDone(task) {
    const newStatus = task.status === 'done' ? 'open' : 'done';
    try {
      const r = await fetch(`${BRIDGE}/api/goals/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const updated = await r.json();
      setGoals(prev => prev.map(g => ({
        ...g,
        tasks: (g.tasks || []).map(t => t.id === task.id ? { ...t, ...updated } : t),
      })));
    } catch (e) { setError(e.message); }
  }

  // ── onSaved callbacks ────────────────────────────────────────────────────
  function onMissionSaved(saved, isEdit) {
    if (isEdit) setMissions(prev => prev.map(x => x.id === saved.id ? saved : x));
    else        setMissions(prev => [...prev, saved]);
    setModal(null);
  }

  function onProjectSaved(saved, isEdit) {
    if (isEdit) setProjects(prev => prev.map(x => x.id === saved.id ? saved : x));
    else        setProjects(prev => [...prev, saved]);
    setModal(null);
  }

  function onGoalSaved(saved, isEdit) {
    if (isEdit) setGoals(prev => prev.map(x => x.id === saved.id ? { ...x, ...saved } : x));
    else        setGoals(prev => [...prev, { ...saved, tasks: [] }]);
    setModal(null);
  }

  function onTaskSaved(saved, isEdit) {
    if (isEdit) {
      setGoals(prev => prev.map(g => ({
        ...g,
        tasks: (g.tasks || []).map(t => t.id === saved.id ? { ...t, ...saved } : t),
      })));
    } else {
      setGoals(prev => prev.map(g =>
        g.id === saved.goal_id
          ? { ...g, tasks: [...(g.tasks || []), saved] }
          : g
      ));
    }
    setModal(null);
  }

  // ── Stats ────────────────────────────────────────────────────────────────
  const totalMissions  = missions.length;
  const activeGoals    = goals.filter(g => g.status === 'active').length;
  const allTasks       = goals.flatMap(g => g.tasks || []);
  const doneTodayCount = allTasks.filter(t => {
    if (t.status !== 'done' || !t.completed_at) return false;
    const d = new Date(t.completed_at);
    const now = new Date();
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  }).length;
  const totalPct = allTasks.length > 0
    ? Math.round((allTasks.filter(t => t.status === 'done').length / allTasks.length) * 100)
    : 0;

  return (
    <div style={{ padding: '24px 20px', maxWidth: 960, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, color: 'var(--tx)', fontWeight: 700 }}>Metas & OKR</h1>
          <p style={{ margin: '4px 0 0', color: 'var(--tx2)', fontSize: 14 }}>
            Missões, projetos, metas e tarefas — tudo conectado
          </p>
        </div>
        <button className="cv2-btn" onClick={() => setModal({ type: 'mission', item: null })}>
          + Nova Missão
        </button>
      </div>

      {/* Stats */}
      {!loading && missions.length > 0 && (
        <div className="cv2-kpis" style={{ marginBottom: 24 }}>
          {[
            { label: 'Missões',         value: totalMissions,  color: 'var(--tx)' },
            { label: 'Metas ativas',    value: activeGoals,    color: '#22c55e' },
            { label: 'Tarefas hoje',    value: doneTodayCount, color: '#f59e0b' },
            { label: 'Progresso geral', value: `${totalPct}%`, color: progressColor(totalPct) },
          ].map(s => (
            <div key={s.label} className="cv2-kpi">
              <div className="cv2-kpi v" style={{ color: s.color }}>{s.value}</div>
              <div className="cv2-kpi l">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div style={{ marginBottom: 16, padding: '10px 16px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 8, color: '#ef4444', fontSize: 13, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {error}
          <button onClick={() => setError('')} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 16 }}>×</button>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div style={{ color: 'var(--tx2)', textAlign: 'center', padding: 60 }}>Carregando metas…</div>
      ) : missions.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--tx2)' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🎯</div>
          <div style={{ fontSize: 16, color: 'var(--tx)', marginBottom: 8 }}>Nenhuma missão cadastrada</div>
          <div style={{ fontSize: 13, marginBottom: 24 }}>
            Crie sua primeira missão para começar a rastrear metas.
          </div>
          <button className="cv2-btn" onClick={() => setModal({ type: 'mission', item: null })}>
            Criar primeira missão
          </button>
        </div>
      ) : (
        <div>
          {missions.map(m => (
            <MissionCard
              key={m.id}
              mission={m}
              projects={projects}
              goals={goals}
              onEditMission={item  => setModal({ type: 'mission',  item })}
              onDeleteMission={deleteMission}
              onAddProject={mission => setModal({ type: 'project', item: null, context: { mission_id: mission.id } })}
              onEditProject={item  => setModal({ type: 'project',  item })}
              onDeleteProject={deleteProject}
              onAddGoal={project  => setModal({ type: 'goal',    item: null, context: { project_id: project.id } })}
              onEditGoal={item    => setModal({ type: 'goal',    item })}
              onDeleteGoal={deleteGoal}
              onAddTask={goal     => setModal({ type: 'task',    item: null, context: { goal_id: goal.id } })}
              onEditTask={item    => setModal({ type: 'task',    item })}
              onDeleteTask={deleteTask}
              onToggleTaskDone={toggleTaskDone}
            />
          ))}
        </div>
      )}

      {/* Modals */}
      {modal?.type === 'mission' && (
        <MissionModal
          mission={modal.item}
          onClose={() => setModal(null)}
          onSaved={onMissionSaved}
          headers={headers}
        />
      )}
      {modal?.type === 'project' && (
        <ProjectModal
          project={modal.item ?? (modal.context ? { mission_id: modal.context.mission_id } : null)}
          missions={missions}
          onClose={() => setModal(null)}
          onSaved={onProjectSaved}
          headers={headers}
        />
      )}
      {modal?.type === 'goal' && (
        <GoalModal
          goal={modal.item ?? (modal.context ? { project_id: modal.context.project_id } : null)}
          projects={projects}
          onClose={() => setModal(null)}
          onSaved={onGoalSaved}
          headers={headers}
        />
      )}
      {modal?.type === 'task' && (
        <TaskModal
          task={modal.item ?? (modal.context ? { goal_id: modal.context.goal_id } : null)}
          goals={goals}
          onClose={() => setModal(null)}
          onSaved={onTaskSaved}
          headers={headers}
        />
      )}
    </div>
  );
}
