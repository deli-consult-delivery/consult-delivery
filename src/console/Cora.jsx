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
                    {cobranca.pix_qr_code.slice(0, 120)}…
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

// ── Main Component ────────────────────────────────────────────────────────────
export default function Cora({ tenantDbId, userId }) {
  const [tab, setTab] = useState('inad');

  // V1 state
  const [cobrancas, setCobrancas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [showNovaModal, setShowNovaModal] = useState(false);

  // V2 state
  const [cobrancasV2, setCobrancasV2] = useState([]);
  const [loadingV2, setLoadingV2] = useState(true);
  const [selectedV2Id, setSelectedV2Id] = useState(null);
  const [showNovaAsaasModal, setShowNovaAsaasModal] = useState(false);

  // Modo CORA
  const [modo, setModo] = useState('humano');
  const [savingModo, setSavingModo] = useState(false);

  const loadCobrancas = useCallback(async () => {
    if (!tenantDbId) return;
    setLoading(true);
    const { data } = await supabase
      .from('cora_cobrancas')
      .select('*')
      .eq('tenant_id', tenantDbId)
      .order('data_vencimento', { ascending: true });
    setCobrancas(data || []);
    setLoading(false);
  }, [tenantDbId]);

  const loadCobrancasV2 = useCallback(async () => {
    if (!tenantDbId) return;
    setLoadingV2(true);
    const { data } = await supabase
      .from('cobrancas')
      .select('*')
      .eq('tenant_id', tenantDbId)
      .order('vencimento', { ascending: true });
    setCobrancasV2(data || []);
    setLoadingV2(false);
  }, [tenantDbId]);

  const loadModo = useCallback(async () => {
    if (!tenantDbId) return;
    const { data } = await supabase
      .from('tenant_agent_config')
      .select('mode')
      .eq('tenant_id', tenantDbId)
      .eq('agent', 'cora')
      .single();
    if (data?.mode) setModo(data.mode);
  }, [tenantDbId]);

  const saveModo = async (novoModo) => {
    if (!tenantDbId) return;
    setSavingModo(true);
    await supabase.from('tenant_agent_config').upsert(
      { tenant_id: tenantDbId, agent: 'cora', mode: novoModo },
      { onConflict: 'tenant_id,agent' }
    );
    setModo(novoModo);
    setSavingModo(false);
  };

  useEffect(() => { loadCobrancas(); }, [loadCobrancas]);
  useEffect(() => { loadCobrancasV2(); }, [loadCobrancasV2]);
  useEffect(() => { loadModo(); }, [loadModo]);

  // Realtime — V1
  useEffect(() => {
    if (!tenantDbId) return;
    const ch = supabase.channel('cora-cobrancas-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cora_cobrancas', filter: `tenant_id=eq.${tenantDbId}` }, () => loadCobrancas())
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [tenantDbId, loadCobrancas]);

  // Realtime — V2
  useEffect(() => {
    if (!tenantDbId) return;
    const ch = supabase.channel('cora-cobrancas-v2-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cobrancas', filter: `tenant_id=eq.${tenantDbId}` }, () => loadCobrancasV2())
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [tenantDbId, loadCobrancasV2]);

  const emAberto = cobrancas.filter(c => c.status === 'aberto' || c.status === 'negociando');
  const pagos = cobrancas.filter(c => c.status === 'pago');
  const escalonados = cobrancas.filter(c => c.status === 'escalonado');
  const vencidosV2 = cobrancasV2.filter(c => c.status === 'overdue');

  const totalAberto = emAberto.reduce((s, c) => s + Number(c.valor_atual), 0);
  const totalPago = pagos.reduce((s, c) => s + Number(c.valor_original), 0);
  const taxaRec = cobrancas.length > 0 ? Math.round((pagos.length / cobrancas.length) * 100) : 0;

  const tabCobrancas = tab === 'inad' ? emAberto : tab === 'escalonados' ? escalonados : tab === 'asaas' ? cobrancasV2 : pagos;
  const selected = cobrancas.find(c => c.id === selectedId);
  const selectedV2 = cobrancasV2.find(c => c.id === selectedV2Id);

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
                <strong style={{ color: 'var(--success)' }}>Ativa</strong> · {emAberto.length} em aberto · {vencidosV2.length} vencidos Asaas
              </span>
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <ModoToggle modo={modo} onChange={saveModo} saving={savingModo} />
          <button className="cv2-btn" onClick={() => setShowNovaAsaasModal(true)} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon name="plus" size={14} /> Asaas
          </button>
          <button className="cv2-btn sec" onClick={() => setShowNovaModal(true)} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon name="plus" size={14} /> Manual
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="cv2-kpis" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
        <div className="cv2-kpi">
          <div className="cv2-kpi l">Total a receber</div>
          <div className="cv2-kpi v accent" style={{ marginTop: 8 }}>{fmtBRL(totalAberto)}</div>
          <div className="kpi-delta down" style={{ marginTop: 10 }}><Icon name="info" size={11} /> Em aberto</div>
        </div>
        <div className="cv2-kpi">
          <div className="cv2-kpi l">Recebido no total</div>
          <div className="cv2-kpi v" style={{ marginTop: 8, color: 'var(--success)' }}>{fmtBRL(totalPago)}</div>
          <div className="kpi-delta up" style={{ marginTop: 10 }}><Icon name="arrowup" size={11} /> CORA recuperou</div>
        </div>
        <div className="cv2-kpi">
          <div className="cv2-kpi l">Taxa de recuperação</div>
          <div className="cv2-kpi v" style={{ marginTop: 8 }}>{taxaRec}%</div>
          <div className="kpi-delta up" style={{ marginTop: 10 }}><Icon name="info" size={11} /> {pagos.length} pago{pagos.length !== 1 ? 's' : ''}</div>
        </div>
        <div className="cv2-kpi">
          <div className="cv2-kpi l">Escalonados</div>
          <div className="cv2-kpi v" style={{ marginTop: 8, color: escalonados.length > 0 ? 'var(--red)' : 'var(--g-900)' }}>{escalonados.length}</div>
          <div className="kpi-delta neutral" style={{ marginTop: 10 }}><Icon name="info" size={11} /> Precisam de atenção</div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 16, borderBottom: '1px solid var(--g-200)' }}>
        {[
          { id: 'inad', label: 'Em aberto', count: emAberto.length },
          { id: 'escalonados', label: 'Escalonados', count: escalonados.length },
          { id: 'pagos', label: 'Pagos', count: pagos.length },
          { id: 'asaas', label: 'Asaas V2', count: cobrancasV2.length, badge: vencidosV2.length > 0 },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: '12px 16px', fontSize: 13, fontWeight: tab === t.id ? 700 : 500,
            color: tab === t.id ? 'var(--red)' : 'var(--g-600)',
            borderBottom: tab === t.id ? '2px solid var(--red)' : '2px solid transparent',
            marginBottom: -1, transition: 'all 150ms', background: 'none', border: 'none', cursor: 'pointer',
          }}>
            {t.label}
            {t.count != null && <span style={{ marginLeft: 6, color: 'var(--g-500)', fontSize: 12 }}>{t.count}</span>}
            {t.badge && <span style={{ marginLeft: 4, background: 'var(--red)', color: 'var(--tx)', borderRadius: 10, fontSize: 10, fontWeight: 700, padding: '1px 6px' }}>{vencidosV2.length}</span>}
          </button>
        ))}
      </div>

      {/* Tabela */}
      <div className="cv2-card" style={{ overflow: 'hidden' }}>
        {(tab === 'asaas' ? loadingV2 : loading) ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--g-500)' }}>Carregando cobranças…</div>
        ) : tabCobrancas.length === 0 ? (
          <div style={{ padding: 60, textAlign: 'center', color: 'var(--g-500)' }}>
            {tab === 'inad' ? '🎉 Nenhuma cobrança em aberto!' : tab === 'escalonados' ? '✅ Sem escalonamentos pendentes.' : tab === 'asaas' ? '📭 Nenhuma cobrança Asaas registrada.' : '💰 Nenhum pagamento registrado ainda.'}
          </div>
        ) : tab === 'asaas' ? (
          <table className="tbl">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Tipo</th>
                <th>Valor</th>
                <th>Atraso</th>
                <th>Vencimento</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {tabCobrancas.map(c => {
                const dias = diasAtraso(c.vencimento);
                const initials = c.customer_name ? c.customer_name.slice(0, 2).toUpperCase() : '??';
                return (
                  <tr key={c.id} onClick={() => setSelectedV2Id(c.id)} style={{ cursor: 'pointer' }}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#B70C00', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: '#fff', fontSize: 11 }}>{initials}</div>
                        <div style={{ fontWeight: 600 }}>{c.customer_name}</div>
                      </div>
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--g-600)' }}>{c.billing_type}</td>
                    <td style={{ fontWeight: 700, color: c.status === 'overdue' ? 'var(--red)' : 'var(--g-900)', fontVariantNumeric: 'tabular-nums' }}>
                      {fmtBRL(c.valor)}
                    </td>
                    <td>
                      <span style={{ fontSize: 12, fontWeight: 600, color: dias > 30 ? 'var(--red)' : dias > 10 ? 'var(--warn)' : 'var(--g-700)' }}>
                        {dias > 0 ? `${dias} ${dias === 1 ? 'dia' : 'dias'}` : '—'}
                      </span>
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--g-600)' }}>
                      {new Date(c.vencimento).toLocaleDateString('pt-BR')}
                    </td>
                    <td><StatusBadgeV2 status={c.status} /></td>
                    <td style={{ textAlign: 'right' }}>
                      <button className="cv2-btn sec" style={{ fontSize: 12 }}
                        onClick={(e) => { e.stopPropagation(); setSelectedV2Id(c.id); }}>
                        <Icon name="eye" size={12} /> Ver
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Valor</th>
                <th>Atraso</th>
                <th>Vencimento</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {tabCobrancas.map(c => {
                const dias = diasAtraso(c.data_vencimento);
                const initials = c.customer_name ? c.customer_name.slice(0, 2).toUpperCase() : '??';
                return (
                  <tr key={c.id} onClick={() => setSelectedId(c.id)} style={{ cursor: 'pointer' }}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#B70C00', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: '#fff', fontSize: 11 }}>{initials}</div>
                        <div>
                          <div style={{ fontWeight: 600 }}>{c.customer_name}</div>
                          {c.cora_analise?.nivel_risco && (
                            <NivelRiscoBadge nivel={c.cora_analise.nivel_risco} />
                          )}
                        </div>
                      </div>
                    </td>
                    <td style={{ fontWeight: 700, color: c.status === 'escalonado' ? 'var(--red)' : 'var(--g-900)', fontVariantNumeric: 'tabular-nums' }}>
                      {fmtBRL(c.valor_atual)}
                    </td>
                    <td>
                      <span style={{ fontSize: 12, fontWeight: 600, color: dias > 30 ? 'var(--red)' : dias > 10 ? 'var(--warn)' : 'var(--g-700)' }}>
                        {dias} {dias === 1 ? 'dia' : 'dias'}
                      </span>
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--g-600)' }}>
                      {new Date(c.data_vencimento).toLocaleDateString('pt-BR')}
                    </td>
                    <td><StatusBadge status={c.status} /></td>
                    <td style={{ textAlign: 'right' }}>
                      <button className="cv2-btn sec" style={{ fontSize: 12 }}
                        onClick={(e) => { e.stopPropagation(); setSelectedId(c.id); }}>
                        <Icon name="eye" size={12} /> Ver
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Modals */}
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
