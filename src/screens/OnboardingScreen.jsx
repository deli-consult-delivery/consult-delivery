import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase.js';
import Icon from '../components/Icon.jsx';
import OnboardingDetalhe from './OnboardingDetalhe.jsx';

const PAGE_SIZE = 20;
const MARCOS    = ['D1', 'D7', 'D30', 'D60', 'D90'];

const STATUS_META = {
  pendente:     { label: 'Pendente',     color: '#6B7280', bg: 'rgba(107,114,128,0.12)' },
  em_andamento: { label: 'Em andamento', color: '#2563EB', bg: 'rgba(37,99,235,0.12)'  },
  concluido:    { label: 'Concluído',    color: '#059669', bg: 'rgba(5,150,105,0.12)'  },
};

function Badge({ status }) {
  const m = STATUS_META[status] || STATUS_META.pendente;
  return (
    <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 4, color: m.color, background: m.bg, whiteSpace: 'nowrap' }}>
      {m.label}
    </span>
  );
}

function ProgressBar({ done, total }) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, height: 6, background: 'rgba(255,255,255,0.1)', borderRadius: 3 }}>
        <div style={{ width: `${pct}%`, height: '100%', borderRadius: 3, background: pct === 100 ? '#059669' : '#B70C00', transition: 'width 0.3s' }} />
      </div>
      <span style={{ fontSize: 11, color: '#9CA3AF', minWidth: 30 }}>{pct}%</span>
    </div>
  );
}

/* ─── Screen root com view interna ─────────────────────────────── */

export default function OnboardingScreen({ tenantDbId }) {
  const [view,         setView]    = useState('list');
  const [customerId,   setCid]     = useState(null);
  const [customerName, setCname]   = useState('');

  function openDetalhe(id, name) { setCid(id); setCname(name); setView('detalhe'); }

  if (view === 'detalhe') {
    return (
      <OnboardingDetalhe
        tenantDbId={tenantDbId}
        customerId={customerId}
        customerName={customerName}
        onBack={() => setView('list')}
      />
    );
  }

  return <OnboardingList tenantDbId={tenantDbId} onOpen={openDetalhe} />;
}

/* ─── Lista ─────────────────────────────────────────────────────── */

function OnboardingList({ tenantDbId, onOpen }) {
  const [rows,        setRows]        = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [search,      setSearch]      = useState('');
  const [filterStatus,setFilterStatus]= useState('');
  const [filterMarco, setFilterMarco] = useState('');
  const [page,        setPage]        = useState(0);

  useEffect(() => {
    if (!tenantDbId) return;
    load();
  }, [tenantDbId]);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from('onboarding_checklists')
      .select('id, customer_id, marco, status, agendado_para, customers(id, name)')
      .eq('tenant_id', tenantDbId)
      .order('marco');

    const map = {};
    for (const row of data || []) {
      const cid = row.customer_id;
      if (!map[cid]) {
        map[cid] = {
          customer_id:   cid,
          customer_name: row.customers?.name || 'Cliente sem nome',
          marcos:        {},
        };
      }
      map[cid].marcos[row.marco] = row;
    }
    setRows(Object.values(map));
    setLoading(false);
  }

  function currentMarco(marcos) {
    for (const m of MARCOS) {
      const r = marcos[m];
      if (!r || r.status !== 'concluido') return m;
    }
    return 'D90';
  }

  function progressOf(marcos) {
    const done = MARCOS.filter(m => marcos[m]?.status === 'concluido').length;
    return { done, total: MARCOS.length };
  }

  function overallStatus(marcos) {
    const statuses = MARCOS.map(m => marcos[m]?.status || 'pendente');
    if (statuses.every(s => s === 'concluido'))  return 'concluido';
    if (statuses.some(s => s !== 'pendente'))    return 'em_andamento';
    return 'pendente';
  }

  const filtered = rows.filter(r => {
    if (search && !r.customer_name.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterStatus && overallStatus(r.marcos) !== filterStatus) return false;
    if (filterMarco  && currentMarco(r.marcos)  !== filterMarco)  return false;
    return true;
  });

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated  = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <div style={{ padding: 24, maxWidth: 1000, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#fff', margin: 0 }}>Onboarding</h1>
          <p style={{ fontSize: 13, color: '#9CA3AF', margin: '4px 0 0' }}>Playbook D1 / D7 / D30 / D60 / D90 por cliente</p>
        </div>
        <span style={{ fontSize: 13, color: '#6B7280' }}>{filtered.length} cliente{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 180 }}>
          <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#6B7280', pointerEvents: 'none', display: 'flex' }}>
            <Icon name="search" size={14} />
          </span>
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(0); }}
            placeholder="Buscar cliente..."
            style={{ width: '100%', padding: '8px 8px 8px 30px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#fff', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
          />
        </div>
        <select
          value={filterStatus}
          onChange={e => { setFilterStatus(e.target.value); setPage(0); }}
          style={{ padding: '8px 12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#fff', fontSize: 13, cursor: 'pointer' }}
        >
          <option value="">Todos os status</option>
          <option value="pendente">Pendente</option>
          <option value="em_andamento">Em andamento</option>
          <option value="concluido">Concluído</option>
        </select>
        <select
          value={filterMarco}
          onChange={e => { setFilterMarco(e.target.value); setPage(0); }}
          style={{ padding: '8px 12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#fff', fontSize: 13, cursor: 'pointer' }}
        >
          <option value="">Todos os marcos</option>
          {MARCOS.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>

      {/* Conteúdo */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#6B7280' }}>Carregando...</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#6B7280' }}>
          <Icon name="users" size={32} />
          <p style={{ marginTop: 12 }}>Nenhum cliente em onboarding</p>
        </div>
      ) : (
        <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                {['Cliente', 'Progresso', 'Marco atual', 'Status', ''].map(h => (
                  <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.5 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paginated.map((r, i) => {
                const { done, total } = progressOf(r.marcos);
                const curr = currentMarco(r.marcos);
                const st   = overallStatus(r.marcos);
                return (
                  <tr
                    key={r.customer_id}
                    style={{ borderBottom: i < paginated.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none', cursor: 'pointer', transition: 'background 0.15s' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    onClick={() => onOpen(r.customer_id, r.customer_name)}
                  >
                    <td style={{ padding: '14px 16px', color: '#fff', fontWeight: 500, fontSize: 14 }}>{r.customer_name}</td>
                    <td style={{ padding: '14px 16px', minWidth: 150 }}>
                      <ProgressBar done={done} total={total} />
                      <span style={{ fontSize: 11, color: '#6B7280', marginTop: 2, display: 'block' }}>{done}/{total} marcos</span>
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#B70C00' }}>{curr}</span>
                    </td>
                    <td style={{ padding: '14px 16px' }}><Badge status={st} /></td>
                    <td style={{ padding: '14px 16px' }}>
                      <Icon name="chevright" size={16} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Paginação */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, marginTop: 20 }}>
          <button
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0}
            style={{ padding: '6px 14px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: page === 0 ? '#4B5563' : '#fff', cursor: page === 0 ? 'not-allowed' : 'pointer', fontSize: 13 }}
          >← Anterior</button>
          <span style={{ fontSize: 13, color: '#9CA3AF' }}>Página {page + 1} de {totalPages}</span>
          <button
            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            style={{ padding: '6px 14px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: page >= totalPages - 1 ? '#4B5563' : '#fff', cursor: page >= totalPages - 1 ? 'not-allowed' : 'pointer', fontSize: 13 }}
          >Próxima →</button>
        </div>
      )}
    </div>
  );
}
