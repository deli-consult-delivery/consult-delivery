// Console v2 · LARA Editorial — componente nativo v2
// Inlines: DraftsLara + CalendarioLara + PublicadosLara
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase.js';
import { usePermissions } from '../hooks/usePermissions.js';
import { Ico } from './CvIcons.jsx';

const BRIDGE = import.meta.env.VITE_BRIDGE_URL || 'http://localhost:3001';

// Status de rascunho — bg explícito, sem concatenação
const STATUS_META = {
  pendente:  { label: 'Pendente',  color: 'var(--amber)', bg: 'var(--amber-soft)' },
  aprovado:  { label: 'Aprovado',  color: 'var(--green)',  bg: 'var(--green-soft)'  },
  rejeitado: { label: 'Rejeitado', color: 'var(--red)',    bg: 'var(--red-soft)'    },
  publicado: { label: 'Publicado', color: 'var(--tx2)',    bg: 'var(--bg)'          },
};

// Status do calendário editorial
const CAL_STATUS_META = {
  planejado: { label: 'Planejado', color: 'var(--red)',   bg: 'var(--red-soft)'   },
  gerado:    { label: 'Gerado',    color: 'var(--amber)', bg: 'var(--amber-soft)' },
  revisao:   { label: 'Revisão',   color: 'var(--tx)',    bg: 'var(--bg)'         },
  publicado: { label: 'Publicado', color: 'var(--green)', bg: 'var(--green-soft)' },
  cancelado: { label: 'Cancelado', color: 'var(--tx2)',   bg: 'var(--bg)'         },
};

const FORMATO_ICON = { post: '📝', story: '📸', carrossel: '🔄', reels: '🎬' };
const CANAL_ICON   = { instagram: '📸', linkedin: '💼', whatsapp: '💬', outro: '🌐' };

function fmtDatetime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', weekday: 'short' });
}

// ─── DraftsTab ────────────────────────────────────────────────────────────────
function DraftsTab({ tenantDbId, canApprove, onToast }) {
  const [drafts, setDrafts]           = useState([]);
  const [filter, setFilter]           = useState('pendente');
  const [loading, setLoading]         = useState(false);
  const [expanded, setExpanded]       = useState(null);
  const [feedback, setFeedback]       = useState('');
  const [acting, setActing]           = useState(null);
  const [publishCanal, setPublishCanal] = useState('instagram');

  const loadDrafts = useCallback(async () => {
    if (!tenantDbId) return;
    setLoading(true);
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
      onToast(err.message);
    } finally {
      setLoading(false);
    }
  }, [tenantDbId, filter, onToast]);

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
      onToast(status === 'aprovado' ? 'Rascunho aprovado.' : 'Rascunho rejeitado.', 'success');
      await loadDrafts();
    } catch (err) {
      onToast(err.message);
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
      onToast('Publicado com sucesso!', 'success');
      await loadDrafts();
    } catch (err) {
      onToast(err.message);
    } finally {
      setActing(null);
    }
  }

  const FILTERS = ['pendente', 'aprovado', 'rejeitado', 'publicado', 'todos'];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Filtros */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {FILTERS.map(f => {
          const active = filter === f;
          const meta = STATUS_META[f];
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                padding: '5px 14px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                background: active ? 'var(--red)' : 'var(--bg)',
                color: active ? '#fff' : 'var(--tx2)',
                transition: 'all 0.15s',
              }}
            >
              {f === 'todos' ? 'Todos' : meta?.label}
            </button>
          );
        })}
        <button
          onClick={loadDrafts}
          style={{ marginLeft: 'auto', padding: '5px 12px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--panel)', cursor: 'pointer', fontSize: 12, color: 'var(--tx)' }}
        >
          <Ico name="i-reload" size={12} /> Atualizar
        </button>
      </div>

      {loading && <div className="cv2-sub" style={{ padding: '12px 0' }}>Carregando...</div>}

      {!loading && drafts.length === 0 && (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--tx2)', fontSize: 14 }}>
          Nenhum rascunho com status "{filter === 'todos' ? 'qualquer' : STATUS_META[filter]?.label ?? filter}".
        </div>
      )}

      {drafts.map(d => {
        const st = STATUS_META[d.status] || { label: d.status, color: 'var(--tx2)', bg: 'var(--bg)' };
        const isOpen = expanded === d.id;
        return (
          <div key={d.id} className="cv2-card" style={{ padding: 16, borderLeft: `3px solid ${st.color}` }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                  <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--ink)' }}>{d.titulo}</span>
                  <span className="cv2-bdg" style={{ background: st.bg, color: st.color }}>{st.label}</span>
                  {d.formato && <span className="cv2-sub">{d.formato}</span>}
                </div>
                <div className="cv2-sub">{fmtDatetime(d.created_at)}</div>
              </div>
              <button
                onClick={() => { setExpanded(isOpen ? null : d.id); if (!isOpen) setFeedback(''); }}
                className="cv2-btn sec"
                style={{ fontSize: 12, padding: '4px 10px' }}
              >
                {isOpen ? 'Fechar' : 'Ver'}
              </button>
            </div>

            {isOpen && (
              <div style={{ marginTop: 12, borderTop: '1px solid var(--line)', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <pre style={{ whiteSpace: 'pre-wrap', fontSize: 13, color: 'var(--tx)', margin: 0, fontFamily: 'inherit' }}>{d.corpo}</pre>
                {d.hashtags?.length > 0 && (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {d.hashtags.map(h => (
                      <span key={h} className="cv2-bdg" style={{ background: 'var(--red-soft)', color: 'var(--red)' }}>{h}</span>
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
                      style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid var(--line)', fontSize: 13, resize: 'vertical', boxSizing: 'border-box', background: 'var(--bg)', color: 'var(--tx)' }}
                    />
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        onClick={() => handleRevisar(d.id, 'aprovado')}
                        disabled={!!acting}
                        className="cv2-btn"
                        style={{ fontSize: 13 }}
                      >
                        {acting === d.id + 'aprovado' ? '...' : 'Aprovar'}
                      </button>
                      <button
                        onClick={() => handleRevisar(d.id, 'rejeitado')}
                        disabled={!!acting}
                        className="cv2-btn danger"
                        style={{ fontSize: 13 }}
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
                      style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--line)', fontSize: 13, background: 'var(--bg)', color: 'var(--tx)' }}
                    >
                      {['instagram', 'linkedin', 'whatsapp', 'outro'].map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => handlePublicar(d.id)}
                      disabled={!!acting}
                      className="cv2-btn"
                      style={{ fontSize: 13 }}
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

// ─── CalendarioTab ────────────────────────────────────────────────────────────
function CalendarioTab({ tenantDbId }) {
  const [items, setItems]   = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState(null);

  useEffect(() => {
    if (!tenantDbId) return;
    let cancelled = false;
    setLoading(true);
    supabase
      .from('content_calendar')
      .select('*')
      .eq('tenant_id', tenantDbId)
      .order('data_alvo', { ascending: true })
      .limit(50)
      .then(({ data, error: err }) => {
        if (cancelled) return;
        setLoading(false);
        if (err) { setError(err.message); return; }
        setItems(data || []);
      });
    return () => { cancelled = true; };
  }, [tenantDbId]);

  if (loading) return <div className="cv2-sub" style={{ padding: 20 }}>Carregando calendário...</div>;
  if (error) return <div style={{ color: 'var(--red)', fontSize: 13, padding: 20 }}>Erro: {error}</div>;

  if (items.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: 40, color: 'var(--tx2)' }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>📅</div>
        <div style={{ fontSize: 14 }}>Nenhum item no calendário editorial.</div>
        <div className="cv2-sub" style={{ marginTop: 4 }}>A LARA preenche automaticamente nas publicações seg/qua/sex.</div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {items.map(item => {
        const meta = CAL_STATUS_META[item.status] || { label: item.status, color: 'var(--tx2)', bg: 'var(--bg)' };
        return (
          <div key={item.id} className="cv2-card" style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, borderLeft: `3px solid ${meta.color}` }}>
            <div style={{ fontSize: 20, minWidth: 28 }}>{FORMATO_ICON[item.formato] || '📄'}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--ink)', marginBottom: 2 }}>{item.tema}</div>
              <div className="cv2-sub">{fmtDate(item.data_alvo)} · {item.formato}</div>
            </div>
            <span className="cv2-bdg" style={{ background: meta.bg, color: meta.color }}>{meta.label}</span>
          </div>
        );
      })}
    </div>
  );
}

// ─── PublicadosTab ────────────────────────────────────────────────────────────
function PublicadosTab({ tenantDbId }) {
  const [items, setItems]     = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    if (!tenantDbId) return;
    let cancelled = false;
    setLoading(true);
    supabase
      .from('content_published')
      .select('*')
      .eq('tenant_id', tenantDbId)
      .order('published_at', { ascending: false })
      .limit(50)
      .then(({ data, error: err }) => {
        if (cancelled) return;
        setLoading(false);
        if (err) { setError(err.message); return; }
        setItems(data || []);
      });
    return () => { cancelled = true; };
  }, [tenantDbId]);

  if (loading) return <div className="cv2-sub" style={{ padding: 20 }}>Carregando publicados...</div>;
  if (error) return <div style={{ color: 'var(--red)', fontSize: 13, padding: 20 }}>Erro: {error}</div>;

  if (items.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: 40, color: 'var(--tx2)' }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>📢</div>
        <div style={{ fontSize: 14 }}>Nenhum conteúdo publicado ainda.</div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {items.map(item => {
        const isOpen = expanded === item.id;
        return (
          <div key={item.id} className="cv2-card" style={{ padding: 14, borderLeft: '3px solid var(--green)' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <div style={{ fontSize: 20, minWidth: 28 }}>{CANAL_ICON[item.canal] || '🌐'}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--ink)', marginBottom: 2 }}>{item.titulo}</div>
                <div className="cv2-sub">{item.canal} · {fmtDatetime(item.published_at)}</div>
              </div>
              <button
                onClick={() => setExpanded(isOpen ? null : item.id)}
                className="cv2-btn sec"
                style={{ fontSize: 12, padding: '3px 10px' }}
              >
                {isOpen ? 'Fechar' : 'Ver'}
              </button>
            </div>
            {isOpen && (
              <div style={{ marginTop: 10, borderTop: '1px solid var(--line)', paddingTop: 10 }}>
                <pre style={{ whiteSpace: 'pre-wrap', fontSize: 13, color: 'var(--tx)', margin: 0, fontFamily: 'inherit' }}>{item.corpo}</pre>
                {item.hashtags?.length > 0 && (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                    {item.hashtags.map(h => (
                      <span key={h} className="cv2-bdg" style={{ background: 'var(--red-soft)', color: 'var(--red)' }}>{h}</span>
                    ))}
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

// ─── LaraEditorial (shell principal) ─────────────────────────────────────────
const TABS = ['Rascunhos', 'Calendário', 'Publicados'];

export default function LaraEditorial({ tenantDbId, userId }) {
  const [activeTab, setActiveTab] = useState(0);
  const [toast, setToast] = useState(null);
  const { can } = usePermissions(userId);
  const canApprove = can('content', 'approve') || can('content', 'edit');

  const showToast = useCallback((msg, type = 'error') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  return (
    <div style={{ padding: '28px 32px 56px', maxWidth: 1000, margin: '0 auto' }}>
      {/* Header */}
      <div className="cv2-spread" style={{ marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'var(--ink)' }}>LARA Editorial</h1>
          <p className="cv2-sub" style={{ margin: '4px 0 0' }}>Conteúdo gerado automaticamente · seg/qua/sex 9h BRT</p>
        </div>
        {!canApprove && (
          <span className="cv2-bdg" style={{ background: 'var(--bg)', color: 'var(--tx2)' }}>somente leitura</span>
        )}
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, borderBottom: '2px solid var(--line)' }}>
        {TABS.map((t, i) => (
          <button key={t} onClick={() => setActiveTab(i)} style={{
            padding: '8px 16px', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
            background: 'transparent',
            color: activeTab === i ? 'var(--red)' : 'var(--tx2)',
            borderBottom: activeTab === i ? '2px solid var(--red)' : '2px solid transparent',
            marginBottom: -2, transition: 'all 0.15s',
          }}>{t}</button>
        ))}
      </div>

      {/* Conteúdo da aba */}
      {activeTab === 0 && <DraftsTab tenantDbId={tenantDbId} userId={userId} canApprove={canApprove} onToast={showToast} />}
      {activeTab === 1 && <CalendarioTab tenantDbId={tenantDbId} />}
      {activeTab === 2 && <PublicadosTab tenantDbId={tenantDbId} />}

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
          padding: '12px 18px', background: 'var(--panel)', borderRadius: 10,
          border: '1px solid var(--line)', color: 'var(--ink)',
          fontSize: 13, fontWeight: 500, boxShadow: '0 4px 24px rgba(0,0,0,0.15)',
          display: 'flex', alignItems: 'center', gap: 10, maxWidth: 360,
        }}>
          <span style={{ color: toast.type === 'success' ? 'var(--green)' : 'var(--red)', fontSize: 16 }}>
            {toast.type === 'success' ? '✓' : '✕'}
          </span>
          <span>{toast.msg}</span>
          <button onClick={() => setToast(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--tx2)', cursor: 'pointer', fontSize: 16 }}>×</button>
        </div>
      )}
    </div>
  );
}
