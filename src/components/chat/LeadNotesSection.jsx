import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../../lib/supabase.js';

const DEBOUNCE_MS = 1000;

export default function LeadNotesSection({ customerId, tenantId }) {
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!customerId) return;
    let cancelled = false;

    supabase
      .from('customer_notes')
      .select('content, updated_at')
      .eq('customer_id', customerId)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) {
          setContent(data?.content ?? '');
          setSavedAt(data?.updated_at ?? null);
          setLoaded(true);
        }
      });

    return () => { cancelled = true; };
  }, [customerId]);

  const save = useCallback(async (text) => {
    if (!customerId || !tenantId) return;
    setSaving(true);
    const { data } = await supabase.auth.getUser();
    const userId = data?.user?.id;

    await supabase.from('customer_notes').upsert(
      {
        tenant_id: tenantId,
        customer_id: customerId,
        content: text,
        updated_by: userId ?? null,
      },
      { onConflict: 'tenant_id,customer_id' }
    );

    setSavedAt(new Date().toISOString());
    setSaving(false);
  }, [customerId, tenantId]);

  function handleChange(e) {
    const text = e.target.value;
    setContent(text);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => save(text), DEBOUNCE_MS);
  }

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  return (
    <div style={{ padding: '12px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span className="section-h2" style={{ margin: 0 }}>Notas internas</span>
        <span style={{ fontSize: 10, color: 'var(--g-400)' }}>
          {saving
            ? 'Salvando…'
            : savedAt
              ? `Salvo ${new Date(savedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
              : ''}
        </span>
      </div>
      <textarea
        value={loaded ? content : ''}
        onChange={handleChange}
        disabled={!loaded}
        placeholder={loaded ? 'Anotações sobre este cliente…' : 'Carregando…'}
        style={{
          width: '100%',
          minHeight: 100,
          resize: 'vertical',
          border: '1px solid var(--g-200)',
          borderRadius: 'var(--r-sm)',
          padding: '8px 10px',
          fontSize: 12,
          color: 'var(--g-800)',
          background: 'var(--g-50)',
          fontFamily: 'inherit',
          lineHeight: 1.5,
          boxSizing: 'border-box',
        }}
      />
    </div>
  );
}
