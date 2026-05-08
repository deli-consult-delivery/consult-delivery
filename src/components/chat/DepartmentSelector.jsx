import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase.js';
import DepartmentBadge from './DepartmentBadge.jsx';

const TagIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/>
    <line x1="7" y1="7" x2="7.01" y2="7"/>
  </svg>
);

export default function DepartmentSelector({ conversationId, tenantId, currentDepartmentId, onChanged, dark = false }) {
  const [departments, setDepartments] = useState([]);
  const [open, setOpen]               = useState(false);
  const [saving, setSaving]           = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!tenantId) return;
    supabase
      .from('departments')
      .select('id, name, color')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .order('name')
      .then(({ data }) => setDepartments(data ?? []));
  }, [tenantId]);

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const current = departments.find(d => d.id === currentDepartmentId);

  async function select(dept) {
    if (dept.id === currentDepartmentId) { setOpen(false); return; }
    setSaving(true);
    await supabase
      .from('conversations')
      .update({ department_id: dept.id })
      .eq('id', conversationId);
    setSaving(false);
    setOpen(false);
    onChanged?.(dept);
  }

  const btnStyle = dark ? {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 6,
    padding: current ? '3px 8px' : '4px 6px',
    cursor: saving ? 'not-allowed' : 'pointer',
    fontSize: 11,
    color: 'rgba(255,255,255,0.55)',
    transition: 'background 120ms',
  } : {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    background: 'none',
    border: '1px solid var(--g-200)',
    borderRadius: 'var(--r-sm)',
    padding: '3px 8px',
    cursor: saving ? 'not-allowed' : 'pointer',
    fontSize: 11,
    color: 'var(--g-600)',
  };

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={() => setOpen(v => !v)}
        disabled={saving}
        title={current ? `Departamento: ${current.name}` : 'Atribuir departamento'}
        style={btnStyle}
      >
        {current
          ? <><DepartmentBadge name={current.name} color={current.color} /><span style={{ fontSize: 9, opacity: 0.5 }}>▾</span></>
          : <TagIcon />
        }
      </button>

      {open && (
        <div style={{
          position: 'absolute',
          top: '100%',
          right: 0,
          marginTop: 4,
          background: 'var(--white)',
          border: '1px solid var(--g-200)',
          borderRadius: 'var(--r-md)',
          boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
          zIndex: 200,
          minWidth: 180,
          overflow: 'hidden',
        }}>
          <div style={{ padding: '8px 12px 4px', fontSize: 10, fontWeight: 700, color: 'var(--g-400)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Departamento
          </div>
          <div
            onClick={() => select({ id: null, name: null, color: null })}
            style={itemStyle(currentDepartmentId === null)}
          >
            <span style={{ color: 'var(--g-400)', fontSize: 11 }}>Sem departamento</span>
          </div>
          {departments.map(d => (
            <div key={d.id} onClick={() => select(d)} style={itemStyle(d.id === currentDepartmentId)}>
              <DepartmentBadge name={d.name} color={d.color} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function itemStyle(active) {
  return {
    padding: '8px 12px',
    cursor: 'pointer',
    background: active ? 'var(--g-50)' : 'transparent',
    display: 'flex',
    alignItems: 'center',
    transition: 'background 100ms',
  };
}
