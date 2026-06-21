import { useState, useEffect, useRef, useCallback, useMemo, Fragment } from 'react';
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

// ── SVG Donut Pie Chart (sem dependência externa) ─────────────────────────────
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

// ── Aging helper ──────────────────────────────────────────────────────────────
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

// ── Status de envio / visualização (reaproveitado nas listas) ─────────────────
function StatusEnvioCell({ enviado, viewedDate }) {
  if (!enviado && !viewedDate) return <span style={{ color: 'var(--tx-3)' }}>—</span>;
  return (
    <span style={{ display: 'inline-flex', gap: 4, flexWrap: 'wrap', justifyContent: 'center' }}>
      {enviado && <span style={{ fontSize: 11, fontWeight: 700, color: '#16a34a', background: '#16a34a22', padding: '2px 7px', borderRadius: 10 }}>✓ Enviado</span>}
      {viewedDate && (
        <span title={`Visualizado em ${new Date(viewedDate).toLocaleString('pt-BR')}`}
          style={{ fontSize: 11, fontWeight: 600, color: '#2563eb', background: '#2563eb22', padding: '2px 7px', borderRadius: 10 }}>👁 Visto</span>
      )}
    </span>
  );
}

// ── Preview inline do draft + botões de envio (régua e tabelas) ───────────────
function DraftPreviewBox({ draft, fallbackPhone, isSending, isRejecting, onEnviar, onTeste, onRejeitar }) {
  return (
    <div style={{ background: 'var(--panel, #f9fafb)', borderRadius: 10, padding: 16, border: '1px solid var(--g-200)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--g-600)' }}>Para:</span>
        <span style={{ fontSize: 12, fontWeight: 700 }}>{draft.metadata?.customer_phone || fallbackPhone || '—'}</span>
        {draft.metadata?.tom && <TomBadge tom={draft.metadata.tom} />}
      </div>
      <div style={{ fontSize: 13, color: 'var(--g-700)', lineHeight: 1.6, whiteSpace: 'pre-wrap', background: 'var(--bg, #fff)', borderRadius: 8, padding: 12, marginBottom: 12 }}>
        {draft.content || <span style={{ color: 'var(--g-400)' }}>(sem texto)</span>}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button disabled={!!isSending} onClick={onEnviar}
          style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: '#16a34a', color: '#fff', fontSize: 13, fontWeight: 600, cursor: isSending ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
          {isSending ? <><Spinner /> Enviando…</> : '✓ Enviar agora'}
        </button>
        <button disabled={!!isSending} onClick={onTeste}
          style={{ padding: '8px 18px', borderRadius: 8, border: '1px solid var(--g-200)', background: 'transparent', color: 'var(--g-600)', fontSize: 13, cursor: isSending ? 'not-allowed' : 'pointer' }}>
          🧪 Enviar para meu número
        </button>
        <button disabled={!!isSending || !!isRejecting} onClick={onRejeitar}
          style={{ padding: '8px 18px', borderRadius: 8, border: '1px solid var(--g-200)', background: 'transparent', color: 'var(--red)', fontSize: 13, cursor: (isSending || isRejecting) ? 'not-allowed' : 'pointer', opacity: (isSending || isRejecting) ? 0.6 : 1 }}>
          {isRejecting ? <><Spinner /> Cancelando…</> : '✕ Cancelar'}
        </button>
      </div>
    </div>
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
            {draft.content}
            {!expanded && draft.content?.length > 200 && (
              <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 32,
                background: 'linear-gradient(transparent, var(--bg))' }} />
            )}
          </div>
          {draft.content?.length > 200 && (
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
  const [finSubTab, setFinSubTab] = useState('visao-geral');

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

  // Per-charge loading + expanded draft state (régua interativa)
  const [loadingMsgMap, setLoadingMsgMap] = useState({});
  const [expandedDraftMap, setExpandedDraftMap] = useState({});
  const [sendingMap, setSendingMap] = useState({});
  const [rejeitarMap, setRejeitarMap] = useState({});

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
    } catch (_) { /* silent */ }
    setLoadingSaldo(false);
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

  const gerarMensagem = async (cob) => {
    setLoadingMsgMap(prev => ({ ...prev, [cob.id]: true }));
    // Fallback: se o draft não chegar via realtime em 30s, limpar o spinner
    const timeout = setTimeout(() => {
      setLoadingMsgMap(prev => { const n = { ...prev }; delete n[cob.id]; return n; });
    }, 30_000);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const r = await fetch(`${BRIDGE}/agents/cora-gerar-mensagem-asaas/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ tenant_id: tenantDbId, payload: { cobranca_v2_id: cob.id } }),
      });
      if (!r.ok) {
        const e = await r.json();
        throw new Error(e.error || 'Erro ao gerar');
      }
    } catch (e) {
      clearTimeout(timeout);
      alert(e.message);
      setLoadingMsgMap(prev => { const n = { ...prev }; delete n[cob.id]; return n; });
    }
  };

  const enviarDraft = async (draft, testPhone = null) => {
    const key = draft.metadata?.cobranca_v2_id || draft.id;
    setSendingMap(prev => ({ ...prev, [key]: true }));
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const url = `${BRIDGE}/api/cora/aprovar/${draft.id}${testPhone ? `?test_phone=${testPhone}` : ''}`;
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ tenant_id: tenantDbId }),
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error || 'Erro ao enviar'); }
      loadDrafts(); loadAcoes();
      const cobId = draft.metadata?.cobranca_v2_id;
      if (cobId) setExpandedDraftMap(prev => { const n = { ...prev }; delete n[cobId]; return n; });
    } catch (e) { alert(e.message); }
    setSendingMap(prev => { const n = { ...prev }; delete n[key]; return n; });
  };

  const rejeitarDraft = async (draft, cobId) => {
    setRejeitarMap(prev => ({ ...prev, [draft.id]: true }));
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const r = await fetch(`${BRIDGE}/api/cora/rejeitar/${draft.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ tenant_id: tenantDbId }),
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error || 'Erro ao rejeitar'); }
      loadDrafts();
      setExpandedDraftMap(prev => { const n = { ...prev }; delete n[cobId]; return n; });
    } catch (e) {
      alert(e.message);
    } finally {
      setRejeitarMap(prev => { const n = { ...prev }; delete n[draft.id]; return n; });
    }
  };

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

  // Auto-clear loadingMsgMap quando draft aparece via realtime
  useEffect(() => {
    if (!Object.keys(loadingMsgMap).length) return;
    const draftIds = new Set(drafts.map(d => d.metadata?.cobranca_v2_id).filter(Boolean));
    const ready = Object.keys(loadingMsgMap).filter(id => draftIds.has(id));
    if (!ready.length) return;
    setLoadingMsgMap(prev => { const n = { ...prev }; ready.forEach(id => delete n[id]); return n; });
    setExpandedDraftMap(prev => { const n = { ...prev }; ready.forEach(id => { n[id] = true; }); return n; });
  }, [drafts]);

  // ── Derived data ──────────────────────────────────────────────────────────

  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const mesAtual = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;

  const recebidoMes = cobrancasV2
    .filter(c => c.status === 'received' && (c.payment_date || c.confirmed_date)?.slice(0, 7) === mesAtual)
    .reduce((s, c) => s + Number(c.valor), 0);

  const aReceber = cobrancasV2
    .filter(c => c.status === 'pending')
    .reduce((s, c) => s + Number(c.valor), 0);

  const totalInad = cobrancasV2
    .filter(c => c.status === 'overdue')
    .reduce((s, c) => s + Number(c.valor), 0);

  const totalEmitido = cobrancasV2.reduce((s, c) => s + Number(c.valor), 0);
  const taxaInad = totalEmitido > 0 ? ((totalInad / totalEmitido) * 100).toFixed(1) : '0.0';

  // Vencidas agrupadas por cliente (pior primeiro)
  const vencidasMap = {};
  cobrancasV2.filter(c => c.status === 'overdue').forEach(c => {
    const key = c.customer_name || c.customer_phone || c.id;
    if (!vencidasMap[key]) vencidasMap[key] = { name: c.customer_name || 'Cliente', phone: c.customer_phone, cobId: c.id, items: [], total: 0, maxDias: 0 };
    vencidasMap[key].items.push(c);
    vencidasMap[key].total += Number(c.valor);
    const d = diasAtraso(c.vencimento);
    if (d > vencidasMap[key].maxDias) { vencidasMap[key].maxDias = d; vencidasMap[key].cobId = c.id; }
  });
  const vencidasPorCliente = Object.values(vencidasMap).sort((a, b) => b.maxDias - a.maxDias);

  // Cobranças que vencem nos próximos 7 dias
  const em7Dias = new Date(hoje); em7Dias.setDate(em7Dias.getDate() + 7);
  const venceEm7Dias = cobrancasV2
    .filter(c => { if (c.status !== 'pending') return false; const v = new Date(c.vencimento + 'T00:00:00'); return v >= hoje && v <= em7Dias; })
    .sort((a, b) => a.vencimento.localeCompare(b.vencimento));

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
    valor: cobrancasV2.filter(c => c.status === 'received' && (c.payment_date || c.confirmed_date)?.slice(0, 7) === m).reduce((s, c) => s + Number(c.valor), 0),
  }));
  const chartMax = Math.max(...chartData.map(d => d.valor), 1);

  // Dados extras para régua e gráficos de pizza (memoizados para evitar re-cálculo a cada render)
  const hoje10 = hoje.toISOString().slice(0, 10);
  const confirmadas = useMemo(() => cobrancasV2.filter(c => c.status === 'received' && c.confirmed_date), [cobrancasV2]);
  const aguardando = useMemo(() => cobrancasV2.filter(c => c.status === 'pending' && c.vencimento >= hoje10), [cobrancasV2, hoje10]);
  const elegiveisRegua = useMemo(() => cobrancasV2.filter(c => {
    if (c.status === 'overdue') return true;
    if (c.status === 'pending') { const v = new Date(c.vencimento + 'T00:00:00'); return v >= hoje && v <= em7Dias; }
    return false;
  }), [cobrancasV2]);
  const elegiveisFiltered = useMemo(() => reguaFilter === 'vencidas' ? elegiveisRegua.filter(c => c.status === 'overdue')
    : reguaFilter === 'proximas7d' ? elegiveisRegua.filter(c => c.status === 'pending')
    : elegiveisRegua, [elegiveisRegua, reguaFilter]);
  const pieStatus = useMemo(() => {
    const totais = cobrancasV2.reduce((acc, c) => {
      acc[c.status] = (acc[c.status] || 0) + Number(c.valor);
      return acc;
    }, {});
    return [
      { label: 'Recebidas', value: totais['received'] || 0, color: '#16a34a' },
      { label: 'Aguardando', value: totais['pending'] || 0, color: '#D97706' },
      { label: 'Vencidas', value: totais['overdue'] || 0, color: '#B70C00' },
      { label: 'Canceladas', value: (totais['canceled'] || 0) + (totais['refunded'] || 0), color: '#6b7280' },
    ];
  }, [cobrancasV2]);
  const pieBilling = useMemo(() => {
    const totais = cobrancasV2.reduce((acc, c) => {
      acc[c.billing_type] = (acc[c.billing_type] || 0) + Number(c.valor);
      return acc;
    }, {});
    return [
      { label: 'PIX', value: totais['PIX'] || 0, color: '#16a34a' },
      { label: 'Boleto', value: totais['BOLETO'] || 0, color: '#2563eb' },
      { label: 'Cartão', value: totais['CREDIT_CARD'] || 0, color: '#7c3aed' },
    ];
  }, [cobrancasV2]);

  // Filtered charge table
  const filteredV2 = cobrancasV2.filter(c => {
    if (statusFilter !== 'todos' && c.status !== statusFilter) return false;
    if (search && !(c.customer_name || '').toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  // Extrato — pagamentos recebidos com dados ricos
  const extrato = cobrancasV2
    .filter(c => c.status === 'received' && (c.payment_date || c.confirmed_date || c.vencimento))
    .sort((a, b) => {
      const da = a.payment_date || a.confirmed_date || a.vencimento;
      const db = b.payment_date || b.confirmed_date || b.vencimento;
      return db.localeCompare(da);
    });

  const totalRecebidoBruto = extrato.reduce((s, c) => s + Number(c.valor), 0);
  const totalRecebidoLiquido = extrato.reduce((s, c) => s + Number(c.net_value ?? c.valor), 0);
  const totalTaxaAsaas = totalRecebidoBruto - totalRecebidoLiquido;

  const billingBreakdown = {};
  cobrancasV2.forEach(c => {
    const bt = c.billing_type || 'UNDEFINED';
    if (!billingBreakdown[bt]) billingBreakdown[bt] = { qtd: 0, valor: 0 };
    billingBreakdown[bt].qtd++;
    billingBreakdown[bt].valor += Number(c.valor);
  });
  const billingLabel = { BOLETO: 'Boleto', PIX: 'PIX', CREDIT_CARD: 'Cartão', UNDEFINED: 'Indefinido' };
  const billingColor = { BOLETO: '#2563eb', PIX: '#16a34a', CREDIT_CARD: '#7c3aed', UNDEFINED: '#6b7280' };

  const selected = cobrancas.find(c => c.id === selectedId);
  const selectedV2 = cobrancasV2.find(c => c.id === selectedV2Id);
  const overdueCount = cobrancasV2.filter(c => c.status === 'overdue').length;

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
          {/* Sub-tabs */}
          <div style={{ display: 'flex', gap: 2, marginBottom: 20, borderBottom: '1px solid var(--g-100)' }}>
            {[
              { id: 'visao-geral', label: 'Visão Geral' },
              { id: 'extrato',     label: 'Extrato de Pagamentos' },
              { id: 'cobrancas',  label: 'Cobranças' },
            ].map(t => (
              <button key={t.id} onClick={() => setFinSubTab(t.id)} style={{
                padding: '8px 16px', fontSize: 13, fontWeight: finSubTab === t.id ? 700 : 500,
                color: finSubTab === t.id ? 'var(--red)' : 'var(--g-500)',
                borderBottom: finSubTab === t.id ? '2px solid var(--red)' : '2px solid transparent',
                marginBottom: -1, background: 'none', border: 'none', cursor: 'pointer',
              }}>{t.label}</button>
            ))}
          </div>

          {/* ── Sub-tab: Visão Geral ─────────────────────── */}
          {finSubTab === 'visao-geral' && <>
          {/* KPIs — linha 1: saldo + recebido + confirmadas + aguardando */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 12 }}>
            <div className="cv2-kpi" style={{ borderLeft: '3px solid #2563eb' }}>
              <div className="cv2-kpi l">Saldo Asaas</div>
              <div className="cv2-kpi v" style={{ marginTop: 8, color: '#2563eb', fontSize: 20 }}>
                {loadingSaldo ? '…' : saldoAsaas !== null ? fmtBRL(saldoAsaas) : '—'}
              </div>
              <div className="kpi-delta neutral" style={{ marginTop: 10 }}><Icon name="info" size={11} /> Conta Asaas</div>
            </div>
            <div className="cv2-kpi" style={{ borderLeft: '3px solid var(--success)' }}>
              <div className="cv2-kpi l">Recebido este mês</div>
              <div className="cv2-kpi v" style={{ marginTop: 8, color: 'var(--success)' }}>{fmtBRL(recebidoMes)}</div>
              <div className="kpi-delta up" style={{ marginTop: 10 }}><Icon name="arrowup" size={11} /> Asaas confirmado</div>
            </div>
            <div className="cv2-kpi" style={{ borderLeft: '3px solid #0ea5e9' }}>
              <div className="cv2-kpi l">Confirmadas</div>
              <div className="cv2-kpi v" style={{ marginTop: 8, color: '#0ea5e9' }}>{fmtBRL(confirmadas.reduce((s, c) => s + Number(c.valor), 0))}</div>
              <div className="kpi-delta neutral" style={{ marginTop: 10 }}><Icon name="info" size={11} /> {confirmadas.length} cobranças</div>
            </div>
            <div className="cv2-kpi" style={{ borderLeft: '3px solid #D97706' }}>
              <div className="cv2-kpi l">Aguardando pagamento</div>
              <div className="cv2-kpi v accent" style={{ marginTop: 8, color: '#D97706' }}>{fmtBRL(aguardando.reduce((s, c) => s + Number(c.valor), 0))}</div>
              <div className="kpi-delta neutral" style={{ marginTop: 10 }}><Icon name="info" size={11} /> {aguardando.length} cobranças</div>
            </div>
            <div className="cv2-kpi" style={{ borderLeft: '3px solid var(--red)' }}>
              <div className="cv2-kpi l">Inadimplência</div>
              <div className="cv2-kpi v" style={{ marginTop: 8, color: totalInad > 0 ? 'var(--red)' : 'var(--g-900)' }}>{fmtBRL(totalInad)}</div>
              <div className="kpi-delta down" style={{ marginTop: 10 }}><Icon name="info" size={11} /> {overdueCount} vencidas</div>
            </div>
            <div className="cv2-kpi">
              <div className="cv2-kpi l">Taxa inadimplência</div>
              <div className="cv2-kpi v" style={{ marginTop: 8, color: Number(taxaInad) > 10 ? 'var(--red)' : 'var(--g-900)' }}>{taxaInad}%</div>
              <div className="kpi-delta neutral" style={{ marginTop: 10 }}><Icon name="info" size={11} /> Do total emitido</div>
            </div>
          </div>

          {/* ── Dois blocos de período lado a lado ─────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, marginBottom: 16 }}>
            {(() => {
              const t30 = new Date(hoje); t30.setDate(hoje.getDate() - 30);
              const t30s = t30.toISOString().slice(0, 10);
              const rec30  = cobrancasV2.filter(c => c.status === 'received' && (c.payment_date || c.confirmed_date) >= t30s);
              const pend30 = cobrancasV2.filter(c => c.status === 'pending'  && c.vencimento >= t30s);
              const over30 = cobrancasV2.filter(c => c.status === 'overdue'  && c.vencimento >= t30s);
              return (
                <div className="cv2-card" style={{ padding: 16 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--g-700)', marginBottom: 12, borderBottom: '1px solid var(--g-100)', paddingBottom: 8 }}>Últimos 30 dias</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div><div style={{ fontSize: 11, color: 'var(--tx-2)', marginBottom: 2 }}>Recebido</div><div style={{ fontWeight: 700, color: 'var(--success)', fontSize: 15 }}>{fmtBRL(rec30.reduce((s, c) => s + Number(c.valor), 0))}</div></div>
                    <div><div style={{ fontSize: 11, color: 'var(--tx-2)', marginBottom: 2 }}>Confirmados</div><div style={{ fontWeight: 700, color: '#0ea5e9', fontSize: 15 }}>{rec30.filter(c => c.confirmed_date).length} cobranças</div></div>
                    <div><div style={{ fontSize: 11, color: 'var(--tx-2)', marginBottom: 2 }}>A receber</div><div style={{ fontWeight: 700, color: '#D97706', fontSize: 15 }}>{fmtBRL(pend30.reduce((s, c) => s + Number(c.valor), 0))}</div></div>
                    <div><div style={{ fontSize: 11, color: 'var(--tx-2)', marginBottom: 2 }}>Inadimplência</div><div style={{ fontWeight: 700, color: 'var(--red)', fontSize: 15 }}>{fmtBRL(over30.reduce((s, c) => s + Number(c.valor), 0))}</div></div>
                  </div>
                </div>
              );
            })()}
            {(() => {
              const recMes  = cobrancasV2.filter(c => c.status === 'received' && (c.payment_date || c.confirmed_date)?.slice(0, 7) === mesAtual);
              const pendMes = cobrancasV2.filter(c => c.status === 'pending'  && c.vencimento?.slice(0, 7) === mesAtual);
              const overMes = cobrancasV2.filter(c => c.status === 'overdue'  && c.vencimento?.slice(0, 7) === mesAtual);
              const mesLabel = new Date(mesAtual + '-02').toLocaleDateString('pt-BR', { month: 'long' });
              return (
                <div className="cv2-card" style={{ padding: 16 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--g-700)', marginBottom: 12, borderBottom: '1px solid var(--g-100)', paddingBottom: 8 }}>Mês atual ({mesLabel.charAt(0).toUpperCase() + mesLabel.slice(1)})</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div><div style={{ fontSize: 11, color: 'var(--tx-2)', marginBottom: 2 }}>Recebido</div><div style={{ fontWeight: 700, color: 'var(--success)', fontSize: 15 }}>{fmtBRL(recMes.reduce((s, c) => s + Number(c.valor), 0))}</div></div>
                    <div><div style={{ fontSize: 11, color: 'var(--tx-2)', marginBottom: 2 }}>Confirmados</div><div style={{ fontWeight: 700, color: '#0ea5e9', fontSize: 15 }}>{recMes.filter(c => c.confirmed_date).length} cobranças</div></div>
                    <div><div style={{ fontSize: 11, color: 'var(--tx-2)', marginBottom: 2 }}>A receber</div><div style={{ fontWeight: 700, color: '#D97706', fontSize: 15 }}>{fmtBRL(pendMes.reduce((s, c) => s + Number(c.valor), 0))}</div></div>
                    <div><div style={{ fontSize: 11, color: 'var(--tx-2)', marginBottom: 2 }}>Inadimplência</div><div style={{ fontWeight: 700, color: 'var(--red)', fontSize: 15 }}>{fmtBRL(overMes.reduce((s, c) => s + Number(c.valor), 0))}</div></div>
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Toggle cards ↔ gráficos */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
            <button onClick={() => setShowPie(v => !v)} style={{ padding: '6px 14px', borderRadius: 20, border: '1px solid var(--g-200)', background: showPie ? 'var(--red)' : 'var(--g-100)', color: showPie ? '#fff' : 'var(--g-600)', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
              {showPie ? '◉ Versão gráfico' : '◎ Versão gráfico'}
            </button>
          </div>

          {showPie && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 24 }}>
              <div className="cv2-card" style={{ padding: 20 }}>
                <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--g-700)', marginBottom: 16 }}>Distribuição por status</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
                  <PieChartSimple data={pieStatus} size={130} />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {pieStatus.map(d => (
                      <div key={d.label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                        <span style={{ width: 10, height: 10, borderRadius: '50%', background: d.color, flexShrink: 0 }} />
                        <span style={{ color: 'var(--g-600)' }}>{d.label}</span>
                        <span style={{ marginLeft: 'auto', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{fmtBRL(d.value)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="cv2-card" style={{ padding: 20 }}>
                <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--g-700)', marginBottom: 16 }}>Distribuição por tipo</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
                  <PieChartSimple data={pieBilling} size={130} />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {pieBilling.map(d => (
                      <div key={d.label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                        <span style={{ width: 10, height: 10, borderRadius: '50%', background: d.color, flexShrink: 0 }} />
                        <span style={{ color: 'var(--g-600)' }}>{d.label}</span>
                        <span style={{ marginLeft: 'auto', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{fmtBRL(d.value)}</span>
                      </div>
                    ))}
                  </div>
                </div>
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
                {[['todas', 'Todas'], ['vencidas', 'Vencidas'], ['proximas7d', 'Próx. 7 dias']].map(([v, l]) => (
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
                  const draftForCob = drafts.find(d => d.metadata?.cobranca_v2_id === cob.id && d.status === 'pending');
                  const isExpanded = expandedDraftMap[cob.id];
                  const isSending = sendingMap[draftForCob?.metadata?.cobranca_v2_id || draftForCob?.id];
                  const sentAcao = acoes.find(a => a.metadata?.cobranca_v2_id === cob.id && a.tipo === 'mensagem_enviada');
                  return (
                    <div key={cob.id} style={{ borderBottom: '1px solid var(--g-100)' }}>
                      <div style={{ padding: '12px 20px', display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr) auto auto auto auto', alignItems: 'center', gap: 12 }}>
                        <div style={{ width: 34, height: 34, borderRadius: '50%', background: cob.status === 'overdue' ? '#B70C00' : '#D97706', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: '#fff', fontSize: 12, flexShrink: 0 }}>
                          {(cob.customer_name || '??').slice(0, 2).toUpperCase()}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cob.customer_name || '—'}</div>
                          {cob.customer_phone && <div style={{ fontSize: 11, color: 'var(--g-500)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cob.customer_phone}</div>}
                        </div>
                        <div style={{ fontWeight: 700, fontSize: 15, color: cob.status === 'overdue' ? 'var(--red)' : 'var(--g-900)', fontVariantNumeric: 'tabular-nums', textAlign: 'right', whiteSpace: 'nowrap' }}>
                          {fmtBRL(Number(cob.valor))}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-start', whiteSpace: 'nowrap' }}>
                          {cob.status === 'overdue' ? (
                            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--red)', background: '#dc262622', padding: '3px 9px', borderRadius: 12 }}>{dias}d vencida</span>
                          ) : (
                            <span style={{ fontSize: 11, fontWeight: 700, color: '#D97706', background: '#D9770622', padding: '3px 9px', borderRadius: 12 }}>vence em {Math.ceil((new Date(cob.vencimento + 'T00:00:00') - hoje) / 86400000)}d</span>
                          )}
                          {cob.vencimento && <span style={{ fontSize: 11, color: 'var(--g-500)' }}>venc. {cob.vencimento.split('-').reverse().join('/')}</span>}
                        </div>
                        <div style={{ whiteSpace: 'nowrap' }}>
                          {sentAcao ? <span style={{ fontSize: 11, fontWeight: 700, color: '#16a34a', background: '#16a34a22', padding: '3px 9px', borderRadius: 12 }}>✓ Enviado</span>
                            : draftForCob ? <span style={{ fontSize: 11, fontWeight: 600, color: '#2563eb', background: '#2563eb22', padding: '3px 9px', borderRadius: 12 }}>Msg pronta</span>
                            : <span style={{ fontSize: 11, color: 'var(--g-400)' }}>Sem mensagem</span>}
                        </div>
                        <div>
                          {sentAcao ? null : draftForCob ? (
                            <button onClick={() => setExpandedDraftMap(prev => ({ ...prev, [cob.id]: !prev[cob.id] }))}
                              style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid #2563eb', background: 'transparent', color: '#2563eb', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                              {isExpanded ? 'Fechar ▲' : 'Ver preview ▼'}
                            </button>
                          ) : (
                            <button disabled={!!isLoading} onClick={() => gerarMensagem(cob)}
                              style={{ padding: '6px 14px', borderRadius: 8, border: 'none', background: 'var(--red, #B70C00)', color: '#fff', fontSize: 12, fontWeight: 600, cursor: isLoading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 6, opacity: isLoading ? 0.7 : 1 }}>
                              {isLoading ? <><Spinner /> Gerando…</> : '✉ Gerar mensagem'}
                            </button>
                          )}
                        </div>
                      </div>
                      {isExpanded && draftForCob && (
                        <div style={{ margin: '0 20px 14px' }}>
                          <DraftPreviewBox
                            draft={draftForCob}
                            fallbackPhone={cob.customer_phone}
                            isSending={isSending}
                            isRejecting={rejeitarMap[draftForCob.id]}
                            onEnviar={() => enviarDraft(draftForCob)}
                            onTeste={async () => { const num = prompt('Número para teste (somente dígitos, ex: 5511999999999):'); if (num) await enviarDraft(draftForCob, num.replace(/\D/g, '')); }}
                            onRejeitar={() => rejeitarDraft(draftForCob, cob.id)}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Cobranças vencidas por cliente */}
          {vencidasPorCliente.length > 0 && (
            <div className="cv2-card" style={{ overflow: 'hidden' }}>
              <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--g-100)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: 'var(--red)', animation: 'pulse 1.5s infinite' }} />
                <span style={{ fontWeight: 700, fontSize: 14 }}>Cobranças vencidas por cliente</span>
                <span style={{ marginLeft: 4, fontSize: 12, color: 'var(--tx-2)', background: 'var(--g-100)', borderRadius: 10, padding: '1px 8px' }}>{vencidasPorCliente.length}</span>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, tableLayout: 'fixed' }}>
                  <thead>
                    <tr style={{ background: 'var(--g-50)' }}>
                      <th style={{ padding: '8px 16px', textAlign: 'left', fontWeight: 600, width: '22%' }}>Cliente</th>
                      <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, width: '14%' }}>Telefone</th>
                      <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 600, width: '7%' }}>Faturas</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600 }}>Total</th>
                      <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 600 }}>Maior atraso</th>
                      <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 600 }}>Forma</th>
                      <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 600 }}>Fatura</th>
                      <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 600 }}>Status</th>
                      <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 600 }}>Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vencidasPorCliente.map((cli, i) => {
                      const cobData = cobrancasV2.find(c => c.id === cli.cobId);
                      const bt = cobData?.billing_type;
                      const linkFatura = cobData?.invoice_url || cobData?.bank_slip_url || null;
                      const billingBadge = bt === 'PIX' ? { bg: '#dcfce7', color: '#15803d', label: 'PIX' }
                        : bt === 'BOLETO' ? { bg: '#dbeafe', color: '#1d4ed8', label: 'Boleto' }
                        : bt === 'CREDIT_CARD' ? { bg: '#f3e8ff', color: '#7c3aed', label: 'Cartão' }
                        : null;
                      const isLoadingRow = !!loadingMsgMap[cli.cobId];
                      const draftForRow = drafts.find(d => d.metadata?.cobranca_v2_id === cli.cobId && d.status === 'pending');
                      const isExpandedRow = !!expandedDraftMap[cli.cobId];
                      const isSendingRow = !!sendingMap[draftForRow?.metadata?.cobranca_v2_id || draftForRow?.id];
                      const sentAcaoRow = acoes.find(a => a.metadata?.cobranca_v2_id === cli.cobId && a.tipo === 'mensagem_enviada');
                      return (
                        <Fragment key={i}>
                        <tr style={{ borderTop: '1px solid var(--g-100)' }}>
                          <td style={{ padding: '8px 16px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={cli.name}>{cli.name}</td>
                          <td style={{ padding: '8px 12px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{cli.phone || <span style={{ color: 'var(--tx-3)' }}>—</span>}</td>
                          <td style={{ padding: '8px 12px', textAlign: 'center' }}>{cli.items.length}</td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--red)', fontWeight: 600 }}>{fmtBRL(cli.total)}</td>
                          <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                            <span style={{ background: cli.maxDias > 30 ? '#fee2e2' : '#fef3c7', color: cli.maxDias > 30 ? 'var(--red)' : '#92400e', borderRadius: 10, padding: '2px 8px', fontWeight: 600, fontSize: 12 }}>{cli.maxDias}d</span>
                          </td>
                          <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                            {billingBadge
                              ? <span style={{ background: billingBadge.bg, color: billingBadge.color, borderRadius: 8, padding: '2px 7px', fontSize: 11, fontWeight: 600 }}>{billingBadge.label}</span>
                              : <span style={{ color: 'var(--tx-3)' }}>—</span>}
                          </td>
                          <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                            {linkFatura
                              ? <a href={linkFatura} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary)', fontSize: 12, textDecoration: 'none', fontWeight: 500 }}>Ver ↗</a>
                              : <span style={{ color: 'var(--tx-3)' }}>—</span>}
                          </td>
                          <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                            <StatusEnvioCell enviado={!!sentAcaoRow} viewedDate={cobData?.invoice_viewed_date} />
                          </td>
                          <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                            {sentAcaoRow ? <span style={{ fontSize: 12, color: 'var(--tx-3)' }}>—</span>
                              : draftForRow ? (
                                <button onClick={() => setExpandedDraftMap(prev => ({ ...prev, [cli.cobId]: !prev[cli.cobId] }))}
                                  style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid #2563eb', background: 'transparent', color: '#2563eb', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                                  {isExpandedRow ? 'Fechar ▲' : 'Ver preview ▼'}
                                </button>
                              ) : (
                                <button onClick={() => gerarMensagem(cobData)} disabled={isLoadingRow}
                                  style={{ padding: '5px 12px', borderRadius: 6, border: 'none', background: 'var(--red)', color: '#fff', fontSize: 12, fontWeight: 600, cursor: isLoadingRow ? 'wait' : 'pointer', opacity: isLoadingRow ? 0.7 : 1 }}>
                                  {isLoadingRow ? '…' : 'Gerar cobrança'}
                                </button>
                              )}
                          </td>
                        </tr>
                        {isExpandedRow && draftForRow && (
                          <tr>
                            <td colSpan={9} style={{ padding: '0 16px 14px', background: 'var(--g-50)' }}>
                              <DraftPreviewBox
                                draft={draftForRow}
                                fallbackPhone={cli.phone}
                                isSending={isSendingRow}
                                isRejecting={rejeitarMap[draftForRow.id]}
                                onEnviar={() => enviarDraft(draftForRow)}
                                onTeste={async () => { const num = prompt('Número para teste (somente dígitos, ex: 5511999999999):'); if (num) await enviarDraft(draftForRow, num.replace(/\D/g, '')); }}
                                onRejeitar={() => rejeitarDraft(draftForRow, cli.cobId)}
                              />
                            </td>
                          </tr>
                        )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Vence em 7 dias */}
          {venceEm7Dias.length > 0 && (
            <div className="cv2-card" style={{ overflow: 'hidden' }}>
              <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--g-100)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: '#f59e0b', animation: 'pulse 1.5s infinite' }} />
                <span style={{ fontWeight: 700, fontSize: 14 }}>Vencem nos próximos 7 dias</span>
                <span style={{ marginLeft: 4, fontSize: 12, color: 'var(--tx-2)', background: 'var(--g-100)', borderRadius: 10, padding: '1px 8px' }}>{venceEm7Dias.length}</span>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, tableLayout: 'fixed' }}>
                  <thead>
                    <tr style={{ background: 'var(--g-50)' }}>
                      <th style={{ padding: '8px 16px', textAlign: 'left', fontWeight: 600, width: '20%' }}>Cliente</th>
                      <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, width: '13%' }}>Telefone</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600, width: '10%' }}>Valor</th>
                      <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 600, width: '10%' }}>Vencimento</th>
                      <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 600, width: '8%' }}>Faltam</th>
                      <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 600, width: '8%' }}>Forma</th>
                      <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 600, width: '8%' }}>Fatura</th>
                      <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 600, width: '9%' }}>Status</th>
                      <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 600, width: '14%' }}>Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {venceEm7Dias.map((c, i) => {
                      const faltam = Math.ceil((new Date(c.vencimento + 'T00:00:00') - hoje) / 86400000);
                      const bt7 = c.billing_type;
                      const link7 = c.invoice_url || c.bank_slip_url || null;
                      const badge7 = bt7 === 'PIX' ? { bg: '#dcfce7', color: '#15803d', label: 'PIX' }
                        : bt7 === 'BOLETO' ? { bg: '#dbeafe', color: '#1d4ed8', label: 'Boleto' }
                        : bt7 === 'CREDIT_CARD' ? { bg: '#f3e8ff', color: '#7c3aed', label: 'Cartão' }
                        : null;
                      const isLoading7 = !!loadingMsgMap[c.id];
                      const draftFor7 = drafts.find(d => d.metadata?.cobranca_v2_id === c.id && d.status === 'pending');
                      const isExpanded7 = !!expandedDraftMap[c.id];
                      const isSending7 = !!sendingMap[draftFor7?.metadata?.cobranca_v2_id || draftFor7?.id];
                      const sentAcao7 = acoes.find(a => a.metadata?.cobranca_v2_id === c.id && a.tipo === 'mensagem_enviada');
                      return (
                        <Fragment key={i}>
                        <tr style={{ borderTop: '1px solid var(--g-100)' }}>
                          <td style={{ padding: '8px 16px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={c.customer_name || ''}>{c.customer_name || '—'}</td>
                          <td style={{ padding: '8px 12px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.customer_phone || <span style={{ color: 'var(--tx-3)' }}>—</span>}</td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600 }}>{fmtBRL(Number(c.valor))}</td>
                          <td style={{ padding: '8px 12px', textAlign: 'center' }}>{c.vencimento.split('-').reverse().join('/')}</td>
                          <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                            <span style={{ background: '#fef3c7', color: '#92400e', borderRadius: 10, padding: '2px 8px', fontWeight: 600, fontSize: 12 }}>{faltam}d</span>
                          </td>
                          <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                            {badge7
                              ? <span style={{ background: badge7.bg, color: badge7.color, borderRadius: 8, padding: '2px 7px', fontSize: 11, fontWeight: 600 }}>{badge7.label}</span>
                              : <span style={{ color: 'var(--tx-3)' }}>—</span>}
                          </td>
                          <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                            {link7
                              ? <a href={link7} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary)', fontSize: 12, textDecoration: 'none', fontWeight: 500 }}>Ver ↗</a>
                              : <span style={{ color: 'var(--tx-3)' }}>—</span>}
                          </td>
                          <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                            <StatusEnvioCell enviado={!!sentAcao7} viewedDate={c.invoice_viewed_date} />
                          </td>
                          <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                            {sentAcao7 ? <span style={{ fontSize: 12, color: 'var(--tx-3)' }}>—</span>
                              : draftFor7 ? (
                                <button onClick={() => setExpandedDraftMap(prev => ({ ...prev, [c.id]: !prev[c.id] }))}
                                  style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid #2563eb', background: 'transparent', color: '#2563eb', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                                  {isExpanded7 ? 'Fechar ▲' : 'Ver preview ▼'}
                                </button>
                              ) : (
                                <button onClick={() => gerarMensagem(c)} disabled={isLoading7}
                                  style={{ padding: '5px 12px', borderRadius: 6, border: 'none', background: '#f59e0b', color: '#fff', fontSize: 12, fontWeight: 600, cursor: isLoading7 ? 'wait' : 'pointer', opacity: isLoading7 ? 0.7 : 1 }}>
                                  {isLoading7 ? '…' : 'Gerar lembrete'}
                                </button>
                              )}
                          </td>
                        </tr>
                        {isExpanded7 && draftFor7 && (
                          <tr>
                            <td colSpan={9} style={{ padding: '0 16px 14px', background: 'var(--g-50)' }}>
                              <DraftPreviewBox
                                draft={draftFor7}
                                fallbackPhone={c.customer_phone}
                                isSending={isSending7}
                                isRejecting={rejeitarMap[draftFor7.id]}
                                onEnviar={() => enviarDraft(draftFor7)}
                                onTeste={async () => { const num = prompt('Número para teste (somente dígitos, ex: 5511999999999):'); if (num) await enviarDraft(draftFor7, num.replace(/\D/g, '')); }}
                                onRejeitar={() => rejeitarDraft(draftFor7, c.id)}
                              />
                            </td>
                          </tr>
                        )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          </>}{/* fim visao-geral */}

          {/* ── Sub-tab: Extrato de Pagamentos ───────────── */}
          {finSubTab === 'extrato' && (
            <>
              {/* KPIs do extrato */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
                <div className="cv2-kpi">
                  <div className="cv2-kpi l">Total recebido (bruto)</div>
                  <div className="cv2-kpi v" style={{ marginTop: 8, color: 'var(--success)' }}>{fmtBRL(totalRecebidoBruto)}</div>
                  <div className="kpi-delta neutral" style={{ marginTop: 10 }}>{extrato.length} pagamentos confirmados</div>
                </div>
                <div className="cv2-kpi">
                  <div className="cv2-kpi l">Total líquido (após taxa)</div>
                  <div className="cv2-kpi v accent" style={{ marginTop: 8 }}>{fmtBRL(totalRecebidoLiquido)}</div>
                  <div className="kpi-delta down" style={{ marginTop: 10 }}>−{fmtBRL(totalTaxaAsaas)} em taxas Asaas</div>
                </div>
                <div className="cv2-kpi">
                  <div className="cv2-kpi l">Taxa média Asaas</div>
                  <div className="cv2-kpi v" style={{ marginTop: 8 }}>
                    {totalRecebidoBruto > 0 ? `${((totalTaxaAsaas / totalRecebidoBruto) * 100).toFixed(2)}%` : '—'}
                  </div>
                  <div className="kpi-delta neutral" style={{ marginTop: 10 }}>Bruto − Líquido</div>
                </div>
              </div>

              {/* Breakdown por forma de pagamento */}
              <div className="cv2-card" style={{ padding: 20, marginBottom: 20 }}>
                <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--g-700)', marginBottom: 16 }}>Breakdown por forma de pagamento</div>
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                  {Object.entries(billingBreakdown).map(([bt, d]) => {
                    const pct = cobrancasV2.length > 0 ? ((d.qtd / cobrancasV2.length) * 100).toFixed(1) : 0;
                    const color = billingColor[bt] || '#6b7280';
                    return (
                      <div key={bt} style={{ flex: 1, minWidth: 140, padding: '12px 16px', borderRadius: 10, border: `1px solid ${color}33`, background: `${color}11` }}>
                        <div style={{ fontSize: 12, color: color, fontWeight: 700, marginBottom: 6 }}>{billingLabel[bt] || bt}</div>
                        <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--tx)', marginBottom: 2 }}>{pct}%</div>
                        <div style={{ fontSize: 12, color: 'var(--g-500)' }}>{d.qtd} cobranças · {fmtBRL(d.valor)}</div>
                        <div style={{ marginTop: 8, height: 4, borderRadius: 2, background: 'var(--g-100)', overflow: 'hidden' }}>
                          <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 2, transition: 'width 0.5s ease' }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Timeline de pagamentos */}
              <div className="cv2-card" style={{ overflow: 'hidden' }}>
                <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--g-100)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontWeight: 700, fontSize: 14 }}>Histórico de confirmações</span>
                  <span style={{ fontSize: 12, color: 'var(--tx-2)', background: 'var(--g-100)', borderRadius: 10, padding: '1px 8px' }}>{extrato.length}</span>
                </div>
                {extrato.length === 0 ? (
                  <div style={{ padding: 48, textAlign: 'center', color: 'var(--g-400)' }}>
                    Nenhum pagamento confirmado ainda. Rode o sync Asaas para atualizar.
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table className="tbl">
                      <thead>
                        <tr>
                          <th>Cliente</th>
                          <th>Descrição</th>
                          <th>Forma</th>
                          <th style={{ textAlign: 'right' }}>Bruto</th>
                          <th style={{ textAlign: 'right' }}>Taxa</th>
                          <th style={{ textAlign: 'right' }}>Líquido</th>
                          <th>Data pagamento</th>
                          <th>Fatura</th>
                        </tr>
                      </thead>
                      <tbody>
                        {extrato.map(c => {
                          const taxa = c.net_value != null ? Number(c.valor) - Number(c.net_value) : null;
                          const dataExibir = c.payment_date || c.confirmed_date || c.vencimento;
                          const btColor = billingColor[c.billing_type] || '#6b7280';
                          return (
                            <tr key={c.id} onClick={() => setSelectedV2Id(c.id)} style={{ cursor: 'pointer' }}>
                              <td style={{ fontWeight: 600 }}>{c.customer_name || '—'}</td>
                              <td style={{ fontSize: 12, color: 'var(--g-600)', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {c.description || '—'}
                              </td>
                              <td>
                                <span style={{ background: `${btColor}22`, color: btColor, border: `1px solid ${btColor}44`, borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 600 }}>
                                  {billingLabel[c.billing_type] || c.billing_type || '—'}
                                </span>
                              </td>
                              <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{fmtBRL(c.valor)}</td>
                              <td style={{ textAlign: 'right', fontSize: 12, color: taxa != null ? '#dc2626' : 'var(--g-400)', fontVariantNumeric: 'tabular-nums' }}>
                                {taxa != null ? `−${fmtBRL(taxa)}` : '—'}
                              </td>
                              <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: 'var(--success)' }}>
                                {c.net_value != null ? fmtBRL(c.net_value) : fmtBRL(c.valor)}
                              </td>
                              <td style={{ fontSize: 12, color: 'var(--g-600)', whiteSpace: 'nowrap' }}>
                                {dataExibir ? new Date(dataExibir).toLocaleDateString('pt-BR') : '—'}
                              </td>
                              <td>
                                {c.invoice_viewed_date ? (
                                  <span title={`Visualizado em ${new Date(c.invoice_viewed_date).toLocaleString('pt-BR')}`}
                                    style={{ background: '#d1fae5', color: '#065f46', border: '1px solid #6ee7b7', borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 600, cursor: 'default' }}>
                                    👁 Visualizado
                                  </span>
                                ) : (
                                  <span style={{ fontSize: 11, color: 'var(--g-400)' }}>Não visto</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}

          {/* ── Sub-tab: Cobranças ───────────────────────── */}
          {finSubTab === 'cobrancas' && <>
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
          </>}
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
