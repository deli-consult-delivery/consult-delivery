import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase.js';

const BRIDGE_URL = import.meta.env.VITE_BRIDGE_URL || 'https://bridge.consultdelivery.com.br';

const SEVERITY_COLORS = {
  verde:    { bg: 'rgba(0,200,81,0.12)',   border: 'rgba(0,200,81,0.3)',   text: '#00C851', label: 'Verde' },
  amarelo:  { bg: 'rgba(255,183,0,0.12)',  border: 'rgba(255,183,0,0.3)',  text: '#FFB700', label: 'Amarelo' },
  vermelho: { bg: 'rgba(183,12,0,0.12)',   border: 'rgba(183,12,0,0.3)',   text: '#B70C00', label: 'Vermelho' },
};

async function authHeader() {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
}

async function apiFetch(path, opts = {}) {
  const r = await fetch(`${BRIDGE_URL}/api${path}`, {
    headers: { 'Content-Type': 'application/json', ...(await authHeader()), ...(opts.headers || {}) },
    ...opts,
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({ error: r.statusText }));
    throw new Error(err.error || r.statusText);
  }
  return r.json();
}

function timeRemaining(expiresAt) {
  if (!expiresAt) return null;
  const diff = new Date(expiresAt) - new Date();
  if (diff <= 0) return 'Expirado';
  const hours   = Math.floor(diff / 3_600_000);
  const minutes = Math.floor((diff % 3_600_000) / 60_000);
  if (hours > 0) return `${hours}h ${minutes}m restantes`;
  return `${minutes}m restantes`;
}

function ApprovalCard({ approval, onDecision }) {
  const [note, setNote]       = useState('');
  const [loading, setLoading] = useState(false);
  const [showNote, setShowNote] = useState(false);

  const sev = SEVERITY_COLORS[approval.severity] || SEVERITY_COLORS.amarelo;
  const remaining = timeRemaining(approval.expires_at);
  const isExpired = remaining === 'Expirado';
  const isDone    = approval.status !== 'pending';

  async function decide(status) {
    setLoading(true);
    try {
      const updated = await apiFetch(`/approvals/${approval.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status, review_note: note.trim() || undefined }),
      });
      onDecision(updated);
    } catch (err) {
      console.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      background: sev.bg,
      border: `1px solid ${sev.border}`,
      borderRadius: 8,
      padding: '14px 16px',
      marginBottom: 10,
      opacity: isExpired ? 0.5 : 1,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{
          background: sev.bg, color: sev.text, border: `1px solid ${sev.border}`,
          borderRadius: 4, padding: '1px 8px', fontSize: 11, fontWeight: 700,
        }}>
          {sev.label}
        </span>
        <span style={{ fontSize: 12, color: '#888', fontWeight: 600 }}>@{approval.agent_slug}</span>
        <span style={{ fontSize: 11, color: '#555', marginLeft: 'auto' }}>
          {remaining && <span style={{ color: isExpired ? '#ef4444' : '#666' }}>{remaining}</span>}
        </span>
      </div>

      {/* Ação */}
      <p style={{ margin: '0 0 6px', fontSize: 13, color: '#e5e5e5', fontWeight: 500 }}>
        {approval.action_label}
      </p>
      <p style={{ margin: '0 0 10px', fontSize: 11, color: '#666' }}>
        Tipo: <span style={{ color: '#888' }}>{approval.action_type}</span>
        {' · '}{new Date(approval.created_at).toLocaleString('pt-BR')}
      </p>

      {/* Payload resumido */}
      {approval.action_payload && (
        <div style={{
          background: 'rgba(0,0,0,0.3)', borderRadius: 4, padding: '6px 10px',
          marginBottom: 10, fontSize: 11, color: '#777', fontFamily: 'monospace',
          maxHeight: 60, overflow: 'hidden', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
        }}>
          {JSON.stringify(approval.action_payload, null, 2).slice(0, 200)}
          {JSON.stringify(approval.action_payload).length > 200 ? '...' : ''}
        </div>
      )}

      {/* Status badge se já decidido */}
      {isDone && (
        <div style={{
          display: 'inline-block', borderRadius: 4, padding: '2px 10px', fontSize: 12, fontWeight: 600,
          background: approval.status === 'approved' ? 'rgba(0,200,81,0.15)' : 'rgba(183,12,0,0.15)',
          color: approval.status === 'approved' ? '#00C851' : '#B70C00',
          marginBottom: approval.review_note ? 6 : 0,
        }}>
          {approval.status === 'approved' ? 'Aprovado' : 'Rejeitado'}
        </div>
      )}
      {isDone && approval.review_note && (
        <p style={{ margin: '4px 0 0', fontSize: 12, color: '#666', fontStyle: 'italic' }}>
          "{approval.review_note}"
        </p>
      )}

      {/* Ações — apenas para pending, não expirado, severidade não verde */}
      {!isDone && !isExpired && approval.severity !== 'verde' && (
        <div>
          {showNote && (
            <input
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="Nota (opcional)..."
              style={{
                width: '100%', boxSizing: 'border-box',
                background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 4, padding: '6px 10px', color: '#ccc', fontSize: 12,
                marginBottom: 8,
              }}
            />
          )}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              onClick={() => decide('approved')}
              disabled={loading}
              style={{
                background: 'rgba(0,200,81,0.15)', border: '1px solid rgba(0,200,81,0.4)',
                borderRadius: 6, padding: '5px 14px', color: '#00C851', fontSize: 12,
                cursor: 'pointer', fontWeight: 600,
              }}
            >
              {loading ? '...' : 'Aprovar'}
            </button>
            <button
              onClick={() => decide('rejected')}
              disabled={loading}
              style={{
                background: 'rgba(183,12,0,0.15)', border: '1px solid rgba(183,12,0,0.4)',
                borderRadius: 6, padding: '5px 14px', color: '#B70C00', fontSize: 12,
                cursor: 'pointer', fontWeight: 600,
              }}
            >
              {loading ? '...' : 'Rejeitar'}
            </button>
            <button
              onClick={() => setShowNote(v => !v)}
              style={{
                background: 'none', border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 6, padding: '5px 10px', color: '#666', fontSize: 11,
                cursor: 'pointer',
              }}
            >
              {showNote ? 'Sem nota' : '+ Nota'}
            </button>
          </div>
        </div>
      )}

      {/* Verde: auto-aprovado */}
      {!isDone && approval.severity === 'verde' && (
        <div style={{ fontSize: 11, color: '#00C851' }}>Auto-aprovado (Verde)</div>
      )}
    </div>
  );
}

export default function ApprovalsScreen({ tenantDbId }) {
  const [approvals, setApprovals] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [showAll, setShowAll]     = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [pending, all] = await Promise.all([
        apiFetch('/approvals?status=pending'),
        showAll ? apiFetch('/approvals?status=approved') : Promise.resolve([]),
      ]);
      setApprovals([...pending, ...all]);
    } catch (err) {
      console.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [showAll]);

  useEffect(() => { load(); }, [load]);

  function handleDecision(updated) {
    setApprovals(prev => prev.map(a => a.id === updated.id ? updated : a));
  }

  const pending   = approvals.filter(a => a.status === 'pending');
  const vermelho  = pending.filter(a => a.severity === 'vermelho');
  const amarelo   = pending.filter(a => a.severity === 'amarelo');
  const verde     = pending.filter(a => a.severity === 'verde');
  const approved  = approvals.filter(a => a.status === 'approved');

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: '#111', color: '#e5e5e5', padding: '20px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Aprovações de Agentes</h2>
        {pending.length > 0 && (
          <span style={{
            background: '#B70C00', color: '#fff', borderRadius: 12,
            padding: '2px 10px', fontSize: 12, fontWeight: 700,
          }}>
            {pending.length} pendente{pending.length !== 1 ? 's' : ''}
          </span>
        )}
        <div style={{ flex: 1 }} />
        <button
          onClick={() => setShowAll(v => !v)}
          style={{
            background: 'none', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 6, padding: '6px 12px', color: '#666', fontSize: 12,
            cursor: 'pointer',
          }}
        >
          {showAll ? 'Ocultar aprovados' : 'Ver aprovados'}
        </button>
        <button
          onClick={load}
          style={{
            background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 6, padding: '6px 12px', color: '#888', fontSize: 12,
            cursor: 'pointer',
          }}
        >
          Atualizar
        </button>
      </div>

      {loading ? (
        <p style={{ color: '#555', textAlign: 'center', marginTop: 60 }}>Carregando...</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>
          {/* Coluna Vermelho */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#B70C00', display: 'inline-block' }} />
              <h3 style={{ margin: 0, fontSize: 13, color: '#B70C00', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Vermelho
              </h3>
              {vermelho.length > 0 && (
                <span style={{ background: 'rgba(183,12,0,0.15)', color: '#B70C00', borderRadius: 10, padding: '1px 8px', fontSize: 11, fontWeight: 700 }}>
                  {vermelho.length}
                </span>
              )}
            </div>
            {vermelho.length === 0 ? (
              <p style={{ fontSize: 12, color: '#333', textAlign: 'center', padding: '20px 0' }}>Nenhuma ação crítica.</p>
            ) : (
              vermelho.map(a => <ApprovalCard key={a.id} approval={a} onDecision={handleDecision} />)
            )}
          </div>

          {/* Coluna Amarelo */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#FFB700', display: 'inline-block' }} />
              <h3 style={{ margin: 0, fontSize: 13, color: '#FFB700', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Amarelo
              </h3>
              {amarelo.length > 0 && (
                <span style={{ background: 'rgba(255,183,0,0.15)', color: '#FFB700', borderRadius: 10, padding: '1px 8px', fontSize: 11, fontWeight: 700 }}>
                  {amarelo.length}
                </span>
              )}
            </div>
            {amarelo.length === 0 ? (
              <p style={{ fontSize: 12, color: '#333', textAlign: 'center', padding: '20px 0' }}>Nenhuma ação pendente.</p>
            ) : (
              amarelo.map(a => <ApprovalCard key={a.id} approval={a} onDecision={handleDecision} />)
            )}
          </div>

          {/* Coluna Verde / Auto-aprovado */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#00C851', display: 'inline-block' }} />
              <h3 style={{ margin: 0, fontSize: 13, color: '#00C851', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Auto-aprovado
              </h3>
              {(verde.length + approved.length) > 0 && (
                <span style={{ background: 'rgba(0,200,81,0.12)', color: '#00C851', borderRadius: 10, padding: '1px 8px', fontSize: 11, fontWeight: 700 }}>
                  {verde.length + approved.length}
                </span>
              )}
            </div>
            {verde.length === 0 && approved.length === 0 ? (
              <p style={{ fontSize: 12, color: '#333', textAlign: 'center', padding: '20px 0' }}>Nenhuma ação verde.</p>
            ) : (
              <>
                {verde.map(a => <ApprovalCard key={a.id} approval={a} onDecision={handleDecision} />)}
                {approved.map(a => <ApprovalCard key={a.id} approval={a} onDecision={handleDecision} />)}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
