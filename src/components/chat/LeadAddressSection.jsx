import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase.js';

const EMPTY = { cep: '', logradouro: '', numero: '', complemento: '', bairro: '', cidade: '', estado: '' };

export default function LeadAddressSection({ customerId, tenantId }) {
  const [addr, setAddr] = useState(EMPTY);
  const [addrId, setAddrId] = useState(null);
  const [cepLoading, setCepLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!customerId) return;
    let cancelled = false;

    supabase
      .from('customer_addresses')
      .select('*')
      .eq('customer_id', customerId)
      .eq('is_primary', true)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) {
          if (data) {
            setAddrId(data.id);
            setAddr({
              cep: data.cep ?? '',
              logradouro: data.logradouro ?? '',
              numero: data.numero ?? '',
              complemento: data.complemento ?? '',
              bairro: data.bairro ?? '',
              cidade: data.cidade ?? '',
              estado: data.estado ?? '',
            });
          }
          setLoaded(true);
        }
      });

    return () => { cancelled = true; };
  }, [customerId]);

  async function lookupCep(cep) {
    const clean = cep.replace(/\D/g, '');
    if (clean.length !== 8) return;
    setCepLoading(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${clean}/json/`);
      const data = await res.json();
      if (!data.erro) {
        setAddr(prev => ({
          ...prev,
          logradouro: data.logradouro ?? prev.logradouro,
          bairro: data.bairro ?? prev.bairro,
          cidade: data.localidade ?? prev.cidade,
          estado: data.uf ?? prev.estado,
        }));
      }
    } catch (_) {
      // silent — user can fill manually
    } finally {
      setCepLoading(false);
    }
  }

  function handleCepChange(e) {
    const val = e.target.value;
    setAddr(prev => ({ ...prev, cep: val }));
    if (val.replace(/\D/g, '').length === 8) lookupCep(val);
  }

  function handleField(field) {
    return (e) => setAddr(prev => ({ ...prev, [field]: e.target.value }));
  }

  async function handleSave() {
    if (!customerId || !tenantId) return;
    setSaving(true);

    const payload = { tenant_id: tenantId, customer_id: customerId, is_primary: true, ...addr };

    if (addrId) {
      await supabase.from('customer_addresses').update(payload).eq('id', addrId);
    } else {
      const { data } = await supabase.from('customer_addresses').insert(payload).select('id').single();
      if (data) setAddrId(data.id);
    }

    setSaving(false);
  }

  if (!loaded) return null;

  return (
    <div style={{ padding: '12px 16px' }}>
      <span className="section-h2" style={{ display: 'block', marginBottom: 8 }}>Endereço</span>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', gap: 6 }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>CEP</label>
            <input
              className="input"
              value={addr.cep}
              onChange={handleCepChange}
              placeholder="00000-000"
              maxLength={9}
              style={inputStyle}
            />
          </div>
          {cepLoading && (
            <div style={{ alignSelf: 'flex-end', paddingBottom: 6, fontSize: 11, color: 'var(--g-400)' }}>
              buscando…
            </div>
          )}
        </div>

        <div>
          <label style={labelStyle}>Logradouro</label>
          <input className="input" value={addr.logradouro} onChange={handleField('logradouro')} style={inputStyle} />
        </div>

        <div style={{ display: 'flex', gap: 6 }}>
          <div style={{ width: 80 }}>
            <label style={labelStyle}>Número</label>
            <input className="input" value={addr.numero} onChange={handleField('numero')} style={inputStyle} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Complemento</label>
            <input className="input" value={addr.complemento} onChange={handleField('complemento')} style={inputStyle} />
          </div>
        </div>

        <div>
          <label style={labelStyle}>Bairro</label>
          <input className="input" value={addr.bairro} onChange={handleField('bairro')} style={inputStyle} />
        </div>

        <div style={{ display: 'flex', gap: 6 }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Cidade</label>
            <input className="input" value={addr.cidade} onChange={handleField('cidade')} style={inputStyle} />
          </div>
          <div style={{ width: 48 }}>
            <label style={labelStyle}>UF</label>
            <input className="input" value={addr.estado} onChange={handleField('estado')} maxLength={2} style={{ ...inputStyle, textTransform: 'uppercase' }} />
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="btn-primary"
          style={{ marginTop: 4, fontSize: 12, padding: '6px 12px', alignSelf: 'flex-start' }}
        >
          {saving ? 'Salvando…' : 'Salvar endereço'}
        </button>
      </div>
    </div>
  );
}

const labelStyle = { fontSize: 10, color: 'var(--g-400)', display: 'block', marginBottom: 2 };
const inputStyle = { width: '100%', fontSize: 12, padding: '5px 8px', boxSizing: 'border-box' };
