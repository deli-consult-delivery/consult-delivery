import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase.js';

const STATUS_COLOR = {
  planejado: '#6366F1',
  gerado:    '#F59E0B',
  revisao:   '#3B82F6',
  publicado: '#10B981',
  cancelado: '#9CA3AF',
};

const FORMATO_ICON = { post: '📝', story: '📸', carrossel: '🔄', reels: '🎬' };

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', weekday: 'short' });
}

export default function CalendarioLara({ tenantDbId }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!tenantDbId) return;
    setLoading(true);
    supabase
      .from('content_calendar')
      .select('*')
      .eq('tenant_id', tenantDbId)
      .order('data_alvo', { ascending: true })
      .limit(50)
      .then(({ data, error: err }) => {
        setLoading(false);
        if (err) { setError(err.message); return; }
        setItems(data || []);
      });
  }, [tenantDbId]);

  if (loading) return <div style={{ color: 'var(--g-400)', fontSize: 13, padding: 20 }}>Carregando calendário...</div>;
  if (error) return <div style={{ color: '#EF4444', fontSize: 13, padding: 20 }}>Erro: {error}</div>;

  if (items.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: 40, color: 'var(--g-400)' }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>📅</div>
        <div style={{ fontSize: 14 }}>Nenhum item no calendário editorial.</div>
        <div style={{ fontSize: 12, marginTop: 4 }}>A LARA preenche automaticamente nas publicações seg/qua/sex.</div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {items.map(item => {
        const color = STATUS_COLOR[item.status] || 'var(--g-400)';
        return (
          <div key={item.id} className="card" style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, borderLeft: `3px solid ${color}` }}>
            <div style={{ fontSize: 20, minWidth: 28 }}>{FORMATO_ICON[item.formato] || '📄'}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--g-900)', marginBottom: 2 }}>{item.tema}</div>
              <div style={{ fontSize: 12, color: 'var(--g-400)' }}>{fmtDate(item.data_alvo)} · {item.formato}</div>
            </div>
            <span style={{
              fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 12,
              background: color + '22', color,
            }}>
              {item.status}
            </span>
          </div>
        );
      })}
    </div>
  );
}
