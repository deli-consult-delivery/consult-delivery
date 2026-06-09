import { useState as uSCrm, useMemo as uMCrm, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import Icon from '../components/Icon.jsx';
import AgentAvatar from '../components/AgentAvatar.jsx';
import UserAvatar from '../components/UserAvatar.jsx';
import { supabase } from '../lib/supabase.js';
import { TENANTS } from '../data.js';
import CustomFieldsSection from '../components/CustomFieldsSection.jsx';

const CrmScreen = ({ tenant, tenantDbId, onNavigate }) => {
  const [mode, setMode] = uSCrm('clientes');
  const [showImportModal, setShowImportModal] = uSCrm(false);
  const [leadsRefreshKey, setLeadsRefreshKey] = uSCrm(0);

  return (
    <div className="route-enter" style={{ padding: '28px 32px 56px', maxWidth: 1480, margin: '0 auto' }}>
      {/* Mode toggle */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, background: 'var(--g-100)', borderRadius: 10, padding: 4, width: 'fit-content' }}>
        <button
          onClick={() => setMode('clientes')}
          style={{
            padding: '7px 20px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
            background: mode === 'clientes' ? 'var(--white)' : 'transparent',
            color: mode === 'clientes' ? 'var(--g-900)' : 'var(--g-500)',
            transition: 'all .15s',
          }}
        >Clientes</button>
        <button
          onClick={() => setMode('leads')}
          style={{
            padding: '7px 20px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
            background: mode === 'leads' ? 'var(--white)' : 'transparent',
            color: mode === 'leads' ? 'var(--g-900)' : 'var(--g-500)',
            transition: 'all .15s',
          }}
        >Leads</button>
      </div>

      {mode === 'clientes' ? (
        <ClientesView tenant={tenant} tenantDbId={tenantDbId} onNavigate={onNavigate} onImportClick={() => { setMode('leads'); setShowImportModal(true); }}/>
      ) : (
        <LeadsView tenantDbId={tenantDbId} onImportClick={() => setShowImportModal(true)} refreshKey={leadsRefreshKey} onNavigate={onNavigate}/>
      )}
      {showImportModal && (
        <ImportCSVModal
          tenantDbId={tenantDbId}
          onClose={() => setShowImportModal(false)}
          onImported={count => { if (count > 0) { setLeadsRefreshKey(k => k + 1); setMode('leads'); } }}
        />
      )}
    </div>
  );
};

/* ─── CLIENTES (original layout) ─── */
// Mapeia uma linha real da tabela `customers` (Supabase) para o shape que a UI consome.
// Colunas reais: id, name, phone, email, avatar, segment, is_vip, tags, metadata, created_at.
// Campos sem fonte real (lifetime, orders, last, nps, risk, city, channel) ficam vazios —
// NÃO inventamos números: a UI mostra "—" / estado vazio honesto.
function mapCustomerRow(row) {
  return {
    id: row.id,
    name: row.name || 'Sem nome',
    avatar: row.avatar || (row.name ? row.name.slice(0, 2).toUpperCase() : '??'),
    phone: row.phone || '—',
    email: row.email || '—',
    segment: row.segment || (row.is_vip ? 'VIP' : 'Lead'),
    tags: Array.isArray(row.tags) ? row.tags : [],
    city: row.metadata?.company || '—',
    channel: '—',
    // Sem tabela de pedidos/pagamentos/NPS por trás → vazio honesto.
    lifetime: null,
    orders: null,
    last: '—',
    nps: null,
    risk: null,
  };
}

const ClientesView = ({ tenant, tenantDbId, onNavigate, onImportClick }) => {
  const [customers, setCustomers] = uSCrm([]);
  const [loading, setLoading] = uSCrm(true);
  const [loadError, setLoadError] = uSCrm(null);

  const [search, setSearch] = uSCrm('');
  const [segment, setSegment] = uSCrm('all');
  const [riskFilter, setRiskFilter] = uSCrm('all');
  const [selected, setSelected] = uSCrm(null);

  useEffect(() => {
    let cancelled = false;
    if (!tenantDbId) { setCustomers([]); setLoading(false); return; }
    setLoading(true);
    setLoadError(null);
    supabase
      .from('customers')
      .select('id, name, phone, email, avatar, segment, is_vip, tags, metadata, created_at')
      .eq('tenant_id', tenantDbId)
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          setLoadError(error.message || 'Erro ao carregar clientes');
          setCustomers([]);
        } else {
          const mapped = (data || []).map(mapCustomerRow);
          setCustomers(mapped);
          setSelected(prev => prev || mapped[0]?.id || null);
        }
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [tenantDbId]);

  const filtered = uMCrm(() => customers.filter(c => {
    if (search && !c.name.toLowerCase().includes(search.toLowerCase()) && !c.email.toLowerCase().includes(search.toLowerCase())) return false;
    if (segment !== 'all' && c.segment !== segment) return false;
    if (riskFilter !== 'all' && c.risk !== riskFilter) return false;
    return true;
  }), [customers, search, segment, riskFilter]);

  const customer = customers.find(c => c.id === selected) || customers[0];

  const stats = uMCrm(() => {
    const total = customers.length;
    const vip = customers.filter(c => c.segment === 'VIP').length;
    const risk = customers.filter(c => c.risk === 'high').length;
    const lead = customers.filter(c => c.segment === 'Lead').length;
    const ltv = customers.reduce((s, c) => s + parseFloat((c.lifetime || 'R$ 0').replace(/[^\d,]/g,'').replace(',','.') || 0), 0);
    return { total, vip, risk, lead, ltv };
  }, [customers]);

  const segments = [
    { id: 'all',         label: 'Todos',         color:'#6B7280' },
    { id: 'VIP',         label: 'VIP',           color:'#B70C00' },
    { id: 'Recorrente',  label: 'Recorrentes',   color:'#10B981' },
    { id: 'Novo',        label: 'Novos',         color:'#3B82F6' },
    { id: 'Lead',        label: 'Leads',         color:'#F59E0B' },
    { id: 'Em risco',    label: 'Em risco',      color:'#EF4444' },
  ];

  return (
    <>
      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-end', marginBottom: 24 }}>
        <div>
          <h1 className="page-h1">Clientes / CRM</h1>
          <p className="page-sub">Base completa de contatos · {stats.total} clientes na {TENANTS.find(t=>t.id===tenant)?.name}</p>
        </div>
        <div style={{ display:'flex', gap: 8 }}>
          <button className="btn-secondary" onClick={onImportClick}><Icon name="paper" size={14}/> Importar CSV</button>
          <button className="btn-secondary"><Icon name="sparkles" size={14}/> Segmentar com IA</button>
          <button className="btn-primary"><Icon name="plus" size={14}/> Novo cliente</button>
        </div>
      </div>

      {/* Stat strip */}
      <div className="crm-stat-strip">
        <CrmStat label="Total de clientes" value={stats.total} icon="users" color="#6B7280"/>
        <CrmStat label="VIPs" value={stats.vip} icon="star" color="#B70C00"/>
        <CrmStat label="Em risco" value="—" icon="alert" color="#EF4444"/>
        <CrmStat label="Leads ativos" value={stats.lead} icon="sparkles" color="#F59E0B"/>
        <CrmStat label="LTV total" value="—" icon="dollar" color="#10B981"/>
      </div>

      {/* Two-column layout */}
      <div className="crm-layout">
        {/* List */}
        <div className="card crm-list-card">
          <div className="crm-list-head">
            <div style={{ position:'relative' }}>
              <Icon name="search" size={14} style={{ position:'absolute', top: 11, left: 12, color:'var(--g-400)' }}/>
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="input"
                placeholder="Buscar por nome ou e-mail…"
                style={{ paddingLeft: 36 }}
              />
            </div>
            <div className="crm-segment-row">
              {segments.map(s => (
                <button
                  key={s.id}
                  className={`crm-seg ${segment === s.id ? 'on' : ''}`}
                  onClick={() => setSegment(s.id)}
                  style={segment === s.id ? { background: s.color, color:'white', borderColor: s.color } : null}
                >{s.label}</button>
              ))}
            </div>
          </div>

          <div className="crm-list-body scroll">
            <div className="crm-list-toolbar">
              <span style={{ fontSize: 12, color:'var(--g-500)' }}>{filtered.length} resultados</span>
              <button className="btn-ghost" style={{ fontSize: 12, padding:'4px 8px' }}>
                <Icon name="filter" size={12}/> Mais filtros
              </button>
            </div>
            {loading ? (
              <div style={{ padding: 40, textAlign:'center', color:'var(--g-400)', fontSize: 13 }}>
                Carregando clientes…
              </div>
            ) : loadError ? (
              <div style={{ padding: 40, textAlign:'center', color:'#EF4444', fontSize: 13 }}>
                Erro ao carregar clientes: {loadError}
              </div>
            ) : customers.length === 0 ? (
              <div style={{ padding: 40, textAlign:'center', color:'var(--g-400)', fontSize: 13, lineHeight: 1.6 }}>
                Nenhum cliente cadastrado ainda.<br/>
                <button className="btn-ghost" style={{ fontSize: 12, marginTop: 8 }} onClick={onImportClick}>
                  <Icon name="paper" size={12}/> Importar via CSV
                </button>
              </div>
            ) : (
              <>
                {filtered.map(c => {
                  const segColor = segments.find(s => s.id === c.segment)?.color || '#6B7280';
                  return (
                    <div
                      key={c.id}
                      className={`crm-list-row ${selected === c.id ? 'on' : ''}`}
                      onClick={() => setSelected(c.id)}
                    >
                      <UserAvatar name={c.avatar} size={36}/>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display:'flex', alignItems:'center', gap: 6, marginBottom: 2 }}>
                          <span style={{ fontSize: 14, fontWeight: 600, color:'var(--g-900)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{c.name}</span>
                          {c.risk === 'high' && <span className="crm-risk-dot" title="Alto risco"/>}
                        </div>
                        <div style={{ fontSize: 11, color:'var(--g-500)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                          {[c.phone !== '—' ? c.phone : null, c.email !== '—' ? c.email : null].filter(Boolean).join(' · ') || 'Sem contato'}
                        </div>
                      </div>
                      <span className="crm-seg-pill" style={{ background: segColor + '22', color: segColor }}>{c.segment}</span>
                    </div>
                  );
                })}
                {filtered.length === 0 && (
                  <div style={{ padding: 40, textAlign:'center', color:'var(--g-400)', fontSize: 13 }}>
                    Nenhum cliente encontrado
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {!loading && !loadError && customer && <Customer360 customer={customer} onNavigate={onNavigate}/>}
      </div>
    </>
  );
};

const STAGES = [
  { id: 'novo',        label: 'Novo',       color: '#6B7280' },
  { id: 'qualificado', label: 'Qualificado', color: '#3B82F6' },
  { id: 'proposta',    label: 'Proposta',    color: '#F59E0B' },
  { id: 'negociacao',  label: 'Negociação',  color: '#8B5CF6' },
  { id: 'fechado',     label: 'Fechado',     color: '#10B981' },
  { id: 'perdido',     label: 'Perdido',     color: '#EF4444' },
];

/* ─── LEADS VIEW ─── */
const LeadsView = ({ tenantDbId, onImportClick, refreshKey = 0, onNavigate }) => {
  const [leads, setLeads] = uSCrm([]);
  const [loading, setLoading] = uSCrm(true);
  const [view, setView] = uSCrm('kanban');
  const [search, setSearch] = uSCrm('');
  const [stageFilter, setStageFilter] = uSCrm('all');
  const [showModal, setShowModal] = uSCrm(false);
  const [editLead, setEditLead] = uSCrm(null);
  const [deleteConfirm, setDeleteConfirm] = uSCrm(null);
  const [deleting, setDeleting] = uSCrm(false);
  const [draggingId, setDraggingId] = uSCrm(null);
  const [dragOver, setDragOver] = uSCrm(null);

  useEffect(() => {
    if (!tenantDbId) return;
    fetchLeads();
  }, [tenantDbId, refreshKey]);

  async function fetchLeads() {
    setLoading(true);
    const { data, error } = await supabase
      .from('leads')
      .select('id, nome, email, whatsapp, origem, stage, valor_estimado, score, responsavel_id, notas, created_at, updated_at')
      .eq('tenant_id', tenantDbId)
      .order('created_at', { ascending: false });
    if (!error && data) setLeads(data);
    setLoading(false);
  }

  async function handleNewLead(data) {
    const { error } = await supabase.from('leads').insert({
      tenant_id: tenantDbId,
      nome: data.nome,
      email: data.email || null,
      whatsapp: data.whatsapp || null,
      origem: data.origem || null,
      stage: data.stage || 'novo',
      valor_estimado: data.valor_estimado ? parseFloat(data.valor_estimado) : null,
      score: data.score ? parseInt(data.score) : null,
      notas: data.notas || null,
    });
    if (!error) { setShowModal(false); fetchLeads(); }
  }

  async function handleEditLead(id, data) {
    const { error } = await supabase.from('leads').update({
      nome: data.nome,
      email: data.email || null,
      whatsapp: data.whatsapp || null,
      origem: data.origem || null,
      stage: data.stage || 'novo',
      valor_estimado: data.valor_estimado ? parseFloat(data.valor_estimado) : null,
      score: data.score ? parseInt(data.score) : null,
      notas: data.notas || null,
      updated_at: new Date().toISOString(),
    }).eq('id', id);
    if (!error) { setEditLead(null); fetchLeads(); }
  }

  async function handleDelete(lead) {
    setDeleting(true);
    await supabase.from('leads').delete().eq('id', lead.id);
    setLeads(prev => prev.filter(l => l.id !== lead.id));
    setDeleteConfirm(null);
    setDeleting(false);
  }

  async function handleStageChange(leadId, newStage) {
    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, stage: newStage } : l));
    await supabase.from('leads').update({ stage: newStage, updated_at: new Date().toISOString() }).eq('id', leadId);
  }

  const filtered = uMCrm(() => {
    let result = leads;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(l =>
        l.nome?.toLowerCase().includes(q) ||
        l.email?.toLowerCase().includes(q) ||
        l.whatsapp?.includes(q)
      );
    }
    if (stageFilter !== 'all') result = result.filter(l => l.stage === stageFilter);
    return result;
  }, [leads, search, stageFilter]);

  function handleDragStart(e, leadId) {
    setDraggingId(leadId);
    e.dataTransfer.effectAllowed = 'move';
  }

  function handleDragOver(e, stageId) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOver(stageId);
  }

  function handleDrop(e, stageId) {
    e.preventDefault();
    if (draggingId && stageId) handleStageChange(draggingId, stageId);
    setDraggingId(null);
    setDragOver(null);
  }

  function handleDragEnd() {
    setDraggingId(null);
    setDragOver(null);
  }

  function formatValor(v) {
    if (!v && v !== 0) return null;
    return `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  }

  const stats = uMCrm(() => {
    const total = leads.length;
    const valorTotal = leads.reduce((s, l) => s + Number(l.valor_estimado || 0), 0);
    const fechados = leads.filter(l => l.stage === 'fechado').length;
    const scorados = leads.filter(l => l.score);
    const avgScore = scorados.length
      ? scorados.reduce((s, l) => s + l.score, 0) / scorados.length
      : 0;
    return { total, valorTotal, fechados, avgScore: Math.round(avgScore * 10) / 10 };
  }, [leads]);

  return (
    <>
      {/* Stats Bar */}
      <div style={{ display:'flex', gap: 12, marginBottom: 20, flexWrap:'wrap' }}>
        {[
          { label: 'Total Leads', value: stats.total, color: '#6B7280' },
          { label: 'Pipeline', value: stats.valorTotal ? `R$ ${Number(stats.valorTotal).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : '—', color: '#3B82F6' },
          { label: 'Fechados', value: stats.fechados, color: '#10B981' },
          { label: 'Score Médio', value: stats.avgScore || '—', color: '#F59E0B' },
        ].map(s => (
          <div key={s.label} style={{ background:'var(--white)', border:'1px solid var(--g-200)', borderRadius: 10, padding:'12px 20px', display:'flex', flexDirection:'column', gap: 4, minWidth: 130 }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 10, fontWeight: 600, color:'var(--g-500)', textTransform:'uppercase', letterSpacing: 0.5 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: 16 }}>
        <div style={{ display:'flex', gap: 8, alignItems:'center' }}>
          {/* View toggle */}
          <div style={{ display:'flex', background:'var(--g-100)', border:'1px solid var(--g-200)', borderRadius: 8, padding: 2 }}>
            {[{ id:'kanban', label:'Kanban' }, { id:'lista', label:'Lista' }].map(v => (
              <button key={v.id} onClick={() => setView(v.id)} style={{
                padding:'5px 14px', fontSize: 12, fontWeight: 600, borderRadius: 6, border:'none', cursor:'pointer',
                background: view === v.id ? 'var(--white)' : 'none',
                color: view === v.id ? 'var(--g-900)' : 'var(--g-500)',
              }}>{v.label}</button>
            ))}
          </div>
          {/* Stage filter */}
          <select value={stageFilter} onChange={e => setStageFilter(e.target.value)} className="input" style={{ height: 34, fontSize: 12, paddingTop: 0, paddingBottom: 0 }}>
            <option value="all">Todos os stages</option>
            {STAGES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </div>
        <div style={{ display:'flex', gap: 8, alignItems:'center' }}>
          <div style={{ position:'relative' }}>
            <Icon name="search" size={14} style={{ position:'absolute', top: 10, left: 10, color:'var(--g-400)' }}/>
            <input value={search} onChange={e => setSearch(e.target.value)} className="input" placeholder="Buscar leads…" style={{ paddingLeft: 32, width: 200, height: 34 }}/>
          </div>
          <button className="btn-primary" style={{ background:'#B70C00', height: 34 }} onClick={() => setShowModal(true)}>
            <Icon name="plus" size={14}/> Novo Lead
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: 60, textAlign:'center', color:'var(--g-500)', fontSize: 13 }}>Carregando leads…</div>
      ) : view === 'kanban' ? (
        <div style={{ display:'flex', gap: 12, overflowX:'auto', paddingBottom: 12, alignItems:'flex-start' }}>
          {STAGES.map(stage => {
            const columnLeads = filtered.filter(l => l.stage === stage.id);
            const isOver = dragOver === stage.id;
            return (
              <div
                key={stage.id}
                onDragOver={e => handleDragOver(e, stage.id)}
                onDrop={e => handleDrop(e, stage.id)}
                onDragLeave={() => setDragOver(null)}
                style={{
                  minWidth: 220, flex: '0 0 220px', background: isOver ? 'rgba(16,185,129,0.08)' : 'var(--g-50)',
                  border: isOver ? '1.5px dashed #10B981' : '1px solid var(--g-200)',
                  borderRadius: 12, padding: 10, transition: 'background .15s, border .15s',
                }}
              >
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: 10, padding:'2px 4px' }}>
                  <div style={{ display:'flex', alignItems:'center', gap: 6 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: stage.color }}/>
                    <span style={{ fontSize: 11, fontWeight: 700, color:'var(--g-700)', textTransform:'uppercase', letterSpacing: 0.5 }}>{stage.label}</span>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, color:'var(--g-500)', background:'var(--g-200)', borderRadius: 10, padding:'1px 7px' }}>{columnLeads.length}</span>
                </div>
                <div style={{ display:'flex', flexDirection:'column', gap: 8 }}>
                  {columnLeads.map(lead => (
                    <div
                      key={lead.id}
                      draggable
                      onDragStart={e => handleDragStart(e, lead.id)}
                      onDragEnd={handleDragEnd}
                      style={{
                        background: draggingId === lead.id ? 'rgba(183,12,0,0.08)' : 'var(--white)',
                        border: draggingId === lead.id ? '1px solid rgba(183,12,0,0.4)' : '1px solid var(--g-200)',
                        borderRadius: 10, padding: '10px 12px', cursor:'grab',
                        opacity: draggingId === lead.id ? 0.6 : 1, transition: 'opacity .1s',
                      }}
                    >
                      <div style={{ fontSize: 13, fontWeight: 600, color:'var(--g-900)', marginBottom: 6, lineHeight: 1.3 }}>{lead.nome}</div>
                      <div style={{ display:'flex', flexWrap:'wrap', gap: 6 }}>
                        {lead.valor_estimado != null && (
                          <span style={{ fontSize: 11, color:'#10B981', fontWeight: 600 }}>{formatValor(lead.valor_estimado)}</span>
                        )}
                        {lead.score != null && (
                          <span style={{ fontSize: 11, color:'#F59E0B', fontWeight: 600 }}>★ {lead.score}/10</span>
                        )}
                        {lead.whatsapp && (
                          <span style={{ fontSize: 10, color:'var(--g-500)' }}>{lead.whatsapp}</span>
                        )}
                      </div>
                      <div style={{ display:'flex', gap: 4, marginTop: 8, justifyContent:'flex-end' }}>
                        <button onClick={() => setEditLead(lead)} style={{ background:'none', border:'none', color:'var(--g-400)', cursor:'pointer', fontSize: 11, padding:'2px 6px', borderRadius: 4 }}
                          onMouseEnter={e => e.currentTarget.style.color = 'var(--g-900)'}
                          onMouseLeave={e => e.currentTarget.style.color = 'var(--g-400)'}
                        >✏️</button>
                        <button onClick={() => setDeleteConfirm(lead)} style={{ background:'none', border:'none', color:'var(--g-400)', cursor:'pointer', fontSize: 11, padding:'2px 6px', borderRadius: 4 }}
                          onMouseEnter={e => e.currentTarget.style.color = '#EF4444'}
                          onMouseLeave={e => e.currentTarget.style.color = 'var(--g-400)'}
                        >🗑️</button>
                      </div>
                    </div>
                  ))}
                  {columnLeads.length === 0 && (
                    <div style={{ textAlign:'center', color:'var(--g-400)', fontSize: 11, padding:'16px 0', fontStyle:'italic' }}>
                      Solte aqui
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow:'hidden' }}>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr style={{ borderBottom:'1px solid var(--g-200)' }}>
                <th style={thStyle}>Nome</th>
                <th style={thStyle}>Contato</th>
                <th style={thStyle}>Stage</th>
                <th style={thStyle}>Valor</th>
                <th style={thStyle}>Score</th>
                <th style={thStyle}>Origem</th>
                <th style={{ width: 60 }}/>
              </tr>
            </thead>
            <tbody>
              {filtered.map(lead => {
                const stg = STAGES.find(s => s.id === lead.stage) || STAGES[0];
                return (
                  <tr key={lead.id} style={{ borderBottom:'1px solid var(--g-200)' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--g-50)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <td style={{ padding:'11px 16px', fontSize: 13, fontWeight: 600, color:'var(--g-900)' }}>{lead.nome}</td>
                    <td style={{ padding:'11px 16px', fontSize: 12, color:'var(--g-500)' }}>
                      {lead.whatsapp && <div>{lead.whatsapp}</div>}
                      {lead.email && <div style={{ fontSize: 11 }}>{lead.email}</div>}
                    </td>
                    <td style={{ padding:'11px 16px' }}>
                      <span style={{ fontSize: 10, fontWeight: 700, padding:'2px 8px', borderRadius: 20, background: stg.color + '20', color: stg.color, textTransform:'uppercase', letterSpacing: 0.3 }}>
                        {stg.label}
                      </span>
                    </td>
                    <td style={{ padding:'11px 16px', fontSize: 12, color:'#10B981', fontWeight: 600 }}>
                      {formatValor(lead.valor_estimado) || '—'}
                    </td>
                    <td style={{ padding:'11px 16px', fontSize: 12, color:'#F59E0B', fontWeight: 600 }}>
                      {lead.score != null ? `★ ${lead.score}` : '—'}
                    </td>
                    <td style={{ padding:'11px 16px', fontSize: 12, color:'var(--g-500)' }}>{lead.origem || '—'}</td>
                    <td style={{ padding:'11px 8px' }}>
                      <div style={{ display:'flex', gap: 4, justifyContent:'center' }}>
                        <button onClick={() => setEditLead(lead)} style={{ background:'none', border:'none', color:'var(--g-400)', cursor:'pointer', padding: 4, borderRadius: 4 }}
                          onMouseEnter={e => e.currentTarget.style.color = 'var(--g-900)'}
                          onMouseLeave={e => e.currentTarget.style.color = 'var(--g-400)'}
                        >✏️</button>
                        <button onClick={() => setDeleteConfirm(lead)} style={{ background:'none', border:'none', color:'var(--g-400)', cursor:'pointer', padding: 4, borderRadius: 4 }}
                          onMouseEnter={e => e.currentTarget.style.color = '#EF4444'}
                          onMouseLeave={e => e.currentTarget.style.color = 'var(--g-400)'}
                        >🗑️</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ padding: 60, textAlign:'center', color:'var(--g-400)', fontSize: 13 }}>
                    {search ? 'Nenhum lead encontrado.' : 'Nenhum lead cadastrado ainda.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {showModal && createPortal(
        <LeadFormModal title="Novo Lead" onClose={() => setShowModal(false)} onSave={handleNewLead}/>,
        document.body
      )}

      {editLead && createPortal(
        <LeadFormModal
          title="Editar Lead"
          initial={editLead}
          leadId={editLead.id}
          tenantDbId={tenantDbId}
          onClose={() => setEditLead(null)}
          onSave={data => handleEditLead(editLead.id, data)}
        />,
        document.body
      )}

      {deleteConfirm && createPortal(
        <div style={{ position:'fixed', inset: 0, background:'rgba(0,0,0,0.6)', zIndex: 1000, display:'flex', alignItems:'center', justifyContent:'center' }}
          onClick={e => e.target === e.currentTarget && setDeleteConfirm(null)}>
          <div style={{ background:'var(--white)', border:'1px solid var(--g-200)', borderRadius: 14, padding: 28, width: 380, boxShadow:'0 24px 48px rgba(0,0,0,.6)' }}>
            <div style={{ fontSize: 32, textAlign:'center', marginBottom: 14 }}>🗑️</div>
            <h3 style={{ margin:'0 0 8px', fontSize: 16, fontWeight: 700, color:'var(--g-900)', textAlign:'center' }}>Excluir lead</h3>
            <p style={{ margin:'0 0 24px', fontSize: 13, color:'var(--g-500)', textAlign:'center', lineHeight: 1.5 }}>
              Tem certeza que deseja excluir <strong style={{ color:'var(--g-900)' }}>{deleteConfirm.nome}</strong>?<br/>Esta ação não pode ser desfeita.
            </p>
            <div style={{ display:'flex', gap: 8 }}>
              <button className="btn-secondary" style={{ flex: 1, justifyContent:'center' }} onClick={() => setDeleteConfirm(null)}>Cancelar</button>
              <button className="btn-primary"
                style={{ flex: 1, justifyContent:'center', background: deleting ? 'rgba(239,68,68,0.4)' : '#EF4444' }}
                disabled={deleting} onClick={() => handleDelete(deleteConfirm)}
              >{deleting ? 'Excluindo…' : 'Excluir'}</button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
};

const thStyle = {
  padding: '12px 16px',
  textAlign: 'left',
  fontSize: 11,
  fontWeight: 700,
  color: 'var(--g-500)',
  textTransform: 'uppercase',
  letterSpacing: 0.5,
};

const LeadFormModal = ({ title, initial, leadId, tenantDbId, onClose, onSave }) => {
  const [form, setForm] = uSCrm({
    nome:           initial?.nome || '',
    whatsapp:       initial?.whatsapp || '',
    email:          initial?.email || '',
    origem:         initial?.origem || '',
    stage:          initial?.stage || 'novo',
    valor_estimado: initial?.valor_estimado ?? '',
    score:          initial?.score ?? '',
    notas:          initial?.notas || '',
  });
  const [saving, setSaving] = uSCrm(false);

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  async function submit(e) {
    e.preventDefault();
    if (!form.nome.trim()) return;
    setSaving(true);
    await onSave(form);
    setSaving(false);
  }

  return (
    <div style={{ position:'fixed', inset: 0, background:'rgba(0,0,0,0.6)', zIndex: 1000, display:'flex', alignItems:'center', justifyContent:'center' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background:'var(--white)', border:'1px solid var(--g-200)', borderRadius: 14, padding: 28, width: 480, boxShadow:'0 24px 48px rgba(0,0,0,.6)', maxHeight:'90vh', overflowY:'auto' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: 20 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color:'var(--g-900)' }}>{title}</h3>
          <button onClick={onClose} style={{ background:'none', border:'none', color:'var(--g-500)', cursor:'pointer', fontSize: 20, lineHeight: 1 }}>×</button>
        </div>
        <form onSubmit={submit} style={{ display:'flex', flexDirection:'column', gap: 14 }}>
          <div>
            <label style={labelStyle}>Nome *</label>
            <input className="input" placeholder="Nome do lead" value={form.nome} onChange={e => set('nome', e.target.value)} required style={{ width:'100%' }}/>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap: 12 }}>
            <div>
              <label style={labelStyle}>WhatsApp</label>
              <input className="input" placeholder="5594999..." value={form.whatsapp} onChange={e => set('whatsapp', e.target.value)} style={{ width:'100%' }}/>
            </div>
            <div>
              <label style={labelStyle}>Email</label>
              <input className="input" type="email" placeholder="email@..." value={form.email} onChange={e => set('email', e.target.value)} style={{ width:'100%' }}/>
            </div>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap: 12 }}>
            <div>
              <label style={labelStyle}>Stage</label>
              <select className="input" value={form.stage} onChange={e => set('stage', e.target.value)} style={{ width:'100%' }}>
                {STAGES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Origem</label>
              <select className="input" value={form.origem} onChange={e => set('origem', e.target.value)} style={{ width:'100%' }}>
                <option value="">Selecione…</option>
                <option value="Indicação">Indicação</option>
                <option value="iFood">iFood</option>
                <option value="Instagram">Instagram</option>
                <option value="WhatsApp">WhatsApp</option>
                <option value="Outro">Outro</option>
              </select>
            </div>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap: 12 }}>
            <div>
              <label style={labelStyle}>Valor Estimado (R$)</label>
              <input className="input" type="number" placeholder="0" min="0" step="1" value={form.valor_estimado} onChange={e => set('valor_estimado', e.target.value)} style={{ width:'100%' }}/>
            </div>
            <div>
              <label style={labelStyle}>Score (1–10)</label>
              <input className="input" type="number" placeholder="—" min="1" max="10" value={form.score} onChange={e => set('score', e.target.value)} style={{ width:'100%' }}/>
            </div>
          </div>
          <div>
            <label style={labelStyle}>Notas</label>
            <textarea className="input" placeholder="Observações…" value={form.notas} onChange={e => set('notas', e.target.value)} rows={3} style={{ width:'100%', resize:'vertical' }}/>
          </div>
          {leadId && tenantDbId && (
            <CustomFieldsSection entidade="lead" entidadeId={leadId} tenantId={tenantDbId} />
          )}
          <div style={{ display:'flex', gap: 8, justifyContent:'flex-end', marginTop: 4 }}>
            <button type="button" className="btn-secondary" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn-primary" style={{ background:'#B70C00' }} disabled={saving}>
              {saving ? 'Salvando…' : title}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const labelStyle = { display:'block', fontSize: 11, fontWeight: 600, color:'var(--g-500)', marginBottom: 5, textTransform:'uppercase', letterSpacing: 0.4 };

/* ─── shared sub-components ─── */
const CrmStat = ({ label, value, icon, color }) => (
  <div className="crm-stat">
    <div style={{ width: 36, height: 36, borderRadius: 8, background: color + '15', color, display:'flex', alignItems:'center', justifyContent:'center' }}>
      <Icon name={icon} size={16}/>
    </div>
    <div>
      <div style={{ fontSize: 22, fontWeight: 800, color:'var(--g-900)', lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 11, color:'var(--g-500)', textTransform:'uppercase', letterSpacing: 0.5, marginTop: 4, fontWeight: 600 }}>{label}</div>
    </div>
  </div>
);

const Customer360 = ({ customer, onNavigate }) => {
  const [tab, setTab] = uSCrm('overview');
  const tabs = [
    { id: 'overview', label: 'Visão geral' },
    { id: 'orders',   label: 'Pedidos' },
    { id: 'chats',    label: 'Conversas' },
    { id: 'payments', label: 'Pagamentos' },
    { id: 'notes',    label: 'Notas' },
  ];
  const segColor = { VIP:'#B70C00', Recorrente:'#10B981', Novo:'#3B82F6', Lead:'#F59E0B', 'Em risco':'#EF4444' }[customer.segment] || '#6B7280';
  const riskColor = { low:'#10B981', medium:'#F59E0B', high:'#EF4444' }[customer.risk] || 'var(--g-400)';
  const riskLabel = { low:'Baixo', medium:'Médio', high:'Alto' }[customer.risk] || '—';
  return (
    <div className="card crm-detail">
      <div className="crm-detail-hero">
        <div className="crm-detail-hero-bg" style={{ background: `linear-gradient(135deg, ${segColor}, ${segColor}cc)` }}/>
        <div style={{ display:'flex', alignItems:'flex-end', gap: 16, position:'relative', zIndex: 1 }}>
          <UserAvatar name={customer.avatar} size={72}/>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 22, fontWeight: 800, color:'white', lineHeight: 1.1 }}>{customer.name}</div>
            <div style={{ fontSize: 12, color:'rgba(255,255,255,0.85)', marginTop: 6, display:'flex', alignItems:'center', gap: 10, flexWrap:'wrap' }}>
              <span><Icon name="phone" size={11}/> {customer.phone}</span>
              <span style={{ opacity:0.5 }}>·</span>
              <span>{customer.email}</span>
              <span style={{ opacity:0.5 }}>·</span>
              <span><Icon name="building" size={11}/> {customer.city}</span>
            </div>
          </div>
          <div style={{ display:'flex', gap: 6, flexShrink: 0 }}>
            <button className="btn-secondary" style={{ background:'rgba(255,255,255,0.18)', color:'white', borderColor:'rgba(255,255,255,0.3)' }} onClick={() => onNavigate && onNavigate('chat')}>
              <Icon name="msg" size={14}/> Mensagem
            </button>
            <button className="btn-secondary" style={{ background:'rgba(255,255,255,0.18)', color:'white', borderColor:'rgba(255,255,255,0.3)' }}>
              <Icon name="phone" size={14}/> Ligar
            </button>
          </div>
        </div>
      </div>
      <div className="crm-360-stats">
        <div><div className="crm-360-stat-l">LTV</div><div className="crm-360-stat-v">{customer.lifetime ?? '—'}</div></div>
        <div><div className="crm-360-stat-l">Pedidos</div><div className="crm-360-stat-v">{customer.orders ?? '—'}</div></div>
        <div><div className="crm-360-stat-l">NPS</div><div className="crm-360-stat-v" style={{ color: customer.nps == null ? 'var(--g-400)' : customer.nps >= 9 ? '#10B981' : customer.nps >= 7 ? '#F59E0B' : '#EF4444' }}>{customer.nps ?? '—'}</div></div>
        <div><div className="crm-360-stat-l">Último pedido</div><div className="crm-360-stat-v" style={{ fontSize: 16 }}>{customer.last ?? '—'}</div></div>
        <div><div className="crm-360-stat-l">Risco churn</div><div className="crm-360-stat-v" style={{ color: riskColor, fontSize: 16 }}><span style={{ display:'inline-block', width: 8, height: 8, borderRadius:'50%', background: riskColor, marginRight: 6 }}/>{riskLabel}</div></div>
      </div>
      <div className="crm-360-tags">
        <span className="crm-seg-pill" style={{ background: segColor + '22', color: segColor }}>{customer.segment}</span>
        {customer.tags.map(t => <span key={t} className="crm-tag">#{t}</span>)}
        <button className="crm-tag-add"><Icon name="plus" size={11}/> tag</button>
      </div>
      <div className="crm-tabs">
        {tabs.map(t => <button key={t.id} className={`crm-tab ${tab === t.id ? 'on' : ''}`} onClick={() => setTab(t.id)}>{t.label}</button>)}
      </div>
      <div className="crm-tab-body">
        {tab === 'overview' && <OverviewTab customer={customer}/>}
        {tab === 'orders'   && <OrdersTab customer={customer}/>}
        {tab === 'chats'    && <ChatsTab customer={customer}/>}
        {tab === 'payments' && <PaymentsTab customer={customer}/>}
        {tab === 'notes'    && <NotesTab customer={customer}/>}
      </div>
    </div>
  );
};

// Estado vazio honesto reutilizável para abas sem tabela de apoio cabeada.
const TabEmpty = ({ icon, children }) => (
  <div style={{ padding: '40px 20px', textAlign:'center', color:'var(--g-400)', fontSize: 13, lineHeight: 1.6 }}>
    {icon && <div style={{ marginBottom: 10, opacity: 0.6 }}><Icon name={icon} size={28}/></div>}
    {children}
  </div>
);

const OverviewTab = ({ customer }) => (
  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap: 16 }}>
    <div className="crm-card-mini" style={{ background:'var(--g-50)', color:'var(--g-900)', borderColor:'var(--g-200)' }}>
      <div style={{ display:'flex', alignItems:'center', gap: 8, marginBottom: 12 }}>
        <AgentAvatar id="deli" size={24}/>
        <span style={{ fontSize: 11, fontWeight: 800, color:'var(--red-light)', letterSpacing: 1, textTransform:'uppercase' }}>DELI · Insights</span>
      </div>
      <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, lineHeight: 1.7, color:'var(--g-700)' }}>
        <li>Segmento atual: {customer.segment}</li>
        {customer.tags.length > 0
          ? <li>Tags: {customer.tags.map(t => `#${t}`).join(' ')}</li>
          : <li>Sem tags atribuídas</li>}
        <li style={{ color:'var(--g-500)' }}>Métricas de pedidos/NPS ainda não conectadas para este cliente.</li>
      </ul>
    </div>
    <div className="crm-card-mini">
      <div style={{ fontSize: 11, fontWeight: 700, color:'var(--g-500)', textTransform:'uppercase', letterSpacing: 1, marginBottom: 12 }}>Ações sugeridas</div>
      <div style={{ display:'flex', flexDirection:'column', gap: 8 }}>
        {customer.risk === 'high' && <button className="crm-suggest"><Icon name="dollar" size={13}/> Acionar CORA — recuperar débito</button>}
        {customer.segment === 'VIP' && <button className="crm-suggest"><Icon name="star" size={13}/> Enviar cupom exclusivo VIP</button>}
        {customer.segment === 'Lead' && <button className="crm-suggest"><Icon name="sparkles" size={13}/> Acionar SOFIA — qualificar lead</button>}
        <button className="crm-suggest"><Icon name="msg" size={13}/> Enviar template "boas_vindas"</button>
        <button className="crm-suggest"><Icon name="check" size={13}/> Criar tarefa de follow-up</button>
      </div>
    </div>
    <div className="crm-card-mini" style={{ gridColumn:'1 / -1' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color:'var(--g-500)', textTransform:'uppercase', letterSpacing: 1, marginBottom: 12 }}>Linha do tempo</div>
      <TabEmpty>Nenhum evento registrado para este cliente ainda.</TabEmpty>
    </div>
  </div>
);

const OrdersTab = () => (
  <TabEmpty icon="paper">Nenhum pedido registrado para este cliente.</TabEmpty>
);

const ChatsTab = () => (
  <TabEmpty icon="msg">Nenhuma conversa vinculada a este cliente.</TabEmpty>
);

const PaymentsTab = () => (
  <TabEmpty icon="dollar">Nenhum pagamento registrado para este cliente.</TabEmpty>
);

const NotesTab = () => (
  <div>
    <textarea
      className="input"
      placeholder="Adicione uma nota interna sobre este cliente…"
      style={{ width:'100%', minHeight: 100, resize:'vertical' }}
    />
    <div style={{ marginTop: 12, display:'flex', justifyContent:'flex-end', alignItems:'center' }}>
      <button className="btn-primary" style={{ fontSize: 13 }}>Salvar nota</button>
    </div>
  </div>
);

/* ─── IMPORT CSV MODAL ─── */
const ImportCSVModal = ({ tenantDbId, onClose, onImported }) => {
  const [rows, setRows] = uSCrm([]);
  const [headers, setHeaders] = uSCrm([]);
  const [importing, setImporting] = uSCrm(false);
  const [result, setResult] = uSCrm(null);
  const [dragging, setDragging] = uSCrm(false);

  function parseCSV(text) {
    const clean = text.replace(/^﻿/, '');
    const lines = clean.trim().split('\n');
    if (lines.length < 2) return { headers: [], rows: [] };
    const sep = lines[0].includes(';') ? ';' : ',';
    const hdrs = lines[0].replace(/\r$/, '').split(sep).map(h => h.trim().replace(/^"|"$/g, ''));
    const rws = lines.slice(1).map(l => l.replace(/\r$/, '').split(sep).map(c => c.trim().replace(/^"|"$/g, '')));
    return { headers: hdrs, rows: rws };
  }

  function loadFile(f) {
    setResult(null);
    const reader = new FileReader();
    reader.onload = ev => {
      const { headers: hdrs, rows: rws } = parseCSV(ev.target.result || '');
      setHeaders(hdrs);
      setRows(rws);
    };
    reader.readAsText(f, 'UTF-8');
  }

  function isEmojiOnly(str) {
    return str.replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, '').trim().length === 0;
  }

  function looksLikePhone(str) {
    const digits = str.replace(/\D/g, '');
    return digits.length >= 8 && digits.length / str.replace(/\s/g, '').length > 0.75;
  }

  function isGroupJID(phone) {
    return phone.replace(/\D/g, '').length > 15;
  }

  function normalizePhone(raw) {
    if (!raw) return null;
    const norm = raw.replace(/[^\d]/g, '');
    return norm || null;
  }

  function mapSegment(tagsStr) {
    if (!tagsStr) return 'Lead';
    const lower = tagsStr.toLowerCase();
    if (lower.includes('cliente ativo') || lower.includes('consultoria ativa')) return 'VIP';
    return 'Lead';
  }

  function buildIdx(hdrs) {
    const idx = {};
    hdrs.forEach((h, i) => { idx[h.toLowerCase()] = i; });
    return idx;
  }

  function isValidRow(row, idx) {
    const nome = (row[idx['nome']] || '').trim();
    const telefone = row[idx['telefone']] || '';
    if (!nome) return false;
    if (isEmojiOnly(nome)) return false;
    if (looksLikePhone(nome)) return false;
    if (telefone && isGroupJID(telefone)) return false;
    return true;
  }

  const idx = buildIdx(headers);
  const validCount = rows.filter(r => isValidRow(r, idx)).length;
  const skipCount = rows.length - validCount;

  async function handleImport() {
    if (!rows.length) return;
    setImporting(true);

    const { data: existing } = await supabase
      .from('customers')
      .select('metadata')
      .eq('tenant_id', tenantDbId);
    const existingOrigIds = new Set(
      (existing || []).map(r => r.metadata?.original_id).filter(Boolean)
    );

    let ok = 0, skipped = 0, duped = 0, err = 0;
    const records = [];

    for (const row of rows) {
      const nome = (row[idx['nome']] || '').trim();
      const telefone = row[idx['telefone']] || '';
      const email = row[idx['email']] || '';
      const empresa = row[idx['empresa']] || '';
      const tags = row[idx['tags']] || '';
      const atendente = row[idx['atendente']] || '';
      const originalId = row[idx['id']] || '';

      if (!nome || isEmojiOnly(nome) || looksLikePhone(nome) || (telefone && isGroupJID(telefone))) {
        skipped++;
        continue;
      }

      if (originalId && existingOrigIds.has(originalId)) {
        duped++;
        continue;
      }

      const phone = normalizePhone(telefone);
      const segment = mapSegment(tags);
      const isVip = segment === 'VIP';
      const tagArr = tags ? tags.split(',').map(t => t.trim()).filter(Boolean) : [];
      const meta = { source: 'datacrazy_import' };
      if (originalId) meta.original_id = originalId;
      if (empresa) meta.company = empresa;
      if (atendente) meta.attendant = atendente;

      records.push({
        tenant_id: tenantDbId,
        name: nome,
        phone,
        email: email || null,
        avatar: nome.slice(0, 2).toUpperCase(),
        segment,
        is_vip: isVip,
        tags: tagArr,
        metadata: meta,
      });
    }

    for (let i = 0; i < records.length; i += 50) {
      const { error } = await supabase.from('customers').insert(records.slice(i, i + 50));
      if (error) err += Math.min(50, records.length - i);
      else ok += Math.min(50, records.length - i);
    }

    setResult({ ok, skipped, duped, err, total: rows.length });
    setImporting(false);
    onImported?.(ok);
  }

  return (
    <div
      style={{ position:'fixed', inset: 0, background:'rgba(0,0,0,0.7)', zIndex: 1000, display:'flex', alignItems:'center', justifyContent:'center', padding: 20 }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{ background:'var(--white)', border:'1px solid var(--g-200)', borderRadius: 16, width: '100%', maxWidth: 640, maxHeight: '85vh', display:'flex', flexDirection:'column', boxShadow:'0 32px 64px rgba(0,0,0,.7)' }}>
        {/* Header */}
        <div style={{ padding:'20px 24px 16px', borderBottom:'1px solid var(--g-200)', display:'flex', justifyContent:'space-between', alignItems:'center', flexShrink: 0 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color:'var(--g-900)' }}>Importar Leads via CSV</h3>
            <p style={{ margin:'4px 0 0', fontSize: 12, color:'var(--g-500)' }}>Formato: id;nome;telefone;email;empresa;tags;atendente</p>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', color:'var(--g-500)', cursor:'pointer', fontSize: 22, lineHeight: 1, padding: 4 }}>×</button>
        </div>

        {/* Body */}
        <div style={{ padding: 24, overflowY:'auto', flex: 1 }}>
          {!rows.length && (
            <div
              onDragOver={e => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files?.[0]; if (f) loadFile(f); }}
              style={{
                border: `2px dashed ${dragging ? '#B70C00' : 'var(--g-200)'}`,
                borderRadius: 12, padding: 40, textAlign:'center',
                transition: 'border-color .15s', cursor:'pointer',
                background: dragging ? 'rgba(183,12,0,0.05)' : 'transparent',
              }}
              onClick={() => document.getElementById('crm-csv-input').click()}
            >
              <div style={{ fontSize: 32, marginBottom: 12 }}>📄</div>
              <div style={{ fontSize: 14, fontWeight: 600, color:'var(--g-700)', marginBottom: 6 }}>
                Arraste o CSV aqui ou clique para selecionar
              </div>
              <div style={{ fontSize: 12, color:'var(--g-500)' }}>Suporta separadores ; e ,  ·  UTF-8</div>
              <input id="crm-csv-input" type="file" accept=".csv,.txt" style={{ display:'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) loadFile(f); }}/>
            </div>
          )}

          {rows.length > 0 && !result && (
            <div style={{ display:'flex', flexDirection:'column', gap: 16 }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                <div style={{ fontSize: 13, color:'var(--g-700)' }}>
                  <strong style={{ color:'var(--g-900)' }}>{rows.length}</strong> linhas ·{' '}
                  <strong style={{ color:'#10B981' }}>{validCount} válidas</strong>
                  {skipCount > 0 && <span style={{ color:'#F59E0B' }}> · {skipCount} serão ignoradas</span>}
                </div>
                <button
                  onClick={() => { setRows([]); setHeaders([]); const el = document.getElementById('crm-csv-input'); if (el) el.value = ''; }}
                  style={{ background:'none', border:'none', color:'var(--g-500)', fontSize: 12, cursor:'pointer', textDecoration:'underline' }}
                >
                  Trocar arquivo
                </button>
              </div>

              <div style={{ overflowX:'auto', borderRadius: 8, border:'1px solid var(--g-200)' }}>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize: 12 }}>
                  <thead>
                    <tr>
                      {headers.map(h => (
                        <th key={h} style={{ padding:'8px 12px', background:'var(--g-50)', borderBottom:'1px solid var(--g-200)', textAlign:'left', color:'var(--g-500)', fontWeight: 700, textTransform:'uppercase', letterSpacing: 0.4, whiteSpace:'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 5).map((row, ri) => (
                      <tr key={ri} style={{ borderBottom:'1px solid var(--g-200)' }}>
                        {row.map((cell, ci) => (
                          <td key={ci} style={{ padding:'7px 12px', color:'var(--g-700)', maxWidth: 160, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                            {cell || <span style={{ color:'var(--g-600)' }}>—</span>}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {rows.length > 5 && <div style={{ padding:'8px 12px', fontSize: 11, color:'var(--g-600)', borderTop:'1px solid var(--g-200)' }}>…e mais {rows.length - 5} linhas</div>}
              </div>

              <div style={{ padding:'10px 14px', background:'var(--g-50)', borderRadius: 8, fontSize: 12, color:'var(--g-500)', lineHeight: 1.6 }}>
                Regras de limpeza: nomes vazios, apenas emojis, ou que são números de telefone serão ignorados. Registros já importados (via original_id) serão pulados automaticamente.
              </div>
            </div>
          )}

          {result && (
            <div style={{ display:'flex', flexDirection:'column', gap: 16 }}>
              <div style={{ textAlign:'center', padding: '12px 0' }}>
                <div style={{ fontSize: 40, marginBottom: 8 }}>{result.ok > 0 ? '✅' : '⚠️'}</div>
                <div style={{ fontSize: 18, fontWeight: 700, color:'var(--g-900)' }}>Importação concluída</div>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap: 10 }}>
                <div style={{ padding:'14px 16px', background:'rgba(16,185,129,0.1)', border:'1px solid rgba(16,185,129,0.2)', borderRadius: 10, textAlign:'center' }}>
                  <div style={{ fontSize: 28, fontWeight: 800, color:'#10B981' }}>{result.ok}</div>
                  <div style={{ fontSize: 11, color:'var(--g-700)', marginTop: 4 }}>Importados</div>
                </div>
                <div style={{ padding:'14px 16px', background:'rgba(245,158,11,0.08)', border:'1px solid rgba(245,158,11,0.2)', borderRadius: 10, textAlign:'center' }}>
                  <div style={{ fontSize: 28, fontWeight: 800, color:'#F59E0B' }}>{result.skipped + result.duped}</div>
                  <div style={{ fontSize: 11, color:'var(--g-700)', marginTop: 4 }}>Pulados ({result.duped} já existiam)</div>
                </div>
                {result.err > 0 && (
                  <div style={{ padding:'14px 16px', background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.2)', borderRadius: 10, textAlign:'center', gridColumn:'1/-1' }}>
                    <div style={{ fontSize: 22, fontWeight: 700, color:'#EF4444' }}>{result.err} com erro</div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding:'16px 24px', borderTop:'1px solid var(--g-200)', display:'flex', justifyContent:'flex-end', gap: 8, flexShrink: 0 }}>
          {!result ? (
            <>
              <button className="btn-secondary" onClick={onClose}>Cancelar</button>
              <button
                className="btn-primary"
                style={{ background: (!rows.length || importing) ? 'rgba(183,12,0,0.4)' : '#B70C00', cursor: (!rows.length || importing) ? 'not-allowed' : 'pointer' }}
                disabled={!rows.length || importing}
                onClick={handleImport}
              >
                {importing ? 'Importando…' : `Importar ${validCount} leads`}
              </button>
            </>
          ) : (
            <button className="btn-primary" style={{ background:'#B70C00' }} onClick={onClose}>Concluir</button>
          )}
        </div>
      </div>
    </div>
  );
};

export default CrmScreen;
