import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase.js';
import CustomSelect from '../CustomSelect.jsx';

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
      <div style={{ width: 130 }}>
        <CustomSelect
          compact
          value={filters?.department ?? ''}
          onChange={v => set('department', v)}
          options={[{ value: '', label: 'Todos deptos' }, ...departments.map(d => ({ value: d.id, label: d.name }))]}
        />
      </div>

      <div style={{ width: 120 }}>
        <CustomSelect
          compact
          value={filters?.tag ?? ''}
          onChange={v => set('tag', v)}
          options={[{ value: '', label: 'Todas tags' }, ...tags.map(t => ({ value: t.id, label: t.name }))]}
        />
      </div>

      <div style={{ width: 120 }}>
        <CustomSelect
          compact
          value={filters?.status ?? ''}
          onChange={v => set('status', v)}
          options={STATUS_OPTIONS}
        />
      </div>

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
