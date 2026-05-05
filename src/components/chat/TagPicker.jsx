import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase.js';
import TagBadge from './TagBadge.jsx';

const PRESET_COLORS = [
  '#EF4444','#F97316','#EAB308','#22C55E',
  '#3B82F6','#8B5CF6','#EC4899','#6B7280',
];

export default function TagPicker({ customerId, tenantId, onChanged }) {
  const [allTags, setAllTags]         = useState([]);
  const [applied, setApplied]         = useState([]);
  const [search, setSearch]           = useState('');
  const [open, setOpen]               = useState(false);
  const [creating, setCreating]       = useState(false);
  const [newName, setNewName]         = useState('');
  const [newColor, setNewColor]       = useState(PRESET_COLORS[0]);
  const [saving, setSaving]           = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!tenantId) return;
    supabase.from('lead_tags').select('id, name, color').eq('tenant_id', tenantId).order('name')
      .then(({ data }) => setAllTags(data ?? []));
  }, [tenantId]);

  useEffect(() => {
    if (!customerId) return;
    supabase.from('customer_tags').select('tag_id, lead_tags(id, name, color)').eq('customer_id', customerId)
      .then(({ data }) => setApplied((data ?? []).map(r => r.lead_tags).filter(Boolean)));
  }, [customerId]);

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) { setOpen(false); setCreating(false); }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const appliedIds = new Set(applied.map(t => t.id));

  async function applyTag(tag) {
    if (appliedIds.has(tag.id)) return;
    await supabase.from('customer_tags').upsert({ customer_id: customerId, tag_id: tag.id }, { onConflict: 'customer_id,tag_id' });
    const next = [...applied, tag];
    setApplied(next);
    onChanged?.(next);
  }

  async function removeTag(tag) {
    await supabase.from('customer_tags').delete().eq('customer_id', customerId).eq('tag_id', tag.id);
    const next = applied.filter(t => t.id !== tag.id);
    setApplied(next);
    onChanged?.(next);
  }

  async function createAndApply() {
    if (!newName.trim()) return;
    setSaving(true);
    const { data } = await supabase
      .from('lead_tags')
      .upsert({ tenant_id: tenantId, name: newName.trim(), color: newColor }, { onConflict: 'tenant_id,name' })
      .select('id, name, color')
      .single();
    if (data) {
      setAllTags(prev => [...prev.filter(t => t.id !== data.id), data].sort((a, b) => a.name.localeCompare(b.name)));
      await applyTag(data);
    }
    setNewName('');
    setCreating(false);
    setSaving(false);
  }

  const filtered = allTags.filter(t => t.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      {/* Applied tags + add button */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
        {applied.map(t => (
          <TagBadge key={t.id} name={t.name} color={t.color} onRemove={() => removeTag(t)} />
        ))}
        <button
          onClick={() => setOpen(v => !v)}
          style={{
            background: 'var(--g-100)',
            border: '1px dashed var(--g-300)',
            borderRadius: 99,
            padding: '2px 8px',
            fontSize: 10,
            color: 'var(--g-500)',
            cursor: 'pointer',
          }}
        >
          + Tag
        </button>
      </div>

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
          zIndex: 200,
          width: 220,
        }}>
          {/* Search */}
          <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--g-100)' }}>
            <input
              className="input"
              autoFocus
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar tag…"
              style={{ fontSize: 12, padding: '4px 8px', width: '100%', boxSizing: 'border-box' }}
            />
          </div>

          {/* Tag list */}
          <div style={{ maxHeight: 160, overflowY: 'auto' }}>
            {filtered.length === 0 && (
              <div style={{ padding: '10px 12px', fontSize: 11, color: 'var(--g-400)' }}>Nenhuma tag encontrada</div>
            )}
            {filtered.map(t => (
              <div
                key={t.id}
                onClick={() => appliedIds.has(t.id) ? removeTag(t) : applyTag(t)}
                style={{
                  padding: '7px 12px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: appliedIds.has(t.id) ? 'var(--g-50)' : 'transparent',
                }}
              >
                <TagBadge name={t.name} color={t.color} />
                {appliedIds.has(t.id) && <span style={{ fontSize: 11, color: 'var(--g-400)' }}>✓</span>}
              </div>
            ))}
          </div>

          {/* Create new */}
          <div style={{ borderTop: '1px solid var(--g-100)', padding: '8px 10px' }}>
            {!creating ? (
              <button
                onClick={() => setCreating(true)}
                style={{ fontSize: 11, color: 'var(--g-500)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
              >
                + Criar nova tag
              </button>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <input
                  className="input"
                  autoFocus
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && createAndApply()}
                  placeholder="Nome da tag"
                  style={{ fontSize: 12, padding: '4px 8px' }}
                />
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {PRESET_COLORS.map(c => (
                    <button
                      key={c}
                      onClick={() => setNewColor(c)}
                      style={{
                        width: 18, height: 18, borderRadius: '50%', background: c, border: 'none', cursor: 'pointer',
                        outline: newColor === c ? `2px solid ${c}` : 'none',
                        outlineOffset: 2,
                      }}
                    />
                  ))}
                </div>
                <button
                  onClick={createAndApply}
                  disabled={saving || !newName.trim()}
                  className="btn-primary"
                  style={{ fontSize: 11, padding: '4px 10px', alignSelf: 'flex-start' }}
                >
                  {saving ? 'Criando…' : 'Criar e aplicar'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
