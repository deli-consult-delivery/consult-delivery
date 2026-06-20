import { useState, useEffect, useRef, useCallback } from 'react';
import Icon from '../components/Icon.jsx';
import { supabase } from '../lib/supabase.js';

const BRIDGE = import.meta.env.VITE_BRIDGE_URL || 'https://bridge.consultdelivery.com.br';

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtBRL(v) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
}

function diasAtraso(dataVencimento) {
  if (!dataVencimento) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(dataVencimento).getTime()) / 86400000));
}

function StatusBadge({ status }) {
  const map = {
    aberto:      { label: 'Em aberto',   cls: 'cv2-bdg', dot: 'pulse-amber' },
    negociando:  { label: 'Negociando',  cls: 'cv2-bdg', dot: '' },
    pago:        { label: 'Pago',        cls: 'cv2-bdg', dot: '' },
    cancelado:   { label: 'Cancelado',   cls: 'cv2-bdg', dot: '' },
    escalonado:  { label: 'Escalonado',  cls: 'cv2-bdg', dot: 'pulse-red' },
  };
  const m = map[status] || map.aberto;
  return (
    <span className={m.cls} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      {m.dot && <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor', display: 'inline-block' }} className={m.dot} />}
      {m.label}
    </span>
  );
}

function NivelRiscoBadge({ nivel }) {
  const map = {
    baixo:   { color: '#16a34a', label: 'Risco Baixo' },
    medio:   { color: '#D97706', label: 'Risco Médio' },
    alto:    { color: '#dc2626', label: 'Risco Alto' },
    critico: { color: '#7f1d1d', label: 'Crítico' },
  };
  const m = map[nivel] || map.medio;
  return (
    <span style={{
      background: `${m.color}22`, color: m.color, border: `1px solid ${m.color}44`,
      borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 600,
    }}>{m.label}</span>
  );
}

function Spinner() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" style={{ animation: 'spin 0.8s linear infinite', flexShrink: 0 }}>
      <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2.5" strokeDasharray="60" strokeDashoffset="20" />
    </svg>
  );
}

function StatusBadgeV2({ status }) {
  const map = {
    pending:  { label: 'Pendente',  cls: 'cv2-bdg', dot: 'pulse-amber' },
    received: { label: 'Recebido',  cls: 'cv2-bdg', dot: '' },
    overdue:  { label: 'Vencido',   cls: 'cv2-bdg', dot: 'pulse-red' },
    refunded: { label: 'Estornado', cls: 'cv2-bdg', dot: '' },
    canceled: { label: 'Cancelado', cls: 'cv2-bdg', dot: '' },
  };
  const m = map[status] || map.pending;
  return (
    <span className={m.cls} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      {m.dot && <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor', display: 'inline-block' }} className={m.dot} />}
      {m.label}
    </span>
  );
}

function ModoToggle({ modo, onChange, saving }) {
  const opts = [
    { id: 'humano', label: 'Humano', icon: '👤' },
    { id: 'hibrido', label: 'Híbrido', icon: '🤝' },
    { id: 'ia', label: 'IA Auto', icon: '🤖' },
  ];
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontSize: 11, color: 'var(--tx2)', fontWeight: 600 }}>MODO CORA</span>
      <div style={{ display: 'flex', background: 'var(--panel)', borderRadius: 8, padding: 2, gap: 2 }}>
        {opts.map(o => (
          <button
            key={o.id}
            disabled={saving}
            onClick={() => onChange(o.id)}
            style={{
              padding: '5px 11px', borderRadius: 6, border: 'none', cursor: saving ? 'not-allowed' : 'pointer',
              fontSize: 12, fontWeight: modo === o.id ? 700 : 500, display: 'flex', alignItems: 'center', gap: 4,
              background: modo === o.id ? 'var(--red, #B70C00)' : 'transparent',
              color: modo === o.id ? 'var(--tx)' : 'var(--tx2)',
              transition: 'all 150ms',
            }}
          >
            {o.icon} {o.label}
          </button>
        ))}
      </div>
      {saving && <Spinner />}
    </div>
  );
}

// ── Nova Cobrança Modal ───────────────────────────────────────────────────────
function NovaCobrancaModal({ tenantDbId, onClose, onCreated }) {
  const [form, setForm] = useState({
    customer_name: '',
    customer_whatsapp: '',
    valor_original: '',
    data_vencimento: '',
    notas: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (!form.customer_name || !form.valor_original || !form.data_vencimento) {
      setError('Nome, valor e vencimento são obrigatórios.');
      return;
    }
    setSaving(true);
    const valor = parseFloat(form.valor_original.replace(',', '.'));
    const { error: e } = await supabase.from('cora_cobrancas').insert({
      tenant_id: tenantDbId,
      customer_name: form.customer_name,
      customer_whatsapp: form.customer_whatsapp,
      valor_original: valor,
      valor_atual: valor,
      data_vencimento: form.data_vencimento,
      notas: form.notas,
      status: 'aberto',
    });
    if (e) { setError(e.message); setSaving(false); return; }
    onCreated();
    onClose();
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={onClose}>
      <div style={{ background: 'var(--panel)', borderRadius: 12, padding: 24, width: 440, maxWidth: '95vw' }}
        onClick={e => e.stopPropagation()}>
        <h3 style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 700 }}>Nova Cobrança</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {[
            { label: 'Nome do cliente *', key: 'customer_name', placeholder: 'Ex: João Silva' },
            { label: 'WhatsApp', key: 'customer_whatsapp', placeholder: '55119XXXXXXXX' },
            { label: 'Valor (R$) *', key: 'valor_original', placeholder: '350,00' },
            { label: 'Data de vencimento *', key: 'data_vencimento', type: 'date' },
          ].map(f => (
            <div key={f.key}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--tx2)', display: 'block', marginBottom: 6 }}>{f.label}</label>
              <input type={f.type || 'text'} placeholder={f.placeholder}
                style={{ width: '100%', boxSizing: 'border-box', padding: '8px 12px', background: 'var(--panel)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 7, color: 'var(--tx)', fontSize: 13, fontFamily: 'inherit' }}
                value={form[f.key]} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} />
            </div>
          ))}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--tx2)', display: 'block', marginBottom: 6 }}>Notas internas</label>
            <textarea style={{ width: '100%', boxSizing: 'border-box', padding: '8px 12px', background: 'var(--panel)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 7, color: 'var(--tx)', fontSize: 13, fontFamily: 'inherit', minHeight: 60, resize: 'vertical' }}
              value={form.notas} onChange={e => setForm(p => ({ ...p, notas: e.target.value }))} />
          </div>
          {error && <p style={{ color: '#f87171', fontSize: 12, margin: 0 }}>{error}</p>}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
            <button onClick={onClose} style={{ padding: '8px 18px', background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 7, color: 'var(--tx2)', fontSize: 13, cursor: 'pointer' }}>Cancelar</button>
            <button onClick={submit} disabled={saving} style={{ padding: '8px 18px', background: 'var(--red, #B70C00)', border: 'none', borderRadius: 7, color: 'var(--tx)', fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
              {saving ? <Spinner /> : null} Cadastrar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Nova Cobrança Asaas Modal (V2) ────────────────────────────────────────────
function NovaCobrancaAsaasModal({ tenantDbId, userId, onClose, onCreated }) {
  const [form, setForm] = useState({
    customer_name: '',
    customer_phone: '',
    asaas_customer_id: '',
    valor: '',
    vencimento: '',
    billing_type: 'PIX',
    description: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (!form.customer_name || !form.asaas_customer_id || !form.valor || !form.vencimento) {
      setError('Nome, ID Asaas, valor e vencimento são obrigatórios.');
      return;
    }
    const valor = parseFloat(form.valor.replace(',', '.'));
    if (isNaN(valor) || valor <= 0) { setError('Valor inválido.'); return; }
    setSaving(true);
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      const res = await fetch(`${BRIDGE}/agents/cora-criar-cobranca/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          tenant_id: tenantDbId,
          asaas_customer_id: form.asaas_customer_id,
          customer_name: form.customer_name,
          customer_phone: form.customer_phone || undefined,
          valor,
          vencimento: form.vencimento,
          billing_type: form.billing_type,
          description: form.description || undefined,
          triggered_by: userId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao criar cobrança');
      onCreated();
      onClose();
    } catch (e) {
      setError(e.message);
      setSaving(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={onClose}>
      <div style={{ background: 'var(--panel)', borderRadius: 12, padding: 24, width: 480, maxWidth: '95vw' }}
        onClick={e => e.stopPropagation()}>
        <h3 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 700 }}>Nova Cobrança Asaas</h3>
        <p style={{ margin: '0 0 20px', fontSize: 12, color: 'var(--tx2)' }}>Cria cobrança via Asaas (Trigger.dev)</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {[
            { label: 'Nome do cliente *', key: 'customer_name', placeholder: 'Ex: João Silva' },
            { label: 'ID Asaas do cliente *', key: 'asaas_customer_id', placeholder: 'cus_xxx' },
            { label: 'Telefone (opcional)', key: 'customer_phone', placeholder: '55119XXXXXXXX' },
            { label: 'Valor (R$) *', key: 'valor', placeholder: '350,00' },
            { label: 'Vencimento *', key: 'vencimento', type: 'date' },
          ].map(f => (
            <div key={f.key}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--tx2)', display: 'block', marginBottom: 6 }}>{f.label}</label>
              <input type={f.type || 'text'} placeholder={f.placeholder}
                style={{ width: '100%', boxSizing: 'border-box', padding: '8px 12px', background: 'var(--panel)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 7, color: 'var(--tx)', fontSize: 13, fontFamily: 'inherit' }}
                value={form[f.key]} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} />
            </div>
          ))}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--tx2)', display: 'block', marginBottom: 6 }}>Tipo de cobrança *</label>
            <select value={form.billing_type} onChange={e => setForm(p => ({ ...p, billing_type: e.target.value }))}
              style={{ width: '100%', padding: '8px 12px', background: 'var(--panel)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 7, color: 'var(--tx)', fontSize: 13, fontFamily: 'inherit' }}>
              <option value="PIX">PIX</option>
              <option value="BOLETO">Boleto</option>
              <option value="CREDIT_CARD">Cartão de crédito</option>
            </select>
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--tx2)', display: 'block', marginBottom: 6 }}>Descrição (opcional)</label>
            <input type="text" placeholder="Ex: Mensalidade consultoria maio/2026"
              style={{ width: '100%', boxSizing: 'border-box', padding: '8px 12px', background: 'var(--panel)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 7, color: 'var(--tx)', fontSize: 13, fontFamily: 'inherit' }}
              value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
          </div>
          {error && <p style={{ color: '#f87171', fontSize: 12, margin: 0 }}>{error}</p>}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
            <button onClick={onClose} style={{ padding: '8px 18px', background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 7, color: 'var(--tx2)', fontSize: 13, cursor: 'pointer' }}>Cancelar</button>
            <button onClick={submit} disabled={saving} style={{ padding: '8px 18px', background: 'var(--red, #B70C00)', border: 'none', borderRadius: 7, color: 'var(--tx)', fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
              {saving ? <Spinner /> : null} Criar no Asaas
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Drawer: detalhe da cobrança ───────────────────────────────────────────────
function CobrancaDrawer({ cobranca, tenantDbId, userId, onClose, onRefresh }) {
  const [acoes, setAcoes] = useState([]);
  const [loadingAcoes, setLoadingAcoes] = useState(true);
  const [loadingAnalise, setLoadingAnalise] = useState(false);
  const [loadingMensagem, setLoadingMensagem] = useState(false);
  const [loadingEscalonar, setLoadingEscalonar] = useState(false);
  const [mensagemGerada, setMensagemGerada] = useState(null);
  const [error, setError] = useState('');
  const pendingRef = useRef(null);
  const [analise, setAnalise] = useState(cobranca.cora_analise || null);
  const dias = diasAtraso(cobranca.data_vencimento);

  const loadAcoes = useCallback(async () => {
    const { data } = await supabase
      .from('cora_acoes')
      .select('*')
      .eq('cobranca_id', cobranca.id)
      .order('created_at', { ascending: false });
    setAcoes(data || []);
    setLoadingAcoes(false);
  }, [cobranca.id]);

  useEffect(() => { loadAcoes(); }, [loadAcoes]);

  useEffect(() => {
    if (!tenantDbId) return;
    const channel = supabase
      .channel(`cora-drawer-${cobranca.id}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'agent_runs',
        filter: `tenant_id=eq.${tenantDbId}`,
      }, (payload) => {
        const run = payload.new;
        if (run.agent_id !== 'cora') return;
        if (!pendingRef.current || run.trigger_dev_run_id !== pendingRef.current) return;
        if (run.status === 'completed') {
          if (run.output?.analise) {
            setAnalise(run.output.analise);
            setLoadingAnalise(false);
          }
          if (run.output?.mensagem) {
            setMensagemGerada(run.output);
            setLoadingMensagem(false);
          }
          if (run.output?.escalonado) {
            setLoadingEscalonar(false);
            onRefresh?.();
          }
          pendingRef.current = null;
          loadAcoes();
        }
      })
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [tenantDbId, cobranca.id]);

  const callAgent = async (slug, extra = {}) => {
    const token = (await supabase.auth.getSession()).data.session?.access_token;
    const res = await fetch(`${BRIDGE}/agents/${slug}/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ cobranca_id: cobranca.id, tenant_id: tenantDbId, user_id: userId, triggered_by: userId, ...extra }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `Erro ao chamar ${slug}`);
    pendingRef.current = data.trigger_run_id || data.run_id;
  };

  const analisar = async () => {
    setError(''); setLoadingAnalise(true);
    try { await callAgent('cora-analisar-devedor'); } catch (e) { setError(e.message); setLoadingAnalise(false); }
  };
  const gerarMensagem = async () => {
    setError(''); setLoadingMensagem(true);
    try { await callAgent('cora-gerar-mensagem', { tom: analise?.tom_recomendado || 'amigavel' }); } catch (e) { setError(e.message); setLoadingMensagem(false); }
  };
  const escalonar = async () => {
    setError(''); setLoadingEscalonar(true);
    try { await callAgent('cora-escalonar'); } catch (e) { setError(e.message); setLoadingEscalonar(false); }
  };
  const marcarPago = async () => {
    await supabase.from('cora_cobrancas').update({ status: 'pago', updated_at: new Date().toISOString() }).eq('id', cobranca.id);
    await supabase.from('cora_acoes').insert({ cobranca_id: cobranca.id, tenant_id: tenantDbId, tipo: 'pagamento_confirmado', agente: 'humano' });
    onRefresh?.();
    onClose();
  };

  const initials = cobranca.customer_name ? cobranca.customer_name.slice(0, 2).toUpperCase() : '??';

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, display: 'flex', justifyContent: 'flex-end' }}
      onClick={onClose}>
      <div style={{ width: 560, maxWidth: '96vw', background: 'var(--panel)', height: '100vh', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}
        onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--tx2)', cursor: 'pointer', padding: 4 }}><Icon name="chevleft" size={18} /></button>
          <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#B70C00', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: '#fff', fontSize: 13 }}>{initials}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>{cobranca.customer_name}</div>
            <div style={{ fontSize: 12, color: 'var(--tx2)' }}>{cobranca.customer_whatsapp || 'Sem WhatsApp'}</div>
          </div>
          <StatusBadge status={cobranca.status} />
        </div>

        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 20, flex: 1 }}>
          {/* KPIs rápidos */}
          <div style={{ display: 'flex', gap: 12 }}>
            {[
              { label: 'Valor', value: fmtBRL(cobranca.valor_atual), color: '#dc2626' },
              { label: 'Atraso', value: `${dias} dia${dias !== 1 ? 's' : ''}`, color: dias > 20 ? '#dc2626' : dias > 7 ? '#D97706' : 'var(--tx2)' },
              { label: 'Vencimento', value: new Date(cobranca.data_vencimento).toLocaleDateString('pt-BR'), color: 'var(--tx2)' },
            ].map(k => (
              <div key={k.label} style={{ flex: 1, padding: '12px 14px', background: 'var(--panel)', borderRadius: 8 }}>
                <div style={{ fontSize: 11, color: 'var(--tx2)' }}>{k.label}</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: k.color, marginTop: 4 }}>{k.value}</div>
              </div>
            ))}
          </div>

          {/* Análise IA */}
          {analise ? (
            <div style={{ padding: 14, background: 'var(--panel)', borderRadius: 10, border: '1px solid rgba(255,255,255,0.08)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--tx2)' }}>Análise CORA</span>
                <NivelRiscoBadge nivel={analise.nivel_risco} />
              </div>
              <div style={{ display: 'flex', gap: 16, marginBottom: 10 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, color: 'var(--tx2)' }}>Probabilidade de pagamento</div>
                  <div style={{ height: 6, background: 'rgba(255,255,255,0.1)', borderRadius: 3, marginTop: 6, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${analise.probabilidade_pagamento}%`, background: '#16a34a', borderRadius: 3 }} />
                  </div>
                  <div style={{ fontSize: 11, color: '#16a34a', marginTop: 3 }}>{analise.probabilidade_pagamento}%</div>
                </div>
              </div>
              <p style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--tx2)', lineHeight: 1.5 }}>{analise.estrategia_recomendada}</p>
              <div style={{ padding: '8px 12px', background: 'rgba(183,12,0,0.12)', borderRadius: 7, fontSize: 12, color: 'var(--tx)', fontWeight: 500 }}>
                ▶ {analise.proxima_acao}
              </div>
            </div>
          ) : (
            <div style={{ padding: 14, background: 'var(--panel)', borderRadius: 10, border: '1px dashed rgba(255,255,255,0.12)', textAlign: 'center' }}>
              <p style={{ margin: '0 0 10px', fontSize: 13, color: 'var(--tx2)' }}>Análise IA não realizada ainda.</p>
              <button onClick={analisar} disabled={loadingAnalise} style={{ padding: '7px 16px', background: 'var(--red, #B70C00)', border: 'none', borderRadius: 7, color: 'var(--tx)', fontSize: 13, fontWeight: 600, cursor: loadingAnalise ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                {loadingAnalise ? <Spinner /> : <Icon name="sparkles" size={13} />} Analisar com CORA
              </button>
            </div>
          )}

          {analise && (
            <button onClick={analisar} disabled={loadingAnalise} style={{ padding: '7px 14px', background: 'var(--panel)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 7, color: 'var(--tx2)', fontSize: 12, cursor: loadingAnalise ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, alignSelf: 'flex-start' }}>
              {loadingAnalise ? <Spinner /> : <Icon name="sparkles" size={12} />} Re-analisar
            </button>
          )}

          {/* Ações */}
          {error && <p style={{ color: '#f87171', fontSize: 12, margin: 0 }}>{error}</p>}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={gerarMensagem} disabled={loadingMensagem} style={{ flex: 1, padding: '9px 14px', background: 'var(--panel)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 7, color: 'var(--tx)', fontSize: 13, cursor: loadingMensagem ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              {loadingMensagem ? <Spinner /> : '💬'} Gerar Mensagem
            </button>
            <button onClick={marcarPago} style={{ flex: 1, padding: '9px 14px', background: 'rgba(22,163,74,0.15)', border: '1px solid rgba(22,163,74,0.3)', borderRadius: 7, color: '#16a34a', fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              ✓ Marcar como Pago
            </button>
            {cobranca.status !== 'escalonado' && (
              <button onClick={escalonar} disabled={loadingEscalonar} style={{ flex: 1, padding: '9px 14px', background: 'rgba(220,38,38,0.12)', border: '1px solid rgba(220,38,38,0.25)', borderRadius: 7, color: '#dc2626', fontSize: 13, cursor: loadingEscalonar ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                {loadingEscalonar ? <Spinner /> : '🚨'} Escalonar
              </button>
            )}
          </div>

          {/* Mensagem gerada */}
          {mensagemGerada && (
            <div style={{ padding: 14, background: 'var(--panel)', borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--tx2)' }}>Mensagem gerada — aguarda aprovação</span>
              </div>
              <p style={{ margin: '0 0 10px', fontSize: 13, color: 'var(--tx)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{mensagemGerada.mensagem}</p>
              {mensagemGerada.dica_envio && (
                <p style={{ margin: 0, fontSize: 11, color: 'var(--tx2)', fontStyle: 'italic' }}>💡 {mensagemGerada.dica_envio}</p>
              )}
            </div>
          )}

          {/* Histórico */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--tx2)', marginBottom: 10 }}>Histórico de Ações</div>
            {loadingAcoes ? (
              <div style={{ fontSize: 13, color: 'var(--tx2)' }}>Carregando…</div>
            ) : acoes.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--tx2)' }}>Nenhuma ação ainda.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {acoes.map(a => (
                  <div key={a.id} style={{ padding: '10px 12px', background: 'var(--panel)', borderRadius: 8, borderLeft: '3px solid rgba(255,255,255,0.1)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--tx2)' }}>{a.tipo.replace(/_/g, ' ')}</span>
                      <span style={{ fontSize: 11, color: 'var(--tx2)' }}>{new Date(a.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    {a.conteudo && <p style={{ margin: 0, fontSize: 12, color: 'var(--tx2)', lineHeight: 1.4 }}>{a.conteudo.slice(0, 120)}{a.conteudo.length > 120 ? '…' : ''}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Drawer V2: cobrança Asaas ─────────────────────────────────────────────────
function CobrancaV2Drawer({ cobranca, tenantDbId, userId, onClose, onRefresh }) {
  const [eventos, setEventos] = useState([]);
  const [acoes, setAcoes] = useState([]);
  const [loadingEventos, setLoadingEventos] = useState(true);
  const [loadingAnalise, setLoadingAnalise] = useState(false);
  const [loadingMensagem, setLoadingMensagem] = useState(false);
  const [mensagemGerada, setMensagemGerada] = useState(null);
  const [error, setError] = useState('');
  const pendingRef = useRef(null);
  const dias = diasAtraso(cobranca.vencimento);

  const loadEventos = useCallback(async () => {
    const [{ data: evs }, { data: acs }] = await Promise.all([
      supabase.from('cobranca_eventos').select('*').eq('cobranca_id', cobranca.id).order('created_at', { ascending: false }),
      supabase.from('cora_acoes').select('*').eq('cobranca_v2_id', cobranca.id).order('created_at', { ascending: false }),
    ]);
    setEventos(evs || []);
    setAcoes(acs || []);
    setLoadingEventos(false);
  }, [cobranca.id]);

  useEffect(() => { loadEventos(); }, [loadEventos]);

  useEffect(() => {
    if (!tenantDbId) return;
    const ch = supabase.channel(`cora-v2-drawer-${cobranca.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'agent_runs', filter: `tenant_id=eq.${tenantDbId}` }, (payload) => {
        const run = payload.new;
        if (run.agent_id !== 'cora') return;
        if (!pendingRef.current || run.trigger_dev_run_id !== pendingRef.current) return;
        if (run.status === 'success' || run.status === 'completed') {
          if (run.output?.mensagem) { setMensagemGerada(run.output); setLoadingMensagem(false); }
          setLoadingAnalise(false);
          pendingRef.current = null;
          loadEventos();
        }
      })
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [tenantDbId, cobranca.id, loadEventos]);

  const callAgent = async (slug, extra = {}) => {
    const token = (await supabase.auth.getSession()).data.session?.access_token;
    const res = await fetch(`${BRIDGE}/agents/${slug}/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ cobranca_id: cobranca.id, tenant_id: tenantDbId, user_id: userId, triggered_by: userId, source: 'v2', ...extra }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `Erro ao chamar ${slug}`);
    pendingRef.current = data.trigger_run_id || data.run_id;
  };

  const analisar = async () => {
    setError(''); setLoadingAnalise(true);
    try { await callAgent('cora-analisar-devedor'); } catch (e) { setError(e.message); setLoadingAnalise(false); }
  };
  const gerarMensagem = async () => {
    setError(''); setLoadingMensagem(true);
    try { await callAgent('cora-gerar-mensagem', { tom: 'amigavel' }); } catch (e) { setError(e.message); setLoadingMensagem(false); }
  };

  const billingLabel = { PIX: 'PIX', BOLETO: 'Boleto', CREDIT_CARD: 'Cartão', UNDEFINED: '-' };

  const initials = cobranca.customer_name ? cobranca.customer_name.slice(0, 2).toUpperCase() : '??';

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, display: 'flex', justifyContent: 'flex-end' }}
      onClick={onClose}>
      <div style={{ width: 580, maxWidth: '96vw', background: 'var(--panel)', height: '100vh', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}
        onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--tx2)', cursor: 'pointer', padding: 4 }}><Icon name="chevleft" size={18} /></button>
          <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#B70C00', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: '#fff', fontSize: 13 }}>{initials}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>{cobranca.customer_name}</div>
            <div style={{ fontSize: 11, color: 'var(--tx2)' }}>
              {billingLabel[cobranca.billing_type] || cobranca.billing_type} · {cobranca.asaas_charge_id}
            </div>
          </div>
          <StatusBadgeV2 status={cobranca.status} />
        </div>

        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 20, flex: 1 }}>
          {/* KPIs */}
          <div style={{ display: 'flex', gap: 12 }}>
            {[
              { label: 'Valor', value: fmtBRL(cobranca.valor), color: cobranca.status === 'overdue' ? '#dc2626' : 'var(--tx)' },
              { label: 'Atraso', value: `${dias} dia${dias !== 1 ? 's' : ''}`, color: dias > 20 ? '#dc2626' : dias > 7 ? '#D97706' : 'var(--tx2)' },
              { label: 'Vencimento', value: new Date(cobranca.vencimento).toLocaleDateString('pt-BR'), color: 'var(--tx2)' },
            ].map(k => (
              <div key={k.label} style={{ flex: 1, padding: '12px 14px', background: 'var(--panel)', borderRadius: 8 }}>
                <div style={{ fontSize: 11, color: 'var(--tx2)' }}>{k.label}</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: k.color, marginTop: 4 }}>{k.value}</div>
              </div>
            ))}
          </div>

          {/* Links de pagamento */}
          {(cobranca.invoice_url || cobranca.bank_slip_url || cobranca.pix_qr_code) && (
            <div style={{ padding: 14, background: 'var(--panel)', borderRadius: 10, border: '1px solid rgba(255,255,255,0.08)', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--tx2)', marginBottom: 2 }}>Links de pagamento</div>
              {cobranca.invoice_url && (
                <a href={cobranca.invoice_url} target="_blank" rel="noreferrer"
                  style={{ fontSize: 12, color: '#60a5fa', textDecoration: 'none' }}>
                  🔗 Link da fatura
                </a>
              )}
              {cobranca.bank_slip_url && (
                <a href={cobranca.bank_slip_url} target="_blank" rel="noreferrer"
                  style={{ fontSize: 12, color: '#60a5fa', textDecoration: 'none' }}>
                  📄 Boleto bancário
                </a>
              )}
              {cobranca.pix_qr_code && (
                <div>
                  <div style={{ fontSize: 11, color: 'var(--tx2)', marginBottom: 4 }}>PIX copia-e-cola</div>
                  <div style={{ fontFamily: 'monospace', fontSize: 10, color: 'var(--tx2)', wordBreak: 'break-all', background: 'var(--panel)', padding: '6px 8px', borderRadius: 6 }}>
                    {cobranca.pix_qr_code.length > 120 ? `${cobranca.pix_qr_code.slice(0, 120)}…` : cobranca.pix_qr_code}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Ações CORA */}
          {error && <p style={{ color: '#f87171', fontSize: 12, margin: 0 }}>{error}</p>}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={analisar} disabled={loadingAnalise}
              style={{ flex: 1, padding: '9px 14px', background: 'var(--panel)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 7, color: 'var(--tx)', fontSize: 13, cursor: loadingAnalise ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              {loadingAnalise ? <Spinner /> : <Icon name="sparkles" size={13} />} Analisar com CORA
            </button>
            <button onClick={gerarMensagem} disabled={loadingMensagem}
              style={{ flex: 1, padding: '9px 14px', background: 'var(--panel)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 7, color: 'var(--tx)', fontSize: 13, cursor: loadingMensagem ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              {loadingMensagem ? <Spinner /> : '💬'} Gerar Mensagem
            </button>
          </div>

          {/* Mensagem gerada */}
          {mensagemGerada && (
            <div style={{ padding: 14, background: 'var(--panel)', borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--tx2)', marginBottom: 8 }}>Mensagem gerada — aguarda aprovação</div>
              <p style={{ margin: '0 0 10px', fontSize: 13, color: 'var(--tx)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{mensagemGerada.mensagem}</p>
              {mensagemGerada.dica_envio && (
                <p style={{ margin: 0, fontSize: 11, color: 'var(--tx2)', fontStyle: 'italic' }}>💡 {mensagemGerada.dica_envio}</p>
              )}
            </div>
          )}

          {/* Histórico de eventos (audit trail) */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--tx2)', marginBottom: 10 }}>Eventos Asaas</div>
            {loadingEventos ? (
              <div style={{ fontSize: 13, color: 'var(--tx2)' }}>Carregando…</div>
            ) : eventos.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--tx2)' }}>Nenhum evento ainda.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {eventos.map(ev => (
                  <div key={ev.id} style={{ padding: '9px 12px', background: 'var(--panel)', borderRadius: 8, borderLeft: `3px solid ${ev.event_type === 'payment_received' ? '#16a34a' : ev.event_type === 'created' ? '#3b82f6' : 'rgba(255,255,255,0.15)'}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--tx2)' }}>{ev.event_type.replace(/_/g, ' ')}</span>
                      <span style={{ fontSize: 11, color: 'var(--tx2)' }}>{new Date(ev.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    {ev.old_status && ev.new_status && (
                      <span style={{ fontSize: 11, color: 'var(--tx2)' }}>{ev.old_status} → {ev.new_status}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Ações CORA sobre esta cobrança */}
          {acoes.length > 0 && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--tx2)', marginBottom: 10 }}>Ações CORA</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {acoes.map(a => (
                  <div key={a.id} style={{ padding: '9px 12px', background: 'var(--panel)', borderRadius: 8, borderLeft: '3px solid rgba(183,12,0,0.4)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--tx2)' }}>{(a.acao || a.tipo || 'ação').replace(/_/g, ' ')}</span>
                      <span style={{ fontSize: 11, color: 'var(--tx2)' }}>{new Date(a.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    {a.mensagem_enviada && <p style={{ margin: 0, fontSize: 12, color: 'var(--tx2)', lineHeight: 1.4 }}>{a.mensagem_enviada.slice(0, 120)}{a.mensagem_enviada.length > 120 ? '…' : ''}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Aging helper ──────────────────────────────────────────────────────────────
// ── Pie chart (SVG, sem dependência externa) ──────────────────────────────────
function PieChartSimple({ data, size = 140 }) {
  const total = data.reduce((s, d) => s + (d.value || 0), 0);
  if (total === 0) return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: 'var(--g-100)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: 'var(--g-400)' }}>
      Sem dados
    </div>
  );
  const cx = size / 2, cy = size / 2;
  const outerR = size / 2 - 4, innerR = outerR * 0.52;
  let cumAngle = -Math.PI / 2;
  const slices = data.filter(d => d.value > 0).map(d => {
    const sweep = (d.value / total) * 2 * Math.PI;
    const start = cumAngle; cumAngle += sweep;
    return { ...d, start, end: cumAngle, sweep };
  });
  function polar(angle, r) { return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)]; }
  function slicePath(s) {
    const [ox1, oy1] = polar(s.start, outerR), [ox2, oy2] = polar(s.end, outerR);
    const [ix1, iy1] = polar(s.end, innerR), [ix2, iy2] = polar(s.start, innerR);
    const lg = s.sweep > Math.PI ? 1 : 0;
    return `M${ox1.toFixed(2)} ${oy1.toFixed(2)} A${outerR} ${outerR} 0 ${lg} 1 ${ox2.toFixed(2)} ${oy2.toFixed(2)} L${ix1.toFixed(2)} ${iy1.toFixed(2)} A${innerR} ${innerR} 0 ${lg} 0 ${ix2.toFixed(2)} ${iy2.toFixed(2)}Z`;
  }
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {slices.map((s, i) => (
        <path key={i} d={slicePath(s)} fill={s.color} opacity={0.88}>
          <title>{s.label}: {fmtBRL(s.value)} ({((s.value / total) * 100).toFixed(1)}%)</title>
        </path>
      ))}
    </svg>
  );
}

function agingBucket(dias) {
  if (dias <= 30) return '1–30';
  if (dias <= 60) return '31–60';
  if (dias <= 90) return '61–90';
  return '90+';
}

// ── Ton badge ─────────────────────────────────────────────────────────────────
function TomBadge({ tom }) {
  const map = {
    amigavel: { label: 'Amigável',  color: '#16a34a' },
    neutro:   { label: 'Neutro',    color: '#2563eb' },
    formal:   { label: 'Formal',    color: '#D97706' },
    urgente:  { label: 'Urgente',   color: '#dc2626' },
  };
  const m = map[tom] || map.neutro;
  return (
    <span style={{ background: `${m.color}22`, color: m.color, border: `1px solid ${m.color}44`, borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 600 }}>
      {m.label}
    </span>
  );
}

// ── Draft approval card ───────────────────────────────────────────────────────
function DraftCard({ draft, tenantDbId, onDone }) {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);

  const call = async (endpoint) => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const r = await fetch(`${BRIDGE}/api/cora/${endpoint}/${draft.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ tenant_id: tenantDbId }),
      });
      if (!r.ok) { const e = await r.json(); alert(e.error || 'Erro'); }
      else onDone();
    } catch (e) { alert(e.message); }
    setLoading(false);
  };

  const meta = draft.metadata || {};
  const dias = meta.dias_atraso ?? 0;
  const diasLabel = dias <= 0 ? `vence em ${Math.abs(dias)}d` : `${dias}d em atraso`;

  return (
    <div className="cv2-card" style={{ padding: 16, marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 700, fontSize: 14 }}>{meta.customer_name || '—'}</span>
            <span style={{ fontWeight: 700, color: dias > 0 ? 'var(--red)' : 'var(--success)', fontSize: 13 }}>{fmtBRL(meta.valor)}</span>
            <span style={{ fontSize: 12, color: dias > 30 ? 'var(--red)' : 'var(--g-600)' }}>{diasLabel}</span>
            {meta.tom && <TomBadge tom={meta.tom} />}
          </div>
          {meta.customer_phone && (
            <div style={{ fontSize: 12, color: 'var(--g-500)', marginBottom: 6 }}>{meta.customer_phone}</div>
          )}
          <div style={{ fontSize: 13, color: 'var(--g-700)', lineHeight: 1.5, whiteSpace: 'pre-wrap',
            maxHeight: expanded ? 'none' : 72, overflow: 'hidden', position: 'relative' }}>
            {draft.body}
            {!expanded && draft.body?.length > 200 && (
              <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 32,
                background: 'linear-gradient(transparent, var(--bg))' }} />
            )}
          </div>
          {draft.body?.length > 200 && (
            <button onClick={() => setExpanded(v => !v)} style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', fontSize: 12, padding: '4px 0', marginTop: 4 }}>
              {expanded ? 'Ver menos' : 'Ver mensagem completa'}
            </button>
          )}
          {meta.dica_envio && (
            <div style={{ fontSize: 11, color: 'var(--g-500)', marginTop: 6 }}>💡 {meta.dica_envio}</div>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 130 }}>
          <button className="cv2-btn" disabled={loading} onClick={() => call('aprovar')} style={{ fontSize: 12, background: '#16a34a', color: '#fff', borderColor: '#16a34a' }}>
            {loading ? '…' : '✓ Aprovar e Enviar'}
          </button>
          <button className="cv2-btn sec" disabled={loading} onClick={() => call('rejeitar')} style={{ fontSize: 12 }}>
            ✕ Rejeitar
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function Cora({ tenantDbId, userId }) {
  const [activeTab, setActiveTab] = useState('financeiro');

  // V2 (Asaas) state
  const [cobrancasV2, setCobrancasV2] = useState([]);
  const [loadingV2, setLoadingV2] = useState(true);
  const [selectedV2Id, setSelectedV2Id] = useState(null);
  const [showNovaAsaasModal, setShowNovaAsaasModal] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('todos');

  // V1 (legacy) state — mantido para o drawer
  const [cobrancas, setCobrancas] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [showNovaModal, setShowNovaModal] = useState(false);

  // Agente CORA drafts
  const [drafts, setDrafts] = useState([]);
  const [loadingDrafts, setLoadingDrafts] = useState(true);
  const [acoes, setAcoes] = useState([]);

  // Modo CORA
  const [modo, setModo] = useState('humano');
  const [savingModo, setSavingModo] = useState(false);

  // Saldo Asaas
  const [saldoAsaas, setSaldoAsaas] = useState(null);
  const [loadingSaldo, setLoadingSaldo] = useState(false);

  // UI toggles
  const [showPie, setShowPie] = useState(false);
  const [reguaFilter, setReguaFilter] = useState('todas');

  // Per-charge loading + expanded draft state
  const [loadingMsgMap, setLoadingMsgMap] = useState({});
  const [expandedDraftMap, setExpandedDraftMap] = useState({});
  const [sendingMap, setSendingMap] = useState({});

  // ── Loaders ────────────────────────────────────────────────────────────────

  const loadCobrancasV2 = useCallback(async () => {
    if (!tenantDbId) return;
    setLoadingV2(true);
    const { data } = await supabase
      .from('cobrancas')
      .select('*')
      .eq('tenant_id', tenantDbId)
      .order('vencimento', { ascending: false });
    setCobrancasV2(data || []);
    setLoadingV2(false);
  }, [tenantDbId]);

  const loadCobrancas = useCallback(async () => {
    if (!tenantDbId) return;
    const { data } = await supabase
      .from('cora_cobrancas')
      .select('*')
      .eq('tenant_id', tenantDbId);
    setCobrancas(data || []);
  }, [tenantDbId]);

  const loadDrafts = useCallback(async () => {
    if (!tenantDbId) return;
    setLoadingDrafts(true);
    const { data } = await supabase
      .from('agent_drafts')
      .select('*')
      .eq('tenant_id', tenantDbId)
      .eq('agent_name', 'cora')
      .eq('status', 'pending')
      .order('created_at', { ascending: false });
    setDrafts(data || []);
    setLoadingDrafts(false);
  }, [tenantDbId]);

  const loadAcoes = useCallback(async () => {
    if (!tenantDbId) return;
    const since = new Date(); since.setDate(since.getDate() - 7);
    const { data } = await supabase
      .from('cora_acoes')
      .select('id, tipo, acao, canal, created_at, conteudo, metadata')
      .eq('tenant_id', tenantDbId)
      .gte('created_at', since.toISOString())
      .order('created_at', { ascending: false })
      .limit(50);
    setAcoes(data || []);
  }, [tenantDbId]);

  const loadModo = useCallback(async () => {
    if (!tenantDbId) return;
    const { data } = await supabase
      .from('tenant_agent_config')
      .select('mode')
      .eq('tenant_id', tenantDbId)
      .eq('agent_id', 'cora')
      .maybeSingle();
    if (data?.mode) setModo(data.mode);
  }, [tenantDbId]);

  const saveModo = async (novoModo) => {
    if (!tenantDbId) return;
    setSavingModo(true);
    await supabase.from('tenant_agent_config').upsert(
      { tenant_id: tenantDbId, agent_id: 'cora', mode: novoModo },
      { onConflict: 'tenant_id,agent_id' }
    );
    setModo(novoModo);
    setSavingModo(false);
  };

  const loadSaldo = useCallback(async () => {
    if (!tenantDbId) return;
    setLoadingSaldo(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const r = await fetch(`${BRIDGE}/api/asaas/saldo`, {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (r.ok) {
        const json = await r.json();
        setSaldoAsaas(json.balance ?? json.totalBalance ?? null);
      }
    } catch (_) { /* silent — saldo não é crítico */ }
    setLoadingSaldo(false);
  }, [tenantDbId]);

  useEffect(() => { loadCobrancasV2(); loadCobrancas(); loadDrafts(); loadAcoes(); loadModo(); loadSaldo(); },
    [loadCobrancasV2, loadCobrancas, loadDrafts, loadAcoes, loadModo, loadSaldo]);

  // Realtime — cobranças V2
  useEffect(() => {
    if (!tenantDbId) return;
    const ch = supabase.channel('cora-cobrancas-v2')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cobrancas', filter: `tenant_id=eq.${tenantDbId}` }, () => loadCobrancasV2())
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [tenantDbId, loadCobrancasV2]);

  // Realtime — drafts CORA
  useEffect(() => {
    if (!tenantDbId) return;
    const ch = supabase.channel('cora-drafts')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agent_drafts', filter: `tenant_id=eq.${tenantDbId}` }, () => { loadDrafts(); loadAcoes(); })
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [tenantDbId, loadDrafts, loadAcoes]);

  // Auto-clear spinner quando draft aparecer para uma cobrança em loading
  useEffect(() => {
    if (!Object.keys(loadingMsgMap).length) return;
    const draftIds = new Set(drafts.map(d => d.metadata?.cobranca_v2_id).filter(Boolean));
    const ready = Object.keys(loadingMsgMap).filter(id => draftIds.has(id));
    if (!ready.length) return;
    setLoadingMsgMap(prev => { const n = { ...prev }; ready.forEach(id => delete n[id]); return n; });
    setExpandedDraftMap(prev => { const n = { ...prev }; ready.forEach(id => { n[id] = true; }); return n; });
  }, [drafts]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Derived data ──────────────────────────────────────────────────────────

  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const mesAtual = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;

  const recebidoMes = cobrancasV2
    .filter(c => c.status === 'received' && c.vencimento?.slice(0, 7) === mesAtual)
    .reduce((s, c) => s + Number(c.valor), 0);

  const aReceber = cobrancasV2
    .filter(c => c.status === 'pending')
    .reduce((s, c) => s + Number(c.valor), 0);

  const totalInad = cobrancasV2
    .filter(c => c.status === 'overdue')
    .reduce((s, c) => s + Number(c.valor), 0);

  const totalEmitido = cobrancasV2.reduce((s, c) => s + Number(c.valor), 0);
  const taxaInad = totalEmitido > 0 ? ((totalInad / totalEmitido) * 100).toFixed(1) : '0.0';

  // Aging (overdue only)
  const aging = { '1–30': { qtd: 0, valor: 0 }, '31–60': { qtd: 0, valor: 0 }, '61–90': { qtd: 0, valor: 0 }, '90+': { qtd: 0, valor: 0 } };
  cobrancasV2.filter(c => c.status === 'overdue').forEach(c => {
    const d = diasAtraso(c.vencimento);
    const b = agingBucket(d);
    aging[b].qtd++;
    aging[b].valor += Number(c.valor);
  });

  // Bar chart — last 6 months received
  const chartMonths = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
    chartMonths.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  const chartData = chartMonths.map(m => ({
    label: new Date(m + '-01').toLocaleDateString('pt-BR', { month: 'short' }),
    valor: cobrancasV2.filter(c => c.status === 'received' && c.vencimento?.slice(0, 7) === m).reduce((s, c) => s + Number(c.valor), 0),
  }));
  const chartMax = Math.max(...chartData.map(d => d.valor), 1);

  // Filtered charge table
  const filteredV2 = cobrancasV2.filter(c => {
    if (statusFilter !== 'todos' && c.status !== statusFilter) return false;
    if (search && !(c.customer_name || '').toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const selected = cobrancas.find(c => c.id === selectedId);
  const selectedV2 = cobrancasV2.find(c => c.id === selectedV2Id);
  const overdueCount = cobrancasV2.filter(c => c.status === 'overdue').length;

  // KPIs extras
  const confirmadas = cobrancasV2
    .filter(c => c.status === 'received' && c.confirmed_date)
    .reduce((s, c) => s + Number(c.valor), 0);
  const aguardando = cobrancasV2
    .filter(c => c.status === 'pending' && new Date(c.vencimento) >= hoje)
    .reduce((s, c) => s + Number(c.valor), 0);

  // Régua — elegíveis: vencidas + pending vencendo em até 7 dias
  const seteDiasAFrente = new Date(hoje); seteDiasAFrente.setDate(seteDiasAFrente.getDate() + 7);
  const elegiveisRegua = cobrancasV2.filter(c => {
    if (c.status === 'overdue') return true;
    if (c.status === 'pending') { const v = new Date(c.vencimento); return v >= hoje && v <= seteDiasAFrente; }
    return false;
  });
  const elegiveisFiltered = reguaFilter === 'vencidas' ? elegiveisRegua.filter(c => c.status === 'overdue')
    : reguaFilter === 'proximas7d' ? elegiveisRegua.filter(c => c.status === 'pending')
    : elegiveisRegua;

  // Pie data
  const pieStatus = [
    { label: 'Recebido',  value: cobrancasV2.filter(c => c.status === 'received').reduce((s,c) => s + Number(c.valor), 0), color: '#16a34a' },
    { label: 'Pendente',  value: cobrancasV2.filter(c => c.status === 'pending').reduce((s,c) => s + Number(c.valor), 0),  color: '#D97706' },
    { label: 'Vencido',   value: cobrancasV2.filter(c => c.status === 'overdue').reduce((s,c) => s + Number(c.valor), 0),  color: '#dc2626' },
    { label: 'Outros',    value: cobrancasV2.filter(c => ['canceled','refunded'].includes(c.status)).reduce((s,c) => s + Number(c.valor), 0), color: '#6b7280' },
  ];
  const pieBilling = [
    { label: 'PIX',    value: cobrancasV2.filter(c => c.billing_type === 'PIX').reduce((s,c) => s + Number(c.valor), 0),         color: '#2563eb' },
    { label: 'Boleto', value: cobrancasV2.filter(c => c.billing_type === 'BOLETO').reduce((s,c) => s + Number(c.valor), 0),      color: '#D97706' },
    { label: 'Cartão', value: cobrancasV2.filter(c => c.billing_type === 'CREDIT_CARD').reduce((s,c) => s + Number(c.valor), 0), color: '#16a34a' },
  ];

  // Ações da régua
  const gerarMensagem = async (cob) => {
    setLoadingMsgMap(prev => ({ ...prev, [cob.id]: true }));
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const r = await fetch(`${BRIDGE}/agents/cora-gerar-mensagem/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({
          tenant_id: tenantDbId, cobranca_v2_id: cob.id,
          customer_name: cob.customer_name, customer_phone: cob.customer_phone,
          valor: cob.valor, vencimento: cob.vencimento, status: cob.status,
        }),
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        alert(e.error || 'Erro ao gerar mensagem');
        setLoadingMsgMap(prev => { const n = { ...prev }; delete n[cob.id]; return n; });
      }
    } catch (e) {
      alert(e.message);
      setLoadingMsgMap(prev => { const n = { ...prev }; delete n[cob.id]; return n; });
    }
  };

  const enviarDraft = async (draft, testPhone = null) => {
    const key = draft.metadata?.cobranca_v2_id || draft.id;
    setSendingMap(prev => ({ ...prev, [key]: true }));
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const url = testPhone
        ? `${BRIDGE}/api/cora/aprovar/${draft.id}?test_phone=${encodeURIComponent(testPhone)}`
        : `${BRIDGE}/api/cora/aprovar/${draft.id}`;
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ tenant_id: tenantDbId }),
      });
      if (!r.ok) { const e = await r.json().catch(() => ({})); alert(e.error || 'Erro ao enviar'); }
      else { loadDrafts(); loadAcoes(); setExpandedDraftMap(prev => { const n = { ...prev }; delete n[key]; return n; }); }
    } catch (e) { alert(e.message); }
    setSendingMap(prev => { const n = { ...prev }; delete n[key]; return n; });
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ padding: 32, maxWidth: 1400, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 24, flexWrap: 'wrap', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#B70C00', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: '#fff', fontSize: 22 }}>C</div>
          <div>
            <h1 style={{ color: 'var(--tx)' }}>CORA — Cobrança Inteligente</h1>
            <p className="page-sub">
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 7, height: 7, background: 'var(--success)', borderRadius: '50%' }} className="pulse-green" />
                <strong style={{ color: 'var(--success)' }}>Ativa</strong> · {overdueCount} vencido{overdueCount !== 1 ? 's' : ''} · {drafts.length} aguardando aprovação
              </span>
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <button className="cv2-btn" onClick={() => setShowNovaAsaasModal(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
            <Icon name="plus" size={13} /> Nova cobrança
          </button>
        </div>
      </div>

      {/* Main tabs */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 24, borderBottom: '1px solid var(--g-200)' }}>
        {[
          { id: 'financeiro', label: 'Financeiro' },
          { id: 'agente', label: 'Agente CORA', badge: drafts.length },
        ].map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
            padding: '12px 18px', fontSize: 14, fontWeight: activeTab === t.id ? 700 : 500,
            color: activeTab === t.id ? 'var(--red)' : 'var(--g-600)',
            borderBottom: activeTab === t.id ? '2px solid var(--red)' : '2px solid transparent',
            marginBottom: -1, background: 'none', border: 'none', cursor: 'pointer', transition: 'all 150ms',
          }}>
            {t.label}
            {t.badge > 0 && (
              <span style={{ marginLeft: 7, background: 'var(--red)', color: '#fff', borderRadius: 10, fontSize: 10, fontWeight: 700, padding: '2px 7px' }}>
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── TAB: FINANCEIRO ─────────────────────────────────────────────────── */}
      {activeTab === 'financeiro' && (
        <>
          {/* Toggle cards ↔ gráfico */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
            <button
              onClick={() => setShowPie(v => !v)}
              style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid var(--g-200)', background: 'var(--bg)', color: 'var(--tx)', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
            >
              {showPie ? '📋 Versão cards' : '🥧 Versão gráfico'}
            </button>
          </div>

          {showPie ? (
            /* ── Gráficos de pizza ──────────────────────────────────── */
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16, marginBottom: 24 }}>
              {/* Pie 1 — Por status */}
              <div className="cv2-card" style={{ padding: 20 }}>
                <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--g-700)', marginBottom: 16 }}>Distribuição por status</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
                  <PieChartSimple data={pieStatus} size={140} />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1, minWidth: 120 }}>
                    {pieStatus.filter(d => d.value > 0).map(d => (
                      <div key={d.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 10, height: 10, borderRadius: 2, background: d.color, flexShrink: 0 }} />
                        <span style={{ fontSize: 12, color: 'var(--g-600)', flex: 1 }}>{d.label}</span>
                        <span style={{ fontSize: 12, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmtBRL(d.value)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              {/* Pie 2 — Por tipo de pagamento */}
              <div className="cv2-card" style={{ padding: 20 }}>
                <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--g-700)', marginBottom: 16 }}>Distribuição por pagamento</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
                  <PieChartSimple data={pieBilling} size={140} />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1, minWidth: 120 }}>
                    {pieBilling.filter(d => d.value > 0).map(d => (
                      <div key={d.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 10, height: 10, borderRadius: 2, background: d.color, flexShrink: 0 }} />
                        <span style={{ fontSize: 12, color: 'var(--g-600)', flex: 1 }}>{d.label}</span>
                        <span style={{ fontSize: 12, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmtBRL(d.value)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* ── KPIs cards ─────────────────────────────────────────── */
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
              <div className="cv2-kpi">
                <div className="cv2-kpi l">Saldo na conta</div>
                <div className="cv2-kpi v" style={{ marginTop: 8, color: 'var(--success)' }}>
                  {loadingSaldo ? '…' : saldoAsaas !== null ? fmtBRL(saldoAsaas) : '—'}
                </div>
                <div className="kpi-delta up" style={{ marginTop: 10 }}><Icon name="arrowup" size={11} /> Asaas saldo atual</div>
              </div>
              <div className="cv2-kpi">
                <div className="cv2-kpi l">Recebido este mês</div>
                <div className="cv2-kpi v" style={{ marginTop: 8, color: 'var(--success)' }}>{fmtBRL(recebidoMes)}</div>
                <div className="kpi-delta up" style={{ marginTop: 10 }}><Icon name="arrowup" size={11} /> Confirmados Asaas</div>
              </div>
              <div className="cv2-kpi">
                <div className="cv2-kpi l">Confirmadas</div>
                <div className="cv2-kpi v accent" style={{ marginTop: 8 }}>{fmtBRL(confirmadas)}</div>
                <div className="kpi-delta neutral" style={{ marginTop: 10 }}><Icon name="info" size={11} /> Com data de confirmação</div>
              </div>
              <div className="cv2-kpi">
                <div className="cv2-kpi l">Aguardando pagamento</div>
                <div className="cv2-kpi v" style={{ marginTop: 8, color: '#D97706' }}>{fmtBRL(aguardando)}</div>
                <div className="kpi-delta neutral" style={{ marginTop: 10 }}><Icon name="info" size={11} /> Pendentes a vencer</div>
              </div>
              <div className="cv2-kpi">
                <div className="cv2-kpi l">Inadimplência</div>
                <div className="cv2-kpi v" style={{ marginTop: 8, color: totalInad > 0 ? 'var(--red)' : 'var(--g-900)' }}>{fmtBRL(totalInad)}</div>
                <div className="kpi-delta down" style={{ marginTop: 10 }}><Icon name="info" size={11} /> {overdueCount} cobranças vencidas</div>
              </div>
              <div className="cv2-kpi">
                <div className="cv2-kpi l">Taxa inadimplência</div>
                <div className="cv2-kpi v" style={{ marginTop: 8, color: Number(taxaInad) > 10 ? 'var(--red)' : 'var(--g-900)' }}>{taxaInad}%</div>
                <div className="kpi-delta neutral" style={{ marginTop: 10 }}><Icon name="info" size={11} /> Do total emitido</div>
              </div>
            </div>
          )}

          {/* Chart + Aging side by side */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
            {/* Bar chart */}
            <div className="cv2-card" style={{ padding: 20 }}>
              <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--g-700)', marginBottom: 16 }}>Recebido por mês (últimos 6 meses)</div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 120 }}>
                {chartData.map(d => (
                  <div key={d.label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                    <div style={{ fontSize: 10, color: 'var(--g-500)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                      {d.valor > 0 ? `R$${(d.valor / 1000).toFixed(1)}k` : ''}
                    </div>
                    <div style={{
                      width: '100%', background: d.label === chartData[5].label ? 'var(--red)' : 'var(--g-200)',
                      borderRadius: '4px 4px 0 0',
                      height: `${Math.max(4, (d.valor / chartMax) * 90)}px`,
                      transition: 'height 0.4s ease',
                    }} />
                    <div style={{ fontSize: 11, color: 'var(--g-500)' }}>{d.label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Aging table */}
            <div className="cv2-card" style={{ padding: 20 }}>
              <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--g-700)', marginBottom: 16 }}>Aging de inadimplência</div>
              <table className="tbl" style={{ fontSize: 13 }}>
                <thead>
                  <tr>
                    <th>Faixa</th>
                    <th style={{ textAlign: 'right' }}>Qtd</th>
                    <th style={{ textAlign: 'right' }}>Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(aging).map(([faixa, v]) => (
                    <tr key={faixa}>
                      <td style={{ fontWeight: 600 }}>{faixa} dias</td>
                      <td style={{ textAlign: 'right', color: 'var(--g-600)' }}>{v.qtd}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600, color: v.valor > 0 ? 'var(--red)' : 'var(--g-400)' }}>{fmtBRL(v.valor)}</td>
                    </tr>
                  ))}
                  <tr style={{ borderTop: '2px solid var(--g-200)' }}>
                    <td style={{ fontWeight: 700 }}>Total</td>
                    <td style={{ textAlign: 'right', fontWeight: 700 }}>{overdueCount}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--red)' }}>{fmtBRL(totalInad)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Régua de Cobrança ──────────────────────────────────────────── */}
          <div className="cv2-card" style={{ marginBottom: 24, overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--g-100)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>Régua de Cobrança</div>
                <div style={{ fontSize: 12, color: 'var(--g-500)', marginTop: 2 }}>
                  {elegiveisRegua.length} cliente{elegiveisRegua.length !== 1 ? 's' : ''} elegíveis · vencidas + próximos 7 dias
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {[['todas','Todas'],['vencidas','Vencidas'],['proximas7d','Próx. 7 dias']].map(([v, l]) => (
                  <button key={v} onClick={() => setReguaFilter(v)} style={{
                    padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    background: reguaFilter === v ? 'var(--red, #B70C00)' : 'var(--g-100)',
                    color: reguaFilter === v ? '#fff' : 'var(--g-600)',
                    border: reguaFilter === v ? 'none' : '1px solid var(--g-200)',
                  }}>{l}</button>
                ))}
              </div>
            </div>
            {elegiveisFiltered.length === 0 ? (
              <div style={{ padding: 32, textAlign: 'center', color: 'var(--g-500)', fontSize: 13 }}>
                ✅ Nenhuma cobrança elegível para esta régua.
              </div>
            ) : (
              <div>
                {elegiveisFiltered.map(cob => {
                  const dias = diasAtraso(cob.vencimento);
                  const isLoading = loadingMsgMap[cob.id];
                  const draftForCob = drafts.find(d => d.metadata?.cobranca_v2_id === cob.id);
                  const isExpanded = expandedDraftMap[cob.id];
                  const isSending = sendingMap[draftForCob?.metadata?.cobranca_v2_id || draftForCob?.id];
                  const sentAcao = acoes.find(a => a.metadata?.cobranca_v2_id === cob.id && a.tipo === 'mensagem_enviada');
                  return (
                    <div key={cob.id} style={{ borderBottom: '1px solid var(--g-100)' }}>
                      {/* Linha principal */}
                      <div style={{ padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                        {/* Avatar */}
                        <div style={{ width: 34, height: 34, borderRadius: '50%', background: '#B70C00', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: '#fff', fontSize: 12, flexShrink: 0 }}>
                          {(cob.customer_name || '??').slice(0, 2).toUpperCase()}
                        </div>
                        {/* Nome + telefone */}
                        <div style={{ flex: 1, minWidth: 120 }}>
                          <div style={{ fontWeight: 600, fontSize: 14 }}>{cob.customer_name || '—'}</div>
                          {cob.customer_phone && (
                            <div style={{ fontSize: 11, color: 'var(--g-500)', marginTop: 1 }}>{cob.customer_phone}</div>
                          )}
                        </div>
                        {/* Valor */}
                        <div style={{ fontWeight: 700, fontSize: 15, color: cob.status === 'overdue' ? 'var(--red)' : 'var(--g-900)', fontVariantNumeric: 'tabular-nums', minWidth: 80 }}>
                          {fmtBRL(cob.valor)}
                        </div>
                        {/* Badge dias */}
                        <div style={{ minWidth: 90 }}>
                          {cob.status === 'overdue' ? (
                            <span style={{ fontSize: 11, fontWeight: 700, color: dias > 30 ? '#7f1d1d' : 'var(--red)', background: dias > 30 ? '#7f1d1d22' : '#dc262622', padding: '3px 9px', borderRadius: 12 }}>
                              {dias}d vencida
                            </span>
                          ) : (
                            <span style={{ fontSize: 11, fontWeight: 700, color: '#D97706', background: '#D9770622', padding: '3px 9px', borderRadius: 12 }}>
                              vence em {Math.ceil((new Date(cob.vencimento) - hoje) / 86400000)}d
                            </span>
                          )}
                        </div>
                        {/* Status envio */}
                        <div style={{ minWidth: 80 }}>
                          {sentAcao ? (
                            <span style={{ fontSize: 11, fontWeight: 700, color: '#16a34a', background: '#16a34a22', padding: '3px 9px', borderRadius: 12 }}>✓ Enviado</span>
                          ) : draftForCob ? (
                            <span style={{ fontSize: 11, fontWeight: 600, color: '#2563eb', background: '#2563eb22', padding: '3px 9px', borderRadius: 12 }}>Msg pronta</span>
                          ) : (
                            <span style={{ fontSize: 11, color: 'var(--g-400)' }}>Sem mensagem</span>
                          )}
                        </div>
                        {/* Ação */}
                        <div>
                          {sentAcao ? null : draftForCob ? (
                            <button
                              onClick={() => setExpandedDraftMap(prev => ({ ...prev, [cob.id]: !prev[cob.id] }))}
                              style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid #2563eb', background: 'transparent', color: '#2563eb', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                            >
                              {isExpanded ? 'Fechar ▲' : 'Ver preview ▼'}
                            </button>
                          ) : (
                            <button
                              disabled={isLoading}
                              onClick={() => gerarMensagem(cob)}
                              style={{ padding: '6px 14px', borderRadius: 8, border: 'none', background: 'var(--red, #B70C00)', color: '#fff', fontSize: 12, fontWeight: 600, cursor: isLoading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 6, opacity: isLoading ? 0.7 : 1 }}
                            >
                              {isLoading ? <><Spinner /> Gerando…</> : '✉ Gerar mensagem'}
                            </button>
                          )}
                        </div>
                      </div>
                      {/* Preview expandido */}
                      {isExpanded && draftForCob && (
                        <div style={{ margin: '0 20px 14px', background: 'var(--panel)', borderRadius: 10, padding: 16, border: '1px solid var(--g-200)' }}>
                          {/* Cabeçalho do preview */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--g-600)' }}>Para:</span>
                            <span style={{ fontSize: 12, fontWeight: 700 }}>{draftForCob.metadata?.customer_phone || cob.customer_phone || '—'}</span>
                            {draftForCob.metadata?.tom && <TomBadge tom={draftForCob.metadata.tom} />}
                          </div>
                          {/* Texto da mensagem */}
                          <div style={{ fontSize: 13, color: 'var(--g-700)', lineHeight: 1.6, whiteSpace: 'pre-wrap', background: 'var(--bg)', borderRadius: 8, padding: 12, marginBottom: 12 }}>
                            {draftForCob.body}
                          </div>
                          {/* Botões */}
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            <button
                              disabled={isSending}
                              onClick={() => enviarDraft(draftForCob)}
                              style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: '#16a34a', color: '#fff', fontSize: 13, fontWeight: 600, cursor: isSending ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
                            >
                              {isSending ? <><Spinner /> Enviando…</> : '✓ Enviar agora'}
                            </button>
                            <button
                              disabled={isSending}
                              onClick={async () => {
                                const num = prompt('Número para teste (somente dígitos, ex: 5511999999999):');
                                if (num) await enviarDraft(draftForCob, num.replace(/\D/g, ''));
                              }}
                              style={{ padding: '8px 18px', borderRadius: 8, border: '1px solid var(--g-200)', background: 'transparent', color: 'var(--g-600)', fontSize: 13, cursor: isSending ? 'not-allowed' : 'pointer' }}
                            >
                              🧪 Enviar para meu número
                            </button>
                            <button
                              onClick={async () => {
                                const { data: { session } } = await supabase.auth.getSession();
                                await fetch(`${BRIDGE}/api/cora/rejeitar/${draftForCob.id}`, {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
                                  body: JSON.stringify({ tenant_id: tenantDbId }),
                                });
                                loadDrafts();
                                setExpandedDraftMap(prev => { const n = { ...prev }; delete n[cob.id]; return n; });
                              }}
                              style={{ padding: '8px 18px', borderRadius: 8, border: '1px solid var(--g-200)', background: 'transparent', color: 'var(--red)', fontSize: 13, cursor: 'pointer' }}
                            >
                              ✕ Cancelar
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Charge table */}
          <div className="cv2-card" style={{ overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--g-100)', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <input
                placeholder="Buscar cliente…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{ flex: 1, minWidth: 180, padding: '6px 12px', borderRadius: 8, border: '1px solid var(--g-200)', fontSize: 13, background: 'var(--bg)' }}
              />
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--g-200)', fontSize: 13, background: 'var(--bg)', color: 'var(--tx)' }}>
                <option value="todos">Todos os status</option>
                <option value="pending">Pendente</option>
                <option value="received">Recebido</option>
                <option value="overdue">Vencido</option>
                <option value="canceled">Cancelado</option>
              </select>
            </div>
            {loadingV2 ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--g-500)' }}>Carregando cobranças…</div>
            ) : filteredV2.length === 0 ? (
              <div style={{ padding: 60, textAlign: 'center', color: 'var(--g-500)' }}>Nenhuma cobrança encontrada.</div>
            ) : (
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Cliente</th>
                    <th>Tipo</th>
                    <th style={{ textAlign: 'right' }}>Valor</th>
                    <th>Atraso</th>
                    <th>Vencimento</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredV2.map(c => {
                    const dias = diasAtraso(c.vencimento);
                    const initials = (c.customer_name || '??').slice(0, 2).toUpperCase();
                    return (
                      <tr key={c.id} onClick={() => setSelectedV2Id(c.id)} style={{ cursor: 'pointer' }}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{ width: 30, height: 30, borderRadius: '50%', background: '#B70C00', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: '#fff', fontSize: 11, flexShrink: 0 }}>{initials}</div>
                            <span style={{ fontWeight: 600 }}>{c.customer_name || '—'}</span>
                          </div>
                        </td>
                        <td style={{ fontSize: 12, color: 'var(--g-600)' }}>{c.billing_type || '—'}</td>
                        <td style={{ textAlign: 'right', fontWeight: 700, color: c.status === 'overdue' ? 'var(--red)' : 'var(--g-900)', fontVariantNumeric: 'tabular-nums' }}>
                          {fmtBRL(c.valor)}
                        </td>
                        <td>
                          <span style={{ fontSize: 12, fontWeight: 600, color: dias > 30 ? 'var(--red)' : dias > 10 ? 'var(--warn)' : 'var(--g-700)' }}>
                            {dias > 0 ? `${dias}d` : '—'}
                          </span>
                        </td>
                        <td style={{ fontSize: 12, color: 'var(--g-600)' }}>
                          {c.vencimento ? new Date(c.vencimento).toLocaleDateString('pt-BR') : '—'}
                        </td>
                        <td><StatusBadgeV2 status={c.status} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {/* ── TAB: AGENTE CORA ────────────────────────────────────────────────── */}
      {activeTab === 'agente' && (
        <>
          {/* Modo + controles */}
          <div className="cv2-card" style={{ padding: 16, marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>Modo de operação</div>
              <div style={{ fontSize: 12, color: 'var(--g-500)' }}>Humano = CORA nunca envia sozinha · Híbrido = draft para aprovação · IA = envia direto</div>
            </div>
            <ModoToggle modo={modo} onChange={saveModo} saving={savingModo} />
          </div>

          {/* Fila de aprovação */}
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--g-700)', marginBottom: 12 }}>
              Fila de aprovação
              {drafts.length > 0 && (
                <span style={{ marginLeft: 8, background: 'var(--red)', color: '#fff', borderRadius: 10, fontSize: 11, fontWeight: 700, padding: '2px 8px' }}>
                  {drafts.length}
                </span>
              )}
            </div>
            {loadingDrafts ? (
              <div style={{ padding: 32, textAlign: 'center', color: 'var(--g-500)' }}>Carregando fila…</div>
            ) : drafts.length === 0 ? (
              <div className="cv2-card" style={{ padding: 40, textAlign: 'center', color: 'var(--g-500)' }}>
                ✅ Nenhum draft aguardando aprovação.
              </div>
            ) : (
              drafts.map(d => (
                <DraftCard key={d.id} draft={d} tenantDbId={tenantDbId} onDone={() => { loadDrafts(); loadAcoes(); }} />
              ))
            )}
          </div>

          {/* Histórico */}
          {acoes.length > 0 && (
            <div style={{ marginTop: 28 }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--g-700)', marginBottom: 12 }}>Histórico (últimos 7 dias)</div>
              <div className="cv2-card" style={{ overflow: 'hidden' }}>
                <table className="tbl" style={{ fontSize: 13 }}>
                  <thead>
                    <tr>
                      <th>Data</th>
                      <th>Ação</th>
                      <th>Canal</th>
                      <th>Mensagem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {acoes.map(a => (
                      <tr key={a.id}>
                        <td style={{ fontSize: 12, color: 'var(--g-500)', whiteSpace: 'nowrap' }}>
                          {new Date(a.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td style={{ fontWeight: 600 }}>{a.tipo || a.acao}</td>
                        <td style={{ fontSize: 12, color: 'var(--g-600)' }}>{a.canal || '—'}</td>
                        <td style={{ fontSize: 12, color: 'var(--g-600)', maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {a.conteudo || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* Modals / Drawers */}
      {showNovaModal && (
        <NovaCobrancaModal tenantDbId={tenantDbId} onClose={() => setShowNovaModal(false)} onCreated={loadCobrancas} />
      )}
      {showNovaAsaasModal && (
        <NovaCobrancaAsaasModal tenantDbId={tenantDbId} userId={userId} onClose={() => setShowNovaAsaasModal(false)} onCreated={loadCobrancasV2} />
      )}
      {selected && (
        <CobrancaDrawer
          cobranca={selected}
          tenantDbId={tenantDbId}
          userId={userId}
          onClose={() => setSelectedId(null)}
          onRefresh={loadCobrancas}
        />
      )}
      {selectedV2 && (
        <CobrancaV2Drawer
          cobranca={selectedV2}
          tenantDbId={tenantDbId}
          userId={userId}
          onClose={() => setSelectedV2Id(null)}
          onRefresh={loadCobrancasV2}
        />
      )}
    </div>
  );
}
