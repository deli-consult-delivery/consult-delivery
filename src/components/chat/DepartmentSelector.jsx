import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase.js';
import DepartmentBadge from './DepartmentBadge.jsx';

export default function DepartmentSelector({ conversationId, tenantId, currentDepartmentId, onChanged }) {
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

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={() => setOpen(v => !v)}
        disabled={saving}
        title="Trocar departamento"
        style={{
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
        }}
      >
        {current
          ? <DepartmentBadge name={current.name} color={current.color} />
          : <span style={{ color: 'var(--g-400)' }}>Sem departamento</span>
        }
        <span style={{ fontSize: 9, opacity: 0.6 }}>▾</span>
      </button>

      {open && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          marginTop: 4,
          background: 'var(--white)',
          border: '1px solid var(--g-200)',
          borderRadius: 'var(--r-md)',
          boxShadow: '0 4px 16px rgba(0,0,0,0.10)',
          zIndex: 100,
          minWidth: 180,
          overflow: 'hidden',
        }}>
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
