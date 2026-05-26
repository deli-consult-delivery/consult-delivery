import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase.js';

const BRIDGE = import.meta.env.VITE_BRIDGE_URL || 'http://localhost:3001';

const STATUS_LABEL = {
  pendente:  { label: 'Pendente',  color: '#F59E0B' },
  aprovado:  { label: 'Aprovado',  color: '#10B981' },
  rejeitado: { label: 'Rejeitado', color: '#EF4444' },
  publicado: { label: 'Publicado', color: '#6366F1' },
};

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export default function DraftsLara({ tenantDbId, canApprove }) {
  const [drafts, setDrafts] = useState([]);
  const [filter, setFilter] = useState('pendente');
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [feedback, setFeedback] = useState('');
  const [acting, setActing] = useState(null);
  const [publishCanal, setPublishCanal] = useState('instagram');
  const [error, setError] = useState(null);

  const loadDrafts = useCallback(async () => {
    if (!tenantDbId) return;
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const params = new URLSearchParams({ tenant_id: tenantDbId });
      if (filter !== 'todos') params.append('status', filter);
      const res = await fetch(`${BRIDGE}/api/lara/drafts?${params}`, {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setDrafts(json.drafts || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [tenantDbId, filter]);

  useEffect(() => { loadDrafts(); }, [loadDrafts]);

  async function handleRevisar(draftId, status) {
    setActing(draftId + status);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${BRIDGE}/api/lara/drafts/${draftId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ status, feedback: feedback || undefined }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setFeedback('');
      setExpanded(null);
      await loadDrafts();
    } catch (err) {
      alert(`Erro: ${err.message}`);
    } finally {
      setActing(null);
    }
  }

  async function handlePublicar(draftId) {
    setActing(draftId + 'pub');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${BRIDGE}/api/lara/publicar/${draftId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ canal: publishCanal }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await loadDrafts();
    } catch (err) {
      alert(`Erro: ${err.message}`);
    } finally {
      setActing(null);
    }
  }

  const FILTERS = ['pendente', 'aprovado', 'rejeitado', 'publicado', 'todos'];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* filtros */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {FILTERS.map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: '5px 14px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
              background: filter === f ? 'var(--primary)' : 'var(--g-100)',
              color: filter === f ? '#fff' : 'var(--g-600)',
            }}
          >
            {f === 'todos' ? 'Todos' : STATUS_LABEL[f]?.label}
          </button>
        ))}
        <button onClick={loadDrafts} style={{ marginLeft: 'auto', padding: '5px 12px', borderRadius: 8, border: '1px solid var(--g-200)', background: '#fff', cursor: 'pointer', fontSize: 12 }}>
          ↻ Atualizar
        </button>
      </div>

      {error && <div style={{ color: '#EF4444', fontSize: 13 }}>Erro: {error}</div>}
      {loading && <div style={{ color: 'var(--g-400)', fontSize: 13 }}>Carregando...</div>}

      {!loading && drafts.length === 0 && (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--g-400)', fontSize: 14 }}>
          Nenhum rascunho encontrado com status "{filter}".
        </div>
      )}

      {drafts.map(d => {
        const st = STATUS_LABEL[d.status] || { label: d.status, color: 'var(--g-400)' };
        const isOpen = expanded === d.id;
        return (
          <div key={d.id} className="card" style={{ padding: 16, borderLeft: `3px solid ${st.color}` }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                  <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--g-900)' }}>{d.titulo}</span>
                  <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10, background: st.color + '22', color: st.color }}>
                    {st.label}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--g-400)' }}>{d.formato}</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--g-400)' }}>{fmtDate(d.created_at)}</div>
              </div>
              <button
                onClick={() => setExpanded(isOpen ? null : d.id)}
                style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid var(--g-200)', background: '#fff', cursor: 'pointer', fontSize: 12 }}
              >
                {isOpen ? 'Fechar' : 'Ver'}
              </button>
            </div>

            {isOpen && (
              <div style={{ marginTop: 12, borderTop: '1px solid var(--g-100)', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <pre style={{ whiteSpace: 'pre-wrap', fontSize: 13, color: 'var(--g-800)', margin: 0, fontFamily: 'inherit' }}>{d.corpo}</pre>
                {d.hashtags?.length > 0 && (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {d.hashtags.map(h => (
                      <span key={h} style={{ fontSize: 11, color: 'var(--primary)', background: 'var(--primary-light, #fef2f2)', padding: '2px 8px', borderRadius: 10 }}>{h}</span>
                    ))}
                  </div>
                )}

                {canApprove && d.status === 'pendente' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 8 }}>
                    <textarea
                      placeholder="Feedback (opcional)..."
                      value={feedback}
                      onChange={e => setFeedback(e.target.value)}
                      rows={2}
                      style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid var(--g-200)', fontSize: 13, resize: 'vertical', boxSizing: 'border-box' }}
                    />
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        onClick={() => handleRevisar(d.id, 'aprovado')}
                        disabled={!!acting}
                        style={{ padding: '6px 16px', borderRadius: 6, border: 'none', background: '#10B981', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: 13 }}
                      >
                        {acting === d.id + 'aprovado' ? '...' : 'Aprovar'}
                      </button>
                      <button
                        onClick={() => handleRevisar(d.id, 'rejeitado')}
                        disabled={!!acting}
                        style={{ padding: '6px 16px', borderRadius: 6, border: 'none', background: '#EF4444', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: 13 }}
                      >
                        {acting === d.id + 'rejeitado' ? '...' : 'Rejeitar'}
                      </button>
                    </div>
                  </div>
                )}

                {canApprove && d.status === 'aprovado' && (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', paddingTop: 8 }}>
                    <select
                      value={publishCanal}
                      onChange={e => setPublishCanal(e.target.value)}
                      style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--g-200)', fontSize: 13 }}
                    >
                      {['instagram', 'linkedin', 'whatsapp', 'outro'].map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => handlePublicar(d.id)}
                      disabled={!!acting}
                      style={{ padding: '6px 16px', borderRadius: 6, border: 'none', background: '#6366F1', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: 13 }}
                    >
                      {acting === d.id + 'pub' ? '...' : 'Publicar'}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
