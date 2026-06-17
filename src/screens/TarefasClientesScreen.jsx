import { useState, useEffect, useMemo, useRef } from 'react';
import Icon from '../components/Icon.jsx';
import UserAvatar from '../components/UserAvatar.jsx';
import AgentAvatar from '../components/AgentAvatar.jsx';
import { AGENTS, SETTINGS_DATA } from '../data.js';
import { listClientes, listClientTasks, createClientTask, updateClientTask, moveClientTask, deleteClientTask } from '../lib/api.js';

/* ─── Constantes ────────────────────────────────────────────── */

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
  { id: 'todo',     label: 'A Fazer',    color: '#6B7280', bg: 'rgba(107,114,128,0.12)' },
  { id: 'doing',    label: 'Fazendo',    color: '#2563EB', bg: 'rgba(37,99,235,0.12)'   },
  { id: 'waiting',  label: 'Aguardando', color: '#D97706', bg: 'rgba(217,119,6,0.12)'   },
  { id: 'blocked',  label: 'Bloqueado',  color: '#DC2626', bg: 'rgba(220,38,38,0.12)'   },
  { id: 'canceled', label: 'Cancelado',  color: '#4B5563', bg: 'rgba(75,85,99,0.12)'    },
  { id: 'done',     label: 'Concluído',  color: '#059669', bg: 'rgba(5,150,105,0.12)'   },
];

const PRIORITIES = [
  { id: 'urgent', label: 'URGENTE', color: '#DC2626', bg: 'rgba(220,38,38,0.12)' },
  { id: 'high',   label: 'ALTA',    color: '#D97706', bg: 'rgba(217,119,6,0.12)' },
  { id: 'normal', label: 'NORMAL',  color: '#6B7280', bg: 'rgba(107,114,128,0.1)' },
  { id: 'low',    label: 'BAIXA',   color: '#9CA3AF', bg: 'rgba(156,163,175,0.1)' },
];

const MEMBERS = SETTINGS_DATA?.users ?? [];

const phaseOf    = id => PHASES.find(p => p.id === id) || PHASES[0];
const statusOf   = id => STATUSES.find(s => s.id === id) || STATUSES[0];
const priorityOf = id => PRIORITIES.find(p => p.id === id) || PRIORITIES[2];

/* ─── Main ──────────────────────────────────────────────────── */

export default function TarefasClientesScreen({ tenantDbId, userId, deepLinkCustomerId }) {
  /* ── Google Fonts (Oswald + Montserrat) ── */
  useEffect(() => {
    if (document.getElementById('tar-gfonts')) return;
    const link = Object.assign(document.createElement('link'), {
      id: 'tar-gfonts', rel: 'stylesheet',
      href: 'https://fonts.googleapis.com/css2?family=Oswald:wght@600;700&family=Montserrat:wght@400;500;600;700&display=swap',
    });
    document.head.appendChild(link);
  }, []);

  const [clients,       setClients]       = useState([]);
  const [allTasks,      setAllTasks]      = useState([]);      // all tasks for active client
  const [loadedCid,     setLoadedCid]     = useState(null);   // which client's tasks are loaded
  const [loadingCli,    setLoadingCli]    = useState(true);
  const [loadingTasks,  setLoadingTasks]  = useState(false);
  const [activeClient,  setActiveClient]  = useState(null);
  const [activePhase,   setActivePhase]   = useState(null);
  const [expanded,      setExpanded]      = useState({});
  const [view,          setView]          = useState('board');
  const [filterMode,    setFilterMode]    = useState('all');   // all|mine|urgent|due
  const [search,        setSearch]        = useState('');
  const [dragId,        setDragId]        = useState(null);
  const deepLinkApplied = useRef(null);
  const [hoverCol,      setHoverCol]      = useState(null);
  const [ghostPos,      setGhostPos]      = useState(null);
  const [showModal,     setShowModal]     = useState(false);
  const [drawerTask,    setDrawerTask]    = useState(null);
  const [defaultStatus, setDefaultStatus] = useState('todo');

  /* Carregar clientes */
  useEffect(() => {
    if (!tenantDbId) return;
    let alive = true;
    setLoadingCli(true);
    listClientes(tenantDbId)
      .then(r => { if (alive) { setClients(r); setLoadingCli(false); } })
      .catch(() => { if (alive) setLoadingCli(false); });
    return () => { alive = false; };
  }, [tenantDbId]);

  /* Deep-link: pré-selecionar cliente quando vindo do chat */
  useEffect(() => {
    if (!deepLinkCustomerId || deepLinkApplied.current === deepLinkCustomerId || !clients.length) return;
    const cli = clients.find(c => c.id === deepLinkCustomerId);
    if (!cli) return;
    deepLinkApplied.current = deepLinkCustomerId;
    setExpanded(e => ({ ...e, [cli.id]: true }));
    setActiveClient(cli);
    setActivePhase(PHASES[0]);
    setView('board');
    setSearch('');
    setFilterMode('all');
    loadClientTasks(cli);
  }, [clients, deepLinkCustomerId]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Carregar todas as tasks do cliente ativo */
  async function loadClientTasks(client) {
    if (!tenantDbId || !client) return;
    if (loadedCid === client.id) return;
    setLoadingTasks(true);
    try {
      const data = await listClientTasks(tenantDbId, client.id, null);
      setAllTasks(data);
      setLoadedCid(client.id);
    } finally { setLoadingTasks(false); }
  }

  function selectPhase(client, phase) {
    setActiveClient(client);
    setActivePhase(phase);
    setView('board');
    setSearch('');
    setFilterMode('all');
    if (loadedCid !== client.id) loadClientTasks(client);
  }

  function toggleExpand(clientId) {
    setExpanded(e => ({ ...e, [clientId]: !e[clientId] }));
    const client = clients.find(c => c.id === clientId);
    if (client && !expanded[clientId]) loadClientTasks(client);
  }

  /* Tasks filtradas para a fase + modo */
  const tasks = useMemo(() => {
    let t = allTasks.filter(x => !activePhase || x.phase_id === activePhase.id);
    if (filterMode === 'mine')   t = t.filter(x => x.assignee_id === userId);
    if (filterMode === 'urgent') t = t.filter(x => x.priority === 'urgent');
    if (filterMode === 'due') {
      const soon = new Date(); soon.setDate(soon.getDate() + 3);
      t = t.filter(x => x.due_date && new Date(x.due_date) <= soon);
    }
    if (search) t = t.filter(x => x.title.toLowerCase().includes(search.toLowerCase()));
    return t;
  }, [allTasks, activePhase, filterMode, search, userId]);

  /* Contagem por fase (para o badge na sidebar) */
  const phaseCounts = useMemo(() => {
    const m = {};
    allTasks.forEach(t => { m[t.phase_id] = (m[t.phase_id] || 0) + 1; });
    return m;
  }, [allTasks]);

  const byStatus = useMemo(() => {
    const g = {}; STATUSES.forEach(s => { g[s.id] = []; });
    tasks.forEach(t => { g[t.status]?.push(t); });
    return g;
  }, [tasks]);

  /* ── Drag ── */
  const onDragStart = (e, id) => {
    setDragId(id);
    e.dataTransfer.effectAllowed = 'move';
    const img = new Image();
    img.src = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';
    e.dataTransfer.setDragImage(img, 0, 0);
  };
  const onDrag        = (e) => { if (e.clientX || e.clientY) setGhostPos({ x: e.clientX, y: e.clientY }); };
  const onDragEnd     = ()  => { setDragId(null); setHoverCol(null); setGhostPos(null); };
  const onColDragOver = (e, col) => { e.preventDefault(); setHoverCol(col); };
  const onColDrop     = (e, col) => {
    e.preventDefault(); if (!dragId) return;
    mutateTask(dragId, { status: col });
    moveClientTask(dragId, col, 0).catch(() => {});
    onDragEnd();
  };

  /* ── CRUD helpers ── */
  function mutateTask(id, patch) {
    setAllTasks(ts => ts.map(t => t.id === id ? { ...t, ...patch } : t));
    if (drawerTask?.id === id) setDrawerTask(d => ({ ...d, ...patch }));
  }

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
      position:    allTasks.filter(t => t.phase_id === activePhase.id).length,
    };
    try {
      const { id } = await createClientTask(payload);
      setAllTasks(ts => [...ts, { ...payload, id }]);
    } catch {}
    setShowModal(false);
  }

  function handleUpdate(id, patch) {
    mutateTask(id, patch);
    updateClientTask(id, patch).catch(() => {});
  }

  function handleDelete(id) {
    setAllTasks(ts => ts.filter(t => t.id !== id));
    if (drawerTask?.id === id) setDrawerTask(null);
    deleteClientTask(id).catch(() => {});
  }

  const hasFilters   = filterMode !== 'all' || !!search;
  const draggingTask = allTasks.find(t => t.id === dragId);
  const phase        = activePhase;

  const MON = { fontFamily: "'Montserrat', system-ui, sans-serif" };
  const OSW = { fontFamily: "'Oswald', system-ui, sans-serif" };

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 64px)', overflow: 'hidden', background: '#f5f5f5', ...MON }}>

      {/* ─── Sidebar ─────────────────────────────────────────────── */}
      <div style={{ width: 256, flexShrink: 0, background: 'linear-gradient(180deg,#1a0e08 0%,#1c1814 50%,#1a1a1a 100%)', borderRight: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', overflowY: 'auto', overflowX: 'hidden' }}>

        {/* Header */}
        <div style={{ padding: '18px 14px 10px', display: 'flex', alignItems: 'center', gap: 9 }}>
          <div style={{ width: 28, height: 28, borderRadius: 7, background: 'linear-gradient(135deg,#B70C00,#DC2626)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Icon name="columns" size={14} style={{ color: 'white' }} />
          </div>
          <span style={{ ...OSW, fontSize: 16, fontWeight: 700, color: 'white', letterSpacing: 0.5 }}>ESPAÇOS</span>
        </div>

        {/* Seção Minha Carteira */}
        <div style={{ padding: '12px 14px 6px', fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: 1.2, ...OSW }}>
          🏢 Minha Carteira
        </div>

        {loadingCli && (
          <div style={{ padding: '10px 14px', fontSize: 12, color: 'rgba(255,255,255,0.25)' }}>Carregando…</div>
        )}

        {!loadingCli && clients.length === 0 && (
          <div style={{ padding: '12px 14px', fontSize: 12, color: 'rgba(255,255,255,0.3)', lineHeight: 1.5 }}>
            Nenhum cliente cadastrado.<br />
            <span style={{ color: 'rgba(183,12,0,0.7)', fontWeight: 600 }}>Adicione em Clientes (CRM)</span>
          </div>
        )}

        {clients.map(client => {
          const isOpen   = !!expanded[client.id];
          const isActive = activeClient?.id === client.id;
          return (
            <div key={client.id}>
              {/* Client row */}
              <div
                onClick={() => toggleExpand(client.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '6px 14px', cursor: 'pointer', color: isActive ? '#fff' : 'rgba(255,255,255,0.6)', fontSize: 12, fontWeight: 600, background: isActive && !activePhase ? 'rgba(183,12,0,0.12)' : 'transparent', transition: 'all 120ms' }}
                onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
                onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
              >
                <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)', transition: 'transform 150ms', transform: isOpen ? 'rotate(90deg)' : 'none', display: 'inline-block', flexShrink: 0 }}>▶</span>
                <span style={{ fontSize: 13 }}>🍽️</span>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{client.name}</span>
              </div>

              {/* Phase rows */}
              {isOpen && PHASES.map(ph => {
                const isActivePh = isActive && activePhase?.id === ph.id;
                const cnt = phaseCounts[ph.id] || 0;
                return (
                  <div key={ph.id}
                    onClick={() => selectPhase(client, ph)}
                    style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '5px 14px 5px 32px', cursor: 'pointer', fontSize: 11.5, color: isActivePh ? '#fff' : 'rgba(255,255,255,0.4)', fontWeight: isActivePh ? 700 : 400, background: isActivePh ? 'rgba(183,12,0,0.18)' : 'transparent', borderLeft: isActivePh ? `2px solid ${ph.color}` : '2px solid transparent', transition: 'all 100ms' }}
                    onMouseEnter={e => { if (!isActivePh) e.currentTarget.style.color = 'rgba(255,255,255,0.7)'; }}
                    onMouseLeave={e => { if (!isActivePh) e.currentTarget.style.color = 'rgba(255,255,255,0.4)'; }}
                  >
                    <span style={{ width: 5, height: 5, borderRadius: '50%', background: ph.color, flexShrink: 0 }} />
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ph.num} · {ph.name}</span>
                    {cnt > 0 && !isActive && <span style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.06)', padding: '1px 5px', borderRadius: 9999 }}>{cnt}</span>}
                    {cnt > 0 && isActive  && <span style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.35)', background: 'rgba(255,255,255,0.08)', padding: '1px 5px', borderRadius: 9999 }}>{cnt}</span>}
                  </div>
                );
              })}
            </div>
          );
        })}

        {/* Seções placeholder */}
        <div style={{ marginTop: 16, padding: '10px 14px 6px', fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.18)', textTransform: 'uppercase', letterSpacing: 1.2, borderTop: '1px solid rgba(255,255,255,0.05)', ...OSW }}>
          📋 SOPs &amp; Processos
        </div>
        <div style={{ padding: '4px 14px 10px', fontSize: 11, color: 'rgba(255,255,255,0.15)', fontStyle: 'italic' }}>Em breve…</div>

        <div style={{ padding: '10px 14px 6px', fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.18)', textTransform: 'uppercase', letterSpacing: 1.2, borderTop: '1px solid rgba(255,255,255,0.05)', ...OSW }}>
          📚 Guias do Time
        </div>
        <div style={{ padding: '4px 14px 12px', fontSize: 11, color: 'rgba(255,255,255,0.15)', fontStyle: 'italic' }}>Em breve…</div>
      </div>

      {/* ─── Área principal ──────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        {!activePhase ? (
          /* Empty state */
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, color: 'var(--g-400)' }}>
            <div style={{ width: 72, height: 72, borderRadius: 20, background: 'linear-gradient(135deg,#B70C00,#DC2626)', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.7 }}>
              <Icon name="columns" size={32} style={{ color: 'white' }} />
            </div>
            <div style={{ ...OSW, fontSize: 22, fontWeight: 700, color: '#1a1a1a', letterSpacing: 0.5 }}>ESPAÇOS</div>
            <div style={{ fontSize: 13.5, color: 'var(--g-500)', textAlign: 'center', lineHeight: 1.6, maxWidth: 360 }}>
              Selecione um cliente e uma fase de consultoria na barra lateral para ver e gerenciar as tarefas.
            </div>
            {clients.length === 0 && !loadingCli && (
              <div style={{ fontSize: 12, color: 'var(--g-400)', marginTop: 4, background: 'var(--g-100)', padding: '8px 16px', borderRadius: 8 }}>
                Adicione clientes em <strong>Clientes (CRM)</strong> para eles aparecerem aqui.
              </div>
            )}
          </div>
        ) : (
          <>
            {/* ── Topbar ────────────────────────────────────────── */}
            <div style={{ padding: '10px 22px', borderBottom: '1px solid #e5e5e5', background: 'white', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, flexWrap: 'wrap' }}>
              {/* Breadcrumb */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: '#888', flex: 1, minWidth: 0 }}>
                <span style={{ ...OSW, fontSize: 11, fontWeight: 700, color: '#aaa', letterSpacing: 0.5 }}>ESPAÇOS</span>
                <span>›</span>
                <span style={{ fontWeight: 600, color: '#555', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140 }}>{activeClient.name}</span>
                <span>›</span>
                <span style={{ fontWeight: 700, color: phase.color, whiteSpace: 'nowrap' }}>{phase.num} · {phase.name}</span>
              </div>
              {/* Actions */}
              <div style={{ display: 'flex', gap: 7, alignItems: 'center', flexShrink: 0 }}>
                <button style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 13px', borderRadius: 7, border: '1px solid #e0e0e0', background: 'white', fontSize: 12, fontWeight: 600, color: '#555', cursor: 'pointer', ...MON }} title="Painel de Agentes IA">
                  <Icon name="sparkles" size={13} style={{ color: '#B70C00' }} /> Agentes
                </button>
                <button style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 13px', borderRadius: 7, border: '1px solid #e0e0e0', background: 'white', fontSize: 12, fontWeight: 600, color: '#555', cursor: 'pointer', ...MON }} title="Pergunte à DELI">
                  <Icon name="msg" size={13} style={{ color: '#2563EB' }} /> Perguntar
                </button>
                <button onClick={() => { setDefaultStatus('todo'); setShowModal(true); }}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 7, border: 'none', background: '#B70C00', color: 'white', fontSize: 13, fontWeight: 700, cursor: 'pointer', boxShadow: '0 2px 8px rgba(183,12,0,0.3)', ...OSW, letterSpacing: 0.3 }}>
                  <Icon name="plus" size={14} style={{ color: 'white' }} /> TAREFA
                </button>
              </div>
            </div>

            {/* ── Toolbar ───────────────────────────────────────── */}
            <div style={{ padding: '0 22px', borderBottom: '1px solid #e8e8e8', background: 'white', display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, flexWrap: 'wrap', minHeight: 44 }}>
              {/* View tabs */}
              {[
                { id: 'board', icon: 'columns', label: 'Quadro' },
                { id: 'list',  icon: 'list',    label: 'Lista'  },
                { id: 'viz',   icon: 'chart',   label: 'Visão'  },
              ].map(v => (
                <button key={v.id} onClick={() => setView(v.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '11px 12px', fontSize: 12, fontWeight: view === v.id ? 700 : 500, color: view === v.id ? phase.color : '#888', background: 'none', border: 'none', borderBottom: view === v.id ? `2px solid ${phase.color}` : '2px solid transparent', cursor: 'pointer', marginBottom: -1, transition: 'all 120ms', ...MON }}>
                  <Icon name={v.icon} size={12} /> {v.label}
                </button>
              ))}

              <div style={{ width: 1, height: 20, background: '#e5e5e5', margin: '0 4px' }} />

              {/* Filter mode pills */}
              {[
                { id: 'all',    label: 'Todos'     },
                { id: 'mine',   label: 'Minhas'    },
                { id: 'urgent', label: 'Urgentes'  },
                { id: 'due',    label: 'Vencendo'  },
              ].map(f => (
                <button key={f.id} onClick={() => setFilterMode(f.id)}
                  style={{ padding: '4px 11px', borderRadius: 9999, fontSize: 11.5, fontWeight: 600, border: '1.5px solid', borderColor: filterMode === f.id ? phase.color : '#e0e0e0', color: filterMode === f.id ? phase.color : '#777', background: filterMode === f.id ? `${phase.color}14` : 'transparent', cursor: 'pointer', transition: 'all 100ms', ...MON }}>
                  {f.label}
                </button>
              ))}

              <div style={{ flex: 1 }} />

              {/* Team avatars */}
              <div style={{ display: 'flex', marginRight: 4 }}>
                {MEMBERS.slice(0, 4).map((m, i) => (
                  <div key={m.avatar} style={{ marginLeft: i === 0 ? 0 : -8, borderRadius: '50%', border: '2px solid white' }}>
                    <UserAvatar name={m.avatar} size={26} />
                  </div>
                ))}
              </div>

              {/* Search */}
              <div style={{ position: 'relative' }}>
                <Icon name="search" size={12} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: '#aaa', pointerEvents: 'none' }} />
                <input
                  placeholder="Buscar tarefas…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  style={{ paddingLeft: 28, paddingRight: 10, height: 30, borderRadius: 7, border: '1.5px solid #e0e0e0', fontSize: 12, color: '#333', background: '#fafafa', outline: 'none', width: 170, ...MON }}
                />
              </div>
            </div>

            {/* ── Views ─────────────────────────────────────────── */}
            <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
              {loadingTasks ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 10 }}>
                  <div style={{ width: 24, height: 24, border: '3px solid #e5e5e5', borderTopColor: '#B70C00', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                  <span style={{ fontSize: 13, color: '#aaa' }}>Carregando tarefas…</span>
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
                  onAddInline={statusId => { setDefaultStatus(statusId); setShowModal(true); }}
                />
              ) : view === 'list' ? (
                <ListView tasks={tasks} phase={phase} onOpenDrawer={setDrawerTask} onDelete={handleDelete} />
              ) : (
                <VizView tasks={tasks} byStatus={byStatus} phase={phase} />
              )}
            </div>
          </>
        )}
      </div>

      {/* ─── Ghost drag ──────────────────────────────────────────── */}
      {draggingTask && ghostPos && (
        <div className="task-card drag-ghost" style={{ left: ghostPos.x - 130, top: ghostPos.y - 30, borderLeft: `4px solid ${phase?.color || '#B70C00'}` }}>
          <TaskCardBody task={draggingTask} phase={phase} />
        </div>
      )}

      {/* ─── Modal nova tarefa ────────────────────────────────────── */}
      {showModal && (
        <NewTaskModal defaultStatus={defaultStatus} phase={activePhase} onSave={handleCreate} onClose={() => setShowModal(false)} />
      )}

      {/* ─── Drawer de detalhe ───────────────────────────────────── */}
      {drawerTask && (
        <TaskDrawer
          task={drawerTask}
          phase={phaseOf(drawerTask.phase_id || activePhase?.id)}
          onUpdate={patch => handleUpdate(drawerTask.id, patch)}
          onDelete={() => handleDelete(drawerTask.id)}
          onClose={() => setDrawerTask(null)}
        />
      )}
    </div>
  );
}

/* ─── BoardView ─────────────────────────────────────────────── */

function BoardView({ byStatus, phase, dragId, hoverCol, onDragStart, onDrag, onDragEnd, onColDragOver, onColDrop, onOpenDrawer, onDelete, onAddInline }) {
  const total = Object.values(byStatus).reduce((s, arr) => s + arr.length, 0);

  return (
    <div style={{ display: 'flex', gap: 10, padding: '16px 20px', height: '100%', overflowX: 'auto', overflowY: 'hidden', boxSizing: 'border-box', alignItems: 'flex-start' }}>
      {total === 0 && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, color: '#bbb', pointerEvents: 'none' }}>
          <Icon name="check" size={36} style={{ opacity: 0.25 }} />
          <span style={{ fontSize: 13.5 }}>Nenhuma tarefa nesta fase. Crie a primeira!</span>
        </div>
      )}
      {STATUSES.map(col => (
        <div key={col.id}
          onDragOver={e => onColDragOver(e, col.id)}
          onDragLeave={() => {}}
          onDrop={e => onColDrop(e, col.id)}
          style={{ minWidth: 230, maxWidth: 250, display: 'flex', flexDirection: 'column', background: hoverCol === col.id ? '#f0f0f0' : '#ebebeb', borderRadius: 10, padding: '10px 8px 8px', flexShrink: 0, maxHeight: '100%', overflow: 'hidden', transition: 'background 120ms' }}
        >
          {/* Col header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 4px 8px', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: col.color }} />
              <span style={{ fontFamily: "'Oswald', system-ui, sans-serif", fontSize: 11, fontWeight: 700, color: '#444', textTransform: 'uppercase', letterSpacing: 0.8 }}>{col.label}</span>
              <span style={{ fontSize: 10, fontWeight: 700, color: col.color, background: col.bg, padding: '1px 7px', borderRadius: 9999 }}>{byStatus[col.id]?.length || 0}</span>
            </div>
            <button onClick={() => onAddInline(col.id)}
              style={{ width: 22, height: 22, borderRadius: 6, border: '1px solid #ddd', background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#888' }}
              title="Adicionar tarefa">
              <Icon name="plus" size={11} />
            </button>
          </div>

          {/* Cards */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7, overflowY: 'auto', flex: 1, paddingRight: 2 }}>
            {byStatus[col.id]?.map(task => (
              <TaskCard key={task.id} task={task} phase={phase} isDragging={dragId === task.id}
                onDragStart={e => onDragStart(e, task.id)} onDrag={onDrag} onDragEnd={onDragEnd}
                onOpen={() => onOpenDrawer(task)} onDelete={() => onDelete(task.id)} />
            ))}
            {byStatus[col.id]?.length === 0 && (
              <button onClick={() => onAddInline(col.id)}
                style={{ padding: '14px 10px', textAlign: 'center', fontSize: 11.5, color: '#bbb', border: '1.5px dashed #d5d5d5', borderRadius: 8, background: 'transparent', cursor: 'pointer', width: '100%' }}>
                + Adicionar tarefa
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─── TaskCard ───────────────────────────────────────────────── */

function TaskCard({ task, phase, isDragging, onDragStart, onDrag, onDragEnd, onOpen, onDelete }) {
  const [hov, setHov]   = useState(false);
  const [conf, setConf] = useState(false);

  return (
    <div
      draggable onDragStart={onDragStart} onDrag={onDrag} onDragEnd={onDragEnd}
      onClick={onOpen}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => { setHov(false); setConf(false); }}
      style={{ background: 'white', borderRadius: 8, padding: '10px 10px 9px', cursor: 'pointer', borderLeft: `4px solid ${phase?.color || '#B70C00'}`, boxShadow: isDragging ? '0 8px 24px rgba(0,0,0,0.15)' : hov ? '0 2px 10px rgba(0,0,0,0.08)' : '0 1px 3px rgba(0,0,0,0.05)', opacity: isDragging ? 0.5 : 1, transition: 'box-shadow 120ms', position: 'relative', userSelect: 'none' }}
    >
      <TaskCardBody task={task} phase={phase} />
      {hov && !isDragging && (
        <div style={{ position: 'absolute', top: 6, right: 6 }} onClick={e => e.stopPropagation()}>
          {!conf ? (
            <button onMouseDown={e => { e.stopPropagation(); setConf(true); }}
              style={{ width: 22, height: 22, borderRadius: 5, background: '#f5f5f5', border: '1px solid #e5e5e5', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#bbb' }}>
              <Icon name="trash" size={11} />
            </button>
          ) : (
            <button onMouseDown={e => { e.stopPropagation(); onDelete(); }}
              style={{ height: 22, padding: '0 8px', borderRadius: 5, background: '#DC2626', border: 'none', color: 'white', fontSize: 10, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}>
              <Icon name="trash" size={10} style={{ color: 'white' }} /> OK?
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
      {/* Título */}
      <div style={{ fontFamily: "'Montserrat', system-ui, sans-serif", fontSize: 12.5, fontWeight: 600, color: '#1a1a1a', lineHeight: 1.38, marginBottom: 7, paddingRight: 24 }}>{task.title}</div>

      {/* Descrição truncada */}
      {task.description && (
        <div style={{ fontFamily: "'Montserrat', system-ui, sans-serif", fontSize: 11, color: '#888', lineHeight: 1.4, marginBottom: 7 }}>
          {task.description.slice(0, 72)}{task.description.length > 72 ? '…' : ''}
        </div>
      )}

      {/* Meta row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ fontFamily: "'Montserrat', system-ui, sans-serif", fontSize: 9.5, fontWeight: 700, padding: '2px 7px', borderRadius: 9999, color: p.color, background: p.bg, letterSpacing: 0.3 }}>{p.label}</span>
          {task.due_date && (
            <span style={{ fontFamily: "'Montserrat', system-ui, sans-serif", fontSize: 10, color: '#999', display: 'flex', alignItems: 'center', gap: 3 }}>
              <Icon name="calendar" size={9} />
              {task.due_date}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
          {agent && <AgentAvatar id={task.agent_id} size={17} />}
          {task.assignee?.full_name && <UserAvatar name={task.assignee.full_name.charAt(0)} size={19} />}
        </div>
      </div>
    </>
  );
}

/* ─── ListView ───────────────────────────────────────────────── */

function ListView({ tasks, phase, onOpenDrawer, onDelete }) {
  const MON = { fontFamily: "'Montserrat', system-ui, sans-serif" };
  const OSW = { fontFamily: "'Oswald', system-ui, sans-serif" };

  if (tasks.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 8, color: '#bbb' }}>
        <Icon name="list" size={32} style={{ opacity: 0.3 }} />
        <span style={{ fontSize: 13, ...MON }}>Nenhuma tarefa nesta fase.</span>
      </div>
    );
  }

  const byStatus = useMemo(() => {
    const g = {}; STATUSES.forEach(s => { g[s.id] = []; });
    tasks.forEach(t => { g[t.status]?.push(t); });
    return g;
  }, [tasks]);

  return (
    <div style={{ padding: '16px 22px', overflowY: 'auto', height: '100%', boxSizing: 'border-box' }}>
      {STATUSES.map(col => {
        const items = byStatus[col.id];
        if (!items?.length) return null;
        return (
          <div key={col.id} style={{ marginBottom: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: col.color }} />
              <span style={{ ...OSW, fontSize: 11, fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: 0.6 }}>{col.label}</span>
              <span style={{ fontSize: 10, fontWeight: 700, color: col.color, background: col.bg, padding: '1px 7px', borderRadius: 9999 }}>{items.length}</span>
            </div>
            <div style={{ background: 'white', borderRadius: 10, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
              {items.map((task, i) => {
                const p = priorityOf(task.priority);
                return (
                  <div key={task.id} onClick={() => onOpenDrawer(task)}
                    style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderBottom: i < items.length - 1 ? '1px solid #f0f0f0' : 'none', cursor: 'pointer', borderLeft: `3px solid ${phase.color}`, transition: 'background 100ms' }}
                    onMouseEnter={e => { e.currentTarget.style.background = '#fafafa'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
                    <span style={{ flex: 1, fontSize: 12.5, fontWeight: 600, color: '#1a1a1a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', ...MON }}>{task.title}</span>
                    <span style={{ fontSize: 9.5, fontWeight: 700, padding: '2px 8px', borderRadius: 9999, color: p.color, background: p.bg, flexShrink: 0, ...MON }}>{p.label}</span>
                    {task.due_date && <span style={{ fontSize: 11, color: '#aaa', flexShrink: 0, ...MON }}>{task.due_date}</span>}
                    {task.assignee?.full_name && <UserAvatar name={task.assignee.full_name.charAt(0)} size={22} />}
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

/* ─── VizView ────────────────────────────────────────────────── */

function VizView({ tasks, byStatus, phase }) {
  const MON = { fontFamily: "'Montserrat', system-ui, sans-serif" };
  const OSW = { fontFamily: "'Oswald', system-ui, sans-serif" };
  const done    = byStatus['done']?.length || 0;
  const blocked = byStatus['blocked']?.length || 0;
  const total   = tasks.length;
  const pct     = total > 0 ? Math.round((done / total) * 100) : 0;
  const maxCnt  = Math.max(1, ...STATUSES.map(s => byStatus[s.id]?.length || 0));

  const kpis = [
    { label: 'Total',         value: total,                         color: '#1a1a1a' },
    { label: 'A Fazer',       value: byStatus['todo']?.length || 0, color: '#6B7280' },
    { label: 'Em Andamento',  value: byStatus['doing']?.length || 0,color: '#2563EB' },
    { label: 'Concluídas',    value: done,                          color: '#059669' },
  ];

  return (
    <div style={{ padding: '20px 24px', overflowY: 'auto', height: '100%', boxSizing: 'border-box' }}>
      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        {kpis.map(k => (
          <div key={k.label} style={{ background: 'white', borderRadius: 10, padding: '16px 18px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', borderTop: `3px solid ${k.color}` }}>
            <div style={{ ...OSW, fontSize: 30, fontWeight: 700, color: k.color, lineHeight: 1 }}>{k.value}</div>
            <div style={{ fontSize: 12, color: '#888', marginTop: 5, ...MON }}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* Progresso */}
      <div style={{ background: 'white', borderRadius: 10, padding: '16px 18px', marginBottom: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#333', ...MON }}>Progresso da fase — {phase.name}</span>
          <span style={{ ...OSW, fontSize: 18, fontWeight: 700, color: '#059669' }}>{pct}%</span>
        </div>
        <div style={{ height: 10, borderRadius: 9999, background: '#f0f0f0', overflow: 'hidden' }}>
          <div style={{ height: '100%', borderRadius: 9999, background: 'linear-gradient(90deg,#059669,#10B981)', width: `${pct}%`, transition: 'width 600ms ease' }} />
        </div>
        {blocked > 0 && (
          <div style={{ marginTop: 8, fontSize: 12, color: '#DC2626', fontWeight: 600, ...MON }}>
            ⚠ {blocked} tarefa{blocked > 1 ? 's' : ''} bloqueada{blocked > 1 ? 's' : ''}
          </div>
        )}
      </div>

      {/* Gráfico por status */}
      <div style={{ background: 'white', borderRadius: 10, padding: '16px 18px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
        <div style={{ ...OSW, fontSize: 13, fontWeight: 700, color: '#444', marginBottom: 14, letterSpacing: 0.3 }}>TAREFAS POR STATUS</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          {STATUSES.map(s => {
            const cnt = byStatus[s.id]?.length || 0;
            const w   = Math.round((cnt / maxCnt) * 100);
            return (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 11.5, color: '#666', width: 96, flexShrink: 0, ...MON }}>{s.label}</span>
                <div style={{ flex: 1, height: 13, borderRadius: 9999, background: '#f0f0f0', overflow: 'hidden' }}>
                  <div style={{ height: '100%', borderRadius: 9999, background: s.color, width: `${w}%`, transition: 'width 450ms ease', opacity: cnt > 0 ? 1 : 0.2 }} />
                </div>
                <span style={{ fontSize: 12, fontWeight: 700, color: cnt > 0 ? s.color : '#ccc', width: 22, textAlign: 'right', flexShrink: 0, ...MON }}>{cnt}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ─── TaskDrawer ─────────────────────────────────────────────── */

function TaskDrawer({ task, phase, onUpdate, onDelete, onClose }) {
  const [title, setTitle] = useState(task.title || '');
  const [desc,  setDesc]  = useState(task.description || '');
  const [status, setSt]   = useState(task.status || 'todo');
  const [prio,   setPr]   = useState(task.priority || 'normal');
  const [due,    setDue]  = useState(task.due_date || '');
  const [agent,  setAg]   = useState(task.agent_id || '');
  const [dirty,  setDirty]= useState(false);

  const MON = { fontFamily: "'Montserrat', system-ui, sans-serif" };
  const OSW = { fontFamily: "'Oswald', system-ui, sans-serif" };
  const st  = statusOf(status);

  function mark() { setDirty(true); }
  function save() {
    if (!title.trim()) return;
    onUpdate({ title: title.trim(), description: desc, status, priority: prio, due_date: due || null, agent_id: agent || null });
    setDirty(false);
  }

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.18)', zIndex: 400 }} />
      <div style={{ position: 'fixed', top: 64, right: 0, bottom: 0, width: 450, background: 'white', borderLeft: '1px solid #e5e5e5', zIndex: 401, display: 'flex', flexDirection: 'column', boxShadow: '-12px 0 40px rgba(0,0,0,0.1)', ...MON }}>

        {/* Header */}
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0f0f0', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: phase.color }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: '#888' }}>{phase.num} · {phase.name}</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 9999, color: st.color, background: st.bg }}>
              {st.label}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
            {dirty && (
              <button onClick={save} style={{ padding: '5px 13px', borderRadius: 7, border: 'none', background: '#B70C00', color: 'white', fontSize: 12, fontWeight: 700, cursor: 'pointer', ...OSW, letterSpacing: 0.3 }}>SALVAR</button>
            )}
            <button onClick={onDelete} style={{ width: 30, height: 30, borderRadius: 7, border: '1px solid #e5e5e5', background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#bbb' }} title="Excluir">
              <Icon name="trash" size={13} />
            </button>
            <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: 7, border: '1px solid #e5e5e5', background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#888' }}>
              <Icon name="x" size={13} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '18px 18px' }}>
          {/* Título */}
          <textarea
            value={title}
            onChange={e => { setTitle(e.target.value); mark(); }}
            onBlur={save}
            rows={2}
            placeholder="Título da tarefa"
            style={{ width: '100%', fontSize: 18, fontWeight: 700, color: '#1a1a1a', border: 'none', background: 'transparent', resize: 'none', fontFamily: "'Oswald', system-ui, sans-serif", lineHeight: 1.3, outline: 'none', boxSizing: 'border-box', marginBottom: 18 }}
          />

          {/* Properties grid */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '14px 16px', background: '#fafafa', borderRadius: 10, marginBottom: 18, border: '1px solid #f0f0f0' }}>
            {[
              { label: 'Status',     child: (
                <select className="input" style={{ fontSize: 12, padding: '5px 8px' }} value={status} onChange={e => { setSt(e.target.value); mark(); }}>
                  {STATUSES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
              )},
              { label: 'Prioridade', child: (
                <select className="input" style={{ fontSize: 12, padding: '5px 8px' }} value={prio} onChange={e => { setPr(e.target.value); mark(); }}>
                  {PRIORITIES.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                </select>
              )},
              { label: 'Prazo',      child: (
                <input type="date" className="input" style={{ fontSize: 12, padding: '5px 8px' }} value={due} onChange={e => { setDue(e.target.value); mark(); }} />
              )},
              { label: 'Agente IA',  child: (
                <select className="input" style={{ fontSize: 12, padding: '5px 8px' }} value={agent} onChange={e => { setAg(e.target.value); mark(); }}>
                  <option value="">— Nenhum —</option>
                  {AGENTS?.map(a => <option key={a.id} value={a.id}>{a.name} · {a.role}</option>)}
                </select>
              )},
            ].map(({ label, child }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 11.5, color: '#999', width: 80, flexShrink: 0, fontWeight: 500 }}>{label}</span>
                {child}
              </div>
            ))}
          </div>

          {/* Descrição */}
          <div style={{ fontSize: 12, fontWeight: 600, color: '#999', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5, ...{ fontFamily: "'Oswald', system-ui, sans-serif" } }}>Descrição</div>
          <textarea
            className="input"
            rows={6}
            placeholder="Contexto, links, detalhes…"
            value={desc}
            onChange={e => { setDesc(e.target.value); mark(); }}
            onBlur={save}
            style={{ resize: 'vertical', fontFamily: "'Montserrat', system-ui, sans-serif", lineHeight: 1.55, fontSize: 13, width: '100%', boxSizing: 'border-box' }}
          />
        </div>
      </div>
    </>
  );
}

/* ─── NewTaskModal ───────────────────────────────────────────── */

function NewTaskModal({ defaultStatus, phase, onSave, onClose }) {
  const [form, setForm] = useState({ title: '', description: '', status: defaultStatus || 'todo', priority: 'normal', due_date: '', agent_id: '' });
  const [err,  setErr]  = useState('');
  const MON = { fontFamily: "'Montserrat', system-ui, sans-serif" };
  const OSW = { fontFamily: "'Oswald', system-ui, sans-serif" };

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }
  function submit() {
    if (!form.title.trim()) { setErr('Título obrigatório.'); return; }
    onSave({ ...form, agent_id: form.agent_id || null, due_date: form.due_date || null });
  }

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 500 }} />
      <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', background: 'white', borderRadius: 14, padding: 28, zIndex: 501, width: 470, boxShadow: '0 24px 64px rgba(0,0,0,0.2)', maxHeight: '90vh', overflowY: 'auto', ...MON }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 22 }}>
          <div>
            <div style={{ ...OSW, fontSize: 18, fontWeight: 700, color: '#1a1a1a', letterSpacing: 0.3 }}>NOVA TAREFA</div>
            {phase && <div style={{ fontSize: 12, color: phase.color, fontWeight: 600, marginTop: 3 }}>{phase.num} · {phase.name}</div>}
          </div>
          <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: 7, border: '1px solid #e5e5e5', background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#999', flexShrink: 0 }}>
            <Icon name="x" size={14} />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: '#999', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 6, ...OSW }}>Título *</label>
            <input className="input" autoFocus placeholder="Ex: Revisar cardápio iFood" value={form.title} onChange={e => set('title', e.target.value)} onKeyDown={e => e.key === 'Enter' && submit()} style={{ ...MON }} />
            {err && <div style={{ fontSize: 11, color: '#DC2626', marginTop: 3 }}>{err}</div>}
          </div>

          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: '#999', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 6, ...OSW }}>Descrição</label>
            <textarea className="input" rows={2} placeholder="Detalhes…" value={form.description} onChange={e => set('description', e.target.value)} style={{ resize: 'vertical', ...MON }} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {[
              { label: 'Status',     key: 'status',   opts: STATUSES.map(s => ({ value: s.id, label: s.label })) },
              { label: 'Prioridade', key: 'priority', opts: PRIORITIES.map(p => ({ value: p.id, label: p.label })) },
            ].map(({ label, key, opts }) => (
              <div key={key}>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#999', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 6, ...OSW }}>{label}</label>
                <select className="input" style={{ ...MON }} value={form[key]} onChange={e => set(key, e.target.value)}>
                  {opts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#999', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 6, ...OSW }}>Prazo</label>
              <input type="date" className="input" style={{ ...MON }} value={form.due_date} onChange={e => set('due_date', e.target.value)} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#999', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 6, ...OSW }}>Agente IA</label>
              <select className="input" style={{ ...MON }} value={form.agent_id} onChange={e => set('agent_id', e.target.value)}>
                <option value="">— Nenhum —</option>
                {AGENTS?.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 22, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '8px 16px', borderRadius: 8, border: '1.5px solid #e5e5e5', background: 'white', fontSize: 13, fontWeight: 600, color: '#666', cursor: 'pointer', ...MON }}>Cancelar</button>
          <button onClick={submit} style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: '#B70C00', color: 'white', fontSize: 13, fontWeight: 700, cursor: 'pointer', boxShadow: '0 2px 8px rgba(183,12,0,0.3)', display: 'flex', alignItems: 'center', gap: 6, ...OSW, letterSpacing: 0.3 }}>
            <Icon name="plus" size={13} style={{ color: 'white' }} /> CRIAR TAREFA
          </button>
        </div>
      </div>
    </>
  );
}
