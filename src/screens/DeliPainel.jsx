import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase.js';

const BRIDGE_URL = import.meta.env.VITE_BRIDGE_URL || 'https://bridge.consultdelivery.com.br';

function badge(level) {
  if (level === 'vermelho') return { bg: '#B70C00', label: '🔴 VERMELHO' };
  if (level === 'amarelo')  return { bg: '#B58900', label: '🟡 AMARELO' };
  return { bg: '#2D7A2D', label: '🟢 VERDE' };
}

function relTime(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return `${min}min atrás`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h atrás`;
  return `${Math.floor(h / 24)}d atrás`;
}

function expiresIn(iso) {
  if (!iso) return null;
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return 'expirado';
  const h = Math.floor(diff / 3600000);
  if (h < 1) return `${Math.floor(diff / 60000)}min`;
  return `${h}h`;
}

export default function DeliPainel({ tenantDbId, userId }) {
  const [pending, setPending] = useState([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState({});
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!tenantDbId) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: sbErr } = await supabase
        .from('deli_pending_approvals')
        .select('id, trigger_id, autonomy_level, summary, context_jsonb, proposed_action_jsonb, reasoning, expires_at, created_at')
        .eq('tenant_id', tenantDbId)
        .eq('status', 'waiting')
        .order('created_at', { ascending: false })
        .limit(50);
      if (sbErr) throw sbErr;
      setPending(data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [tenantDbId]);

  useEffect(() => { load(); }, [load]);

  async function getToken() {
    const { data } = await supabase.auth.getSession();
    return data?.session?.access_token;
  }

  async function act(id, action, reason) {
    setActing(prev => ({ ...prev, [id]: action }));
    try {
      const token = await getToken();
      const r = await fetch(`${BRIDGE_URL}/api/deli/${action}/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ tenant_id: tenantDbId, ...(reason ? { reason } : {}) }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error || `HTTP ${r.status}`);
      }
      await load();
    } catch (err) {
      alert(`Erro ao ${action}: ${err.message}`);
    } finally {
      setActing(prev => { const n = { ...prev }; delete n[id]; return n; });
    }
  }

  return (
    <div style={{ padding: '24px 20px', maxWidth: 720, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--text, #fff)' }}>
          Pendências DELI
        </h2>
        <button
          onClick={load}
          disabled={loading}
          style={{
            padding: '6px 14px', borderRadius: 8, border: '1px solid var(--g-700, #333)',
            background: 'transparent', color: 'var(--text, #fff)', cursor: 'pointer', fontSize: 13,
          }}
        >
          {loading ? '...' : 'Atualizar'}
        </button>
      </div>

      {error && (
        <div style={{ padding: 12, borderRadius: 8, background: '#3a0000', color: '#ff6b6b', marginBottom: 16, fontSize: 13 }}>
          Erro: {error}
        </div>
      )}

      {!loading && pending.length === 0 && (
        <div style={{ textAlign: 'center', padding: '48px 0', color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>
          Nenhuma pendência no momento
        </div>
      )}

      {pending.map(item => {
        const { bg, label } = badge(item.autonomy_level);
        const exp = expiresIn(item.expires_at);
        const isActing = !!acting[item.id];

        return (
          <div
            key={item.id}
            style={{
              background: 'var(--g-900, #111)',
              border: `1px solid ${item.autonomy_level === 'vermelho' ? '#B70C0055' : item.autonomy_level === 'amarelo' ? '#B5890055' : '#2D7A2D55'}`,
              borderRadius: 12,
              padding: '16px 18px',
              marginBottom: 12,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ background: bg, color: '#fff', borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>
                {label}
              </span>
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
                {relTime(item.created_at)}
                {exp && <> · expira em {exp}</>}
              </span>
            </div>

            <p style={{ margin: '0 0 6px', fontSize: 14, fontWeight: 600, color: 'var(--text, #fff)', lineHeight: 1.4 }}>
              {item.summary}
            </p>

            {item.reasoning && item.reasoning !== item.summary && (
              <p style={{ margin: '0 0 10px', fontSize: 13, color: 'rgba(255,255,255,0.55)', lineHeight: 1.5 }}>
                {item.reasoning}
              </p>
            )}

            {item.proposed_action_jsonb && (
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 12 }}>
                Ação: {item.proposed_action_jsonb.title || item.proposed_action_jsonb.type}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => act(item.id, 'approve')}
                disabled={isActing}
                style={{
                  padding: '7px 18px', borderRadius: 8, border: 'none',
                  background: '#2D7A2D', color: '#fff', cursor: 'pointer',
                  fontWeight: 600, fontSize: 13, opacity: isActing ? 0.5 : 1,
                }}
              >
                {acting[item.id] === 'approve' ? 'Aprovando…' : 'Aprovar'}
              </button>
              <button
                onClick={() => {
                  const reason = window.prompt('Motivo da rejeição (opcional):');
                  if (reason !== null) act(item.id, 'reject', reason);
                }}
                disabled={isActing}
                style={{
                  padding: '7px 18px', borderRadius: 8, border: '1px solid #B70C00',
                  background: 'transparent', color: '#B70C00', cursor: 'pointer',
                  fontWeight: 600, fontSize: 13, opacity: isActing ? 0.5 : 1,
                }}
              >
                {acting[item.id] === 'reject' ? 'Rejeitando…' : 'Rejeitar'}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
