import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import Icon from '../components/Icon.jsx';
import UserAvatar from '../components/UserAvatar.jsx';
import { SETTINGS_DATA } from '../data.js';
import {
  listClientes,
  listFolders, createFolder, deleteFolder,
  listLists, createList, deleteList,
  listColumns, createColumn, updateColumn, deleteColumn,
  listClientTasks, createClientTask, updateClientTask, moveClientTask, deleteClientTask,
} from '../lib/api.js';

/* ─── Constantes ────────────────────────────────────────────── */

const PRIORITIES = [
  { id: 'urgent', label: 'URGENTE', color: '#DC2626', bg: 'rgba(220,38,38,0.12)' },
  { id: 'high',   label: 'ALTA',    color: '#D97706', bg: 'rgba(217,119,6,0.12)' },
  { id: 'normal', label: 'NORMAL',  color: '#6B7280', bg: 'rgba(107,114,128,0.1)' },
  { id: 'low',    label: 'BAIXA',   color: '#9CA3AF', bg: 'rgba(156,163,175,0.1)' },
];

const MEMBERS = SETTINGS_DATA?.users ?? [];

const priorityOf = id => PRIORITIES.find(p => p.id === id) || PRIORITIES[2];

/* ─── Main ──────────────────────────────────────────────────── */

export default function TarefasClientesScreen({ tenantDbId, userId, deepLinkCustomerId }) {
  const [clients,        setClients]        = useState([]);
  const [loadingCli,     setLoadingCli]     = useState(true);

  const [expandedClients, setExpandedClients] = useState({});  // { customerId: true }
  const [foldersByClient, setFoldersByClient] = useState({});  // { customerId: [folder] }
  const [expandedFolders, setExpandedFolders] = useState({});  // { folderId: true }
  const [listsByFolder,   setListsByFolder]   = useState({});  // { folderId: [list] }

  const [activeClient,   setActiveClient]   = useState(null);
  const [activeFolder,   setActiveFolder]   = useState(null);
  const [activeList,     setActiveList]     = useState(null);

  const [columns,        setColumns]        = useState([]);
  const [tasks,          setTasks]          = useState([]);
  const [loadingBoard,   setLoadingBoard]   = useState(false);

  const [view,           setView]           = useState('board');   // board|list|viz
  const [search,         setSearch]         = useState('');
  const [dragId,         setDragId]         = useState(null);
  const [hoverCol,       setHoverCol]       = useState(null);
  const [ghostPos,       setGhostPos]       = useState(null);
  const [showModal,      setShowModal]      = useState(false);
  const [drawerTask,     setDrawerTask]     = useState(null);
  const [busy,           setBusy]           = useState(false);     // criando folder/list/coluna

  const deepLinkApplied = useRef(null);

  /* ── Loaders (declarados ANTES dos effects — evita TDZ) ── */

  const loadColumnsAndTasks = useCallback(async (list) => {
    if (!tenantDbId || !list) return;
    setLoadingBoard(true);
    try {
      const [cols, tks] = await Promise.all([
        listColumns(list.id),
        listClientTasks(tenantDbId, list.id),
      ]);
      setColumns(cols);
      setTasks(tks);
    } catch {
      setColumns([]); setTasks([]);
    } finally {
      setLoadingBoard(false);
    }
  }, [tenantDbId]);

  const selectList = useCallback((client, folder, list) => {
    setActiveClient(client);
    setActiveFolder(folder);
    setActiveList(list);
    setView('board');
    setSearch('');
    loadColumnsAndTasks(list);
  }, [loadColumnsAndTasks]);

  const loadLists = useCallback(async (client, folder, { autoSelect = false } = {}) => {
    if (!folder) return [];
    try {
      const lists = await listLists(folder.id);
      setListsByFolder(m => ({ ...m, [folder.id]: lists }));
      if (autoSelect && lists.length) selectList(client, folder, lists[0]);
      return lists;
    } catch {
      setListsByFolder(m => ({ ...m, [folder.id]: [] }));
      return [];
    }
  }, [selectList]);

  const loadFolders = useCallback(async (client, { autoSelect = false } = {}) => {
    if (!tenantDbId || !client) return [];
    try {
      const folders = await listFolders(tenantDbId, client.id);
      setFoldersByClient(m => ({ ...m, [client.id]: folders }));
      if (autoSelect && folders.length) {
        const f0 = folders[0];
        setExpandedFolders(e => ({ ...e, [f0.id]: true }));
        setActiveFolder(f0);
        await loadLists(client, f0, { autoSelect: true });
      }
      return folders;
    } catch {
      setFoldersByClient(m => ({ ...m, [client.id]: [] }));
      return [];
    }
  }, [tenantDbId, loadLists]);

  /* ── Carregar clientes ── */
  useEffect(() => {
    if (!tenantDbId) return;
    let alive = true;
    setLoadingCli(true);
    listClientes(tenantDbId)
      .then(r => { if (alive) { setClients(r); setLoadingCli(false); } })
      .catch(() => { if (alive) setLoadingCli(false); });
    return () => { alive = false; };
  }, [tenantDbId]);

  /* ── Deep-link: pré-selecionar cliente → pasta[0] → lista[0] ── */
  useEffect(() => {
    if (!deepLinkCustomerId || deepLinkApplied.current === deepLinkCustomerId || !clients.length) return;
    const cli = clients.find(c => c.id === deepLinkCustomerId);
    if (!cli) return;
    deepLinkApplied.current = deepLinkCustomerId;
    setExpandedClients(e => ({ ...e, [cli.id]: true }));
    setActiveClient(cli);
    loadFolders(cli, { autoSelect: true });
  }, [clients, deepLinkCustomerId, loadFolders]);

  /* ── Navegação da árvore ── */

  function toggleClient(client) {
    const open = !!expandedClients[client.id];
    setExpandedClients(e => ({ ...e, [client.id]: !open }));
    if (!open && !foldersByClient[client.id]) loadFolders(client);
  }

  function toggleFolder(client, folder) {
    const open = !!expandedFolders[folder.id];
    setExpandedFolders(e => ({ ...e, [folder.id]: !open }));
    if (!open && !listsByFolder[folder.id]) loadLists(client, folder);
  }

  /* ── Criar entidades ── */

  async function handleCreateFolder(client) {
    const name = window.prompt('Nome da pasta:', 'Nova pasta');
    if (!name) return;
    setBusy(true);
    try {
      const folder = await createFolder({ tenantId: tenantDbId, customerId: client.id, name, color: '#B70C00', icon: 'folder', position: (foldersByClient[client.id]?.length || 0) });
      setFoldersByClient(m => ({ ...m, [client.id]: [...(m[client.id] || []), folder] }));
      setExpandedClients(e => ({ ...e, [client.id]: true }));
      setExpandedFolders(e => ({ ...e, [folder.id]: true }));
      setListsByFolder(m => ({ ...m, [folder.id]: [] }));
      setActiveClient(client); setActiveFolder(folder); setActiveList(null);
    } catch {} finally { setBusy(false); }
  }

  async function handleCreateList(client, folder) {
    const name = window.prompt('Nome da lista:', 'Tarefas');
    if (!name) return;
    setBusy(true);
    try {
      const { list, columns: cols } = await createList({ tenantId: tenantDbId, folderId: folder.id, name, position: (listsByFolder[folder.id]?.length || 0) });
      setListsByFolder(m => ({ ...m, [folder.id]: [...(m[folder.id] || []), list] }));
      setExpandedFolders(e => ({ ...e, [folder.id]: true }));
      setActiveClient(client); setActiveFolder(folder); setActiveList(list);
      setColumns(cols || []); setTasks([]); setView('board');
    } catch {} finally { setBusy(false); }
  }

  async function handleDeleteFolder(client, folder) {
    if (!window.confirm(`Apagar a pasta "${folder.name}" e tudo dentro?`)) return;
    try {
      await deleteFolder(folder.id);
      setFoldersByClient(m => ({ ...m, [client.id]: (m[client.id] || []).filter(f => f.id !== folder.id) }));
      if (activeFolder?.id === folder.id) { setActiveFolder(null); setActiveList(null); setColumns([]); setTasks([]); }
    } catch {}
  }

  async function handleDeleteList(folder, list) {
    if (!window.confirm(`Apagar a lista "${list.name}" e suas tarefas?`)) return;
    try {
      await deleteList(list.id);
      setListsByFolder(m => ({ ...m, [folder.id]: (m[folder.id] || []).filter(l => l.id !== list.id) }));
      if (activeList?.id === list.id) { setActiveList(null); setColumns([]); setTasks([]); }
    } catch {}
  }

  /* ── Colunas ── */

  async function handleCreateColumn() {
    if (!activeList) return;
    const name = window.prompt('Nome da coluna:', 'Nova coluna');
    if (!name) return;
    try {
      const col = await createColumn({ tenantId: tenantDbId, listId: activeList.id, name, color: '#6B7280', position: columns.length });
      setColumns(c => [...c, col]);
    } catch {}
  }

  async function handleRenameColumn(col) {
    const name = window.prompt('Renomear coluna:', col.name);
    if (!name || name === col.name) return;
    setColumns(c => c.map(x => x.id === col.id ? { ...x, name } : x));
    updateColumn(col.id, { name }).catch(() => {});
  }

  async function handleDeleteColumn(col) {
    if (!window.confirm(`Apagar a coluna "${col.name}"? As tarefas dela serão removidas.`)) return;
    setColumns(c => c.filter(x => x.id !== col.id));
    setTasks(t => t.filter(x => x.column_id !== col.id));
    deleteColumn(col.id).catch(() => {});
  }

  /* ── Tasks CRUD ── */

  function patchTask(id, patch) {
    setTasks(ts => ts.map(t => t.id === id ? { ...t, ...patch } : t));
    if (drawerTask?.id === id) setDrawerTask(d => ({ ...d, ...patch }));
  }

  async function handleCreateTask(data) {
    if (!tenantDbId || !activeClient || !activeList) return;
    const targetCol = data.column_id || columns[0]?.id || null;
    const payload = {
      tenant_id:   tenantDbId,
      customer_id: activeClient.id,
      list_id:     activeList.id,
      column_id:   targetCol,
      title:       data.title,
      description: data.description || '',
      priority:    data.priority || 'normal',
      due_date:    data.due_date || null,
      assignee:    data.assignee || null,
      position:    tasks.filter(t => t.column_id === targetCol).length,
    };
    try {
      const { id } = await createClientTask(payload);
      setTasks(ts => [...ts, { ...payload, id }]);
    } catch {}
    setShowModal(false);
  }

  function handleUpdateTask(id, patch) {
    patchTask(id, patch);
    updateClientTask(id, patch).catch(() => {});
  }

  function handleDeleteTask(id) {
    setTasks(ts => ts.filter(t => t.id !== id));
    if (drawerTask?.id === id) setDrawerTask(null);
    deleteClientTask(id).catch(() => {});
  }

  /* ── Drag & drop ── */

  const onDragStart = (e, id) => {
    setDragId(id);
    e.dataTransfer.effectAllowed = 'move';
    const img = new Image();
    img.src = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';
    e.dataTransfer.setDragImage(img, 0, 0);
  };
  const onDrag        = (e) => { if (e.clientX || e.clientY) setGhostPos({ x: e.clientX, y: e.clientY }); };
  const onDragEnd     = ()  => { setDragId(null); setHoverCol(null); setGhostPos(null); };
  const onColDragOver = (e, colId) => { e.preventDefault(); setHoverCol(colId); };
  const onColDrop     = (e, colId) => {
    e.preventDefault();
    if (!dragId) return;
    // posição = fim da coluna destino (append) — corrige o bug do position fixo em 0
    const destSize = tasks.filter(t => t.column_id === colId && t.id !== dragId).length;
    patchTask(dragId, { column_id: colId, position: destSize });
    moveClientTask(dragId, colId, destSize).catch(() => {});
    onDragEnd();
  };

  /* ── Derivados ── */

  const folders     = activeClient ? (foldersByClient[activeClient.id] || []) : [];
  const visibleTasks = useMemo(() => {
    if (!search) return tasks;
    const q = search.toLowerCase();
    return tasks.filter(t => (t.title || '').toLowerCase().includes(q));
  }, [tasks, search]);

  const byColumn = useMemo(() => {
    const g = {};
    columns.forEach(c => { g[c.id] = []; });
    visibleTasks.forEach(t => { (g[t.column_id] = g[t.column_id] || []).push(t); });
    return g;
  }, [columns, visibleTasks]);

  const draggingTask = tasks.find(t => t.id === dragId);
  const dragColColor = draggingTask ? (columns.find(c => c.id === draggingTask.column_id)?.color || '#B70C00') : '#B70C00';

  /* ── Render ── */

  return (
    <div className="cv2" style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--bg, #faf9f7)' }}>

      {/* ─── Sidebar ─────────────────────────────────────────── */}
      <div className="cv2-sb" style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', overflowY: 'auto', borderRight: '1px solid var(--line)', background: 'var(--panel)' }}>
        <div className="cv2-grp">ESPAÇOS</div>
        <div className="cv2-grp" style={{ paddingTop: 2 }}>Minha Carteira</div>

        {loadingCli && <div style={{ padding: '8px 16px', fontSize: 12, color: 'var(--tx2)' }}>Carregando…</div>}

        {!loadingCli && clients.length === 0 && (
          <div style={{ padding: '10px 16px', fontSize: 12, color: 'var(--tx2)', lineHeight: 1.5 }}>
            Nenhum cliente em consultoria ativa.
          </div>
        )}

        {clients.map(client => {
          const cliOpen = !!expandedClients[client.id];
          const cliFolders = foldersByClient[client.id] || [];
          return (
            <div key={client.id}>
              {/* Cliente */}
              <div className={`cv2-item${activeClient?.id === client.id ? ' on' : ''}`}
                   onClick={() => toggleClient(client)}
                   style={{ cursor: 'pointer' }}
                   onMouseEnter={e => { const b = e.currentTarget.querySelector('.add-folder'); if (b) b.style.opacity = 1; }}
                   onMouseLeave={e => { const b = e.currentTarget.querySelector('.add-folder'); if (b) b.style.opacity = 0; }}>
                <Icon name={cliOpen ? 'chevdown' : 'chevright'} size={12} />
                <Icon name="building" size={13} />
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{client.name}</span>
                <button className="add-folder" title="Nova pasta"
                        onClick={e => { e.stopPropagation(); handleCreateFolder(client); }}
                        style={{ opacity: 0, border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--tx2)', display: 'flex', alignItems: 'center', padding: 0 }}>
                  <Icon name="plus" size={12} />
                </button>
              </div>

              {/* Pastas */}
              {cliOpen && cliFolders.length === 0 && (
                <div style={{ paddingLeft: 38, padding: '6px 16px 6px 38px', fontSize: 12, color: 'var(--tx2)' }}>
                  <button onClick={() => handleCreateFolder(client)} className="cv2-btn sec" style={{ fontSize: 11, padding: '3px 8px' }}>+ Pasta</button>
                </div>
              )}

              {cliOpen && cliFolders.map(folder => {
                const fOpen = !!expandedFolders[folder.id];
                const fLists = listsByFolder[folder.id] || [];
                return (
                  <div key={folder.id}>
                    <div className={`cv2-item${activeFolder?.id === folder.id && !activeList ? ' on' : ''}`}
                         onClick={() => toggleFolder(client, folder)}
                         style={{ cursor: 'pointer', paddingLeft: 30 }}
                         onMouseEnter={e => { const b = e.currentTarget.querySelector('.row-actions'); if (b) b.style.opacity = 1; }}
                         onMouseLeave={e => { const b = e.currentTarget.querySelector('.row-actions'); if (b) b.style.opacity = 0; }}>
                      <Icon name={fOpen ? 'chevdown' : 'chevright'} size={11} />
                      <Icon name="folder" size={12} />
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{folder.name}</span>
                      <span className="row-actions" style={{ opacity: 0, display: 'flex', gap: 6 }}>
                        <button title="Nova lista" onClick={e => { e.stopPropagation(); handleCreateList(client, folder); }}
                                style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--tx2)', padding: 0, display: 'flex' }}><Icon name="plus" size={11} /></button>
                        <button title="Apagar pasta" onClick={e => { e.stopPropagation(); handleDeleteFolder(client, folder); }}
                                style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--tx2)', padding: 0, display: 'flex' }}><Icon name="trash" size={11} /></button>
                      </span>
                    </div>

                    {/* Listas */}
                    {fOpen && fLists.length === 0 && (
                      <div style={{ padding: '5px 16px 5px 52px' }}>
                        <button onClick={() => handleCreateList(client, folder)} className="cv2-btn sec" style={{ fontSize: 11, padding: '3px 8px' }}>+ Lista</button>
                      </div>
                    )}
                    {fOpen && fLists.map(list => (
                      <div key={list.id} className={`cv2-item${activeList?.id === list.id ? ' on' : ''}`}
                           onClick={() => selectList(client, folder, list)}
                           style={{ cursor: 'pointer', paddingLeft: 50 }}
                           onMouseEnter={e => { const b = e.currentTarget.querySelector('.row-actions'); if (b) b.style.opacity = 1; }}
                           onMouseLeave={e => { const b = e.currentTarget.querySelector('.row-actions'); if (b) b.style.opacity = 0; }}>
                        <Icon name="list" size={12} />
                        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{list.name}</span>
                        <button className="row-actions" title="Apagar lista" onClick={e => { e.stopPropagation(); handleDeleteList(folder, list); }}
                                style={{ opacity: 0, border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--tx2)', padding: 0, display: 'flex' }}><Icon name="trash" size={11} /></button>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* ─── Área principal ──────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        {!activeList ? (
          <EmptyMain
            activeClient={activeClient}
            activeFolder={activeFolder}
            onCreateFolder={() => activeClient && handleCreateFolder(activeClient)}
            onCreateList={() => activeClient && activeFolder && handleCreateList(activeClient, activeFolder)}
          />
        ) : (
          <>
            {/* Topbar / breadcrumb */}
            <div className="cv2-tb">
              <div className="crumb" style={{ flex: 1, minWidth: 0 }}>
                <span>ESPAÇOS</span> <span>›</span>{' '}
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{activeClient?.name}</span> <span>›</span>{' '}
                <span>{activeFolder?.name}</span> <span>›</span> <b>{activeList?.name}</b>
              </div>

              {/* View tabs */}
              <div style={{ display: 'flex', gap: 4 }}>
                {[
                  { id: 'board', icon: 'columns', label: 'Quadro' },
                  { id: 'list',  icon: 'list',    label: 'Lista'  },
                  { id: 'viz',   icon: 'chart',   label: 'Visão'  },
                ].map(v => (
                  <button key={v.id} onClick={() => setView(v.id)}
                          className={`cv2-btn${view === v.id ? '' : ' sec'}`} style={{ fontSize: 12, padding: '5px 10px' }}>
                    <Icon name={v.icon} size={12} /> {v.label}
                  </button>
                ))}
              </div>

              <input className="search" placeholder="Buscar tarefas…" value={search} onChange={e => setSearch(e.target.value)} style={{ width: 160 }} />

              <button className="cv2-btn" onClick={() => setShowModal(true)} disabled={!columns.length}>
                <Icon name="plus" size={13} /> Tarefa
              </button>
            </div>

            {/* Views */}
            <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
              {loadingBoard ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--tx2)', fontSize: 13 }}>Carregando tarefas…</div>
              ) : columns.length === 0 ? (
                <div style={{ padding: 24 }}>
                  <div className="cv2-card" style={{ textAlign: 'center' }}>
                    <div className="anton" style={{ fontSize: 20 }}>Lista sem colunas</div>
                    <div className="cv2-rule" />
                    <div className="cv2-sub">Esta lista ainda não tem colunas. Crie a primeira para começar.</div>
                    <button className="cv2-btn" onClick={handleCreateColumn} style={{ marginTop: 12 }}><Icon name="plus" size={13} /> Coluna</button>
                  </div>
                </div>
              ) : view === 'board' ? (
                <BoardView
                  columns={columns} byColumn={byColumn} dragId={dragId} hoverCol={hoverCol}
                  onDragStart={onDragStart} onDrag={onDrag} onDragEnd={onDragEnd}
                  onColDragOver={onColDragOver} onColDrop={onColDrop}
                  onOpenDrawer={setDrawerTask} onDelete={handleDeleteTask}
                  onAddTask={() => setShowModal(true)}
                  onAddColumn={handleCreateColumn}
                  onRenameColumn={handleRenameColumn} onDeleteColumn={handleDeleteColumn}
                />
              ) : view === 'list' ? (
                <ListView columns={columns} byColumn={byColumn} onOpenDrawer={setDrawerTask} />
              ) : (
                <VizView columns={columns} byColumn={byColumn} total={visibleTasks.length} listName={activeList?.name} />
              )}
            </div>
          </>
        )}
      </div>

      {/* Ghost drag */}
      {draggingTask && ghostPos && (
        <div className="cv2-card" style={{ position: 'fixed', left: ghostPos.x - 120, top: ghostPos.y - 24, width: 220, pointerEvents: 'none', zIndex: 600, borderLeft: `4px solid ${dragColColor}`, boxShadow: '0 12px 32px rgba(0,0,0,0.18)', padding: '10px 12px' }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)' }}>{draggingTask.title}</div>
        </div>
      )}

      {/* Modal nova tarefa */}
      {showModal && (
        <NewTaskModal columns={columns} listName={activeList?.name} onSave={handleCreateTask} onClose={() => setShowModal(false)} />
      )}

      {/* Drawer */}
      {drawerTask && (
        <TaskDrawer
          task={drawerTask} columns={columns}
          onUpdate={patch => handleUpdateTask(drawerTask.id, patch)}
          onMove={(colId) => { const dest = tasks.filter(t => t.column_id === colId && t.id !== drawerTask.id).length; patchTask(drawerTask.id, { column_id: colId, position: dest }); moveClientTask(drawerTask.id, colId, dest).catch(() => {}); }}
          onDelete={() => handleDeleteTask(drawerTask.id)}
          onClose={() => setDrawerTask(null)}
        />
      )}
    </div>
  );
}

/* ─── EmptyMain ──────────────────────────────────────────────── */

function EmptyMain({ activeClient, activeFolder, onCreateFolder, onCreateList }) {
  let title = 'ESPAÇOS';
  let sub = 'Selecione um cliente, uma pasta e uma lista na barra lateral para ver as tarefas.';
  let action = null;

  if (activeClient && !activeFolder) {
    title = activeClient.name;
    sub = 'Este cliente ainda não tem pastas. Crie a primeira pasta para organizar as listas de tarefas.';
    action = <button className="cv2-btn" onClick={onCreateFolder}><Icon name="plus" size={13} /> Pasta</button>;
  } else if (activeClient && activeFolder) {
    title = activeFolder.name;
    sub = 'Esta pasta ainda não tem listas. Crie a primeira lista (com colunas padrão) para começar.';
    action = <button className="cv2-btn" onClick={onCreateList}><Icon name="plus" size={13} /> Lista</button>;
  }

  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div className="cv2-card" style={{ textAlign: 'center', maxWidth: 420 }}>
        <div className="anton" style={{ fontSize: 24 }}>{title}</div>
        <div className="cv2-rule" />
        <div className="cv2-sub">{sub}</div>
        {action && <div style={{ marginTop: 14 }}>{action}</div>}
      </div>
    </div>
  );
}

/* ─── BoardView ──────────────────────────────────────────────── */

function BoardView({ columns, byColumn, dragId, hoverCol, onDragStart, onDrag, onDragEnd, onColDragOver, onColDrop, onOpenDrawer, onDelete, onAddTask, onAddColumn, onRenameColumn, onDeleteColumn }) {
  return (
    <div style={{ display: 'flex', gap: 10, padding: '16px 20px', height: '100%', overflowX: 'auto', overflowY: 'hidden', boxSizing: 'border-box', alignItems: 'flex-start' }}>
      {columns.map(col => (
        <div key={col.id}
             onDragOver={e => onColDragOver(e, col.id)}
             onDrop={e => onColDrop(e, col.id)}
             style={{ minWidth: 240, maxWidth: 260, display: 'flex', flexDirection: 'column', background: hoverCol === col.id ? '#f0eeec' : '#f4f2f0', borderRadius: 8, padding: '10px 8px 8px', flexShrink: 0, maxHeight: '100%', overflow: 'hidden', transition: 'background 120ms', border: '1px solid var(--line)' }}>
          <ColumnHeader col={col} count={byColumn[col.id]?.length || 0} onAddTask={onAddTask} onRename={() => onRenameColumn(col)} onDelete={() => onDeleteColumn(col)} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7, overflowY: 'auto', flex: 1, paddingRight: 2 }}>
            {(byColumn[col.id] || []).map(task => (
              <TaskCard key={task.id} task={task} colColor={col.color} isDragging={dragId === task.id}
                        onDragStart={e => onDragStart(e, task.id)} onDrag={onDrag} onDragEnd={onDragEnd}
                        onOpen={() => onOpenDrawer(task)} onDelete={() => onDelete(task.id)} />
            ))}
            {(byColumn[col.id] || []).length === 0 && (
              <button onClick={onAddTask}
                      style={{ padding: '12px 10px', textAlign: 'center', fontSize: 11.5, color: 'var(--tx2)', border: '1.5px dashed var(--line)', borderRadius: 6, background: 'transparent', cursor: 'pointer', width: '100%' }}>
                + Adicionar tarefa
              </button>
            )}
          </div>
        </div>
      ))}

      {/* + Coluna */}
      <button onClick={onAddColumn}
              style={{ minWidth: 160, flexShrink: 0, alignSelf: 'flex-start', padding: '12px 14px', border: '1.5px dashed var(--line)', borderRadius: 8, background: 'transparent', cursor: 'pointer', color: 'var(--tx2)', fontSize: 12.5, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
        <Icon name="plus" size={13} /> Coluna
      </button>
    </div>
  );
}

function ColumnHeader({ col, count, onAddTask, onRename, onDelete }) {
  const [menu, setMenu] = useState(false);
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 4px 8px', flexShrink: 0, position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: col.color, flexShrink: 0 }} />
        <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--tx)', textTransform: 'uppercase', letterSpacing: 0.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{col.name}</span>
        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--tx2)', background: '#e9e7e4', padding: '1px 7px', borderRadius: 999, flexShrink: 0 }}>{count}</span>
      </div>
      <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
        <button onClick={onAddTask} title="Adicionar tarefa"
                style={{ width: 22, height: 22, borderRadius: 5, border: '1px solid var(--line)', background: 'var(--panel)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--tx2)' }}>
          <Icon name="plus" size={11} />
        </button>
        <button onClick={() => setMenu(m => !m)} title="Mais"
                style={{ width: 22, height: 22, borderRadius: 5, border: '1px solid var(--line)', background: 'var(--panel)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--tx2)' }}>
          <Icon name="more" size={13} />
        </button>
      </div>
      {menu && (
        <>
          <div onClick={() => setMenu(false)} style={{ position: 'fixed', inset: 0, zIndex: 300 }} />
          <div style={{ position: 'absolute', top: 26, right: 0, zIndex: 301, background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 6, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', minWidth: 130, overflow: 'hidden' }}>
            <button onClick={() => { setMenu(false); onRename(); }} style={menuItemStyle}><Icon name="edit" size={12} /> Renomear</button>
            <button onClick={() => { setMenu(false); onDelete(); }} style={{ ...menuItemStyle, color: 'var(--red)' }}><Icon name="trash" size={12} /> Apagar</button>
          </div>
        </>
      )}
    </div>
  );
}

const menuItemStyle = { display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 12px', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 12.5, color: 'var(--tx)', textAlign: 'left' };

/* ─── TaskCard ───────────────────────────────────────────────── */

function TaskCard({ task, colColor, isDragging, onDragStart, onDrag, onDragEnd, onOpen, onDelete }) {
  const [hov, setHov]   = useState(false);
  const [conf, setConf] = useState(false);
  const p = priorityOf(task.priority);

  return (
    <div draggable onDragStart={onDragStart} onDrag={onDrag} onDragEnd={onDragEnd}
         onClick={onOpen} onMouseEnter={() => setHov(true)} onMouseLeave={() => { setHov(false); setConf(false); }}
         className="cv2-card"
         style={{ padding: '10px 10px 9px', cursor: 'pointer', borderLeft: `4px solid ${colColor || '#B70C00'}`, opacity: isDragging ? 0.5 : 1, position: 'relative', userSelect: 'none', boxShadow: hov ? '0 2px 10px rgba(0,0,0,0.08)' : '0 1px 3px rgba(0,0,0,0.05)' }}>
      <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', lineHeight: 1.38, marginBottom: 6, paddingRight: 22 }}>{task.title}</div>
      {task.description && (
        <div style={{ fontSize: 11, color: 'var(--tx2)', lineHeight: 1.4, marginBottom: 6 }}>
          {task.description.slice(0, 72)}{task.description.length > 72 ? '…' : ''}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ fontSize: 9.5, fontWeight: 700, padding: '2px 7px', borderRadius: 999, color: p.color, background: p.bg, letterSpacing: 0.3 }}>{p.label}</span>
          {task.due_date && (
            <span style={{ fontSize: 10, color: 'var(--tx2)', display: 'flex', alignItems: 'center', gap: 3 }}>
              <Icon name="calendar" size={9} /> {task.due_date}
            </span>
          )}
        </div>
        {task.assignee?.full_name && <UserAvatar name={task.assignee.full_name.charAt(0)} size={19} />}
      </div>

      {hov && !isDragging && (
        <div style={{ position: 'absolute', top: 6, right: 6 }} onClick={e => e.stopPropagation()}>
          {!conf ? (
            <button onMouseDown={e => { e.stopPropagation(); setConf(true); }}
                    style={{ width: 22, height: 22, borderRadius: 5, background: '#f4f2f0', border: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--tx2)' }}>
              <Icon name="trash" size={11} />
            </button>
          ) : (
            <button onMouseDown={e => { e.stopPropagation(); onDelete(); }}
                    style={{ height: 22, padding: '0 8px', borderRadius: 5, background: 'var(--red)', border: 'none', color: 'white', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>OK?</button>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── ListView ───────────────────────────────────────────────── */

function ListView({ columns, byColumn, onOpenDrawer }) {
  const empty = columns.every(c => !(byColumn[c.id]?.length));
  if (empty) {
    return (
      <div style={{ padding: 24 }}>
        <div className="cv2-card" style={{ textAlign: 'center', color: 'var(--tx2)' }}>Nenhuma tarefa nesta lista.</div>
      </div>
    );
  }
  return (
    <div style={{ padding: '16px 22px', overflowY: 'auto', height: '100%', boxSizing: 'border-box' }}>
      {columns.map(col => {
        const items = byColumn[col.id] || [];
        if (!items.length) return null;
        return (
          <div key={col.id} style={{ marginBottom: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: col.color }} />
              <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--tx)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{col.name}</span>
              <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--tx2)', background: '#e9e7e4', padding: '1px 7px', borderRadius: 999 }}>{items.length}</span>
            </div>
            <div className="cv2-card" style={{ padding: 0, overflow: 'hidden' }}>
              {items.map((task, i) => {
                const p = priorityOf(task.priority);
                return (
                  <div key={task.id} onClick={() => onOpenDrawer(task)}
                       style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderBottom: i < items.length - 1 ? '1px solid var(--line)' : 'none', cursor: 'pointer', borderLeft: `3px solid ${col.color}` }}
                       onMouseEnter={e => { e.currentTarget.style.background = '#faf9f7'; }}
                       onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
                    <span style={{ flex: 1, fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.title}</span>
                    <span style={{ fontSize: 9.5, fontWeight: 700, padding: '2px 8px', borderRadius: 999, color: p.color, background: p.bg, flexShrink: 0 }}>{p.label}</span>
                    {task.due_date && <span style={{ fontSize: 11, color: 'var(--tx2)', flexShrink: 0 }}>{task.due_date}</span>}
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

function VizView({ columns, byColumn, total, listName }) {
  const doneCol = columns.find(c => c.is_done);
  const done    = doneCol ? (byColumn[doneCol.id]?.length || 0) : 0;
  const pct     = total > 0 ? Math.round((done / total) * 100) : 0;
  const maxCnt  = Math.max(1, ...columns.map(c => byColumn[c.id]?.length || 0));

  return (
    <div style={{ padding: '20px 24px', overflowY: 'auto', height: '100%', boxSizing: 'border-box' }}>
      <div className="cv2-kpis" style={{ marginBottom: 18 }}>
        <div className="cv2-kpi"><div className="n">{total}</div><div className="l">Total</div></div>
        <div className="cv2-kpi"><div className="n">{done}</div><div className="l">Concluídas</div></div>
        <div className="cv2-kpi"><div className="n">{pct}%</div><div className="l">Progresso</div></div>
        <div className="cv2-kpi"><div className="n">{columns.length}</div><div className="l">Colunas</div></div>
      </div>

      <div className="cv2-card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--tx)' }}>Progresso — {listName}</span>
          <span className="anton" style={{ fontSize: 18, color: 'var(--green)' }}>{pct}%</span>
        </div>
        <div style={{ height: 10, borderRadius: 999, background: '#eceae7', overflow: 'hidden' }}>
          <div style={{ height: '100%', borderRadius: 999, background: 'var(--green)', width: `${pct}%`, transition: 'width 500ms ease' }} />
        </div>
      </div>

      <div className="cv2-card">
        <div className="anton" style={{ fontSize: 13, marginBottom: 14 }}>TAREFAS POR COLUNA</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          {columns.map(col => {
            const cnt = byColumn[col.id]?.length || 0;
            const w   = Math.round((cnt / maxCnt) * 100);
            return (
              <div key={col.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 11.5, color: 'var(--tx2)', width: 100, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{col.name}</span>
                <div style={{ flex: 1, height: 13, borderRadius: 999, background: '#eceae7', overflow: 'hidden' }}>
                  <div style={{ height: '100%', borderRadius: 999, background: col.color, width: `${w}%`, transition: 'width 450ms ease', opacity: cnt > 0 ? 1 : 0.2 }} />
                </div>
                <span style={{ fontSize: 12, fontWeight: 700, color: cnt > 0 ? col.color : '#ccc', width: 22, textAlign: 'right', flexShrink: 0 }}>{cnt}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ─── TaskDrawer ─────────────────────────────────────────────── */

function TaskDrawer({ task, columns, onUpdate, onMove, onDelete, onClose }) {
  const [title, setTitle] = useState(task.title || '');
  const [desc,  setDesc]  = useState(task.description || '');
  const [colId, setColId] = useState(task.column_id || (columns[0]?.id ?? ''));
  const [prio,  setPr]    = useState(task.priority || 'normal');
  const [due,   setDue]   = useState(task.due_date || '');
  const [assignee, setAssignee] = useState(task.assignee?.full_name || task.assignee || '');
  const [dirty, setDirty] = useState(false);

  const col = columns.find(c => c.id === colId) || columns[0];

  function mark() { setDirty(true); }
  function save() {
    if (!title.trim()) return;
    onUpdate({ title: title.trim(), description: desc, priority: prio, due_date: due || null, assignee: assignee || null });
    setDirty(false);
  }
  function changeColumn(newCol) {
    setColId(newCol);
    onMove(newCol);
  }

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.18)', zIndex: 400 }} />
      <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 450, background: 'var(--panel)', borderLeft: '1px solid var(--line)', zIndex: 401, display: 'flex', flexDirection: 'column', boxShadow: '-12px 0 40px rgba(0,0,0,0.1)' }}>
        {/* Header */}
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--line)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: col?.color || '#B70C00' }} />
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--tx)' }}>{col?.name}</span>
          </div>
          <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
            {dirty && <button onClick={save} className="cv2-btn" style={{ fontSize: 12, padding: '5px 12px' }}>Salvar</button>}
            <button onClick={onDelete} className="cv2-btn sec" title="Excluir" style={{ padding: '6px 8px' }}><Icon name="trash" size={13} /></button>
            <button onClick={onClose} className="cv2-btn sec" style={{ padding: '6px 8px' }}><Icon name="x" size={13} /></button>
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 18 }}>
          <textarea value={title} onChange={e => { setTitle(e.target.value); mark(); }} onBlur={save} rows={2} placeholder="Título da tarefa"
                    style={{ width: '100%', fontSize: 18, fontWeight: 700, color: 'var(--ink)', border: 'none', background: 'transparent', resize: 'none', lineHeight: 1.3, outline: 'none', boxSizing: 'border-box', marginBottom: 18 }} />

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '14px 16px', background: '#faf9f7', borderRadius: 8, marginBottom: 18, border: '1px solid var(--line)' }}>
            <Field label="Coluna">
              <select className="input" style={{ fontSize: 12, padding: '5px 8px' }} value={colId} onChange={e => changeColumn(e.target.value)}>
                {columns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
            <Field label="Prioridade">
              <select className="input" style={{ fontSize: 12, padding: '5px 8px' }} value={prio} onChange={e => { setPr(e.target.value); mark(); }}>
                {PRIORITIES.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </Field>
            <Field label="Prazo">
              <input type="date" className="input" style={{ fontSize: 12, padding: '5px 8px' }} value={due} onChange={e => { setDue(e.target.value); mark(); }} />
            </Field>
            <Field label="Responsável">
              <select className="input" style={{ fontSize: 12, padding: '5px 8px' }} value={assignee} onChange={e => { setAssignee(e.target.value); mark(); }}>
                <option value="">— Ninguém —</option>
                {MEMBERS.map(m => <option key={m.avatar || m.name} value={m.name}>{m.name}</option>)}
              </select>
            </Field>
          </div>

          <div className="anton" style={{ fontSize: 12, color: 'var(--tx2)', marginBottom: 6 }}>Descrição</div>
          <textarea className="input" rows={6} placeholder="Contexto, links, detalhes…" value={desc} onChange={e => { setDesc(e.target.value); mark(); }} onBlur={save}
                    style={{ resize: 'vertical', lineHeight: 1.55, fontSize: 13, width: '100%', boxSizing: 'border-box' }} />
        </div>
      </div>
    </>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ fontSize: 11.5, color: 'var(--tx2)', width: 90, flexShrink: 0, fontWeight: 500 }}>{label}</span>
      {children}
    </div>
  );
}

/* ─── NewTaskModal ───────────────────────────────────────────── */

function NewTaskModal({ columns, listName, onSave, onClose }) {
  const [form, setForm] = useState({ title: '', description: '', column_id: columns[0]?.id ?? '', priority: 'normal', due_date: '', assignee: '' });
  const [err, setErr]   = useState('');

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }
  function submit() {
    if (!form.title.trim()) { setErr('Título obrigatório.'); return; }
    onSave({ ...form, assignee: form.assignee || null, due_date: form.due_date || null });
  }

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 500 }} />
      <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', background: 'var(--panel)', borderRadius: 10, padding: 28, zIndex: 501, width: 470, boxShadow: '0 24px 64px rgba(0,0,0,0.2)', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 22 }}>
          <div>
            <div className="anton" style={{ fontSize: 20 }}>NOVA TAREFA</div>
            {listName && <div style={{ fontSize: 12, color: 'var(--tx2)', fontWeight: 600, marginTop: 3 }}>{listName}</div>}
          </div>
          <button onClick={onClose} className="cv2-btn sec" style={{ padding: '6px 8px' }}><Icon name="x" size={14} /></button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={labelStyle}>Título *</label>
            <input className="input" autoFocus placeholder="Ex: Revisar cardápio iFood" value={form.title} onChange={e => set('title', e.target.value)} onKeyDown={e => e.key === 'Enter' && submit()} />
            {err && <div style={{ fontSize: 11, color: 'var(--red)', marginTop: 3 }}>{err}</div>}
          </div>

          <div>
            <label style={labelStyle}>Descrição</label>
            <textarea className="input" rows={2} placeholder="Detalhes…" value={form.description} onChange={e => set('description', e.target.value)} style={{ resize: 'vertical' }} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={labelStyle}>Coluna</label>
              <select className="input" value={form.column_id} onChange={e => set('column_id', e.target.value)}>
                {columns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Prioridade</label>
              <select className="input" value={form.priority} onChange={e => set('priority', e.target.value)}>
                {PRIORITIES.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={labelStyle}>Prazo</label>
              <input type="date" className="input" value={form.due_date} onChange={e => set('due_date', e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>Responsável</label>
              <select className="input" value={form.assignee} onChange={e => set('assignee', e.target.value)}>
                <option value="">— Ninguém —</option>
                {MEMBERS.map(m => <option key={m.avatar || m.name} value={m.name}>{m.name}</option>)}
              </select>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 22, justifyContent: 'flex-end' }}>
          <button onClick={onClose} className="cv2-btn sec">Cancelar</button>
          <button onClick={submit} className="cv2-btn"><Icon name="plus" size={13} /> Criar tarefa</button>
        </div>
      </div>
    </>
  );
}

const labelStyle = { fontSize: 11, fontWeight: 700, color: 'var(--tx2)', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 6 };
