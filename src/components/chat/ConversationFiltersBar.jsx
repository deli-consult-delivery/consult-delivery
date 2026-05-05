import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase.js';

const STATUS_OPTIONS = [
  { value: '',            label: 'Todos status' },
  { value: 'open',        label: 'Aberta' },
  { value: 'in_progress', label: 'Em Atendimento' },
  { value: 'waiting',     label: 'Aguardando' },
  { value: 'closed',      label: 'Finalizada' },
  { value: 'archived',    label: 'Arquivada' },
];

export default function ConversationFiltersBar({ tenantId, filters, onChange }) {
  const [departments, setDepartments] = useState([]);
  const [tags, setTags]               = useState([]);

  useEffect(() => {
    if (!tenantId) return;
    supabase.from('departments').select('id, name, color').eq('tenant_id', tenantId).eq('is_active', true).order('name')
      .then(({ data }) => setDepartments(data ?? []));
    supabase.from('lead_tags').select('id, name, color').eq('tenant_id', tenantId).order('name')
      .then(({ data }) => setTags(data ?? []));
  }, [tenantId]);

  function set(key, value) {
    onChange?.({ ...filters, [key]: value || null });
  }

  const hasActive = filters?.department || filters?.tag || filters?.status;

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      padding: '6px 12px',
      borderBottom: '1px solid var(--g-100)',
      background: hasActive ? 'var(--g-50)' : 'transparent',
      flexWrap: 'wrap',
    }}>
      {/* Departamento */}
      <select
        value={filters?.department ?? ''}
        onChange={e => set('department', e.target.value)}
        style={selectStyle}
      >
        <option value="">Todos deptos</option>
        {departments.map(d => (
          <option key={d.id} value={d.id}>{d.name}</option>
        ))}
      </select>

      {/* Tag */}
      <select
        value={filters?.tag ?? ''}
        onChange={e => set('tag', e.target.value)}
        style={selectStyle}
      >
        <option value="">Todas tags</option>
        {tags.map(t => (
          <option key={t.id} value={t.id}>{t.name}</option>
        ))}
      </select>

      {/* Status */}
      <select
        value={filters?.status ?? ''}
        onChange={e => set('status', e.target.value)}
        style={selectStyle}
      >
        {STATUS_OPTIONS.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>

      {/* Limpar filtros */}
      {hasActive && (
        <button
          onClick={() => onChange?.({ department: null, tag: null, status: null })}
          style={{
            fontSize: 10,
            color: 'var(--g-500)',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '2px 4px',
            textDecoration: 'underline',
          }}
        >
          Limpar
        </button>
      )}
    </div>
  );
}

const selectStyle = {
  fontSize: 11,
  padding: '3px 6px',
  border: '1px solid var(--g-200)',
  borderRadius: 'var(--r-sm)',
  background: 'var(--white)',
  color: 'var(--g-700)',
  cursor: 'pointer',
  maxWidth: 140,
};
