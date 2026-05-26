import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import Icon from '../components/Icon.jsx';
import UserAvatar from '../components/UserAvatar.jsx';
import { supabase } from '../lib/supabase.js';

const BRIDGE = import.meta.env.VITE_BRIDGE_URL || 'https://bridge.consultdelivery.com.br';

async function bridgeFetch(path, options = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(`${BRIDGE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session?.access_token}`,
      ...options.headers,
    },
  });
  const body = await res.json().catch(() => ({ error: res.statusText }));
  if (res.status >= 400) throw new Error(body.error || res.statusText);
  return body;
}

// ── Constantes ─────────────────────────────────────────────────────────────────

const BOARD_COLS = [
  { id: 'rascunho',   label: 'Rascunho',    color: '#6B7280', bg: 'rgba(107,114,128,0.1)' },
  { id: 'aprovada',   label: 'Aprovada',    color: '#2563EB', bg: 'rgba(37,99,235,0.1)'   },
  { id: 'em_execucao',label: 'Em Execução', color: '#D97706', bg: 'rgba(217,119,6,0.1)'   },
  { id: 'concluida',  label: 'Concluída',   color: '#059669', bg: 'rgba(5,150,105,0.1)'   },
];

const STATUS_LABEL = {
  rascunho:              { label: 'Rascunho',          cls: 'badge-gray'   },
  aguardando_envio:      { label: 'Ag. Envio',         cls: 'badge-gray'   },
  aguardando_aprovacao:  { label: 'Ag. Aprovação',     cls: 'badge-yellow' },
  aprovada:              { label: 'Aprovada',           cls: 'badge-blue'   },
  rejeitada:             { label: 'Rejeitada',          cls: 'badge-red'    },
  em_execucao:           { label: 'Em Execução',        cls: 'badge-yellow' },
  aguardando_validacao:  { label: 'Ag. Validação',     cls: 'badge-yellow' },
  concluida:             { label: 'Concluída',          cls: 'badge-green'  },
  cancelada:             { label: 'Cancelada',          cls: 'badge-gray'   },
};

const PRIORIDADE_LABEL = {
  quick_win:        { label: 'Quick Win',       cls: 'badge-green'  },
  estrutural:       { label: 'Estrutural',      cls: 'badge-blue'   },
  material_cliente: { label: 'Mat. Cliente',    cls: 'badge-yellow' },
};

const BLOCOS = ['identidade','cardapio','operacao','avaliacoes','marketing','suporte'];
const PRIORIDADES = ['quick_win','estrutural','material_cliente'];

// ── Main ───────────────────────────────────────────────────────────────────────

export default function TasksScreen({ tenantDbId, userId }) {
  const [view, setView] = useState('lista');

  // filtros
  const [filtroLoja,        setFiltroLoja]        = useState('');
  const [filtroStatus,      setFiltroStatus]      = useState('');
  const [filtroPrioridade,  setFiltroPrioridade]  = useState('');
  const [filtroPrazoDe,     setFiltroPrazoDe]     = useState('');
  const [filtroPrazoAte,    setFiltroPrazoAte]    = useState('');

  // lojas disponíveis para filtro
  const [lojas, setLojas] = useState([]);

  // lista / board
  const [tarefas,  setTarefas]  = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [page,     setPage]     = useState(0);
  const [hasMore,  setHasMore]  = useState(false);
  const LIMIT = 50;

  // calendário
  const [calMonth, setCalMonth] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  const [calData,   setCalData]   = useState({});
  const [calLoading,setCalLoading]= useState(false);
  const [calModal,  setCalModal]  = useState(null); // { date, tarefas[] }

  // modal nova tarefa
  const [showModal,  setShowModal]  = useState(false);
  const [sortCol,    setSortCol]    = useState('created_at');
  const [sortDir,    setSortDir]    = useState('desc');

  // drag board
  const [dragId,   setDragId]   = useState(null);
  const [hoverCol, setHoverCol] = useState(null);
  const [ghostPos, setGhostPos] = useState(null);

  // Carregar lojas do tenant
  useEffect(() => {
    if (!tenantDbId) return;
    supabase.from('lojas').select('id,nome').eq('tenant_id', tenantDbId).order('nome')
      .then(({ data }) => setLojas(data || []))
      .catch(() => {});
  }, [tenantDbId]);

  // Carregar tarefas (lista/board)
  const loadTarefas = useCallback(async (resetPage = false) => {
    if (!tenantDbId) return;
    setLoading(true);
    const offset = resetPage ? 0 : page * LIMIT;
    const params = new URLSearchParams({ limit: LIMIT, offset });
    if (filtroLoja)       params.set('loja_id',   filtroLoja);
    if (filtroStatus)     params.set('status',    filtroStatus);
    if (filtroPrioridade) params.set('prioridade',filtroPrioridade);
    if (filtroPrazoDe)    params.set('prazo_de',  filtroPrazoDe);
    if (filtroPrazoAte)   params.set('prazo_ate', filtroPrazoAte);
    try {
      const data = await bridgeFetch(`/api/tarefas?${params.toString()}`);
      if (resetPage) {
        setTarefas(data.tarefas || []);
        setPage(0);
      } else {
        setTarefas(prev => [...prev, ...(data.tarefas || [])]);
      }
      setHasMore(data.has_more);
    } catch (e) {
      console.error('[TasksScreen] loadTarefas:', e.message);
    } finally {
      setLoading(false);
    }
  }, [tenantDbId, filtroLoja, filtroStatus, filtroPrioridade, filtroPrazoDe, filtroPrazoAte, page]);

  useEffect(() => { if (view !== 'calendario') loadTarefas(true); }, [
    tenantDbId, filtroLoja, filtroStatus, filtroPrioridade, filtroPrazoDe, filtroPrazoAte, view,
  ]);

  // Carregar calendário
  const loadCalendario = useCallback(async () => {
    if (!tenantDbId) return;
    setCalLoading(true);
    const { year, month } = calMonth;
    const inicio = `${year}-${String(month + 1).padStart(2,'0')}-01`;
    const lastDay = new Date(year, month + 1, 0).getDate();
    const fim = `${year}-${String(month + 1).padStart(2,'0')}-${lastDay}`;
    const params = new URLSearchParams({ inicio, fim });
    if (filtroLoja) params.set('loja_id', filtroLoja);
    try {
      const data = await bridgeFetch(`/api/tarefas/calendario?${params.toString()}`);
      setCalData(data.por_data || {});
    } catch (e) {
      console.error('[TasksScreen] loadCalendario:', e.message);
    } finally {
      setCalLoading(false);
    }
  }, [tenantDbId, calMonth, filtroLoja]);

  useEffect(() => { if (view === 'calendario') loadCalendario(); }, [view, calMonth, tenantDbId, filtroLoja]);

  // Sort
  const sorted = useMemo(() => {
    return [...tarefas].sort((a, b) => {
      const va = a[sortCol] ?? '';
      const vb = b[sortCol] ?? '';
      const cmp = String(va).localeCompare(String(vb), 'pt-BR');
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [tarefas, sortCol, sortDir]);

  function toggleSort(col) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('asc'); }
  }

  // Board PATCH status
  async function moveCard(id, newStatus) {
    setTarefas(ts => ts.map(t => t.id === id ? { ...t, status: newStatus } : t));
    try {
      await bridgeFetch(`/api/tarefas/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus }),
      });
    } catch (e) {
      console.error('[TasksScreen] moveCard:', e.message);
      loadTarefas(true);
    }
  }

  // Drag handlers
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
  const onColDrop = (e, colId) => {
    e.preventDefault();
    if (!dragId) return;
    moveCard(dragId, colId);
    onDragEnd();
  };

  const draggingTask = tarefas.find(t => t.id === dragId);
  const ativas = tarefas.filter(t => t.status !== 'concluida' && t.status !== 'cancelada').length;

  return (
    <div className="route-enter" style={{ padding: 24, height:'calc(100vh - 64px)', display:'flex', flexDirection:'column', background:'var(--g-50)', overflow:'hidden' }}>

      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-end', marginBottom: 16 }}>
        <div>
          <h1 className="page-h1">Todas as Tarefas</h1>
          <p className="page-sub">{tarefas.length} tarefas · {ativas} ativas</p>
        </div>
        <div style={{ display:'flex', gap: 8, alignItems:'center' }}>
          <ViewToggle view={view} setView={setView}/>
          <button className="btn-primary" onClick={() => setShowModal(true)}>
            <Icon name="plus" size={14}/> Nova Tarefa
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div style={{ display:'flex', gap: 8, marginBottom: 16, flexWrap:'wrap', alignItems:'center' }}>
        <select className="filter-select" value={filtroLoja} onChange={e => setFiltroLoja(e.target.value)}>
          <option value="">Todas as lojas</option>
          {lojas.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
        </select>
        <select className="filter-select" value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)}>
          <option value="">Todos os status</option>
          {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select className="filter-select" value={filtroPrioridade} onChange={e => setFiltroPrioridade(e.target.value)}>
          <option value="">Todas as prioridades</option>
          {PRIORIDADES.map(p => <option key={p} value={p}>{PRIORIDADE_LABEL[p].label}</option>)}
        </select>
        <input type="date" className="filter-select" value={filtroPrazoDe} onChange={e => setFiltroPrazoDe(e.target.value)} style={{ width: 130 }}/>
        <input type="date" className="filter-select" value={filtroPrazoAte} onChange={e => setFiltroPrazoAte(e.target.value)} style={{ width: 130 }}/>
        {(filtroLoja||filtroStatus||filtroPrioridade||filtroPrazoDe||filtroPrazoAte) && (
          <button className="btn-secondary" style={{ fontSize: 12 }} onClick={() => {
            setFiltroLoja(''); setFiltroStatus(''); setFiltroPrioridade('');
            setFiltroPrazoDe(''); setFiltroPrazoAte('');
          }}>
            <Icon name="x" size={11}/> Limpar
          </button>
        )}
      </div>

      {/* Views */}
      <div style={{ flex: 1, overflow:'hidden', position:'relative' }}>
        {loading && tarefas.length === 0 && (
          <div style={{ display:'flex', justifyContent:'center', alignItems:'center', height: '100%', color:'var(--g-400)' }}>
            Carregando...
          </div>
        )}

        {view === 'lista' && !loading && (
          <ListaView
            tarefas={sorted}
            sortCol={sortCol}
            sortDir={sortDir}
            toggleSort={toggleSort}
            page={page}
            setPage={setPage}
            hasMore={hasMore}
            loadMore={() => { const np = page + 1; setPage(np); loadTarefas(false); }}
          />
        )}

        {view === 'board' && (
          <BoardView
            tarefas={tarefas}
            dragId={dragId}
            hoverCol={hoverCol}
            setHoverCol={setHoverCol}
            onDragStart={onDragStart}
            onDrag={onDrag}
            onDragEnd={onDragEnd}
            onColDrop={onColDrop}
          />
        )}

        {view === 'calendario' && (
          <CalendarioView
            calMonth={calMonth}
            setCalMonth={setCalMonth}
            calData={calData}
            calLoading={calLoading}
            calModal={calModal}
            setCalModal={setCalModal}
          />
        )}
      </div>

      {/* Drag ghost */}
      {draggingTask && ghostPos && (
        <div className="task-card drag-ghost" style={{ left: ghostPos.x - 130, top: ghostPos.y - 30, position:'fixed', zIndex: 9999, pointerEvents:'none' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color:'var(--g-900)' }}>{draggingTask.titulo}</div>
        </div>
      )}

      {/* Modal nova tarefa */}
      {showModal && (
        <NovaTarefaModal
          lojas={lojas}
          onClose={() => setShowModal(false)}
          onCreated={() => { setShowModal(false); loadTarefas(true); }}
        />
      )}
    </div>
  );
}

// ── ViewToggle ─────────────────────────────────────────────────────────────────

function ViewToggle({ view, setView }) {
  const views = [
    { id: 'lista',      icon: 'list',    label: 'Lista'      },
    { id: 'board',      icon: 'columns', label: 'Board'      },
    { id: 'calendario', icon: 'calendar',label: 'Calendário' },
  ];
  return (
    <div style={{ display:'flex', background:'var(--g-100)', borderRadius: 6, padding: 2, gap: 2 }}>
      {views.map(v => (
        <button
          key={v.id}
          onClick={() => setView(v.id)}
          style={{
            padding: '5px 10px', fontSize: 12, fontWeight: 600, border: 'none', cursor:'pointer',
            borderRadius: 5, display:'flex', alignItems:'center', gap: 5,
            background: view === v.id ? 'white' : 'transparent',
            color: view === v.id ? 'var(--g-900)' : 'var(--g-500)',
            boxShadow: view === v.id ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
          }}
        >
          <Icon name={v.icon} size={12}/>{v.label}
        </button>
      ))}
    </div>
  );
}

// ── Lista View ─────────────────────────────────────────────────────────────────

function ListaView({ tarefas, sortCol, sortDir, toggleSort, hasMore, loadMore }) {
  const cols = [
    { key: 'titulo',         label: 'Título'       },
    { key: 'loja_nome',      label: 'Loja'         },
    { key: 'bloco',          label: 'Bloco'        },
    { key: 'prioridade',     label: 'Prioridade'   },
    { key: 'status',         label: 'Status'       },
    { key: 'prazo_estimado', label: 'Prazo'        },
  ];

  return (
    <div style={{ height:'100%', overflowY:'auto' }} className="scroll">
      <table style={{ width:'100%', borderCollapse:'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ background:'var(--g-100)', position:'sticky', top: 0, zIndex: 1 }}>
            {cols.map(c => (
              <th
                key={c.key}
                onClick={() => toggleSort(c.key)}
                style={{ padding:'8px 12px', textAlign:'left', fontWeight:700, fontSize:11, color:'var(--g-600)', cursor:'pointer', userSelect:'none', whiteSpace:'nowrap' }}
              >
                {c.label}
                {sortCol === c.key && <span style={{ marginLeft: 4 }}>{sortDir === 'asc' ? '↑' : '↓'}</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {tarefas.length === 0 && (
            <tr><td colSpan={cols.length} style={{ padding: 32, textAlign:'center', color:'var(--g-400)' }}>Nenhuma tarefa encontrada</td></tr>
          )}
          {tarefas.map(t => {
            const s = STATUS_LABEL[t.status] || { label: t.status, cls: 'badge-gray' };
            const p = PRIORIDADE_LABEL[t.prioridade] || { label: t.prioridade, cls: 'badge-gray' };
            return (
              <tr key={t.id} style={{ borderBottom:'1px solid var(--g-200)', background:'white' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--g-50)'}
                onMouseLeave={e => e.currentTarget.style.background = 'white'}
              >
                <td style={{ padding:'8px 12px', fontWeight: 500, maxWidth: 320 }}>
                  <div style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{t.titulo}</div>
                </td>
                <td style={{ padding:'8px 12px', color:'var(--g-600)', fontSize: 12 }}>{t.loja_nome || '—'}</td>
                <td style={{ padding:'8px 12px', color:'var(--g-600)', fontSize: 12, textTransform:'capitalize' }}>{t.bloco || '—'}</td>
                <td style={{ padding:'8px 12px' }}><span className={`badge ${p.cls}`}>{p.label}</span></td>
                <td style={{ padding:'8px 12px' }}><span className={`badge ${s.cls}`}>{s.label}</span></td>
                <td style={{ padding:'8px 12px', color: t.prazo_estimado ? 'var(--g-700)' : 'var(--g-400)', fontSize: 12 }}>
                  {t.prazo_estimado || '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {hasMore && (
        <div style={{ padding: 16, textAlign:'center' }}>
          <button className="btn-secondary" onClick={loadMore}>Carregar mais</button>
        </div>
      )}
    </div>
  );
}

// ── Board View ─────────────────────────────────────────────────────────────────

function BoardView({ tarefas, dragId, hoverCol, setHoverCol, onDragStart, onDrag, onDragEnd, onColDrop }) {
  const byCol = useMemo(() => {
    const g = {};
    BOARD_COLS.forEach(c => { g[c.id] = []; });
    tarefas.forEach(t => {
      const col = BOARD_COLS.find(c => c.id === t.status) ? t.status : 'rascunho';
      g[col].push(t);
    });
    return g;
  }, [tarefas]);

  return (
    <div style={{ display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap: 12, height:'100%', overflow:'hidden' }}>
      {BOARD_COLS.map(col => (
        <div
          key={col.id}
          className={`kanban-col scroll ${hoverCol === col.id ? 'drop-hover' : ''}`}
          style={{ display:'flex', flexDirection:'column', overflowY:'auto', height:'100%' }}
          onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (hoverCol !== col.id) setHoverCol(col.id); }}
          onDragLeave={() => setHoverCol(null)}
          onDrop={e => onColDrop(e, col.id)}
        >
          <div style={{ display:'flex', alignItems:'center', gap: 8, padding:'4px 6px 10px', position:'sticky', top: 0, background:'var(--g-50)' }}>
            <span style={{ width: 10, height: 10, borderRadius:'50%', background: col.color }}/>
            <span style={{ fontSize: 12, fontWeight: 700, color:'var(--g-900)', textTransform:'uppercase', letterSpacing: 0.3 }}>{col.label}</span>
            <span style={{ fontSize: 11, color:'var(--g-500)', background:'white', padding:'1px 7px', borderRadius: 9999 }}>{byCol[col.id].length}</span>
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap: 8 }}>
            {byCol[col.id].map(t => (
              <BoardCard key={t.id} task={t} isDragging={dragId === t.id}
                onDragStart={e => onDragStart(e, t.id)}
                onDrag={onDrag}
                onDragEnd={onDragEnd}
              />
            ))}
            {byCol[col.id].length === 0 && (
              <div style={{ padding: 16, textAlign:'center', fontSize: 12, color:'var(--g-400)', border:'2px dashed var(--g-300)', borderRadius: 6 }}>
                Arraste aqui
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function BoardCard({ task, isDragging, onDragStart, onDrag, onDragEnd }) {
  const p = PRIORIDADE_LABEL[task.prioridade] || { label: task.prioridade, cls: 'badge-gray' };
  return (
    <div
      className={`task-card ${isDragging ? 'dragging' : ''}`}
      draggable
      onDragStart={onDragStart}
      onDrag={onDrag}
      onDragEnd={onDragEnd}
    >
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: 6 }}>
        <span className={`badge ${p.cls}`} style={{ fontSize: 10 }}>{p.label}</span>
        {task.loja_nome && <span style={{ fontSize: 10, color:'var(--g-500)' }}>{task.loja_nome}</span>}
      </div>
      <div style={{ fontSize: 12, fontWeight: 600, color:'var(--g-900)', lineHeight: 1.35, marginBottom: 6 }}>{task.titulo}</div>
      {task.prazo_estimado && (
        <div style={{ fontSize: 11, color:'var(--g-500)', display:'flex', alignItems:'center', gap: 4 }}>
          <Icon name="calendar" size={10}/>{task.prazo_estimado}
        </div>
      )}
    </div>
  );
}

// ── Calendário View ────────────────────────────────────────────────────────────

function CalendarioView({ calMonth, setCalMonth, calData, calLoading, calModal, setCalModal }) {
  const { year, month } = calMonth;
  const monthNames = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();
  const isToday = (d) => d === today.getDate() && month === today.getMonth() && year === today.getFullYear();

  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const dateKey = (d) => `${year}-${String(month + 1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;

  return (
    <div style={{ height:'100%', display:'flex', flexDirection:'column' }}>
      {/* Nav */}
      <div style={{ display:'flex', alignItems:'center', gap: 16, marginBottom: 12 }}>
        <button className="btn-icon" onClick={() => setCalMonth(m => {
          const d = new Date(m.year, m.month - 1, 1);
          return { year: d.getFullYear(), month: d.getMonth() };
        })}><Icon name="chevleft" size={14}/></button>
        <span style={{ fontWeight: 700, fontSize: 15, minWidth: 160, textAlign:'center' }}>
          {monthNames[month]} {year}
        </span>
        <button className="btn-icon" onClick={() => setCalMonth(m => {
          const d = new Date(m.year, m.month + 1, 1);
          return { year: d.getFullYear(), month: d.getMonth() };
        })}><Icon name="arrowright" size={14}/></button>
        {calLoading && <span style={{ fontSize: 12, color:'var(--g-400)' }}>Carregando...</span>}
      </div>

      {/* Header dias */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap: 2, marginBottom: 2 }}>
        {['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'].map(d => (
          <div key={d} style={{ textAlign:'center', fontSize: 11, fontWeight: 700, color:'var(--g-500)', padding:'4px 0' }}>{d}</div>
        ))}
      </div>

      {/* Grid */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap: 2, flex: 1, overflowY:'auto' }}>
        {cells.map((d, i) => {
          if (!d) return <div key={`empty-${i}`}/>;
          const key = dateKey(d);
          const items = calData[key] || [];
          const hasItems = items.length > 0;
          return (
            <div
              key={key}
              onClick={() => hasItems && setCalModal({ date: key, tarefas: items })}
              style={{
                minHeight: 70, padding: 6, borderRadius: 6, border:'1px solid var(--g-200)',
                background: isToday(d) ? 'rgba(183,12,0,0.05)' : 'white',
                cursor: hasItems ? 'pointer' : 'default',
                position:'relative',
              }}
              onMouseEnter={e => { if (hasItems) e.currentTarget.style.background = 'var(--g-50)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = isToday(d) ? 'rgba(183,12,0,0.05)' : 'white'; }}
            >
              <div style={{
                fontSize: 12, fontWeight: isToday(d) ? 700 : 500,
                color: isToday(d) ? 'var(--red)' : 'var(--g-700)',
                marginBottom: 4,
              }}>{d}</div>
              {items.slice(0,3).map(t => {
                const s = STATUS_LABEL[t.status] || {};
                return (
                  <div key={t.id} style={{
                    fontSize: 10, lineHeight: 1.2, padding:'2px 4px', borderRadius: 3,
                    background: t.status === 'concluida' ? 'rgba(5,150,105,0.1)' : 'rgba(37,99,235,0.1)',
                    color: t.status === 'concluida' ? '#059669' : '#2563EB',
                    marginBottom: 2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
                  }}>
                    {t.titulo}
                  </div>
                );
              })}
              {items.length > 3 && (
                <div style={{ fontSize: 10, color:'var(--g-500)' }}>+{items.length - 3} mais</div>
              )}
            </div>
          );
        })}
      </div>

      {/* Modal dia */}
      {calModal && (
        <div style={{ position:'fixed', inset: 0, background:'rgba(0,0,0,0.4)', zIndex: 1000, display:'flex', alignItems:'center', justifyContent:'center' }}
          onClick={() => setCalModal(null)}>
          <div style={{ background:'white', borderRadius: 10, padding: 24, minWidth: 320, maxWidth: 500, maxHeight:'70vh', overflowY:'auto' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: 16 }}>
              <h3 style={{ fontWeight: 700, fontSize: 15 }}>Tarefas — {calModal.date}</h3>
              <button className="btn-icon" onClick={() => setCalModal(null)}><Icon name="x" size={14}/></button>
            </div>
            {calModal.tarefas.map(t => {
              const s = STATUS_LABEL[t.status] || { label: t.status, cls: 'badge-gray' };
              const p = PRIORIDADE_LABEL[t.prioridade] || { label: t.prioridade, cls: 'badge-gray' };
              return (
                <div key={t.id} style={{ padding:'10px 0', borderBottom:'1px solid var(--g-100)' }}>
                  <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>{t.titulo}</div>
                  <div style={{ display:'flex', gap: 6 }}>
                    <span className={`badge ${s.cls}`}>{s.label}</span>
                    <span className={`badge ${p.cls}`}>{p.label}</span>
                    {t.loja_nome && <span style={{ fontSize: 11, color:'var(--g-500)' }}>{t.loja_nome}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Modal Nova Tarefa ──────────────────────────────────────────────────────────

function NovaTarefaModal({ lojas, onClose, onCreated }) {
  const [form, setForm] = useState({
    loja_id: lojas[0]?.id || '',
    titulo: '',
    bloco: 'identidade',
    o_que_sera_feito: '',
    prioridade: 'estrutural',
    prazo_estimado: '',
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.loja_id) { setErr('Selecione uma loja'); return; }
    if (!form.titulo.trim()) { setErr('Título obrigatório'); return; }
    if (!form.o_que_sera_feito.trim()) { setErr('Descrição obrigatória'); return; }
    setSaving(true);
    setErr('');
    try {
      await bridgeFetch(`/api/tarefas/loja/${form.loja_id}`, {
        method: 'POST',
        body: JSON.stringify({
          titulo:           form.titulo.trim(),
          bloco:            form.bloco,
          situacao:         form.o_que_sera_feito.trim(),
          o_que_sera_feito: form.o_que_sera_feito.trim(),
          prioridade:       form.prioridade,
          prazo_estimado:   form.prazo_estimado || null,
        }),
      });
      onCreated();
    } catch (e) {
      setErr(e.message);
      setSaving(false);
    }
  }

  return (
    <div style={{ position:'fixed', inset: 0, background:'rgba(0,0,0,0.5)', zIndex: 1000, display:'flex', alignItems:'center', justifyContent:'center' }}
      onClick={onClose}>
      <div style={{ background:'white', borderRadius: 12, padding: 28, width: 480, maxWidth:'95vw' }}
        onClick={e => e.stopPropagation()}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: 20 }}>
          <h2 style={{ fontWeight: 700, fontSize: 16 }}>Nova Tarefa</h2>
          <button className="btn-icon" onClick={onClose}><Icon name="x" size={16}/></button>
        </div>
        <form onSubmit={handleSubmit}>
          <Field label="Loja">
            <select className="filter-select" style={{ width:'100%' }} value={form.loja_id} onChange={e => set('loja_id', e.target.value)}>
              {lojas.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
            </select>
          </Field>
          <Field label="Título">
            <input type="text" style={{ width:'100%', padding:'6px 10px', border:'1px solid var(--g-300)', borderRadius: 6, fontSize: 13 }}
              value={form.titulo} onChange={e => set('titulo', e.target.value)} placeholder="Título da tarefa"/>
          </Field>
          <Field label="Bloco">
            <select className="filter-select" style={{ width:'100%' }} value={form.bloco} onChange={e => set('bloco', e.target.value)}>
              {BLOCOS.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </Field>
          <Field label="O que será feito">
            <textarea style={{ width:'100%', padding:'6px 10px', border:'1px solid var(--g-300)', borderRadius: 6, fontSize: 13, resize:'vertical', minHeight: 80 }}
              value={form.o_que_sera_feito} onChange={e => set('o_que_sera_feito', e.target.value)} placeholder="Descreva o que será feito"/>
          </Field>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap: 12 }}>
            <Field label="Prioridade">
              <select className="filter-select" style={{ width:'100%' }} value={form.prioridade} onChange={e => set('prioridade', e.target.value)}>
                {PRIORIDADES.map(p => <option key={p} value={p}>{PRIORIDADE_LABEL[p].label}</option>)}
              </select>
            </Field>
            <Field label="Prazo estimado">
              <input type="date" style={{ width:'100%', padding:'6px 10px', border:'1px solid var(--g-300)', borderRadius: 6, fontSize: 13 }}
                value={form.prazo_estimado} onChange={e => set('prazo_estimado', e.target.value)}/>
            </Field>
          </div>
          {err && <div style={{ color:'var(--red)', fontSize: 12, marginBottom: 8 }}>{err}</div>}
          <div style={{ display:'flex', gap: 8, justifyContent:'flex-end', marginTop: 8 }}>
            <button type="button" className="btn-secondary" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Salvando...' : 'Criar Tarefa'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display:'block', fontSize: 11, fontWeight: 700, color:'var(--g-600)', marginBottom: 4 }}>{label}</label>
      {children}
    </div>
  );
}
