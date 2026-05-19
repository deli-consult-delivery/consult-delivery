import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase.js';

const BRIDGE = import.meta.env.VITE_BRIDGE_URL || 'https://bridge.consultdelivery.com.br';

const PAPEIS = [
  { value: 'colaborador', label: 'Colaborador' },
  { value: 'principal', label: 'Principal' },
  { value: 'observador', label: 'Observador' },
];

export default function AtribuirConsultorModal({ tenantDbId, lojaId, onClose, onAtribuido }) {
  const [members, setMembers] = useState([]);
  const [userId, setUserId] = useState('');
  const [papel, setPapel] = useState('colaborador');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      const { data: tm } = await supabase
        .from('tenant_members')
        .select('user_id')
        .eq('tenant_id', tenantDbId);

      const ids = (tm || []).map(m => m.user_id);
      if (!ids.length) { setLoading(false); return; }

      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', ids)
        .order('full_name');

      setMembers(profiles || []);
      setLoading(false);
    }
    load();
  }, [tenantDbId]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!userId) { setError('Selecione um consultor.'); return; }
    setSaving(true);
    setError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${BRIDGE}/api/lojas/${lojaId}/consultores`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ user_id: userId, papel }),
      });
      if (!res.ok) throw new Error((await res.text()) || `Erro ${res.status}`);
      onAtribuido();
    } catch (err) {
      setError(err.message || 'Erro ao atribuir consultor.');
      setSaving(false);
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 14, width: '100%', maxWidth: 400, padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <h2 style={{ fontSize: 17, fontWeight: 700, color: '#fff', margin: 0 }}>Atribuir consultor</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', padding: 4, fontSize: 20, lineHeight: 1 }}>✕</button>
        </div>

        {loading ? (
          <div style={{ color: '#6b7280', fontSize: 13, padding: '20px 0' }}>Carregando membros…</div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <label style={labelWrap}>
                <span style={labelText}>Consultor *</span>
                <select
                  value={userId}
                  onChange={e => setUserId(e.target.value)}
                  style={{ ...inputStyle, color: userId ? '#fff' : '#6b7280' }}
                >
                  <option value="">Selecionar…</option>
                  {members.map(m => (
                    <option key={m.id} value={m.id}>
                      {m.full_name || m.email || m.id}
                    </option>
                  ))}
                </select>
              </label>

              <label style={labelWrap}>
                <span style={labelText}>Papel</span>
                <select value={papel} onChange={e => setPapel(e.target.value)} style={inputStyle}>
                  {PAPEIS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </label>
            </div>

            {error && (
              <div style={{ marginTop: 12, fontSize: 12, color: '#ef4444', background: '#ef444415', padding: '8px 12px', borderRadius: 6 }}>
                {error}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
              <button type="button" onClick={onClose} style={btnSecondary}>Cancelar</button>
              <button type="submit" disabled={saving} style={{ ...btnPrimary, opacity: saving ? 0.7 : 1, cursor: saving ? 'not-allowed' : 'pointer' }}>
                {saving ? 'Atribuindo…' : 'Atribuir'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

const labelWrap = { display: 'flex', flexDirection: 'column', gap: 5 };
const labelText = { fontSize: 12, fontWeight: 500, color: '#9ca3af' };
const inputStyle = { background: '#111', border: '1px solid #2a2a2a', borderRadius: 8, color: '#fff', padding: '9px 12px', fontSize: 13, width: '100%', boxSizing: 'border-box' };
const btnSecondary = { flex: 1, background: '#252525', border: '1px solid #2a2a2a', color: '#9ca3af', padding: '9px 0', borderRadius: 8, cursor: 'pointer', fontSize: 14 };
const btnPrimary = { flex: 1, background: '#B70C00', border: 'none', color: '#fff', padding: '9px 0', borderRadius: 8, fontSize: 14, fontWeight: 600 };
