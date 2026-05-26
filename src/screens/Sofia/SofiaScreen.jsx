import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase.js';
import LeadsLista from './LeadsLista.jsx';
import SofiaConfig from './SofiaConfig.jsx';

const SOFIA_COLOR = '#8B5CF6';

function SofiaAvatar({ size = 36 }) {
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
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ animation: 'spin 0.8s linear infinite', flexShrink: 0 }}>
      <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2.5" strokeDasharray="60" strokeDashoffset="20" />
    </svg>
  );
}

function Toast({ message, type = 'info', onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3500);
    return () => clearTimeout(t);
  }, [onClose]);
  const colors = { info: SOFIA_COLOR, success: '#16a34a', error: '#dc2626' };
  const color = colors[type] || SOFIA_COLOR;
  return (
    <div style={{
      position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
      padding: '12px 18px', background: '#1e1e2e', borderRadius: 10,
      border: `1px solid ${color}55`, color: 'rgba(255,255,255,0.9)',
      fontSize: 13, fontWeight: 500, boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
      display: 'flex', alignItems: 'center', gap: 10, maxWidth: 360,
    }}>
      <span style={{ color, fontSize: 16 }}>{type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ'}</span>
      <span>{message}</span>
      <button onClick={onClose} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>×</button>
    </div>
  );
}

// ── Pipeline tab: leads grouped by status ──────────────────────────────────────

const PIPELINE_STAGES = [
  { key: 'prospectado',  label: 'Prospectado',  color: '#6b7280' },
  { key: 'contactado',   label: 'Contactado',   color: '#60a5fa' },
  { key: 'interessado',  label: 'Interessado',  color: '#16a34a' },
  { key: 'crm',          label: 'CRM',          color: '#a855f7' },
];

const BRIDGE = import.meta.env.VITE_BRIDGE_URL || 'http://localhost:3001';

function PipelineTab({ tenantDbId, onToast }) {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!tenantDbId) return;
    setLoading(true);
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      const res = await fetch(`${BRIDGE}/api/sofia/leads?tenant_id=${encodeURIComponent(tenantDbId)}&score_min=1&limit=200`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Erro ${res.status}`);
      setLeads(data.leads || []);
    } catch (e) {
      onToast(e.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [tenantDbId, onToast]);

  useEffect(() => { load(); }, [load]);

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 24, color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>
      <Spinner /> Carregando pipeline…
    </div>
  );

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
      {PIPELINE_STAGES.map(stage => {
        const stageLeads = leads.filter(l => l.status === stage.key);
        return (
          <div key={stage.key} style={{
            background: 'rgba(255,255,255,0.02)',
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
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.2)', textAlign: 'center', padding: '12px 0' }}>—</div>
              ) : (
                stageLeads.slice(0, 10).map(lead => {
                  const scoreColor = lead.score >= 8 ? '#16a34a' : lead.score >= 6 ? '#D97706' : '#dc2626';
                  return (
                    <div key={lead.id} style={{
                      padding: '10px 12px',
                      background: 'rgba(255,255,255,0.03)',
                      border: '1px solid rgba(255,255,255,0.07)',
                      borderRadius: 8,
                    }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.85)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {lead.nome}
                      </div>
                      {lead.cidade && (
                        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>{lead.cidade}</div>
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
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', textAlign: 'center' }}>
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

// ── Main ───────────────────────────────────────────────────────────────────────
const TABS = ['Leads', 'Pipeline', 'Configuração'];

export default function SofiaScreen({ tenantDbId, userId }) {
  const [activeTab, setActiveTab] = useState(0);
  const [toast, setToast] = useState(null);
  const [role, setRole] = useState(null);

  useEffect(() => {
    if (!tenantDbId || !userId) return;
    supabase
      .from('tenant_members')
      .select('role')
      .eq('tenant_id', tenantDbId)
      .eq('user_id', userId)
      .maybeSingle()
      .then(({ data }) => setRole(data?.role || 'viewer'));
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
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'rgba(255,255,255,0.9)' }}>
            SOFIA · Prospecção de Leads
          </h1>
          <p style={{ margin: 0, fontSize: 13, color: 'rgba(255,255,255,0.45)' }}>
            Qualifica leads food service automaticamente todos os dias úteis
          </p>
        </div>
        {role && (
          <span style={{
            marginLeft: 'auto', fontSize: 11, fontWeight: 600,
            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 6, padding: '3px 10px', color: 'rgba(255,255,255,0.45)',
          }}>
            {role}
          </span>
        )}
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, background: 'rgba(255,255,255,0.04)', padding: 4, borderRadius: 10 }}>
        {TABS.map((t, i) => (
          <button key={t} onClick={() => setActiveTab(i)} style={{
            flex: 1, padding: '8px 4px', borderRadius: 7, border: 'none', cursor: 'pointer',
            fontSize: 13, fontWeight: 600,
            background: activeTab === i ? SOFIA_COLOR : 'transparent',
            color: activeTab === i ? '#fff' : 'rgba(255,255,255,0.5)',
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
