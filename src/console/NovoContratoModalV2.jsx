import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase.js';

const COLOR = '#10b981';

const labelStyle = {
  fontSize: 12, fontWeight: 600, color: 'var(--tx2)',
  display: 'block', marginBottom: 5,
};
const inputStyle = {
  width: '100%', boxSizing: 'border-box',
  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 8, padding: '9px 12px', color: 'var(--tx)',
  fontSize: 13, outline: 'none', fontFamily: 'inherit',
};
const selectStyle = { ...inputStyle };

const PACOTES = [
  { value: 'light',       label: 'Light' },
  { value: 'performance', label: 'Performance' },
  { value: 'enterprise',  label: 'Enterprise' },
  { value: 'growth',      label: 'Growth' },
];

export default function NovoContratoModalV2({ tenantDbId, onClose, onSaved }) {
  const [customers, setCustomers] = useState([]);
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState(null);

  const [form, setForm] = useState({
    customer_id:            '',
    pacote:                 'light',
    valor_mensal:           '',
    valor_setup:            '',
    percentual_crescimento: '',
    duracao_meses:          '',
    multa_percentual:       '',
    vigencia_inicio:        '',
  });

  useEffect(() => {
    supabase
      .from('customers')
      .select('id, name')
      .eq('tenant_id', tenantDbId)
      .order('name')
      .then(({ data }) => setCustomers(data || []));
  }, [tenantDbId]);

  function set(field, value) {
    setForm(f => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    if (!form.valor_mensal || isNaN(Number(form.valor_mensal))) {
      setError('Valor mensal é obrigatório e deve ser um número.');
      return;
    }
    setSaving(true);
    const row = {
      tenant_id:              tenantDbId,
      customer_id:            form.customer_id || null,
      pacote:                 form.pacote,
      valor_mensal:           Number(form.valor_mensal),
      valor_setup:            form.valor_setup ? Number(form.valor_setup) : null,
      percentual_crescimento: form.percentual_crescimento ? Number(form.percentual_crescimento) : null,
      duracao_meses:          form.duracao_meses ? Number(form.duracao_meses) : null,
      multa_percentual:       form.multa_percentual ? Number(form.multa_percentual) : null,
      vigencia_inicio:        form.vigencia_inicio || null,
      status:                 'rascunho',
    };
    const { error: dbErr } = await supabase.from('contratos').insert(row);
    setSaving(false);
    if (dbErr) { setError(dbErr.message); return; }
    onSaved();
  }

  const isPerformance = form.pacote === 'performance';
  const isEnterprise  = form.pacote === 'enterprise';

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div style={{
        background: 'var(--panel)', border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: 14, width: '100%', maxWidth: 520,
        maxHeight: '90vh', overflowY: 'auto',
      }}>
        {/* Header */}
        <div style={{
          padding: '18px 22px', borderBottom: '1px solid rgba(255,255,255,0.08)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{
              width: 32, height: 32, borderRadius: 8,
              background: `rgba(16,185,129,0.15)`, display: 'flex',
              alignItems: 'center', justifyContent: 'center', fontSize: 16,
            }}>📄</span>
            <span style={{ fontWeight: 700, fontSize: 16, color: 'var(--tx)' }}>
              Novo Contrato
            </span>
          </div>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', color: 'var(--tx2)',
            fontSize: 20, cursor: 'pointer', lineHeight: 1, padding: 4,
          }}>×</button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Cliente */}
          <div>
            <label style={labelStyle}>Cliente</label>
            <select
              style={selectStyle}
              value={form.customer_id}
              onChange={e => set('customer_id', e.target.value)}
            >
              <option value="">— Selecionar cliente —</option>
              {customers.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* Pacote */}
          <div>
            <label style={labelStyle}>Pacote *</label>
            <select
              style={selectStyle}
              value={form.pacote}
              onChange={e => set('pacote', e.target.value)}
              required
            >
              {PACOTES.map(p => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </div>

          {/* Valores */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={labelStyle}>Valor Mensal (R$) *</label>
              <input
                type="number" min="0" step="0.01"
                style={inputStyle}
                value={form.valor_mensal}
                onChange={e => set('valor_mensal', e.target.value)}
                placeholder="0,00"
                required
              />
            </div>
            <div>
              <label style={labelStyle}>Setup (R$)</label>
              <input
                type="number" min="0" step="0.01"
                style={inputStyle}
                value={form.valor_setup}
                onChange={e => set('valor_setup', e.target.value)}
                placeholder="0,00"
              />
            </div>
          </div>

          {/* Performance-specific */}
          {isPerformance && (
            <div>
              <label style={labelStyle}>Percentual de Crescimento (%)</label>
              <input
                type="number" min="0" step="0.1"
                style={inputStyle}
                value={form.percentual_crescimento}
                onChange={e => set('percentual_crescimento', e.target.value)}
                placeholder="ex: 15"
              />
            </div>
          )}

          {/* Enterprise-specific */}
          {isEnterprise && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={labelStyle}>Duração (meses)</label>
                <input
                  type="number" min="1" step="1"
                  style={inputStyle}
                  value={form.duracao_meses}
                  onChange={e => set('duracao_meses', e.target.value)}
                  placeholder="12"
                />
              </div>
              <div>
                <label style={labelStyle}>Multa (%)</label>
                <input
                  type="number" min="0" step="0.1"
                  style={inputStyle}
                  value={form.multa_percentual}
                  onChange={e => set('multa_percentual', e.target.value)}
                  placeholder="20"
                />
              </div>
            </div>
          )}

          {/* Início vigência */}
          <div>
            <label style={labelStyle}>Início de Vigência</label>
            <input
              type="date"
              style={{ ...inputStyle, colorScheme: 'dark' }}
              value={form.vigencia_inicio}
              onChange={e => set('vigencia_inicio', e.target.value)}
            />
          </div>

          {error && (
            <div style={{
              background: 'rgba(220,38,38,0.1)', border: '1px solid rgba(220,38,38,0.3)',
              borderRadius: 8, padding: '10px 14px', color: '#f87171', fontSize: 13,
            }}>{error}</div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 4 }}>
            <button type="button" onClick={onClose} style={{
              background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 8, padding: '9px 18px', color: 'var(--tx2)',
              fontSize: 13, fontWeight: 500, cursor: 'pointer',
            }}>Cancelar</button>
            <button type="submit" disabled={saving} style={{
              background: saving ? 'rgba(16,185,129,0.5)' : COLOR,
              border: 'none', borderRadius: 8, padding: '9px 22px',
              color: '#fff', fontSize: 13, fontWeight: 600, cursor: saving ? 'default' : 'pointer',
              display: 'flex', alignItems: 'center', gap: 7,
            }}>
              {saving && (
                <svg width="13" height="13" viewBox="0 0 24 24"
                  style={{ animation: 'spin 0.8s linear infinite' }}>
                  <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor"
                    strokeWidth="2.5" strokeDasharray="60" strokeDashoffset="20" />
                </svg>
              )}
              {saving ? 'Salvando…' : 'Criar Contrato'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
