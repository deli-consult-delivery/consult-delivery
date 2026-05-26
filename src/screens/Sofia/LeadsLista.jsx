import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase.js';
import LeadCard from './LeadCard.jsx';

const SOFIA_COLOR = '#8B5CF6';
const BRIDGE = import.meta.env.VITE_BRIDGE_URL || 'http://localhost:3001';

const inputStyle = {
  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 8, padding: '8px 12px', color: 'rgba(255,255,255,0.85)',
  fontSize: 13, outline: 'none', fontFamily: 'inherit',
};

const btnBase = {
  border: 'none', borderRadius: 7, fontSize: 12, fontWeight: 600,
  cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4,
};

const STATUS_MAP = {
  prospectado:   { label: 'Prospectado',  color: '#6b7280' },
  contactado:    { label: 'Contactado',   color: '#60a5fa' },
  sem_resposta:  { label: 'Sem resposta', color: '#D97706' },
  interessado:   { label: 'Interessado',  color: '#16a34a' },
  nao_fit:       { label: 'Não fit',      color: '#dc2626' },
  crm:           { label: 'CRM',          color: '#a855f7' },
  perdido:       { label: 'Perdido',      color: '#4b5563' },
};

const FONTE_MAP = {
  google_maps: 'Maps',
  ifood: 'iFood',
  instagram: 'Insta',
  manual: 'Manual',
  outro: 'Outro',
};

function Spinner({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ animation: 'spin 0.8s linear infinite', flexShrink: 0 }}>
      <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2.5" strokeDasharray="60" strokeDashoffset="20" />
    </svg>
  );
}

function ScoreChip({ score }) {
  const color = score >= 8 ? '#16a34a' : score >= 6 ? '#D97706' : '#dc2626';
  return (
    <span style={{
      background: `${color}22`, color, border: `1px solid ${color}44`,
      borderRadius: 6, padding: '2px 8px', fontSize: 12, fontWeight: 700,
    }}>{score}</span>
  );
}

async function fetchLeads(tenantDbId, { scoreMin, status, cidade }) {
  const token = (await supabase.auth.getSession()).data.session?.access_token;
  let qs = `/api/sofia/leads?tenant_id=${encodeURIComponent(tenantDbId)}&score_min=${scoreMin}&limit=100`;
  if (status) qs += `&status=${encodeURIComponent(status)}`;
  if (cidade) qs += `&cidade=${encodeURIComponent(cidade)}`;
  const res = await fetch(`${BRIDGE}${qs}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Erro ${res.status}`);
  return data.leads || [];
}

export default function LeadsLista({ tenantDbId, role, onToast }) {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [scoreMin, setScoreMin] = useState(6);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterCidade, setFilterCidade] = useState('');
  const [cidades, setCidades] = useState([]);
  const [selectedLead, setSelectedLead] = useState(null);

  const load = useCallback(async () => {
    if (!tenantDbId) return;
    setLoading(true);
    try {
      const data = await fetchLeads(tenantDbId, { scoreMin, status: filterStatus, cidade: filterCidade });
      setLeads(data);
      const uniqueCidades = [...new Set(data.map(l => l.cidade).filter(Boolean))].sort();
      setCidades(prev => {
        const merged = [...new Set([...prev, ...uniqueCidades])].sort();
        return merged;
      });
    } catch (e) {
      onToast(e.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [tenantDbId, scoreMin, filterStatus, filterCidade, onToast]);

  useEffect(() => { load(); }, [load]);

  const handleLeadUpdated = (updated) => {
    setLeads(prev => prev.map(l => l.id === updated.id ? updated : l));
    setSelectedLead(updated);
  };

  const isAdmin = ['admin', 'dev'].includes(role);

  return (
    <>
      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: '0 0 auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.45)' }}>
              Score mínimo
            </label>
            <span style={{ fontSize: 12, fontWeight: 700, color: SOFIA_COLOR, marginLeft: 8 }}>{scoreMin}</span>
          </div>
          <input
            type="range" min="1" max="10" value={scoreMin}
            onChange={e => setScoreMin(Number(e.target.value))}
            style={{ width: 160, accentColor: SOFIA_COLOR, cursor: 'pointer' }}
          />
        </div>
        <select style={{ ...inputStyle, flex: '1 1 150px' }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">Todos os status</option>
          {Object.entries(STATUS_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select style={{ ...inputStyle, flex: '1 1 150px' }} value={filterCidade} onChange={e => setFilterCidade(e.target.value)}>
          <option value="">Todas as cidades</option>
          {cidades.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <button onClick={load} style={{ ...btnBase, padding: '8px 14px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)' }}>
          {loading ? <Spinner /> : '↻'} Atualizar
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 24, color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>
          <Spinner /> Carregando leads…
        </div>
      ) : leads.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 24px', color: 'rgba(255,255,255,0.4)' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🔭</div>
          <p style={{ fontSize: 14 }}>Nenhum lead encontrado com score ≥ {scoreMin}.</p>
          <p style={{ fontSize: 12 }}>Ajuste o filtro ou aguarde a prospecção diária (dias úteis 12h UTC).</p>
        </div>
      ) : (
        <>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', marginBottom: 10 }}>
            {leads.length} lead{leads.length !== 1 ? 's' : ''} encontrado{leads.length !== 1 ? 's' : ''}
          </div>

          {/* Table header */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: isAdmin ? '1fr 120px 80px 130px 160px' : '1fr 120px 80px 130px 80px',
            gap: 8, padding: '6px 12px',
            fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.35)',
            letterSpacing: 0.5, borderBottom: '1px solid rgba(255,255,255,0.07)',
          }}>
            <div>NOME / LOCAL</div>
            <div>FONTE</div>
            <div>SCORE</div>
            <div>STATUS</div>
            <div>AÇÕES</div>
          </div>

          {/* Rows */}
          {leads.map(lead => {
            const statusInfo = STATUS_MAP[lead.status] || { label: lead.status, color: '#6b7280' };
            return (
              <div
                key={lead.id}
                onClick={() => setSelectedLead(lead)}
                style={{
                  display: 'grid',
                  gridTemplateColumns: isAdmin ? '1fr 120px 80px 130px 160px' : '1fr 120px 80px 130px 80px',
                  gap: 8, padding: '10px 12px', cursor: 'pointer',
                  borderBottom: '1px solid rgba(255,255,255,0.05)',
                  alignItems: 'center',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
              >
                {/* Nome */}
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.88)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {lead.nome}
                  </div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
                    {[lead.bairro, lead.cidade].filter(Boolean).join(' · ')}
                  </div>
                </div>

                {/* Fonte */}
                <div>
                  <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
                    {FONTE_MAP[lead.fonte] || lead.fonte}
                  </span>
                </div>

                {/* Score */}
                <div><ScoreChip score={lead.score} /></div>

                {/* Status */}
                <div>
                  <span style={{
                    background: `${statusInfo.color}22`, color: statusInfo.color,
                    border: `1px solid ${statusInfo.color}44`, borderRadius: 6,
                    padding: '2px 8px', fontSize: 11, fontWeight: 600,
                  }}>
                    {statusInfo.label}
                  </span>
                </div>

                {/* Ações */}
                <div style={{ display: 'flex', gap: 4 }} onClick={e => e.stopPropagation()}>
                  <button
                    onClick={() => setSelectedLead(lead)}
                    style={{ ...btnBase, padding: '4px 10px', background: `${SOFIA_COLOR}18`, border: `1px solid ${SOFIA_COLOR}33`, color: SOFIA_COLOR, fontSize: 11 }}
                  >
                    Ver
                  </button>
                  {isAdmin && lead.status !== 'crm' && (
                    <button
                      onClick={async () => {
                        const token = (await supabase.auth.getSession()).data.session?.access_token;
                        try {
                          const res = await fetch(`${BRIDGE}/api/sofia/leads/${lead.id}/promote`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                            body: JSON.stringify({ tenant_id: tenantDbId }),
                          });
                          const data = await res.json();
                          if (!res.ok) throw new Error(data.error || `Erro ${res.status}`);
                          onToast(`${lead.nome} → CRM`, 'success');
                          setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, status: 'crm' } : l));
                        } catch (e) {
                          onToast(e.message, 'error');
                        }
                      }}
                      style={{ ...btnBase, padding: '4px 10px', background: 'rgba(168,85,247,0.12)', border: '1px solid rgba(168,85,247,0.25)', color: '#a855f7', fontSize: 11 }}
                    >
                      CRM
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </>
      )}

      {/* Lead detail drawer */}
      {selectedLead && (
        <LeadCard
          lead={selectedLead}
          role={role}
          tenantDbId={tenantDbId}
          onClose={() => setSelectedLead(null)}
          onUpdated={handleLeadUpdated}
          onToast={onToast}
        />
      )}
    </>
  );
}
