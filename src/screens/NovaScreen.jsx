import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase.js';

const NOVA_COLOR = '#D97706';
const NOVA_BG = 'rgba(217,119,6,0.12)';

const BRIDGE = import.meta.env.VITE_BRIDGE_URL || 'http://localhost:3001';

const SEGMENTOS = [
  'Hamburgueria', 'Pizzaria', 'Salgados / Coxinha', 'Açaí / Sobremesas',
  'Japonês / Sushi', 'Marmitaria', 'Lanchonete', 'Bar e Petiscos',
  'Cafeteria', 'Vegetariano / Vegano', 'Churrascaria', 'Outro',
];

const SISTEMAS = [
  'iFood', 'Rappi', '99Food', 'WhatsApp Business', 'Instagram',
  'Google Ads', 'Facebook Ads', 'Planilhas Google', 'Sistema próprio',
  'Nenhum ainda',
];

const BUDGET_OPTIONS = [
  { value: 'ate-500', label: 'Até R$ 500/mês', desc: 'Soluções básicas no-code' },
  { value: '500-2000', label: 'R$ 500 – 2.000/mês', desc: 'Automações intermediárias' },
  { value: '2000-5000', label: 'R$ 2.000 – 5.000/mês', desc: 'Stack completa com IA' },
  { value: 'acima-5000', label: 'Acima de R$ 5.000/mês', desc: 'Solução enterprise' },
];

const PRAZO_OPTIONS = [
  { value: 'urgente', label: 'Urgente', desc: '< 2 semanas' },
  { value: '1-mes', label: '1 mês', desc: 'Médio prazo' },
  { value: '2-3-meses', label: '2–3 meses', desc: 'Prazo confortável' },
  { value: 'flexivel', label: 'Flexível', desc: 'Sem pressa' },
];

function NovaAvatar({ size = 32 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: `linear-gradient(135deg, ${NOVA_COLOR}, #92400E)`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.38, fontWeight: 700, color: '#fff', flexShrink: 0,
    }}>N</div>
  );
}

function ViabilidadeBadge({ score }) {
  const color = score >= 8 ? '#16a34a' : score >= 6 ? NOVA_COLOR : score >= 4 ? '#dc2626' : '#6b7280';
  const label = score >= 8 ? 'Alta' : score >= 6 ? 'Média' : score >= 4 ? 'Baixa' : 'Muito Baixa';
  return (
    <span style={{
      background: `${color}22`, color, border: `1px solid ${color}44`,
      borderRadius: 6, padding: '2px 8px', fontSize: 12, fontWeight: 600,
    }}>{score}/10 — {label}</span>
  );
}

function ComplexidadeBadge({ nivel }) {
  const colors = { baixo: '#16a34a', medio: NOVA_COLOR, alto: '#dc2626' };
  const labels = { baixo: 'Baixa', medio: 'Média', alto: 'Alta' };
  const c = colors[nivel] || '#6b7280';
  return (
    <span style={{
      background: `${c}22`, color: c, border: `1px solid ${c}44`,
      borderRadius: 6, padding: '2px 8px', fontSize: 12, fontWeight: 600,
    }}>Complexidade {labels[nivel] || nivel}</span>
  );
}

function StatusBadge({ status }) {
  const map = {
    discovery: { label: 'Discovery', color: '#6b7280' },
    blueprint: { label: 'Blueprint', color: NOVA_COLOR },
    complete:  { label: 'Completo', color: '#16a34a' },
  };
  const { label, color } = map[status] || map.discovery;
  return (
    <span style={{
      background: `${color}22`, color, border: `1px solid ${color}44`,
      borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 600,
    }}>{label}</span>
  );
}

function Spinner() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" style={{ animation: 'spin 0.8s linear infinite', flexShrink: 0 }}>
      <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2.5" strokeDasharray="60" strokeDashoffset="20" />
    </svg>
  );
}

// ── Aba Discovery ──────────────────────────────────────────────────────────────
function DiscoveryTab({ tenantDbId, userId, onDiscoveryDone }) {
  const [form, setForm] = useState({
    client_name: '',
    segmento: '',
    problema: '',
    objetivo: '',
    sistemas_atuais: [],
    budget_range: '',
    prazo_desejado: '',
  });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const pendingRef = useRef(null);

  useEffect(() => {
    if (!tenantDbId) return;
    const channel = supabase
      .channel('nova-discovery-runs')
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'agent_runs',
        filter: `tenant_id=eq.${tenantDbId}`,
      }, (payload) => {
        const run = payload.new;
        if (run.agent_id !== 'nova') return;
        if (!pendingRef.current || run.trigger_dev_run_id !== pendingRef.current) return;
        if (run.status === 'completed' && run.output?.discovery) {
          setResult(run.output);
          setLoading(false);
          pendingRef.current = null;
          onDiscoveryDone?.(run.output.blueprint_id);
        }
      })
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [tenantDbId]);

  const toggleSistema = (s) => {
    setForm(f => ({
      ...f,
      sistemas_atuais: f.sistemas_atuais.includes(s)
        ? f.sistemas_atuais.filter(x => x !== s)
        : [...f.sistemas_atuais, s],
    }));
  };

  const submit = async () => {
    if (!form.client_name.trim() || !form.problema.trim()) {
      setError('Nome do cliente e problema são obrigatórios.');
      return;
    }
    setError('');
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch(`${BRIDGE}/agents/nova-discovery/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}` },
        body: JSON.stringify({ ...form, tenant_id: tenantDbId, user_id: userId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao iniciar discovery');
      pendingRef.current = data.trigger_run_id || data.run_id;
    } catch (e) {
      setError(e.message);
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 200px' }}>
          <label style={labelStyle}>Nome do Cliente *</label>
          <input style={inputStyle} placeholder="Ex: Hamburgueria do Zé"
            value={form.client_name} onChange={e => setForm(f => ({ ...f, client_name: e.target.value }))} />
        </div>
        <div style={{ flex: '1 1 200px' }}>
          <label style={labelStyle}>Segmento</label>
          <select style={inputStyle} value={form.segmento} onChange={e => setForm(f => ({ ...f, segmento: e.target.value }))}>
            <option value="">Selecionar...</option>
            {SEGMENTOS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      <div>
        <label style={labelStyle}>Problema Principal *</label>
        <textarea style={{ ...inputStyle, minHeight: 90, resize: 'vertical' }}
          placeholder="Descreva o principal problema ou dor do cliente. Ex: 'Gasto 4h por dia respondendo as mesmas perguntas no WhatsApp e não consigo atender todos os clientes no horário de pico.'"
          value={form.problema} onChange={e => setForm(f => ({ ...f, problema: e.target.value }))} />
      </div>

      <div>
        <label style={labelStyle}>Objetivo Desejado</label>
        <textarea style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }}
          placeholder="O que o cliente quer alcançar? Ex: 'Automatizar o atendimento e aumentar as vendas em 30%.'"
          value={form.objetivo} onChange={e => setForm(f => ({ ...f, objetivo: e.target.value }))} />
      </div>

      <div>
        <label style={labelStyle}>Sistemas já em uso</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
          {SISTEMAS.map(s => {
            const sel = form.sistemas_atuais.includes(s);
            return (
              <button key={s} onClick={() => toggleSistema(s)} style={{
                padding: '5px 12px', borderRadius: 20, fontSize: 12, cursor: 'pointer', border: '1px solid',
                background: sel ? NOVA_BG : 'transparent',
                borderColor: sel ? NOVA_COLOR : 'rgba(255,255,255,0.15)',
                color: sel ? NOVA_COLOR : 'rgba(255,255,255,0.6)',
                fontWeight: sel ? 600 : 400,
              }}>{s}</button>
            );
          })}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 240px' }}>
          <label style={labelStyle}>Budget disponível</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
            {BUDGET_OPTIONS.map(o => (
              <label key={o.value} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input type="radio" name="budget" value={o.value}
                  checked={form.budget_range === o.value}
                  onChange={() => setForm(f => ({ ...f, budget_range: o.value }))} />
                <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)' }}>{o.label}</span>
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>— {o.desc}</span>
              </label>
            ))}
          </div>
        </div>
        <div style={{ flex: '1 1 200px' }}>
          <label style={labelStyle}>Prazo desejado</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
            {PRAZO_OPTIONS.map(o => (
              <label key={o.value} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input type="radio" name="prazo" value={o.value}
                  checked={form.prazo_desejado === o.value}
                  onChange={() => setForm(f => ({ ...f, prazo_desejado: o.value }))} />
                <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)' }}>{o.label}</span>
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>— {o.desc}</span>
              </label>
            ))}
          </div>
        </div>
      </div>

      {error && <p style={{ color: '#f87171', fontSize: 13, margin: 0 }}>{error}</p>}

      <button onClick={submit} disabled={loading} style={btnStyle(loading)}>
        {loading ? <><Spinner /> Analisando problema…</> : '🔍 Iniciar Discovery com IA'}
      </button>

      {loading && (
        <div style={loadingBoxStyle}>
          <NovaAvatar size={28} />
          <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>
            NOVA está analisando o problema e mapeando oportunidades de automação…
          </span>
        </div>
      )}

      {result?.discovery && <DiscoveryResult discovery={result.discovery} />}
    </div>
  );
}

function DiscoveryResult({ discovery: d }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={resultCardStyle}>
        <h4 style={cardTitleStyle}>Resumo do Problema</h4>
        <p style={cardTextStyle}>{d.resumo_problema}</p>
      </div>
      <div style={resultCardStyle}>
        <h4 style={cardTitleStyle}>Impacto Atual no Negócio</h4>
        <p style={cardTextStyle}>{d.impacto_atual}</p>
      </div>
      {d.raiz_causa?.length > 0 && (
        <div style={resultCardStyle}>
          <h4 style={cardTitleStyle}>Causas Raiz Identificadas</h4>
          <ul style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {d.raiz_causa.map((c, i) => <li key={i} style={cardTextStyle}>{c}</li>)}
          </ul>
        </div>
      )}
      {d.oportunidades_ia?.length > 0 && (
        <div style={resultCardStyle}>
          <h4 style={cardTitleStyle}>Oportunidades com IA</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {d.oportunidades_ia.map((o, i) => {
              const potColor = o.potencial === 'alto' ? '#16a34a' : o.potencial === 'medio' ? NOVA_COLOR : '#6b7280';
              return (
                <div key={i} style={{ padding: '10px 12px', background: 'rgba(255,255,255,0.03)', borderRadius: 8, borderLeft: `3px solid ${potColor}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.85)' }}>{o.area}</span>
                    <span style={{ fontSize: 11, color: potColor, fontWeight: 600 }}>Potencial {o.potencial}</span>
                  </div>
                  <p style={{ ...cardTextStyle, margin: 0 }}>{o.descricao}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {d.recomendacao_geral && (
        <div style={{ ...resultCardStyle, borderLeft: `3px solid ${NOVA_COLOR}` }}>
          <h4 style={{ ...cardTitleStyle, color: NOVA_COLOR }}>Recomendação Geral</h4>
          <p style={cardTextStyle}>{d.recomendacao_geral}</p>
        </div>
      )}
    </div>
  );
}

// ── Aba Blueprint ──────────────────────────────────────────────────────────────
function BlueprintTab({ tenantDbId, userId, blueprintId }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const pendingRef = useRef(null);

  useEffect(() => {
    if (!tenantDbId) return;
    const channel = supabase
      .channel('nova-blueprint-runs')
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'agent_runs',
        filter: `tenant_id=eq.${tenantDbId}`,
      }, (payload) => {
        const run = payload.new;
        if (run.agent_id !== 'nova') return;
        if (!pendingRef.current || run.trigger_dev_run_id !== pendingRef.current) return;
        if (run.status === 'completed' && run.output?.blueprint) {
          setResult(run.output);
          setLoading(false);
          pendingRef.current = null;
        }
      })
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [tenantDbId]);

  const submit = async () => {
    if (!blueprintId) { setError('Complete o Discovery primeiro.'); return; }
    setError('');
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch(`${BRIDGE}/agents/nova-blueprint/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}` },
        body: JSON.stringify({ blueprint_id: blueprintId, tenant_id: tenantDbId, user_id: userId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao gerar blueprint');
      pendingRef.current = data.trigger_run_id || data.run_id;
    } catch (e) {
      setError(e.message);
      setLoading(false);
    }
  };

  if (!blueprintId) {
    return (
      <div style={{ textAlign: 'center', padding: '48px 24px', color: 'rgba(255,255,255,0.4)' }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🗺️</div>
        <p style={{ fontSize: 14 }}>Complete o Discovery primeiro para gerar o Blueprint de Automação.</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ padding: '16px', background: NOVA_BG, borderRadius: 10, border: `1px solid ${NOVA_COLOR}44` }}>
        <p style={{ margin: 0, fontSize: 13, color: 'rgba(255,255,255,0.7)' }}>
          O Blueprint detalha as fases de implementação, integrações, KPIs e stack técnica recomendada para automatizar o negócio do cliente.
        </p>
      </div>
      {error && <p style={{ color: '#f87171', fontSize: 13, margin: 0 }}>{error}</p>}
      <button onClick={submit} disabled={loading} style={btnStyle(loading)}>
        {loading ? <><Spinner /> Gerando blueprint…</> : '🗺️ Gerar Blueprint de Automação'}
      </button>
      {loading && (
        <div style={loadingBoxStyle}>
          <NovaAvatar size={28} />
          <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>
            NOVA está desenhando o plano de automação com fases, tecnologias e integrações…
          </span>
        </div>
      )}
      {result?.blueprint && <BlueprintResult blueprint={result.blueprint} />}
    </div>
  );
}

function BlueprintResult({ blueprint: b }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={resultCardStyle}>
        <h3 style={{ margin: '0 0 6px', fontSize: 16, color: NOVA_COLOR }}>{b.titulo}</h3>
        <p style={cardTextStyle}>{b.descricao}</p>
      </div>
      {b.fases?.length > 0 && (
        <div style={resultCardStyle}>
          <h4 style={cardTitleStyle}>Fases de Implementação</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {b.fases.map((f, i) => (
              <div key={i} style={{ padding: '12px', background: 'rgba(255,255,255,0.03)', borderRadius: 8, borderLeft: `3px solid ${NOVA_COLOR}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.9)' }}>Fase {f.numero} — {f.nome}</span>
                  <span style={{ fontSize: 12, color: NOVA_COLOR }}>{f.duracao_semanas} sem.</span>
                </div>
                <p style={{ ...cardTextStyle, marginBottom: 6 }}>{f.objetivo}</p>
                {f.entregaveis?.length > 0 && (
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>
                    Entregas: {f.entregaveis.join(' · ')}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      {b.kpis?.length > 0 && (
        <div style={resultCardStyle}>
          <h4 style={cardTitleStyle}>KPIs e Metas</h4>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                  {['Métrica', 'Baseline', 'Meta', 'Prazo'].map(h => (
                    <th key={h} style={{ padding: '6px 10px', textAlign: 'left', color: 'rgba(255,255,255,0.5)', fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {b.kpis.map((k, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <td style={{ padding: '7px 10px', color: 'rgba(255,255,255,0.85)' }}>{k.metrica}</td>
                    <td style={{ padding: '7px 10px', color: 'rgba(255,255,255,0.5)' }}>{k.baseline}</td>
                    <td style={{ padding: '7px 10px', color: '#16a34a' }}>{k.meta}</td>
                    <td style={{ padding: '7px 10px', color: 'rgba(255,255,255,0.5)' }}>{k.prazo}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {b.arquitetura_resumo && (
        <div style={resultCardStyle}>
          <h4 style={cardTitleStyle}>Arquitetura Técnica</h4>
          <p style={cardTextStyle}>{b.arquitetura_resumo}</p>
          {b.stack_recomendada?.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
              {b.stack_recomendada.map((s, i) => (
                <span key={i} style={{ padding: '3px 10px', background: `${NOVA_COLOR}22`, color: NOVA_COLOR, borderRadius: 20, fontSize: 11, fontWeight: 600 }}>{s}</span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Aba Estimativa ─────────────────────────────────────────────────────────────
function EstimativaTab({ tenantDbId, userId, blueprintId }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const pendingRef = useRef(null);

  useEffect(() => {
    if (!tenantDbId) return;
    const channel = supabase
      .channel('nova-estimate-runs')
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'agent_runs',
        filter: `tenant_id=eq.${tenantDbId}`,
      }, (payload) => {
        const run = payload.new;
        if (run.agent_id !== 'nova') return;
        if (!pendingRef.current || run.trigger_dev_run_id !== pendingRef.current) return;
        if (run.status === 'completed' && run.output?.estimate) {
          setResult(run.output);
          setLoading(false);
          pendingRef.current = null;
        }
      })
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [tenantDbId]);

  const submit = async () => {
    if (!blueprintId) { setError('Complete o Discovery primeiro.'); return; }
    setError('');
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch(`${BRIDGE}/agents/nova-estimate/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}` },
        body: JSON.stringify({ blueprint_id: blueprintId, tenant_id: tenantDbId, user_id: userId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao gerar estimativa');
      pendingRef.current = data.trigger_run_id || data.run_id;
    } catch (e) {
      setError(e.message);
      setLoading(false);
    }
  };

  if (!blueprintId) {
    return (
      <div style={{ textAlign: 'center', padding: '48px 24px', color: 'rgba(255,255,255,0.4)' }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>💰</div>
        <p style={{ fontSize: 14 }}>Complete o Discovery para gerar a estimativa financeira.</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ padding: '16px', background: NOVA_BG, borderRadius: 10, border: `1px solid ${NOVA_COLOR}44` }}>
        <p style={{ margin: 0, fontSize: 13, color: 'rgba(255,255,255,0.7)' }}>
          A Estimativa inclui investimento de setup, custo mensal recorrente, ROI projetado e cronograma detalhado.
        </p>
      </div>
      {error && <p style={{ color: '#f87171', fontSize: 13, margin: 0 }}>{error}</p>}
      <button onClick={submit} disabled={loading} style={btnStyle(loading)}>
        {loading ? <><Spinner /> Calculando estimativa…</> : '💰 Gerar Estimativa Financeira'}
      </button>
      {loading && (
        <div style={loadingBoxStyle}>
          <NovaAvatar size={28} />
          <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>
            NOVA está calculando investimentos, ROI e cronograma…
          </span>
        </div>
      )}
      {result?.estimate && <EstimativaResult estimate={result.estimate} />}
    </div>
  );
}

function fmtBRL(v) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v || 0);
}

function EstimativaResult({ estimate: e }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 180px', ...metricCardStyle }}>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginBottom: 4 }}>Setup (uma vez)</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: NOVA_COLOR }}>{fmtBRL(e.investimento_setup?.minimo)} – {fmtBRL(e.investimento_setup?.maximo)}</div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>{e.investimento_setup?.descricao}</div>
        </div>
        <div style={{ flex: '1 1 180px', ...metricCardStyle }}>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginBottom: 4 }}>Custo Mensal</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: NOVA_COLOR }}>{fmtBRL(e.custo_mensal?.minimo)} – {fmtBRL(e.custo_mensal?.maximo)}</div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>{e.custo_mensal?.descricao}</div>
        </div>
        <div style={{ flex: '1 1 180px', ...metricCardStyle }}>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginBottom: 4 }}>Economia Mensal Estimada</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#16a34a' }}>{fmtBRL(e.retorno_estimado?.economia_mensal)}</div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>Payback em {e.retorno_estimado?.payback_meses} meses</div>
        </div>
      </div>

      {e.retorno_estimado?.roi_12meses && (
        <div style={{ ...resultCardStyle, borderLeft: `3px solid #16a34a` }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>ROI em 12 meses</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#16a34a' }}>{e.retorno_estimado.roi_12meses}</div>
            </div>
            {e.nivel_complexidade && <ComplexidadeBadge nivel={e.nivel_complexidade} />}
            {e.score_viabilidade !== undefined && <ViabilidadeBadge score={e.score_viabilidade} />}
          </div>
          {e.justificativa_score && (
            <p style={{ ...cardTextStyle, marginTop: 8 }}>{e.justificativa_score}</p>
          )}
        </div>
      )}

      {e.cronograma?.length > 0 && (
        <div style={resultCardStyle}>
          <h4 style={cardTitleStyle}>Cronograma</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {e.cronograma.map((c, i) => (
              <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ minWidth: 100, fontSize: 11, color: NOVA_COLOR, fontWeight: 600 }}>{c.inicio} → {c.fim}</div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.85)' }}>{c.fase}</div>
                  {c.marcos?.length > 0 && (
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>{c.marcos.join(' · ')}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {e.proximos_passos?.length > 0 && (
        <div style={{ ...resultCardStyle, borderLeft: `3px solid ${NOVA_COLOR}` }}>
          <h4 style={{ ...cardTitleStyle, color: NOVA_COLOR }}>Próximos Passos</h4>
          <ol style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {e.proximos_passos.map((p, i) => <li key={i} style={cardTextStyle}>{p}</li>)}
          </ol>
        </div>
      )}
    </div>
  );
}

// ── Aba Projetos ───────────────────────────────────────────────────────────────
function ProjetosTab({ tenantDbId, onSelectBlueprint }) {
  const [projetos, setProjetos] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!tenantDbId) return;
    setLoading(true);
    const { data } = await supabase
      .from('nova_blueprints')
      .select('id, client_name, segmento, problema, status, created_at, discovery, blueprint, estimate')
      .eq('tenant_id', tenantDbId)
      .order('created_at', { ascending: false });
    setProjetos(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [tenantDbId]);

  if (loading) return <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, padding: 24 }}>Carregando projetos…</div>;

  if (!projetos.length) return (
    <div style={{ textAlign: 'center', padding: '48px 24px', color: 'rgba(255,255,255,0.4)' }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
      <p style={{ fontSize: 14 }}>Nenhum projeto ainda. Crie o primeiro no Discovery.</p>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {projetos.map(p => (
        <div key={p.id} style={{
          padding: '16px', background: 'rgba(255,255,255,0.03)', borderRadius: 10,
          border: '1px solid rgba(255,255,255,0.08)', cursor: 'pointer',
          transition: 'border-color 0.15s',
        }}
          onMouseEnter={e => e.currentTarget.style.borderColor = `${NOVA_COLOR}55`}
          onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'}
          onClick={() => onSelectBlueprint?.(p.id)}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: 'rgba(255,255,255,0.9)' }}>{p.client_name}</span>
                {p.segmento && <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>· {p.segmento}</span>}
              </div>
              <p style={{ margin: 0, fontSize: 12, color: 'rgba(255,255,255,0.5)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {p.problema}
              </p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
              <StatusBadge status={p.status} />
              {p.estimate?.score_viabilidade !== undefined && <ViabilidadeBadge score={p.estimate.score_viabilidade} />}
            </div>
          </div>
          <div style={{ marginTop: 8, display: 'flex', gap: 16, fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>
            <span>{new Date(p.created_at).toLocaleDateString('pt-BR')}</span>
            {p.estimate?.custo_mensal && (
              <span>{fmtBRL(p.estimate.custo_mensal.minimo)}/mês</span>
            )}
            {p.blueprint?.fases?.length > 0 && <span>{p.blueprint.fases.length} fases</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Shared styles ──────────────────────────────────────────────────────────────
const labelStyle = { fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.6)', display: 'block', marginBottom: 6 };
const inputStyle = {
  width: '100%', boxSizing: 'border-box',
  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 8, padding: '9px 12px', color: 'rgba(255,255,255,0.85)', fontSize: 13,
  outline: 'none', fontFamily: 'inherit',
};
const resultCardStyle = {
  padding: '16px', background: 'rgba(255,255,255,0.03)',
  border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10,
};
const metricCardStyle = {
  padding: '16px', background: 'rgba(255,255,255,0.03)',
  border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10,
};
const cardTitleStyle = { margin: '0 0 8px', fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.7)' };
const cardTextStyle = { margin: 0, fontSize: 13, color: 'rgba(255,255,255,0.65)', lineHeight: 1.6 };
const loadingBoxStyle = {
  display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px',
  background: NOVA_BG, border: `1px solid ${NOVA_COLOR}44`, borderRadius: 10,
};
const btnStyle = (disabled) => ({
  display: 'flex', alignItems: 'center', gap: 8, padding: '10px 24px',
  background: disabled ? 'rgba(255,255,255,0.06)' : NOVA_COLOR,
  color: disabled ? 'rgba(255,255,255,0.4)' : '#fff',
  border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer',
  alignSelf: 'flex-start',
});

// ── Main screen ────────────────────────────────────────────────────────────────
const TABS = ['Discovery', 'Blueprint', 'Estimativa', 'Projetos'];

export default function NovaScreen({ tenantDbId, userId }) {
  const [activeTab, setActiveTab] = useState(0);
  const [blueprintId, setBlueprintId] = useState(null);

  const handleDiscoveryDone = (id) => {
    setBlueprintId(id);
    setActiveTab(1);
  };

  const handleSelectBlueprint = (id) => {
    setBlueprintId(id);
    setActiveTab(0);
  };

  return (
    <div style={{ padding: '24px', maxWidth: 860, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <NovaAvatar size={42} />
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'rgba(255,255,255,0.9)' }}>
            NOVA · Automação IA
          </h1>
          <p style={{ margin: 0, fontSize: 13, color: 'rgba(255,255,255,0.45)' }}>
            Discovery → Blueprint → Estimativa para projetos de automação com IA
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, background: 'rgba(255,255,255,0.04)', padding: 4, borderRadius: 10 }}>
        {TABS.map((t, i) => (
          <button key={t} onClick={() => setActiveTab(i)} style={{
            flex: 1, padding: '8px 4px', borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
            background: activeTab === i ? NOVA_COLOR : 'transparent',
            color: activeTab === i ? '#fff' : 'rgba(255,255,255,0.5)',
            transition: 'all 0.15s',
          }}>
            {t}
            {i === 1 && blueprintId && <span style={{ marginLeft: 4, fontSize: 10, opacity: 0.8 }}>●</span>}
          </button>
        ))}
      </div>

      {/* Content */}
      <div>
        {activeTab === 0 && <DiscoveryTab tenantDbId={tenantDbId} userId={userId} onDiscoveryDone={handleDiscoveryDone} />}
        {activeTab === 1 && <BlueprintTab tenantDbId={tenantDbId} userId={userId} blueprintId={blueprintId} />}
        {activeTab === 2 && <EstimativaTab tenantDbId={tenantDbId} userId={userId} blueprintId={blueprintId} />}
        {activeTab === 3 && <ProjetosTab tenantDbId={tenantDbId} onSelectBlueprint={handleSelectBlueprint} />}
      </div>
    </div>
  );
}
