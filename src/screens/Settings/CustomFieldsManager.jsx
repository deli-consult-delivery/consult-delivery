import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase.js';

const BRIDGE = import.meta.env.VITE_BRIDGE_URL || 'https://bridge.consultdelivery.com.br';

const ENTIDADES = [
  { id: 'loja',     label: 'Lojas' },
  { id: 'customer', label: 'Clientes' },
  { id: 'tarefa',   label: 'Tarefas' },
  { id: 'lead',     label: 'Leads' },
  { id: 'contrato', label: 'Contratos' },
];

const TIPOS = [
  { id: 'texto',       label: 'Texto' },
  { id: 'numero',      label: 'Número' },
  { id: 'data',        label: 'Data' },
  { id: 'boolean',     label: 'Sim/Não' },
  { id: 'select',      label: 'Seleção única' },
  { id: 'multiselect', label: 'Múltipla escolha' },
];

const TIPO_COLOR = {
  texto: '#3b82f6', numero: '#f59e0b', data: '#8b5cf6',
  boolean: '#10b981', select: '#f97316', multiselect: '#ec4899',
};

async function getToken() {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token;
}

export default function CustomFieldsManager({ tenantDbId }) {
  const [entidade, setEntidade] = useState('loja');
  const [fields, setFields] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editField, setEditField] = useState(null);

  useEffect(() => {
    if (tenantDbId) load();
  }, [tenantDbId, entidade]);

  async function load() {
    setLoading(true);
    try {
      const token = await getToken();
      const r = await fetch(
        `${BRIDGE}/api/custom-fields?tenant_id=${encodeURIComponent(tenantDbId)}&entidade=${encodeURIComponent(entidade)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!r.ok) return;
      const data = await r.json();
      setFields(data.fields || []);
    } catch (err) {
      console.error('[CustomFieldsManager]', err.message);
    } finally {
      setLoading(false);
    }
  }

  async function deleteField(id) {
    if (!window.confirm('Excluir este campo? Todos os valores associados serão removidos permanentemente.')) return;
    try {
      const token = await getToken();
      await fetch(`${BRIDGE}/api/custom-fields/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      setFields(f => f.filter(x => x.id !== id));
    } catch (err) {
      alert('Erro ao excluir: ' + err.message);
    }
  }

  async function reorder(id, dir) {
    const idx = fields.findIndex(f => f.id === id);
    const next = idx + dir;
    if (next < 0 || next >= fields.length) return;
    const updated = [...fields];
    [updated[idx], updated[next]] = [updated[next], updated[idx]];
    setFields(updated);
    const token = await getToken();
    await Promise.all(
      updated.map((f, i) =>
        fetch(`${BRIDGE}/api/custom-fields/${f.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ ordem: i }),
        })
      )
    );
  }

  return (
    <div>
      {/* Tabs + new button */}
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 20 }}>
        {ENTIDADES.map(e => (
          <button
            key={e.id}
            onClick={() => setEntidade(e.id)}
            style={{
              background: entidade === e.id ? '#2a2a2a' : 'transparent',
              border: '1px solid ' + (entidade === e.id ? '#3a3a3a' : '#2a2a2a'),
              color: entidade === e.id ? '#fff' : '#6b7280',
              borderRadius: 8, padding: '6px 14px', fontSize: 13,
              cursor: 'pointer', fontWeight: 500,
            }}
          >
            {e.label}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <button
          onClick={() => { setEditField(null); setShowModal(true); }}
          style={{
            background: '#B70C00', color: 'white', border: 'none', borderRadius: 8,
            padding: '6px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}
        >
          + Novo campo
        </button>
      </div>

      {loading ? (
        <div style={{ fontSize: 13, color: '#6b7280', padding: 20 }}>Carregando…</div>
      ) : !fields.length ? (
        <div style={{
          background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 12,
          padding: '32px 20px', textAlign: 'center', color: '#6b7280', fontSize: 13,
        }}>
          Nenhum campo para <b style={{ color: '#9ca3af' }}>{ENTIDADES.find(e => e.id === entidade)?.label}</b>.
          Clique em <b style={{ color: '#9ca3af' }}>+ Novo campo</b> para criar.
        </div>
      ) : (
        <div style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 12, overflow: 'hidden' }}>
          {fields.map((f, i) => (
            <div
              key={f.id}
              style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
                borderTop: i > 0 ? '1px solid #1f1f1f' : undefined,
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <ArrowBtn onClick={() => reorder(f.id, -1)} disabled={i === 0} title="Subir">▲</ArrowBtn>
                <ArrowBtn onClick={() => reorder(f.id, 1)} disabled={i === fields.length - 1} title="Descer">▼</ArrowBtn>
              </div>
              <span style={{
                fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                minWidth: 90, textAlign: 'center',
                background: (TIPO_COLOR[f.tipo] || '#6b7280') + '22',
                color: TIPO_COLOR[f.tipo] || '#6b7280',
              }}>
                {TIPOS.find(t => t.id === f.tipo)?.label || f.tipo}
              </span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#e5e7eb' }}>
                  {f.nome}
                  {f.obrigatorio && (
                    <span style={{ fontSize: 10, color: '#ef4444', marginLeft: 6, fontWeight: 400 }}>obrigatório</span>
                  )}
                </div>
                {f.ajuda && <div style={{ fontSize: 11, color: '#6b7280', marginTop: 1 }}>{f.ajuda}</div>}
                {(f.tipo === 'select' || f.tipo === 'multiselect') && Array.isArray(f.opcoes) && f.opcoes.length > 0 && (
                  <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 1 }}>
                    Opções: {f.opcoes.join(' · ')}
                  </div>
                )}
              </div>
              <button
                onClick={() => { setEditField(f); setShowModal(true); }}
                style={{
                  background: 'none', border: '1px solid #2a2a2a', borderRadius: 6,
                  color: '#9ca3af', cursor: 'pointer', padding: '4px 10px', fontSize: 12,
                }}
              >
                Editar
              </button>
              <button
                onClick={() => deleteField(f.id)}
                style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', padding: '4px 6px', fontSize: 18, lineHeight: 1 }}
                title="Excluir campo"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <FieldModal
          field={editField}
          entidade={entidade}
          tenantDbId={tenantDbId}
          onClose={() => { setShowModal(false); setEditField(null); }}
          onSaved={() => { setShowModal(false); setEditField(null); load(); }}
        />
      )}
    </div>
  );
}

function ArrowBtn({ onClick, disabled, title, children }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        background: 'none', border: 'none', color: disabled ? '#2a2a2a' : '#6b7280',
        cursor: disabled ? 'default' : 'pointer', padding: '1px 3px', fontSize: 9, lineHeight: 1,
      }}
    >
      {children}
    </button>
  );
}

const labelStyle = {
  fontSize: 11, color: '#9ca3af', textTransform: 'uppercase',
  letterSpacing: '0.05em', fontWeight: 600, display: 'block', marginBottom: 6,
};

const inputStyle = {
  width: '100%', background: '#141414', border: '1px solid #2a2a2a', borderRadius: 8,
  color: '#e5e7eb', fontSize: 13, padding: '8px 12px', boxSizing: 'border-box', outline: 'none',
};

function FieldModal({ field, entidade, tenantDbId, onClose, onSaved }) {
  const isEdit = !!field;
  const [form, setForm] = useState({
    nome:        field?.nome || '',
    tipo:        field?.tipo || 'texto',
    opcoes:      Array.isArray(field?.opcoes) ? field.opcoes.join('\n') : '',
    obrigatorio: field?.obrigatorio ?? false,
    ajuda:       field?.ajuda || '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  const needsOpcoes = form.tipo === 'select' || form.tipo === 'multiselect';

  async function submit(e) {
    e.preventDefault();
    if (!form.nome.trim()) return;
    setSaving(true);
    setError('');
    try {
      const token = await getToken();
      const opcoes = needsOpcoes
        ? form.opcoes.split('\n').map(s => s.trim()).filter(Boolean)
        : null;
      const payload = {
        nome: form.nome.trim(),
        tipo: form.tipo,
        opcoes,
        obrigatorio: form.obrigatorio,
        ajuda: form.ajuda || null,
        ...(!isEdit && { tenant_id: tenantDbId, entidade }),
      };
      const url = isEdit
        ? `${BRIDGE}/api/custom-fields/${field.id}`
        : `${BRIDGE}/api/custom-fields`;
      const r = await fetch(url, {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({ error: r.statusText }));
        throw new Error(d.error || r.statusText);
      }
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 14, padding: 28, width: 480, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 24px 60px rgba(0,0,0,.7)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#fff' }}>
            {isEdit ? 'Editar campo' : 'Novo campo personalizado'}
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: 22, lineHeight: 1 }}>×</button>
        </div>
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={labelStyle}>Nome do campo *</label>
            <input style={inputStyle} value={form.nome} onChange={e => set('nome', e.target.value)} required placeholder="ex: Nicho de mercado" />
          </div>
          <div>
            <label style={labelStyle}>Tipo</label>
            <select style={inputStyle} value={form.tipo} onChange={e => set('tipo', e.target.value)}>
              {TIPOS.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </div>
          {needsOpcoes && (
            <div>
              <label style={labelStyle}>Opções (uma por linha)</label>
              <textarea
                style={{ ...inputStyle, resize: 'vertical', fontFamily: 'monospace', minHeight: 90 }}
                value={form.opcoes}
                onChange={e => set('opcoes', e.target.value)}
                placeholder={'burger\npizza\njapa'}
              />
            </div>
          )}
          <div>
            <label style={labelStyle}>Dica / texto de ajuda</label>
            <input style={inputStyle} value={form.ajuda} onChange={e => set('ajuda', e.target.value)} placeholder="Texto de ajuda opcional" />
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={form.obrigatorio}
              onChange={e => set('obrigatorio', e.target.checked)}
              style={{ width: 14, height: 14, accentColor: '#B70C00' }}
            />
            <span style={{ fontSize: 13, color: '#e5e7eb' }}>Campo obrigatório</span>
          </label>
          {error && (
            <div style={{ fontSize: 12, color: '#ef4444', background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.3)', borderRadius: 6, padding: '8px 12px' }}>
              {error}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
            <button
              type="button"
              onClick={onClose}
              style={{ background: 'none', border: '1px solid #2a2a2a', borderRadius: 8, color: '#9ca3af', padding: '8px 16px', fontSize: 13, cursor: 'pointer' }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              style={{ background: '#B70C00', color: 'white', border: 'none', borderRadius: 8, padding: '8px 18px', fontSize: 13, fontWeight: 600, cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.7 : 1 }}
            >
              {saving ? 'Salvando…' : isEdit ? 'Atualizar' : 'Criar campo'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
