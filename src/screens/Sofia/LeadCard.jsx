import { useState } from 'react';
import { supabase } from '../../lib/supabase.js';

const SOFIA_COLOR = '#8B5CF6';
const BRIDGE = import.meta.env.VITE_BRIDGE_URL || 'http://localhost:3001';

const cardStyle = {
  padding: 14,
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 10,
};

const btnBase = {
  border: 'none', borderRadius: 7, fontSize: 12, fontWeight: 600,
  cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4,
};

const inputStyle = {
  width: '100%', boxSizing: 'border-box',
  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 8, padding: '8px 12px', color: 'rgba(255,255,255,0.85)',
  fontSize: 13, outline: 'none', fontFamily: 'inherit',
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
  google_maps: { label: 'Google Maps', color: '#4285f4' },
  ifood:       { label: 'iFood',       color: '#ea1d2c' },
  instagram:   { label: 'Instagram',   color: '#e1306c' },
  manual:      { label: 'Manual',      color: '#6b7280' },
  outro:       { label: 'Outro',       color: '#64748b' },
};

function ScoreBar({ score }) {
  const color = score >= 8 ? '#16a34a' : score >= 6 ? '#D97706' : '#dc2626';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{
        background: `${color}22`, color, border: `1px solid ${color}44`,
        borderRadius: 8, padding: '4px 12px', fontSize: 18, fontWeight: 800,
      }}>{score}</span>
      <div style={{ flex: 1, height: 6, background: 'rgba(255,255,255,0.08)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${score * 10}%`, height: '100%', background: color, borderRadius: 3, transition: 'width 0.3s' }} />
      </div>
      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>/ 10</span>
    </div>
  );
}

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

export default function LeadCard({ lead, role, tenantDbId, onClose, onUpdated, onToast }) {
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
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)' }} />
      <div style={{
        position: 'relative', width: 500, maxWidth: '100vw',
        background: '#0f0f1a', borderLeft: '1px solid rgba(255,255,255,0.1)',
        display: 'flex', flexDirection: 'column', overflowY: 'auto', zIndex: 1,
      }}>
        {/* Header */}
        <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 700, color: 'rgba(255,255,255,0.92)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {lead.nome}
            </h2>
            <p style={{ margin: '0 0 10px', fontSize: 13, color: 'rgba(255,255,255,0.45)' }}>
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
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: 22, lineHeight: 1, flexShrink: 0 }}>×</button>
        </div>

        {/* Body */}
        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16, flex: 1 }}>

          {/* Score */}
          <div style={cardStyle}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.35)', marginBottom: 10, letterSpacing: 1 }}>SCORE SOFIA</div>
            <ScoreBar score={lead.score} />
          </div>

          {/* Justificativa */}
          {lead.justificativa && (
            <div style={cardStyle}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.35)', marginBottom: 10, letterSpacing: 1 }}>ANÁLISE SOFIA</div>
              <p style={{ margin: 0, fontSize: 13, color: 'rgba(255,255,255,0.78)', lineHeight: 1.6 }}>{lead.justificativa}</p>
            </div>
          )}

          {/* Contato */}
          <div style={cardStyle}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.35)', marginBottom: 10, letterSpacing: 1 }}>CONTATO</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {lead.telefone && (
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)' }}>
                  📱 {lead.telefone}
                </div>
              )}
              {lead.instagram && (
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)' }}>
                  📸 <a href={`https://instagram.com/${lead.instagram.replace('@', '')}`} target="_blank" rel="noreferrer" style={{ color: '#e1306c' }}>
                    {lead.instagram.startsWith('@') ? lead.instagram : `@${lead.instagram}`}
                  </a>
                </div>
              )}
              {lead.ifood_url && (
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)' }}>
                  🍔 <a href={lead.ifood_url} target="_blank" rel="noreferrer" style={{ color: '#ea1d2c' }}>Ver no iFood</a>
                </div>
              )}
              {lead.gmaps_url && (
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)' }}>
                  📍 <a href={lead.gmaps_url} target="_blank" rel="noreferrer" style={{ color: '#4285f4' }}>Ver no Maps</a>
                </div>
              )}
              {!lead.telefone && !lead.instagram && !lead.ifood_url && !lead.gmaps_url && (
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>Sem dados de contato</div>
              )}
            </div>
          </div>

          {/* Dados JSON */}
          {dadosEntries.length > 0 && (
            <div style={cardStyle}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.35)', marginBottom: 10, letterSpacing: 1 }}>DADOS COLETADOS</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {dadosEntries.map(([k, v]) => (
                  <div key={k}>
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', fontWeight: 600, textTransform: 'uppercase' }}>{k.replace(/_/g, ' ')}</div>
                    <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)', marginTop: 2 }}>
                      {typeof v === 'boolean' ? (v ? '✓ Sim' : '✗ Não') : String(v)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Meta */}
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', display: 'flex', gap: 12 }}>
            <span>Criado: {new Date(lead.created_at).toLocaleDateString('pt-BR')}</span>
            {lead.crm_id && <span>CRM ID: {lead.crm_id.slice(0, 8)}…</span>}
          </div>
        </div>

        {/* Footer actions */}
        {isAdmin && (
          <div style={{ padding: 16, borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', flexDirection: 'column', gap: 10 }}>
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
                  style={{ ...btnBase, padding: '8px 12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.4)' }}
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
