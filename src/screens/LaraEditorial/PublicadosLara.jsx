import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase.js';

const CANAL_ICON = { instagram: '📸', linkedin: '💼', whatsapp: '💬', outro: '🌐' };

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export default function PublicadosLara({ tenantDbId }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    if (!tenantDbId) return;
    setLoading(true);
    supabase
      .from('content_published')
      .select('*')
      .eq('tenant_id', tenantDbId)
      .order('published_at', { ascending: false })
      .limit(50)
      .then(({ data, error: err }) => {
        setLoading(false);
        if (err) { setError(err.message); return; }
        setItems(data || []);
      });
  }, [tenantDbId]);

  if (loading) return <div style={{ color: 'var(--g-400)', fontSize: 13, padding: 20 }}>Carregando publicados...</div>;
  if (error) return <div style={{ color: '#EF4444', fontSize: 13, padding: 20 }}>Erro: {error}</div>;

  if (items.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: 40, color: 'var(--g-400)' }}>
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
          <div key={item.id} className="card" style={{ padding: 14, borderLeft: '3px solid #10B981' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <div style={{ fontSize: 20, minWidth: 28 }}>{CANAL_ICON[item.canal] || '🌐'}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--g-900)', marginBottom: 2 }}>{item.titulo}</div>
                <div style={{ fontSize: 12, color: 'var(--g-400)' }}>{item.canal} · {fmtDate(item.published_at)}</div>
              </div>
              <button
                onClick={() => setExpanded(isOpen ? null : item.id)}
                style={{ padding: '3px 10px', borderRadius: 6, border: '1px solid var(--g-200)', background: '#fff', cursor: 'pointer', fontSize: 12 }}
              >
                {isOpen ? 'Fechar' : 'Ver'}
              </button>
            </div>
            {isOpen && (
              <div style={{ marginTop: 10, borderTop: '1px solid var(--g-100)', paddingTop: 10 }}>
                <pre style={{ whiteSpace: 'pre-wrap', fontSize: 13, color: 'var(--g-800)', margin: 0, fontFamily: 'inherit' }}>{item.corpo}</pre>
                {item.hashtags?.length > 0 && (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                    {item.hashtags.map(h => (
                      <span key={h} style={{ fontSize: 11, color: '#6366F1', background: '#6366F111', padding: '2px 8px', borderRadius: 10 }}>{h}</span>
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
