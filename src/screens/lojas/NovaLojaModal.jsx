import { useState } from 'react';
import { supabase } from '../../lib/supabase.js';

const BRIDGE = import.meta.env.VITE_BRIDGE_URL || 'https://bridge.consultdelivery.com.br';

const SEGMENTOS = [
  { value: 'hamburgueria', label: 'Hamburgueria' },
  { value: 'pizzaria', label: 'Pizzaria' },
  { value: 'japonesa', label: 'Japonesa' },
  { value: 'brasileira', label: 'Brasileira' },
  { value: 'marmita', label: 'Marmita' },
  { value: 'saudavel', label: 'Saudável' },
  { value: 'acai', label: 'Açaí' },
  { value: 'sobremesa', label: 'Sobremesa' },
  { value: 'padaria', label: 'Padaria' },
  { value: 'outro', label: 'Outro' },
];

const UFs = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];

export default function NovaLojaModal({ tenantDbId, userId, onClose, onCreated }) {
  const [form, setForm] = useState({ nome: '', segmento: '', cidade: '', estado: '', whatsapp: '', ifood_url: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function set(field, val) { setForm(p => ({ ...p, [field]: val })); }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.nome.trim()) { setError('Nome é obrigatório.'); return; }
    setSaving(true);
    setError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${BRIDGE}/api/lojas`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          tenant_id: tenantDbId,
          nome: form.nome.trim(),
          ...(form.segmento && { segmento: form.segmento }),
          ...(form.cidade.trim() && { cidade: form.cidade.trim() }),
          ...(form.estado && { estado: form.estado }),
          ...(form.whatsapp.trim() && { whatsapp: form.whatsapp.trim() }),
          ...(form.ifood_url.trim() && { ifood_url: form.ifood_url.trim() }),
        }),
      });
      if (!res.ok) throw new Error((await res.text()) || `Erro ${res.status}`);
      const raw = await res.json();
      const created = raw?.loja ?? (Array.isArray(raw) ? raw[0] : raw);
      onCreated(created);
    } catch (err) {
      setError(err.message || 'Erro ao criar loja.');
      setSaving(false);
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 14, width: '100%', maxWidth: 480, padding: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#fff', margin: 0 }}>Nova loja</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', padding: 4, fontSize: 20, lineHeight: 1 }}>✕</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <label style={labelWrap}>
              <span style={labelText}>Nome *</span>
              <input autoFocus value={form.nome} onChange={e => set('nome', e.target.value)} placeholder="Ex: Pizza do Zé" style={input} />
            </label>

            <label style={labelWrap}>
              <span style={labelText}>Segmento</span>
              <select value={form.segmento} onChange={e => set('segmento', e.target.value)} style={input}>
                <option value="">Selecionar…</option>
                {SEGMENTOS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </label>

            <div style={{ display: 'flex', gap: 10 }}>
              <label style={{ ...labelWrap, flex: '1 1 auto' }}>
                <span style={labelText}>Cidade</span>
                <input value={form.cidade} onChange={e => set('cidade', e.target.value)} placeholder="São Paulo" style={input} />
              </label>
              <label style={{ ...labelWrap, flex: '0 0 88px' }}>
                <span style={labelText}>UF</span>
                <select value={form.estado} onChange={e => set('estado', e.target.value)} style={input}>
                  <option value="">—</option>
                  {UFs.map(uf => <option key={uf} value={uf}>{uf}</option>)}
                </select>
              </label>
            </div>

            <label style={labelWrap}>
              <span style={labelText}>WhatsApp</span>
              <input value={form.whatsapp} onChange={e => set('whatsapp', e.target.value)} placeholder="5511999999999" style={input} />
            </label>

            <label style={labelWrap}>
              <span style={labelText}>Link iFood</span>
              <input value={form.ifood_url} onChange={e => set('ifood_url', e.target.value)} placeholder="https://www.ifood.com.br/…" style={input} />
            </label>
          </div>

          {error && (
            <div style={{ marginTop: 12, fontSize: 12, color: '#ef4444', background: '#ef444415', padding: '8px 12px', borderRadius: 6 }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
            <button type="button" onClick={onClose} style={btnSecondary}>Cancelar</button>
            <button type="submit" disabled={saving} style={{ ...btnPrimary, opacity: saving ? 0.7 : 1, cursor: saving ? 'not-allowed' : 'pointer' }}>
              {saving ? 'Criando…' : 'Criar loja'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const labelWrap = { display: 'flex', flexDirection: 'column', gap: 5 };
const labelText = { fontSize: 12, fontWeight: 500, color: '#9ca3af' };
const input = { background: '#111', border: '1px solid #2a2a2a', borderRadius: 8, color: '#fff', padding: '9px 12px', fontSize: 13, width: '100%', boxSizing: 'border-box' };
const btnSecondary = { flex: 1, background: '#252525', border: '1px solid #2a2a2a', color: '#9ca3af', padding: '10px 0', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 500 };
const btnPrimary = { flex: 1, background: '#B70C00', border: 'none', color: '#fff', padding: '10px 0', borderRadius: 8, fontSize: 14, fontWeight: 600 };
