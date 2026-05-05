import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase.js';

export default function ListPicker({ customerId, tenantId, onChanged }) {
  const [allLists, setAllLists]   = useState([]);
  const [applied, setApplied]     = useState([]);
  const [search, setSearch]       = useState('');
  const [open, setOpen]           = useState(false);
  const [creating, setCreating]   = useState(false);
  const [newName, setNewName]     = useState('');
  const [saving, setSaving]       = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!tenantId) return;
    supabase.from('lead_lists').select('id, name, description').eq('tenant_id', tenantId).order('name')
      .then(({ data }) => setAllLists(data ?? []));
  }, [tenantId]);

  useEffect(() => {
    if (!customerId) return;
    supabase.from('lead_list_members').select('list_id, lead_lists(id, name)').eq('customer_id', customerId)
      .then(({ data }) => setApplied((data ?? []).map(r => r.lead_lists).filter(Boolean)));
  }, [customerId]);

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) { setOpen(false); setCreating(false); }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const appliedIds = new Set(applied.map(l => l.id));

  async function toggle(list) {
    if (appliedIds.has(list.id)) {
      await supabase.from('lead_list_members').delete().eq('customer_id', customerId).eq('list_id', list.id);
      const next = applied.filter(l => l.id !== list.id);
      setApplied(next);
      onChanged?.(next);
    } else {
      await supabase.from('lead_list_members').upsert({ list_id: list.id, customer_id: customerId }, { onConflict: 'list_id,customer_id' });
      const next = [...applied, list];
      setApplied(next);
      onChanged?.(next);
    }
  }

  async function createAndAdd() {
    if (!newName.trim()) return;
    setSaving(true);
    const { data } = await supabase
      .from('lead_lists')
      .upsert({ tenant_id: tenantId, name: newName.trim() }, { onConflict: 'tenant_id,name' })
      .select('id, name')
      .single();
    if (data) {
      setAllLists(prev => [...prev.filter(l => l.id !== data.id), data].sort((a, b) => a.name.localeCompare(b.name)));
      await toggle(data);
    }
    setNewName('');
    setCreating(false);
    setSaving(false);
  }

  const filtered = allLists.filter(l => l.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
        {applied.map(l => (
          <span key={l.id} style={{
            display: 'inline-flex', alignItems: 'center', gap: 3,
            padding: '2px 7px', borderRadius: 99, fontSize: 10, fontWeight: 500,
            background: 'var(--info-soft)', color: '#1E40AF',
            border: '1px solid #BFDBFE',
          }}>
            {l.name}
            <button
              onClick={e => { e.stopPropagation(); toggle(l); }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 0 0 2px', color: '#1E40AF', fontSize: 11, lineHeight: 1, opacity: 0.6 }}
            >×</button>
          </span>
        ))}
        <button
          onClick={() => setOpen(v => !v)}
          style={{
            background: 'var(--g-100)', border: '1px dashed var(--g-300)',
            borderRadius: 99, padding: '2px 8px', fontSize: 10, color: 'var(--g-500)', cursor: 'pointer',
          }}
        >
          + Lista
        </button>
      </div>

      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, marginTop: 4,
          background: 'var(--white)', border: '1px solid var(--g-200)',
          borderRadius: 'var(--r-md)', boxShadow: '0 4px 16px rgba(0,0,0,0.10)',
          zIndex: 200, width: 220,
        }}>
          <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--g-100)' }}>
            <input
              className="input"
              autoFocus
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar lista…"
              style={{ fontSize: 12, padding: '4px 8px', width: '100%', boxSizing: 'border-box' }}
            />
          </div>

          <div style={{ maxHeight: 160, overflowY: 'auto' }}>
            {filtered.length === 0 && (
              <div style={{ padding: '10px 12px', fontSize: 11, color: 'var(--g-400)' }}>Nenhuma lista encontrada</div>
            )}
            {filtered.map(l => (
              <div
                key={l.id}
                onClick={() => toggle(l)}
                style={{
                  padding: '7px 12px', cursor: 'pointer', display: 'flex',
                  alignItems: 'center', justifyContent: 'space-between',
                  background: appliedIds.has(l.id) ? 'var(--g-50)' : 'transparent',
                  fontSize: 12, color: 'var(--g-700)',
                }}
              >
                {l.name}
                {appliedIds.has(l.id) && <span style={{ fontSize: 11, color: 'var(--g-400)' }}>✓</span>}
              </div>
            ))}
          </div>

          <div style={{ borderTop: '1px solid var(--g-100)', padding: '8px 10px' }}>
            {!creating ? (
              <button
                onClick={() => setCreating(true)}
                style={{ fontSize: 11, color: 'var(--g-500)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
              >
                + Criar nova lista
              </button>
            ) : (
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  className="input"
                  autoFocus
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && createAndAdd()}
                  placeholder="Nome da lista"
                  style={{ fontSize: 12, padding: '4px 8px', flex: 1 }}
                />
                <button
                  onClick={createAndAdd}
                  disabled={saving || !newName.trim()}
                  className="btn-primary"
                  style={{ fontSize: 11, padding: '4px 10px' }}
                >
                  {saving ? '…' : 'Ok'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
