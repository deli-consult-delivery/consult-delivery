import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import Icon from '../components/Icon.jsx';
import UserAvatar from '../components/UserAvatar.jsx';
import AgentAvatar from '../components/AgentAvatar.jsx';
import { AGENTS, SETTINGS_DATA } from '../data.js';
import { listClientes, listClientTasks, createClientTask, updateClientTask, moveClientTask, deleteClientTask } from '../lib/api.js';

// ─── Constantes ────────────────────────────────────────────────────────────────

const PHASES = [
  { id: 'onboarding',     num: '01', name: 'Onboarding',          color: '#B70C00' },
  { id: 'levantamento',   num: '02', name: 'Levantamento',        color: '#DC2626' },
  { id: 'diagnostico',    num: '03', name: 'Diagnóstico',         color: '#EA580C' },
  { id: 'planejamento',   num: '04', name: 'Planejamento',        color: '#D97706' },
  { id: 'implantacao',    num: '05', name: 'Implantação',         color: '#059669' },
  { id: 'treinamento',    num: '06', name: 'Treinamento',         color: '#0891B2' },
  { id: 'acompanhamento', num: '07', name: 'Acompanhamento',      color: '#6366F1' },
  { id: 'revisao',        num: '08', name: 'Revisão',             color: '#8B5CF6' },
  { id: 'avaliacoes',     num: '09', name: 'Gestão de Avaliações',color: '#EC4899' },
  { id: 'renovacao',      num: '10', name: 'Renovação',           color: '#14B8A6' },
];

const STATUSES = [
  { id: 'todo',     label: 'A Fazer',    color: '#6B7280', bg: 'rgba(107,114,128,0.1)'  },
  { id: 'doing',    label: 'Fazendo',    color: '#2563EB', bg: 'rgba(37,99,235,0.1)'    },
  { id: 'waiting',  label: 'Aguardando', color: '#D97706', bg: 'rgba(217,119,6,0.1)'    },
  { id: 'blocked',  label: 'Bloqueado',  color: '#DC2626', bg: 'rgba(220,38,38,0.1)'    },
  { id: 'canceled', label: 'Cancelado',  color: '#4B5563', bg: 'rgba(75,85,99,0.1)'     },
  { id: 'done',     label: 'Concluído',  color: '#059669', bg: 'rgba(5,150,105,0.1)'    },
];

const PRIORITIES = [
  { id: 'urgent', label: 'Urgente', color: '#DC2626' },
  { id: 'high',   label: 'Alta',    color: '#D97706' },
  { id: 'normal', label: 'Normal',  color: '#6B7280' },
  { id: 'low',    label: 'Baixa',   color: '#9CA3AF' },
];

const MEMBERS = SETTINGS_DATA?.users ?? [];

function phaseOf(id) { return PHASES.find(p => p.id === id) || PHASES[0]; }
function statusOf(id) { return STATUSES.find(s => s.id === id) || STATUSES[0]; }
function priorityOf(id) { return PRIORITIES.find(p => p.id === id) || PRIORITIES[2]; }

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function TarefasClientesScreen({ tenantDbId, userId }) {
  const [clients,       setClients]       = useState([]);
  const [tasks,         setTasks]         = useState([]);
  const [loadingCli,    setLoadingCli]    = useState(true);
  const [loadingTasks,  setLoadingTasks]  = useState(false);
  const [activeClient,  setActiveClient]  = useState(null);
  const [activePhase,   setActivePhase]   = useState(null);
  const [expanded,      setExpanded]      = useState({});
  const [view,          setView]          = useState('board');
  const [dragId,        setDragId]        = useState(null);
  const [hoverCol,      setHoverCol]      = useState(null);
  const [ghostPos,      setGhostPos]      = useState(null);
  const [showModal,     setShowModal]     = useState(false);
  const [drawerTask,    setDrawerTask]    = useState(null);
  const [defaultStatus, setDefaultStatus] = useState('todo');

  // Carregar clientes
  useEffect(() => {
    if (!tenantDbId) return;
    let alive = true;
    setLoadingCli(true);
    listClientes(tenantDbId)
      .then(r => { if (alive) { setClients(r); setLoadingCli(false); } })
      .catch(() => { if (alive) setLoadingCli(false); });
    return () => { alive = false; };
  }, [tenantDbId]);

  // Carregar tasks quando selecionar fase
  useEffect(() => {
    if (!tenantDbId || !activeClient || !activePhase) { setTasks([]); return; }
    let alive = true;
    setLoadingTasks(true);
    listClientTasks(tenantDbId, activeClient.id, activePhase.id)
      .then(r => { if (alive) { setTasks(r); setLoadingTasks(false); } })
      .catch(() => { if (alive) setLoadingTasks(false); });
    return () => { alive = false; };
  }, [tenantDbId, activeClient, activePhase]);

  function selectPhase(client, phase) {
    setActiveClient(client);
    setActivePhase(phase);
    setView('board');
  }

  function toggleExpand(clientId) {
    setExpanded(e => ({ ...e, [clientId]: !e[clientId] }));
  }

  // ── Drag-and-drop ──
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
  const onColDrop = (e, colId) => {
    e.preventDefault();
    if (!dragId) return;
    setTasks(ts => ts.map(t => t.id === dragId ? { ...t, status: colId } : t));
    moveClientTask(dragId, colId, 0).catch(() => {});
    onDragEnd();
  };

  // ── CRUD ──
  async function handleCreate(data) {
    if (!tenantDbId || !activeClient || !activePhase) return;
    const payload = {
      tenant_id:   tenantDbId,
      customer_id: activeClient.id,
      phase_id:    activePhase.id,
      title:       data.title,
      description: data.description || '',
      status:      data.status || 'todo',
      priority:    data.priority || 'normal',
      due_date:    data.due_date || null,
      agent_id:    data.agent_id || null,
      position:    tasks.length,
    };
    try {
      const { id } = await createClientTask(payload);
      setTasks(ts => [...ts, { ...payload, id }]);
    } catch {}
    setShowModal(false);
  }

  async function handleUpdate(id, patch) {
    setTasks(ts => ts.map(t => t.id === id ? { ...t, ...patch } : t));
    updateClientTask(id, patch).catch(() => {});
  }

  async function handleDelete(id) {
    setTasks(ts => ts.filter(t => t.id !== id));
    deleteClientTask(id).catch(() => {});
    if (drawerTask?.id === id) setDrawerTask(null);
  }

  const byStatus = useMemo(() => {
    const g = {};
    STATUSES.forEach(s => { g[s.id] = []; });
    tasks.forEach(t => { g[t.status]?.push(t); });
    return g;
  }, [tasks]);

  const draggingTask = tasks.find(t => t.id === dragId);
  const phase = activePhase;

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 64px)', overflow: 'hidden', background: 'var(--g-50)' }}>

      {/* ── Sidebar esquerdo de clientes/fases ── */}
      <ClientSidebar
        clients={clients}
        loading={loadingCli}
        expanded={expanded}
        activeClient={activeClient}
        activePhase={activePhase}
        tasks={tasks}
        onToggle={toggleExpand}
        onSelectPhase={selectPhase}
      />

      {/* ── Área principal ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Topbar */}
        {activeClient && activePhase ? (
          <>
            <div style={{ padding: '12px 24px', borderBottom: '1px solid var(--g-200)', background: 'var(--white)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--g-500)' }}>
                <span>🏢 CONSULTORIA</span>
                <span>›</span>
                <span style={{ color: 'var(--g-700)', fontWeight: 500 }}>{activeClient.name}</span>
                <span>›</span>
                <span style={{ color: phase.color, fontWeight: 700 }}>{phase.num} - {phase.name}</span>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button className="btn-primary" onClick={() => { setDefaultStatus('todo'); setShowModal(true); }}>
                  <Icon name="plus" size={14} /> Tarefa
                </button>
              </div>
            </div>

            {/* View tabs */}
            <div style={{ padding: '0 24px', borderBottom: '1px solid var(--g-200)', background: 'var(--white)', display: 'flex', gap: 4, flexShrink: 0 }}>
              {[
                { id: 'board', icon: 'columns', label: 'Quadro'      },
                { id: 'list',  icon: 'list',    label: 'Lista'        },
                { id: 'viz',   icon: 'chart',   label: 'Visão Geral'  },
              ].map(v => (
                <button key={v.id} onClick={() => setView(v.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 14px', fontSize: 13, fontWeight: view === v.id ? 700 : 500, color: view === v.id ? phase.color : 'var(--g-500)', background: 'none', border: 'none', borderBottom: view === v.id ? `2px solid ${phase.color}` : '2px solid transparent', cursor: 'pointer', marginBottom: -1 }}>
                  <Icon name={v.icon} size={13} /> {v.label}
                </button>
              ))}
            </div>

            {/* Views */}
            <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
              {loadingTasks ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                  <span style={{ fontSize: 13, color: 'var(--g-400)' }}>Carregando tarefas…</span>
                </div>
              ) : view === 'board' ? (
                <BoardView
                  byStatus={byStatus}
                  phase={phase}
                  dragId={dragId}
                  hoverCol={hoverCol}
                  onDragStart={onDragStart}
                  onDrag={onDrag}
                  onDragEnd={onDragEnd}
                  onColDragOver={onColDragOver}
                  onColDrop={onColDrop}
                  onOpenDrawer={setDrawerTask}
                  onDelete={handleDelete}
                  onAddInline={(statusId) => { setDefaultStatus(statusId); setShowModal(true); }}
                />
              ) : view === 'list' ? (
                <ListView tasks={tasks} phase={phase} onOpenDrawer={setDrawerTask} onDelete={handleDelete} />
              ) : (
                <VizView tasks={tasks} byStatus={byStatus} />
              )}
            </div>
          </>
        ) : (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--g-400)', gap: 12 }}>
            <Icon name="list" size={40} style={{ opacity: 0.3 }} />
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--g-600)' }}>Selecione um cliente e uma fase</div>
            <div style={{ fontSize: 13 }}>Use a barra lateral para navegar pelos clientes e fases de consultoria.</div>
          </div>
        )}
      </div>

      {/* Ghost de drag */}
      {draggingTask && ghostPos && (
        <div className="task-card drag-ghost" style={{ left: ghostPos.x - 130, top: ghostPos.y - 30 }}>
          <TaskCardBody task={draggingTask} phase={phase} />
        </div>
      )}

      {/* Modal nova tarefa */}
      {showModal && (
        <NewTaskModal defaultStatus={defaultStatus} phases={PHASES} activePhase={activePhase} onSave={handleCreate} onClose={() => setShowModal(false)} />
      )}

      {/* Drawer de detalhe */}
      {drawerTask && (
        <TaskDrawer
          task={drawerTask}
          phase={phaseOf(drawerTask.phase_id || activePhase?.id)}
          onUpdate={(patch) => { setDrawerTask(t => ({ ...t, ...patch })); handleUpdate(drawerTask.id, patch); }}
          onDelete={() => handleDelete(drawerTask.id)}
          onClose={() => setDrawerTask(null)}
        />
      )}
    </div>
  );
}

// ─── ClientSidebar ────────────────────────────────────────────────────────────

function ClientSidebar({ clients, loading, expanded, activeClient, activePhase, tasks, onToggle, onSelectPhase }) {
  const taskCountByPhase = useMemo(() => {
    const m = {};
    tasks.forEach(t => {
      const key = `${activeClient?.id}-${t.phase_id}`;
      m[key] = (m[key] || 0) + 1;
    });
    return m;
  }, [tasks, activeClient]);

  return (
    <div style={{ width: 260, flexShrink: 0, background: '#1a1a1a', borderRight: '1px solid rgba(255,255,255,0.08)', display: 'flex', flexDirection: 'column', overflowY: 'auto', overflowX: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '16px 14px 10px', fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 1, flexShrink: 0 }}>
        🏢 Consultoria
      </div>

      {loading && (
        <div style={{ padding: '20px 14px', fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>Carregando clientes…</div>
      )}

      {!loading && clients.length === 0 && (
        <div style={{ padding: '20px 14px', fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>Nenhum cliente cadastrado.</div>
      )}

      {clients.map(client => {
        const isOpen = !!expanded[client.id];
        const isActiveClient = activeClient?.id === client.id;
        return (
          <div key={client.id}>
            {/* Client row */}
            <div
              onClick={() => onToggle(client.id)}
              style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 14px', cursor: 'pointer', color: isActiveClient ? '#fff' : 'rgba(255,255,255,0.65)', fontSize: 13, fontWeight: isActiveClient ? 600 : 400, background: isActiveClient && !activePhase ? 'rgba(183,12,0,0.15)' : 'transparent', transition: 'background 150ms' }}
            >
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', flexShrink: 0, transition: 'transform 150ms', transform: isOpen ? 'rotate(90deg)' : 'none' }}>▶</span>
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>🍽️ {client.name}</span>
            </div>

            {/* Phases */}
            {isOpen && PHASES.map(phase => {
              const isActivePhase = isActiveClient && activePhase?.id === phase.id;
              return (
                <div key={phase.id}
                  onClick={() => onSelectPhase(client, phase)}
                  style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '5px 14px 5px 30px', cursor: 'pointer', fontSize: 12, color: isActivePhase ? '#fff' : 'rgba(255,255,255,0.45)', fontWeight: isActivePhase ? 700 : 400, background: isActivePhase ? 'rgba(183,12,0,0.2)' : 'transparent', borderLeft: isActivePhase ? `2px solid ${phase.color}` : '2px solid transparent', transition: 'all 120ms' }}
                >
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: phase.color, flexShrink: 0 }} />
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{phase.num} · {phase.name}</span>
                </div>
              );
            })}
          </div>
        );
      })}

      {/* Espaços extras */}
      <div style={{ padding: '16px 14px 10px', marginTop: 8, fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 1, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        📋 SOPs &amp; Processos
      </div>
      <div style={{ padding: '6px 14px', fontSize: 12, color: 'rgba(255,255,255,0.25)', fontStyle: 'italic' }}>Em breve…</div>
    </div>
  );
}

// ─── BoardView ────────────────────────────────────────────────────────────────

function BoardView({ byStatus, phase, dragId, hoverCol, onDragStart, onDrag, onDragEnd, onColDragOver, onColDrop, onOpenDrawer, onDelete, onAddInline }) {
  return (
    <div style={{ display: 'flex', gap: 12, padding: 20, height: '100%', overflowX: 'auto', overflowY: 'hidden', boxSizing: 'border-box' }}>
      {STATUSES.map(col => (
        <div key={col.id}
          className={`kanban-col scroll ${hoverCol === col.id ? 'drop-hover' : ''}`}
          style={{ minWidth: 240, maxWidth: 260, display: 'flex', flexDirection: 'column', overflowY: 'auto', flexShrink: 0 }}
          onDragOver={(e) => onColDragOver(e, col.id)}
          onDragLeave={() => {}}
          onDrop={(e) => onColDrop(e, col.id)}
        >
          {/* Column header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '2px 6px 10px', position: 'sticky', top: 0, background: 'var(--g-100)', zIndex: 1, flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: col.color, flexShrink: 0 }} />
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--g-800)', textTransform: 'uppercase', letterSpacing: 0.4 }}>{col.label}</span>
              <span style={{ fontSize: 11, color: 'var(--g-500)', background: 'var(--white)', padding: '1px 7px', borderRadius: 9999 }}>{byStatus[col.id]?.length || 0}</span>
            </div>
            <button className="btn-icon" style={{ width: 22, height: 22 }} onClick={() => onAddInline(col.id)} title="Adicionar tarefa">
              <Icon name="plus" size={11} />
            </button>
          </div>

          {/* Cards */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {byStatus[col.id]?.map(task => (
              <TaskCard
                key={task.id}
                task={task}
                phase={phase}
                isDragging={dragId === task.id}
                onDragStart={(e) => onDragStart(e, task.id)}
                onDrag={onDrag}
                onDragEnd={onDragEnd}
                onOpen={() => onOpenDrawer(task)}
                onDelete={() => onDelete(task.id)}
              />
            ))}
            {byStatus[col.id]?.length === 0 && (
              <button onClick={() => onAddInline(col.id)}
                style={{ padding: 16, textAlign: 'center', fontSize: 12, color: 'var(--g-400)', border: '2px dashed var(--g-300)', borderRadius: 6, background: 'transparent', cursor: 'pointer', width: '100%' }}>
                + Adicionar tarefa
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── ListView ─────────────────────────────────────────────────────────────────

function ListView({ tasks, phase, onOpenDrawer, onDelete }) {
  const byStatus = useMemo(() => {
    const g = {};
    STATUSES.forEach(s => { g[s.id] = []; });
    tasks.forEach(t => { g[t.status]?.push(t); });
    return g;
  }, [tasks]);

  if (tasks.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 8, color: 'var(--g-400)' }}>
        <Icon name="list" size={32} style={{ opacity: 0.3 }} />
        <span style={{ fontSize: 13 }}>Nenhuma tarefa nesta fase.</span>
      </div>
    );
  }

  return (
    <div style={{ padding: 20, overflowY: 'auto', height: '100%', boxSizing: 'border-box' }}>
      {STATUSES.map(col => {
        const items = byStatus[col.id];
        if (items.length === 0) return null;
        return (
          <div key={col.id} style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: col.color }} />
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--g-700)', textTransform: 'uppercase', letterSpacing: 0.4 }}>{col.label}</span>
              <span style={{ fontSize: 11, color: 'var(--g-500)', background: 'var(--g-100)', padding: '1px 7px', borderRadius: 9999 }}>{items.length}</span>
            </div>
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              {items.map((task, i) => {
                const p = priorityOf(task.priority);
                return (
                  <div key={task.id}
                    onClick={() => onOpenDrawer(task)}
                    style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderBottom: i < items.length - 1 ? '1px solid var(--g-100)' : 'none', cursor: 'pointer', transition: 'background 120ms' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--g-50)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <span style={{ width: 3, height: 32, borderRadius: 9999, background: phase.color, flexShrink: 0 }} />
                    <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: 'var(--g-900)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.title}</span>
                    <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 9999, color: p.color, background: `${p.color}18`, flexShrink: 0 }}>{p.label}</span>
                    {task.due_date && (
                      <span style={{ fontSize: 11, color: 'var(--g-500)', flexShrink: 0 }}>{task.due_date}</span>
                    )}
                    {task.assignee?.full_name && (
                      <UserAvatar name={task.assignee.full_name.charAt(0)} size={22} />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── VizView ──────────────────────────────────────────────────────────────────

function VizView({ tasks, byStatus }) {
  const done     = byStatus['done']?.length || 0;
  const todo     = byStatus['todo']?.length || 0;
  const doing    = byStatus['doing']?.length || 0;
  const blocked  = byStatus['blocked']?.length || 0;
  const total    = tasks.length;
  const pct      = total > 0 ? Math.round((done / total) * 100) : 0;

  const kpis = [
    { label: 'Total',       value: total,   color: 'var(--g-700)' },
    { label: 'A Fazer',     value: todo,    color: '#6B7280' },
    { label: 'Em Andamento',value: doing,   color: '#2563EB' },
    { label: 'Concluídas',  value: done,    color: '#059669' },
  ];

  const maxCount = Math.max(1, ...STATUSES.map(s => byStatus[s.id]?.length || 0));

  return (
    <div style={{ padding: 24, overflowY: 'auto', height: '100%', boxSizing: 'border-box' }}>
      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 24 }}>
        {kpis.map(k => (
          <div key={k.label} className="card" style={{ padding: '18px 20px' }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: k.color, lineHeight: 1 }}>{k.value}</div>
            <div style={{ fontSize: 12, color: 'var(--g-500)', marginTop: 4 }}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* Progresso geral */}
      <div className="card" style={{ padding: '16px 20px', marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--g-700)' }}>Progresso da fase</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#059669' }}>{pct}%</span>
        </div>
        <div style={{ height: 8, borderRadius: 9999, background: 'var(--g-100)', overflow: 'hidden' }}>
          <div style={{ height: '100%', borderRadius: 9999, background: '#059669', width: `${pct}%`, transition: 'width 500ms' }} />
        </div>
        {blocked > 0 && (
          <div style={{ marginTop: 8, fontSize: 12, color: '#DC2626', fontWeight: 600 }}>⚠ {blocked} tarefa{blocked > 1 ? 's' : ''} bloqueada{blocked > 1 ? 's' : ''}</div>
        )}
      </div>

      {/* Gráfico por status */}
      <div className="card" style={{ padding: '16px 20px' }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--g-700)', marginBottom: 16 }}>Tarefas por status</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {STATUSES.map(s => {
            const count = byStatus[s.id]?.length || 0;
            const w = maxCount > 0 ? Math.round((count / maxCount) * 100) : 0;
            return (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 12, color: 'var(--g-600)', width: 90, flexShrink: 0 }}>{s.label}</span>
                <div style={{ flex: 1, height: 14, borderRadius: 9999, background: 'var(--g-100)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', borderRadius: 9999, background: s.color, width: `${w}%`, transition: 'width 400ms', opacity: count > 0 ? 1 : 0.3 }} />
                </div>
                <span style={{ fontSize: 12, fontWeight: 700, color: s.color, width: 20, textAlign: 'right', flexShrink: 0 }}>{count}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── TaskCard ─────────────────────────────────────────────────────────────────

function TaskCard({ task, phase, isDragging, onDragStart, onDrag, onDragEnd, onOpen, onDelete }) {
  const [hovered,    setHovered]    = useState(false);
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
      onClick={onOpen}
      style={{ position: 'relative', cursor: 'pointer', borderLeft: `3px solid ${phase?.color || '#B70C00'}` }}
    >
      <TaskCardBody task={task} phase={phase} />
      {hovered && !isDragging && (
        <div style={{ position: 'absolute', top: 6, right: 6, display: 'flex', gap: 3 }} onClick={e => e.stopPropagation()}>
          {!confirmDel ? (
            <button onMouseDown={e => { e.stopPropagation(); setConfirmDel(true); }}
              style={{ width: 24, height: 24, borderRadius: 5, background: 'var(--white)', border: '1px solid var(--g-200)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
              title="Excluir">
              <Icon name="trash" size={11} style={{ color: 'var(--g-500)' }} />
            </button>
          ) : (
            <button onMouseDown={e => { e.stopPropagation(); onDelete(); }}
              style={{ height: 24, padding: '0 7px', borderRadius: 5, background: 'var(--red)', border: 'none', display: 'flex', alignItems: 'center', gap: 3, cursor: 'pointer', fontSize: 11, fontWeight: 700, color: 'white' }}>
              <Icon name="trash" size={10} style={{ color: 'white' }} /> OK
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function TaskCardBody({ task, phase }) {
  const p     = priorityOf(task.priority);
  const agent = task.agent_id ? AGENTS?.find(a => a.id === task.agent_id) : null;

  return (
    <>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--g-900)', lineHeight: 1.35, marginBottom: 8, paddingRight: 32 }}>{task.title}</div>
      {task.description && (
        <div style={{ fontSize: 11, color: 'var(--g-500)', lineHeight: 1.4, marginBottom: 8 }}>{task.description.slice(0, 80)}{task.description.length > 80 ? '…' : ''}</div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 9999, color: p.color, background: `${p.color}18` }}>{p.label}</span>
          {task.due_date && (
            <span style={{ fontSize: 10, color: 'var(--g-500)', display: 'flex', alignItems: 'center', gap: 3 }}>
              <Icon name="calendar" size={10} />{task.due_date}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          {agent && <AgentAvatar id={task.agent_id} size={18} />}
          {task.assignee?.full_name && <UserAvatar name={task.assignee.full_name.charAt(0)} size={20} />}
        </div>
      </div>
    </>
  );
}

// ─── TaskDrawer ───────────────────────────────────────────────────────────────

function TaskDrawer({ task, phase, onUpdate, onDelete, onClose }) {
  const [title, setTitle]   = useState(task.title || '');
  const [desc,  setDesc]    = useState(task.description || '');
  const [status, setStatus] = useState(task.status || 'todo');
  const [prio,   setPrio]   = useState(task.priority || 'normal');
  const [due,    setDue]    = useState(task.due_date || '');
  const [agent,  setAgent]  = useState(task.agent_id || '');
  const [dirty,  setDirty]  = useState(false);

  function mark()     { setDirty(true); }
  function saveAll()  {
    if (!title.trim()) return;
    onUpdate({ title: title.trim(), description: desc, status, priority: prio, due_date: due || null, agent_id: agent || null });
    setDirty(false);
  }

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.2)', zIndex: 400 }} />
      <div style={{ position: 'fixed', top: 64, right: 0, bottom: 0, width: 440, background: 'var(--white)', borderLeft: '1px solid var(--g-200)', zIndex: 401, display: 'flex', flexDirection: 'column', boxShadow: '-8px 0 32px rgba(0,0,0,0.08)' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid var(--g-200)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: phase.color }} />
            <span style={{ fontSize: 12, color: 'var(--g-500)', fontWeight: 600 }}>{phase.num} · {phase.name}</span>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {dirty && (
              <button className="btn-primary" style={{ fontSize: 12, padding: '5px 12px' }} onClick={saveAll}>Salvar</button>
            )}
            <button className="btn-icon" onClick={onDelete} title="Excluir tarefa">
              <Icon name="trash" size={14} style={{ color: 'var(--g-500)' }} />
            </button>
            <button className="btn-icon" onClick={onClose} title="Fechar">
              <Icon name="x" size={14} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '18px 18px' }}>

          {/* Título */}
          <textarea
            value={title}
            onChange={e => { setTitle(e.target.value); mark(); }}
            onBlur={saveAll}
            rows={2}
            placeholder="Título da tarefa"
            style={{ width: '100%', fontSize: 17, fontWeight: 700, color: 'var(--g-900)', border: 'none', background: 'transparent', resize: 'none', fontFamily: 'inherit', lineHeight: 1.35, outline: 'none', boxSizing: 'border-box', marginBottom: 14 }}
          />

          {/* Propriedades */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
            <PropRow label="Status">
              <select className="input" style={{ fontSize: 12, padding: '5px 8px' }} value={status} onChange={e => { setStatus(e.target.value); mark(); }}>
                {STATUSES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </PropRow>
            <PropRow label="Prioridade">
              <select className="input" style={{ fontSize: 12, padding: '5px 8px' }} value={prio} onChange={e => { setPrio(e.target.value); mark(); }}>
                {PRIORITIES.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </PropRow>
            <PropRow label="Prazo">
              <input type="date" className="input" style={{ fontSize: 12, padding: '5px 8px' }} value={due} onChange={e => { setDue(e.target.value); mark(); }} />
            </PropRow>
            <PropRow label="Agente IA">
              <select className="input" style={{ fontSize: 12, padding: '5px 8px' }} value={agent} onChange={e => { setAgent(e.target.value); mark(); }}>
                <option value="">— Nenhum —</option>
                {AGENTS?.map(a => <option key={a.id} value={a.id}>{a.name} · {a.role}</option>)}
              </select>
            </PropRow>
          </div>

          {/* Descrição */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--g-600)', marginBottom: 6 }}>Descrição</div>
            <textarea
              className="input"
              rows={5}
              placeholder="Adicione detalhes, contexto, links…"
              value={desc}
              onChange={e => { setDesc(e.target.value); mark(); }}
              onBlur={saveAll}
              style={{ resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5, fontSize: 13, width: '100%', boxSizing: 'border-box' }}
            />
          </div>
        </div>
      </div>
    </>
  );
}

function PropRow({ label, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ fontSize: 12, color: 'var(--g-500)', width: 80, flexShrink: 0 }}>{label}</span>
      {children}
    </div>
  );
}

// ─── NewTaskModal ─────────────────────────────────────────────────────────────

function NewTaskModal({ defaultStatus, activePhase, onSave, onClose }) {
  const [form, setForm] = useState({
    title:       '',
    description: '',
    status:      defaultStatus || 'todo',
    priority:    'normal',
    due_date:    '',
    agent_id:    '',
  });
  const [err, setErr] = useState('');

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  function submit() {
    if (!form.title.trim()) { setErr('Título obrigatório.'); return; }
    onSave({ ...form, agent_id: form.agent_id || null, due_date: form.due_date || null });
  }

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(13,13,13,0.45)', zIndex: 500 }} />
      <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', background: 'var(--white)', borderRadius: 'var(--r-lg)', padding: 26, zIndex: 501, width: 460, boxShadow: '0 20px 60px rgba(0,0,0,0.25)', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--g-900)' }}>Nova tarefa</div>
            {activePhase && (
              <div style={{ fontSize: 12, color: activePhase.color, fontWeight: 600, marginTop: 2 }}>{activePhase.num} · {activePhase.name}</div>
            )}
          </div>
          <button className="btn-icon" onClick={onClose}><Icon name="x" size={15} /></button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--g-600)', display: 'block', marginBottom: 5 }}>Título *</label>
            <input className="input" autoFocus placeholder="Ex: Revisar cardápio iFood" value={form.title} onChange={e => set('title', e.target.value)} />
            {err && <div style={{ fontSize: 11, color: 'var(--red)', marginTop: 3 }}>{err}</div>}
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--g-600)', display: 'block', marginBottom: 5 }}>Descrição</label>
            <textarea className="input" rows={2} placeholder="Detalhes…" value={form.description} onChange={e => set('description', e.target.value)} style={{ resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--g-600)', display: 'block', marginBottom: 5 }}>Status</label>
              <select className="input" value={form.status} onChange={e => set('status', e.target.value)}>
                {STATUSES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--g-600)', display: 'block', marginBottom: 5 }}>Prioridade</label>
              <select className="input" value={form.priority} onChange={e => set('priority', e.target.value)}>
                {PRIORITIES.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--g-600)', display: 'block', marginBottom: 5 }}>Prazo</label>
              <input type="date" className="input" value={form.due_date} onChange={e => set('due_date', e.target.value)} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--g-600)', display: 'block', marginBottom: 5 }}>Agente IA</label>
              <select className="input" value={form.agent_id} onChange={e => set('agent_id', e.target.value)}>
                <option value="">— Nenhum —</option>
                {AGENTS?.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 20, justifyContent: 'flex-end' }}>
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" onClick={submit}><Icon name="plus" size={13} /> Criar tarefa</button>
        </div>
      </div>
    </>
  );
}
