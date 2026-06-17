import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase.js';

const SOFIA_COLOR = '#8B5CF6';
const BRIDGE = import.meta.env.VITE_BRIDGE_URL || 'http://localhost:3001';

// ── Shared styles ─────────────────────────────────────────────────────────────
const inputStyle = {
  background: 'var(--bg)', border: '1px solid var(--line)',
  borderRadius: 8, padding: '8px 12px', color: 'var(--tx)',
  fontSize: 13, outline: 'none', fontFamily: 'inherit',
};

const cardStyle = {
  padding: 14,
  background: 'var(--panel)',
  border: '1px solid var(--line)',
  borderRadius: 10,
};

const btnBase = {
  border: 'none', borderRadius: 7, fontSize: 12, fontWeight: 600,
  cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4,
};

// ── Constants ─────────────────────────────────────────────────────────────────
const STATUS_MAP = {
  prospectado:  { label: 'Prospectado',  color: '#6b7280' },
  contactado:   { label: 'Contactado',   color: '#60a5fa' },
  sem_resposta: { label: 'Sem resposta', color: '#D97706' },
  interessado:  { label: 'Interessado',  color: '#16a34a' },
  nao_fit:      { label: 'Não fit',      color: '#dc2626' },
  crm:          { label: 'CRM',          color: '#a855f7' },
  perdido:      { label: 'Perdido',      color: '#4b5563' },
};

const FONTE_MAP_SHORT = {
  google_maps: 'Maps',
  ifood: 'iFood',
  instagram: 'Insta',
  manual: 'Manual',
  outro: 'Outro',
};

const FONTE_MAP = {
  google_maps: { label: 'Google Maps', color: '#4285f4' },
  ifood:       { label: 'iFood',       color: '#ea1d2c' },
  instagram:   { label: 'Instagram',   color: '#e1306c' },
  manual:      { label: 'Manual',      color: '#6b7280' },
  outro:       { label: 'Outro',       color: '#64748b' },
};

const PIPELINE_STAGES = [
  { key: 'prospectado', label: 'Prospectado', color: '#6b7280' },
  { key: 'contactado',  label: 'Contactado',  color: '#60a5fa' },
  { key: 'interessado', label: 'Interessado', color: '#16a34a' },
  { key: 'crm',         label: 'CRM',         color: '#a855f7' },
];

const CIDADES_DEFAULT = ['São Paulo', 'Campinas', 'Santos'];
const QUERIES_DEFAULT = [
  'restaurante delivery',
  'hamburgueria artesanal',
  'pizzaria delivery',
  'comida saudável delivery',
];

// ── Helpers ───────────────────────────────────────────────────────────────────
export function SofiaAvatar({ size = 36 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: `linear-gradient(135deg, ${SOFIA_COLOR}, #6D28D9)`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.4, fontWeight: 700, color: '#fff', flexShrink: 0,
    }}>S</div>
  );
}

function Spinner({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24"
      style={{ animation: 'spin 0.8s linear infinite', flexShrink: 0 }}>
      <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor"
        strokeWidth="2.5" strokeDasharray="60" strokeDashoffset="20" />
    </svg>
  );
}

// ── Toast ─────────────────────────────────────────────────────────────────────
export function Toast({ message, type = 'info', onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3500);
    return () => clearTimeout(t);
  }, [onClose]);
  const colors = { info: SOFIA_COLOR, success: '#16a34a', error: '#dc2626' };
  const color = colors[type] || SOFIA_COLOR;
  return (
    <div style={{
      position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
      padding: '12px 18px', background: 'var(--panel)', borderRadius: 10,
      border: `1px solid ${color}55`, color: 'var(--ink)',
      fontSize: 13, fontWeight: 500, boxShadow: '0 4px 24px rgba(0,0,0,0.12)',
      display: 'flex', alignItems: 'center', gap: 10, maxWidth: 360,
    }}>
      <span style={{ color, fontSize: 16 }}>{type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ'}</span>
      <span>{message}</span>
      <button onClick={onClose} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--tx2)', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>×</button>
    </div>
  );
}

// ── ScoreChip ─────────────────────────────────────────────────────────────────
export function ScoreChip({ score }) {
  const color = score >= 8 ? '#16a34a' : score >= 6 ? '#D97706' : '#dc2626';
  return (
    <span style={{
      background: `${color}22`, color, border: `1px solid ${color}44`,
      borderRadius: 6, padding: '2px 8px', fontSize: 12, fontWeight: 700,
    }}>{score}</span>
  );
}

// ── ScoreBar ──────────────────────────────────────────────────────────────────
export function ScoreBar({ score }) {
  const color = score >= 8 ? '#16a34a' : score >= 6 ? '#D97706' : '#dc2626';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{
        background: `${color}22`, color, border: `1px solid ${color}44`,
        borderRadius: 8, padding: '4px 12px', fontSize: 18, fontWeight: 800,
      }}>{score}</span>
      <div style={{ flex: 1, height: 6, background: 'var(--line)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${score * 10}%`, height: '100%', background: color, borderRadius: 3, transition: 'width 0.3s' }} />
      </div>
      <span style={{ fontSize: 11, color: 'var(--tx2)' }}>/ 10</span>
    </div>
  );
}

// ── Bridge call helper ────────────────────────────────────────────────────────
async function bridgeCall(method, endpoint, body) {
  const token = (await supabase.auth.getSession()).data.session?.access_token;
  const res = await fetch(`${BRIDGE}${endpoint}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Erro ${res.status}`);
  return data;
}

// ── fetchLeads helper ─────────────────────────────────────────────────────────
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

// ── LeadCard (side drawer) ────────────────────────────────────────────────────
export function LeadCard({ lead, role, tenantDbId, onClose, onUpdated, onToast }) {
  const [changingStatus, setChangingStatus] = useState(false);
  const [newStatus, setNewStatus] = useState(lead.status);
  const [loading, setLoading] = useState(false);

  if (!lead) return null;

  const isAdmin = ['admin', 'dev'].includes(role);
  const fonte = FONTE_MAP[lead.fonte] || { label: lead.fonte, color: '#6b7280' };
  const statusInfo = STATUS_MAP[lead.status] || { label: lead.status, color: '#6b7280' };

  const handleStatusChange = async () => {
    if (newStatus === lead.status) { setChangingStatus(false); return; }
    setLoading(true);
    try {
      await bridgeCall('PATCH', `/api/sofia/leads/${lead.id}/status`, {
        tenant_id: tenantDbId,
        status: newStatus,
      });
      onToast(`Status → ${STATUS_MAP[newStatus]?.label || newStatus}`, 'success');
      onUpdated({ ...lead, status: newStatus });
    } catch (e) {
      onToast(e.message, 'error');
    } finally {
      setLoading(false);
      setChangingStatus(false);
    }
  };

  const handlePromote = async () => {
    setLoading(true);
    try {
      await bridgeCall('POST', `/api/sofia/leads/${lead.id}/promote`, {
        tenant_id: tenantDbId,
      });
      onToast(`${lead.nome} adicionado ao CRM`, 'success');
      onUpdated({ ...lead, status: 'crm' });
    } catch (e) {
      onToast(e.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const dados = lead.dados_json;
  const dadosEntries = dados ? Object.entries(dados) : [];

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', justifyContent: 'flex-end' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)' }} />
      <div style={{
        position: 'relative', width: 500, maxWidth: '100vw',
        background: 'var(--bg)', borderLeft: '1px solid var(--line)',
        display: 'flex', flexDirection: 'column', overflowY: 'auto', zIndex: 1,
      }}>
        {/* Header */}
        <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 700, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {lead.nome}
            </h2>
            <p style={{ margin: '0 0 10px', fontSize: 13, color: 'var(--tx2)' }}>
              {[lead.bairro, lead.cidade].filter(Boolean).join(' · ')}
            </p>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <span style={{ background: `${fonte.color}22`, color: fonte.color, border: `1px solid ${fonte.color}44`, borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 600 }}>
                {fonte.label}
              </span>
              <span style={{ background: `${statusInfo.color}22`, color: statusInfo.color, border: `1px solid ${statusInfo.color}44`, borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 600 }}>
                {statusInfo.label}
              </span>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--tx2)', cursor: 'pointer', fontSize: 22, lineHeight: 1, flexShrink: 0 }}>×</button>
        </div>

        {/* Body */}
        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16, flex: 1 }}>
          {/* Score */}
          <div style={cardStyle}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--tx2)', marginBottom: 10, letterSpacing: 1 }}>SCORE SOFIA</div>
            <ScoreBar score={lead.score} />
          </div>

          {/* Justificativa */}
          {lead.justificativa && (
            <div style={cardStyle}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--tx2)', marginBottom: 10, letterSpacing: 1 }}>ANÁLISE SOFIA</div>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--tx)', lineHeight: 1.6 }}>{lead.justificativa}</p>
            </div>
          )}

          {/* Contato */}
          <div style={cardStyle}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--tx2)', marginBottom: 10, letterSpacing: 1 }}>CONTATO</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {lead.telefone && (
                <div style={{ fontSize: 13, color: 'var(--tx)' }}>📱 {lead.telefone}</div>
              )}
              {lead.instagram && (
                <div style={{ fontSize: 13, color: 'var(--tx)' }}>
                  📸 <a href={`https://instagram.com/${lead.instagram.replace('@', '')}`} target="_blank" rel="noreferrer" style={{ color: '#e1306c' }}>
                    {lead.instagram.startsWith('@') ? lead.instagram : `@${lead.instagram}`}
                  </a>
                </div>
              )}
              {lead.ifood_url && (
                <div style={{ fontSize: 13, color: 'var(--tx)' }}>
                  🍔 <a href={lead.ifood_url} target="_blank" rel="noreferrer" style={{ color: '#ea1d2c' }}>Ver no iFood</a>
                </div>
              )}
              {lead.gmaps_url && (
                <div style={{ fontSize: 13, color: 'var(--tx)' }}>
                  📍 <a href={lead.gmaps_url} target="_blank" rel="noreferrer" style={{ color: '#4285f4' }}>Ver no Maps</a>
                </div>
              )}
              {!lead.telefone && !lead.instagram && !lead.ifood_url && !lead.gmaps_url && (
                <div style={{ fontSize: 12, color: 'var(--tx2)' }}>Sem dados de contato</div>
              )}
            </div>
          </div>

          {/* Dados JSON */}
          {dadosEntries.length > 0 && (
            <div style={cardStyle}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--tx2)', marginBottom: 10, letterSpacing: 1 }}>DADOS COLETADOS</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {dadosEntries.map(([k, v]) => (
                  <div key={k}>
                    <div style={{ fontSize: 10, color: 'var(--tx2)', fontWeight: 600, textTransform: 'uppercase' }}>{k.replace(/_/g, ' ')}</div>
                    <div style={{ fontSize: 13, color: 'var(--tx)', marginTop: 2 }}>
                      {typeof v === 'boolean' ? (v ? '✓ Sim' : '✗ Não') : String(v)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Meta */}
          <div style={{ fontSize: 11, color: 'var(--tx2)', display: 'flex', gap: 12 }}>
            <span>Criado: {new Date(lead.created_at).toLocaleDateString('pt-BR')}</span>
            {lead.crm_id && <span>CRM ID: {lead.crm_id.slice(0, 8)}…</span>}
          </div>
        </div>

        {/* Footer actions */}
        {isAdmin && (
          <div style={{ padding: 16, borderTop: '1px solid var(--line)', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {changingStatus ? (
              <div style={{ display: 'flex', gap: 8 }}>
                <select
                  value={newStatus}
                  onChange={e => setNewStatus(e.target.value)}
                  style={{ ...inputStyle, flex: 1 }}
                >
                  {Object.entries(STATUS_MAP).map(([k, v]) => (
                    <option key={k} value={k}>{v.label}</option>
                  ))}
                </select>
                <button
                  disabled={loading}
                  onClick={handleStatusChange}
                  style={{ ...btnBase, padding: '8px 14px', background: 'rgba(22,163,74,0.15)', border: '1px solid rgba(22,163,74,0.3)', color: '#16a34a' }}
                >
                  Salvar
                </button>
                <button
                  onClick={() => { setChangingStatus(false); setNewStatus(lead.status); }}
                  style={{ ...btnBase, padding: '8px 12px', background: 'var(--panel)', border: '1px solid var(--line)', color: 'var(--tx2)' }}
                >
                  ✕
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  onClick={() => setChangingStatus(true)}
                  style={{ ...btnBase, padding: '8px 14px', background: `${SOFIA_COLOR}18`, border: `1px solid ${SOFIA_COLOR}33`, color: SOFIA_COLOR }}
                >
                  Alterar status
                </button>
                {lead.status !== 'crm' && (
                  <button
                    disabled={loading}
                    onClick={handlePromote}
                    style={{ ...btnBase, padding: '8px 14px', background: 'rgba(168,85,247,0.15)', border: '1px solid rgba(168,85,247,0.3)', color: '#a855f7', opacity: loading ? 0.5 : 1, cursor: loading ? 'not-allowed' : 'pointer' }}
                  >
                    ★ Adicionar ao CRM
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── LeadsLista ────────────────────────────────────────────────────────────────
export function LeadsLista({ tenantDbId, role, onToast }) {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [promoting, setPromoting] = useState(null);
  const [scoreMin, setScoreMin] = useState(6);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterCidade, setFilterCidade] = useState('');
  const [cidades, setCidades] = useState([]);
  const [selectedLead, setSelectedLead] = useState(null);

  const load = useCallback(() => {
    if (!tenantDbId) return;
    setLoading(true);
    let cancelled = false;
    fetchLeads(tenantDbId, { scoreMin, status: filterStatus, cidade: filterCidade })
      .then(data => {
        if (cancelled) return;
        setLeads(data);
        const uniqueCidades = [...new Set(data.map(l => l.cidade).filter(Boolean))].sort();
        setCidades(prev => [...new Set([...prev, ...uniqueCidades])].sort());
      })
      .catch(e => { if (!cancelled) onToast(e.message, 'error'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [tenantDbId, scoreMin, filterStatus, filterCidade, onToast]);

  useEffect(() => {
    const cleanup = load();
    return cleanup;
  }, [load]);

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
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--tx2)' }}>
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
        <button
          aria-label="Atualizar lista"
          onClick={load}
          style={{ ...btnBase, padding: '8px 14px', background: 'var(--panel)', border: '1px solid var(--line)', color: 'var(--tx)' }}
        >
          {loading ? <Spinner /> : '↻'} Atualizar
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 24, color: 'var(--tx2)', fontSize: 13 }}>
          <Spinner /> Carregando leads…
        </div>
      ) : leads.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--tx2)' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🔭</div>
          <p style={{ fontSize: 14 }}>Nenhum lead encontrado com score ≥ {scoreMin}.</p>
          <p style={{ fontSize: 12 }}>Ajuste o filtro ou aguarde a prospecção diária (dias úteis 12h UTC).</p>
        </div>
      ) : (
        <>
          <div style={{ fontSize: 12, color: 'var(--tx2)', marginBottom: 10 }}>
            {leads.length} lead{leads.length !== 1 ? 's' : ''} encontrado{leads.length !== 1 ? 's' : ''}
          </div>

          {/* Table header */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: isAdmin ? '1fr 120px 80px 130px 160px' : '1fr 120px 80px 130px 80px',
            gap: 8, padding: '6px 12px',
            fontSize: 11, fontWeight: 700, color: 'var(--tx2)',
            letterSpacing: 0.5, borderBottom: '1px solid var(--line)',
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
                tabIndex={0}
                onClick={() => setSelectedLead(lead)}
                onKeyDown={e => e.key === 'Enter' && setSelectedLead(lead)}
                style={{
                  display: 'grid',
                  gridTemplateColumns: isAdmin ? '1fr 120px 80px 130px 160px' : '1fr 120px 80px 130px 80px',
                  gap: 8, padding: '10px 12px', cursor: 'pointer',
                  borderBottom: '1px solid var(--line)',
                  alignItems: 'center',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--panel)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
              >
                {/* Nome */}
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {lead.nome}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--tx2)' }}>
                    {[lead.bairro, lead.cidade].filter(Boolean).join(' · ')}
                  </div>
                </div>

                {/* Fonte */}
                <div>
                  <span style={{ fontSize: 12, color: 'var(--tx2)' }}>
                    {FONTE_MAP_SHORT[lead.fonte] || lead.fonte}
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
                        if (promoting) return;
                        setPromoting(lead.id);
                        try {
                          await bridgeCall('POST', `/api/sofia/leads/${lead.id}/promote`, { tenant_id: tenantDbId });
                          onToast(`${lead.nome} → CRM`, 'success');
                          setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, status: 'crm' } : l));
                        } catch (e) {
                          onToast(e.message, 'error');
                        } finally {
                          setPromoting(null);
                        }
                      }}
                      disabled={promoting === lead.id}
                      style={{ ...btnBase, padding: '4px 10px', background: 'rgba(168,85,247,0.12)', border: '1px solid rgba(168,85,247,0.25)', color: '#a855f7', fontSize: 11, opacity: promoting === lead.id ? 0.5 : 1, cursor: promoting === lead.id ? 'not-allowed' : 'pointer' }}
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

// ── PipelineTab ───────────────────────────────────────────────────────────────
export function PipelineTab({ tenantDbId, onToast }) {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    if (!tenantDbId) return;
    setLoading(true);
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      const token = data.session?.access_token;
      return fetch(`${BRIDGE}/api/sofia/leads?tenant_id=${encodeURIComponent(tenantDbId)}&score_min=1&limit=200`, {
        headers: { Authorization: `Bearer ${token}` },
      });
    })
    .then(res => res.json().then(d => ({ res, d })))
    .then(({ res, d }) => {
      if (cancelled) return;
      if (!res.ok) throw new Error(d.error || `Erro ${res.status}`);
      setLeads(d.leads || []);
    })
    .catch(e => { if (!cancelled) onToast(e.message, 'error'); })
    .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [tenantDbId, onToast]);

  useEffect(() => {
    const cleanup = load();
    return cleanup;
  }, [load]);

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 24, color: 'var(--tx2)', fontSize: 13 }}>
      <Spinner /> Carregando pipeline…
    </div>
  );

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
      {PIPELINE_STAGES.map(stage => {
        const stageLeads = leads.filter(l => l.status === stage.key);
        return (
          <div key={stage.key} style={{
            background: 'var(--panel)',
            border: `1px solid ${stage.color}33`,
            borderRadius: 12, padding: 14,
          }}>
            {/* Column header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: stage.color, letterSpacing: 0.5 }}>
                {stage.label.toUpperCase()}
              </span>
              <span style={{
                background: `${stage.color}22`, color: stage.color,
                borderRadius: 12, padding: '1px 8px', fontSize: 11, fontWeight: 700,
              }}>
                {stageLeads.length}
              </span>
            </div>

            {/* Cards */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {stageLeads.length === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--tx2)', textAlign: 'center', padding: '12px 0' }}>—</div>
              ) : (
                stageLeads.slice(0, 10).map(lead => {
                  const scoreColor = lead.score >= 8 ? '#16a34a' : lead.score >= 6 ? '#D97706' : '#dc2626';
                  return (
                    <div key={lead.id} style={{
                      padding: '10px 12px',
                      background: 'var(--bg)',
                      border: '1px solid var(--line)',
                      borderRadius: 8,
                    }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {lead.nome}
                      </div>
                      {lead.cidade && (
                        <div style={{ fontSize: 11, color: 'var(--tx2)', marginTop: 2 }}>{lead.cidade}</div>
                      )}
                      <div style={{ marginTop: 6 }}>
                        <span style={{
                          background: `${scoreColor}22`, color: scoreColor,
                          border: `1px solid ${scoreColor}44`, borderRadius: 4,
                          padding: '1px 6px', fontSize: 11, fontWeight: 700,
                        }}>{lead.score}</span>
                      </div>
                    </div>
                  );
                })
              )}
              {stageLeads.length > 10 && (
                <div style={{ fontSize: 11, color: 'var(--tx2)', textAlign: 'center' }}>
                  +{stageLeads.length - 10} mais
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── SofiaConfig ───────────────────────────────────────────────────────────────
export function SofiaConfig({ role }) {
  const isAdmin = ['admin', 'dev'].includes(role);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 640 }}>

      {/* Agendamento */}
      <div style={cardStyle}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--tx2)', marginBottom: 12, letterSpacing: 1 }}>AGENDAMENTO</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[
            ['Frequência', 'Dias úteis (seg–sex)'],
            ['Horário', '12h UTC (9h BRT)'],
          ].map(([k, v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 13, color: 'var(--tx2)' }}>{k}</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{v}</span>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 13, color: 'var(--tx2)' }}>Cron</span>
            <code style={{ fontSize: 12, color: SOFIA_COLOR, background: `${SOFIA_COLOR}18`, padding: '2px 8px', borderRadius: 4 }}>0 12 * * 1-5</code>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 13, color: 'var(--tx2)' }}>Plataforma</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>Trigger.dev (sofia-prospect)</span>
          </div>
        </div>
      </div>

      {/* Cidades */}
      <div style={cardStyle}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--tx2)', marginBottom: 12, letterSpacing: 1 }}>CIDADES PROSPECTADAS</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {CIDADES_DEFAULT.map(c => (
            <span key={c} style={{
              background: `${SOFIA_COLOR}18`, color: SOFIA_COLOR,
              border: `1px solid ${SOFIA_COLOR}33`, borderRadius: 8,
              padding: '6px 14px', fontSize: 13, fontWeight: 600,
            }}>{c}</span>
          ))}
        </div>
        {isAdmin && (
          <p style={{ margin: '12px 0 0', fontSize: 12, color: 'var(--tx2)' }}>
            Configuração via <code style={{ color: 'var(--tx)' }}>CIDADES_DEFAULT</code> em <code style={{ color: 'var(--tx)' }}>trigger/sofia/sofia-prospect.ts</code>.
            Configuração dinâmica por tenant será adicionada em G02 v2.
          </p>
        )}
      </div>

      {/* Queries */}
      <div style={cardStyle}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--tx2)', marginBottom: 12, letterSpacing: 1 }}>BUSCAS REALIZADAS</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {QUERIES_DEFAULT.map(q => (
            <div key={q} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ color: SOFIA_COLOR, fontSize: 14 }}>🔍</span>
              <span style={{ fontSize: 13, color: 'var(--tx)' }}>{q}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ICP */}
      <div style={cardStyle}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--tx2)', marginBottom: 12, letterSpacing: 1 }}>PERFIL IDEAL DE CLIENTE (ICP)</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[
            ['GMV estimado', 'R$80.000+/mês'],
            ['Tecnologia', 'iFood Premium ou Pro'],
            ['Engajamento', 'Posts ativos no Instagram (últimos 30 dias)'],
            ['Segmento', 'Restaurante, hamburgueria, pizzaria, saudável'],
            ['Ticket médio', '>R$40'],
          ].map(([k, v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <span style={{ fontSize: 12, color: 'var(--tx2)', flexShrink: 0 }}>{k}</span>
              <span style={{ fontSize: 12, color: 'var(--tx)', textAlign: 'right' }}>{v}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Score rubric */}
      <div style={cardStyle}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--tx2)', marginBottom: 12, letterSpacing: 1 }}>RUBRICA DE SCORE (1–10)</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[
            { range: '8–10', desc: 'Todos os critérios do ICP atendidos + indícios de escala', color: '#16a34a' },
            { range: '6–7',  desc: 'Maioria atendida, 1–2 gaps menores', color: '#D97706' },
            { range: '4–5',  desc: 'Potencial mas gaps significativos', color: '#f97316' },
            { range: '1–3',  desc: 'Não fit — lanchonete simples, sem presença digital', color: '#dc2626' },
          ].map(({ range, desc, color }) => (
            <div key={range} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <span style={{ background: `${color}22`, color, border: `1px solid ${color}44`, borderRadius: 6, padding: '2px 10px', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                {range}
              </span>
              <span style={{ fontSize: 12, color: 'var(--tx)', lineHeight: 1.4 }}>{desc}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Meta */}
      <div style={{ fontSize: 11, color: 'var(--tx2)', textAlign: 'center' }}>
        Meta D60: ≥100 leads com score ≥6 · ≥15 em status CRM
      </div>
    </div>
  );
}

// ── Sofia (main screen) ───────────────────────────────────────────────────────
const TABS = ['Leads', 'Pipeline', 'Configuração'];

export default function Sofia({ tenantDbId, userId }) {
  const [activeTab, setActiveTab] = useState(0);
  const [toast, setToast] = useState(null);
  const [role, setRole] = useState(null);

  useEffect(() => {
    if (!tenantDbId || !userId) return;
    let cancelled = false;
    supabase.from('tenant_members').select('role')
      .eq('tenant_id', tenantDbId).eq('user_id', userId).maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) console.error('[Sofia] role fetch:', error.message);
        setRole(data?.role || 'viewer');
      });
    return () => { cancelled = true; };
  }, [tenantDbId, userId]);

  const showToast = useCallback((message, type = 'info') => {
    setToast({ message, type, key: Date.now() });
  }, []);

  return (
    <div style={{ padding: '24px', maxWidth: 1000, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <SofiaAvatar size={42} />
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'var(--ink)' }}>
            SOFIA · Prospecção de Leads
          </h1>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--tx2)' }}>
            Qualifica leads food service automaticamente todos os dias úteis
          </p>
        </div>
        {role && (
          <span style={{
            marginLeft: 'auto', fontSize: 11, fontWeight: 600,
            background: 'var(--panel)', border: '1px solid var(--line)',
            borderRadius: 6, padding: '3px 10px', color: 'var(--tx2)',
          }}>
            {role}
          </span>
        )}
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, background: 'var(--panel)', padding: 4, borderRadius: 10 }}>
        {TABS.map((t, i) => (
          <button key={t} onClick={() => setActiveTab(i)} style={{
            flex: 1, padding: '8px 4px', borderRadius: 7, border: 'none', cursor: 'pointer',
            fontSize: 13, fontWeight: 600,
            background: activeTab === i ? SOFIA_COLOR : 'transparent',
            color: activeTab === i ? '#fff' : 'var(--tx2)',
            transition: 'all 0.15s',
          }}>
            {t}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 0 && <LeadsLista tenantDbId={tenantDbId} role={role} onToast={showToast} />}
      {activeTab === 1 && <PipelineTab tenantDbId={tenantDbId} onToast={showToast} />}
      {activeTab === 2 && <SofiaConfig role={role} />}

      {/* Toast */}
      {toast && (
        <Toast key={toast.key} message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
