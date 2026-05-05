import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase.js';

const PRESET_COLORS = [
  '#3B82F6','#8B5CF6','#10B981','#F59E0B','#EF4444',
  '#EC4899','#F97316','#6B7280','#0EA5E9','#14B8A6',
];

const EMPTY_FORM = { name: '', description: '', color: PRESET_COLORS[0] };

export default function DepartmentManagementPage({ tenantId }) {
  const [departments, setDepartments] = useState([]);
  const [form, setForm]               = useState(EMPTY_FORM);
  const [editId, setEditId]           = useState(null);
  const [saving, setSaving]           = useState(false);
  const [loading, setLoading]         = useState(true);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from('departments')
      .select('id, name, description, color, is_active, created_at')
      .eq('tenant_id', tenantId)
      .order('name');
    setDepartments(data ?? []);
    setLoading(false);
  }

  useEffect(() => { if (tenantId) load(); }, [tenantId]);

  function startEdit(dept) {
    setEditId(dept.id);
    setForm({ name: dept.name, description: dept.description ?? '', color: dept.color });
  }

  function cancelEdit() {
    setEditId(null);
    setForm(EMPTY_FORM);
  }

  async function save() {
    if (!form.name.trim()) return;
    setSaving(true);

    if (editId) {
      await supabase.from('departments').update({
        name: form.name.trim(),
        description: form.description.trim() || null,
        color: form.color,
      }).eq('id', editId);
    } else {
      await supabase.from('departments').insert({
        tenant_id: tenantId,
        name: form.name.trim(),
        description: form.description.trim() || null,
        color: form.color,
      });
    }

    setSaving(false);
    cancelEdit();
    load();
  }

  async function toggleActive(dept) {
    await supabase.from('departments').update({ is_active: !dept.is_active }).eq('id', dept.id);
    load();
  }

  return (
    <div style={{ padding: '20px 24px', maxWidth: 600 }}>
      <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--g-900)', marginBottom: 4 }}>Departamentos</h2>
      <p style={{ fontSize: 12, color: 'var(--g-500)', marginBottom: 20 }}>
        Departamentos definem onde cada conversa está roteada. São independentes do RBAC.
      </p>

      {/* Formulário criar / editar */}
      <div style={{
        background: 'var(--g-50)',
        border: '1px solid var(--g-200)',
        borderRadius: 'var(--r-md)',
        padding: 16,
        marginBottom: 20,
      }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--g-700)', marginBottom: 12 }}>
          {editId ? 'Editar departamento' : 'Novo departamento'}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div>
            <label style={labelStyle}>Nome *</label>
            <input
              className="input"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="Ex: Atendimento"
              style={{ fontSize: 13 }}
            />
          </div>

          <div>
            <label style={labelStyle}>Descrição</label>
            <input
              className="input"
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Opcional"
              style={{ fontSize: 13 }}
            />
          </div>

          <div>
            <label style={labelStyle}>Cor</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
              {PRESET_COLORS.map(c => (
                <button
                  key={c}
                  onClick={() => setForm(f => ({ ...f, color: c }))}
                  style={{
                    width: 22, height: 22, borderRadius: '50%', background: c, border: 'none', cursor: 'pointer',
                    outline: form.color === c ? `2px solid ${c}` : 'none',
                    outlineOffset: 2,
                  }}
                />
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <button
              onClick={save}
              disabled={saving || !form.name.trim()}
              className="btn-primary"
              style={{ fontSize: 13, padding: '7px 16px' }}
            >
              {saving ? 'Salvando…' : editId ? 'Salvar' : 'Criar'}
            </button>
            {editId && (
              <button onClick={cancelEdit} className="btn-secondary" style={{ fontSize: 13, padding: '7px 14px' }}>
                Cancelar
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Lista */}
      {loading ? (
        <div style={{ fontSize: 12, color: 'var(--g-400)', textAlign: 'center', padding: 20 }}>Carregando…</div>
      ) : departments.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--g-400)', textAlign: 'center', padding: 20 }}>Nenhum departamento ainda.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {departments.map(dept => (
            <div key={dept.id} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 14px',
              background: dept.is_active ? 'var(--white)' : 'var(--g-50)',
              border: '1px solid var(--g-200)',
              borderRadius: 'var(--r-md)',
              opacity: dept.is_active ? 1 : 0.6,
            }}>
              <div style={{ width: 12, height: 12, borderRadius: '50%', background: dept.color, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--g-900)' }}>{dept.name}</div>
                {dept.description && (
                  <div style={{ fontSize: 11, color: 'var(--g-500)', marginTop: 1 }}>{dept.description}</div>
                )}
              </div>
              <span className={`badge ${dept.is_active ? 'badge-green' : 'badge-gray'}`} style={{ fontSize: 10 }}>
                {dept.is_active ? 'Ativo' : 'Inativo'}
              </span>
              <button
                onClick={() => startEdit(dept)}
                style={{ fontSize: 11, color: 'var(--g-500)', background: 'none', border: 'none', cursor: 'pointer' }}
              >
                Editar
              </button>
              <button
                onClick={() => toggleActive(dept)}
                style={{ fontSize: 11, color: dept.is_active ? '#EF4444' : '#10B981', background: 'none', border: 'none', cursor: 'pointer' }}
              >
                {dept.is_active ? 'Desativar' : 'Ativar'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const labelStyle = { fontSize: 11, color: 'var(--g-500)', display: 'block', marginBottom: 4 };
