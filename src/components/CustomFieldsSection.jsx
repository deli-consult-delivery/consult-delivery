import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';

const BRIDGE = import.meta.env.VITE_BRIDGE_URL || 'https://bridge.consultdelivery.com.br';

export default function CustomFieldsSection({ entidade, entidadeId, tenantId }) {
  const [fields, setFields] = useState([]);
  const [values, setValues] = useState({});
  const [dirty, setDirty] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!entidadeId || !tenantId) return;
    load();
  }, [entidade, entidadeId, tenantId]);

  async function getToken() {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token;
  }

  async function load() {
    setLoading(true);
    try {
      const token = await getToken();
      const r = await fetch(
        `${BRIDGE}/api/entidades/${entidade}/${entidadeId}/custom-values?tenant_id=${encodeURIComponent(tenantId)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!r.ok) return;
      const data = await r.json();
      setFields(data.fields || []);
      setValues(data.values || {});
      setDirty({});
    } catch (err) {
      console.error('[CustomFieldsSection] load error', err.message);
    } finally {
      setLoading(false);
    }
  }

  function onChange(fieldId, val) {
    setDirty(d => ({ ...d, [fieldId]: val }));
  }

  async function save() {
    setSaving(true);
    try {
      const token = await getToken();
      const merged = { ...values, ...dirty };
      const valuesArr = Object.entries(merged).map(([custom_field_id, valor]) => ({
        custom_field_id,
        valor: valor ?? null,
      }));
      await fetch(
        `${BRIDGE}/api/entidades/${entidade}/${entidadeId}/custom-values`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ tenant_id: tenantId, values: valuesArr }),
        }
      );
      setValues(v => ({ ...v, ...dirty }));
      setDirty({});
    } catch (err) {
      console.error('[CustomFieldsSection] save error', err.message);
    } finally {
      setSaving(false);
    }
  }

  if (!entidadeId || !tenantId) return null;
  if (loading) return <div style={{ fontSize: 12, color: '#6b7280', padding: '8px 0' }}>Carregando campos…</div>;
  if (!fields.length) return null;

  const hasDirty = Object.keys(dirty).length > 0;

  return (
    <div style={{ marginTop: 20 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
        Campos personalizados
      </div>
      <div style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 12, overflow: 'hidden' }}>
        {fields.map((field, i) => {
          const currentVal = dirty[field.id] !== undefined ? dirty[field.id] : (values[field.id] ?? '');
          return (
            <div
              key={field.id}
              style={{
                display: 'flex', gap: 16, padding: '12px 16px', alignItems: 'center',
                borderTop: i > 0 ? '1px solid #1f1f1f' : undefined,
              }}
            >
              <div style={{ width: 160, flexShrink: 0, fontSize: 12, color: '#6b7280', paddingTop: 1 }}>
                {field.nome}
                {field.obrigatorio && <span style={{ color: '#ef4444', marginLeft: 2 }}>*</span>}
              </div>
              <div style={{ flex: 1 }}>
                <FieldInput field={field} value={currentVal} onChange={val => onChange(field.id, val)} />
              </div>
            </div>
          );
        })}
      </div>
      {hasDirty && (
        <div style={{ marginTop: 10, display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={save}
            disabled={saving}
            style={{
              background: '#B70C00', color: 'white', border: 'none', borderRadius: 8,
              padding: '8px 16px', fontSize: 13, fontWeight: 600,
              cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? 'Salvando…' : 'Salvar campos'}
          </button>
        </div>
      )}
    </div>
  );
}

const inputStyle = {
  background: '#141414', border: '1px solid #333', borderRadius: 6,
  color: '#e5e7eb', fontSize: 13, padding: '6px 10px', width: '100%', boxSizing: 'border-box',
};

function FieldInput({ field, value, onChange }) {
  switch (field.tipo) {
    case 'texto':
      return <input style={inputStyle} value={value} onChange={e => onChange(e.target.value)} placeholder={field.ajuda || ''} />;

    case 'numero':
      return <input type="number" style={inputStyle} value={value} onChange={e => onChange(e.target.value)} placeholder={field.ajuda || '0'} />;

    case 'data':
      return <input type="date" style={inputStyle} value={value} onChange={e => onChange(e.target.value)} />;

    case 'boolean':
      return (
        <button
          onClick={() => onChange(value === 'true' ? 'false' : 'true')}
          style={{
            width: 38, height: 22, borderRadius: 99, border: 'none', padding: 0,
            background: value === 'true' ? '#10b981' : '#374151',
            position: 'relative', cursor: 'pointer', transition: 'background 200ms',
          }}
        >
          <span style={{
            position: 'absolute', top: 2, left: value === 'true' ? 18 : 2,
            width: 18, height: 18, borderRadius: '50%', background: 'white',
            transition: 'left 200ms',
          }} />
        </button>
      );

    case 'select': {
      const opcoes = Array.isArray(field.opcoes) ? field.opcoes : [];
      return (
        <select style={inputStyle} value={value} onChange={e => onChange(e.target.value)}>
          <option value="">— selecionar —</option>
          {opcoes.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      );
    }

    case 'multiselect': {
      const opcoes = Array.isArray(field.opcoes) ? field.opcoes : [];
      const selected = value ? value.split(',').map(s => s.trim()).filter(Boolean) : [];
      return (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {opcoes.map(o => {
            const active = selected.includes(o);
            return (
              <button
                key={o}
                onClick={() => {
                  const next = active ? selected.filter(s => s !== o) : [...selected, o];
                  onChange(next.join(', '));
                }}
                style={{
                  fontSize: 12, padding: '3px 10px', borderRadius: 20,
                  border: `1px solid ${active ? '#B70C00' : '#374151'}`,
                  background: active ? 'rgba(183,12,0,0.12)' : 'transparent',
                  color: active ? '#ef4444' : '#9ca3af', cursor: 'pointer',
                }}
              >
                {o}
              </button>
            );
          })}
        </div>
      );
    }

    default:
      return <input style={inputStyle} value={value} onChange={e => onChange(e.target.value)} />;
  }
}
