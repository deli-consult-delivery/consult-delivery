import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase.js';
import { Ico } from './CvIcons.jsx';

const BRIDGE = import.meta.env.VITE_BRIDGE_URL || 'https://bridge.consultdelivery.com.br';

const PERIODS = [
  { id: '7',  label: '7 dias'  },
  { id: '30', label: '30 dias' },
  { id: '90', label: '90 dias' },
];

const TABS = [
  { id: 'overview',  label: 'Visão geral', icon: 'i-chart'   },
  { id: 'channels',  label: 'Canais',      icon: 'i-chat'    },
  { id: 'agents',    label: 'Agentes',     icon: 'i-bot'     },
  { id: 'funnel',    label: 'Funil',       icon: 'i-layers'  },
  { id: 'sentiment', label: 'Sentimento',  icon: 'i-droplet' },
];

// ── helper ──────────────────────────────────────────────────────────────────

async function bridgeFetch(path, options = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(`${BRIDGE}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}`, ...options.headers },
  });
  if (!res.ok) { const body = await res.json().catch(() => ({ error: res.statusText })); throw new Error(body.error || res.statusText); }
  return res.json();
}

// ── main ─────────────────────────────────────────────────────────────────────

export default function Relatorios({ tenantDbId, userId }) {
  const [period,       setPeriod]       = useState('30');
  const [tab,          setTab]          = useState('overview');
  const [lojas,        setLojas]        = useState([]);
  const [selectedLoja, setSelectedLoja] = useState('');
  const [dashData,     setDashData]     = useState(null);
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState(null);

  // Carregar lista de lojas para dropdown de filtro
  useEffect(() => {
    if (!tenantDbId) return;
    bridgeFetch(`/api/lojas?tenant_id=${tenantDbId}&limit=100`)
      .then(d => setLojas(d.lojas || []))
      .catch(() => {});
  }, [tenantDbId]);

  // Carregar dashboard ao mudar período ou loja
  useEffect(() => {
    if (!tenantDbId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    let qs = `/api/relatorios/dashboard?tenant_id=${tenantDbId}&periodo=${period}`;
    if (selectedLoja) qs += `&loja_id=${encodeURIComponent(selectedLoja)}`;
    bridgeFetch(qs)
      .then(d => { if (!cancelled) { setDashData(d); setLoading(false); } })
      .catch(err => { if (!cancelled) { setError(err.message); setLoading(false); } });
    return () => { cancelled = true; };
  }, [tenantDbId, period, selectedLoja]);

  const m             = dashData?.metrics || {};
  const tarefasPorDia = (dashData?.charts || []).find(c => c.id === 'tarefas_por_dia')?.data || [];

  const kpis = [
    { label: 'Tarefas concluídas (30d)', value: m.tarefas_concluidas_30d },
    { label: 'Taxa de conclusão',         value: m.taxa_conclusao != null ? `${m.taxa_conclusao}%` : undefined },
    { label: 'Análises processadas',      value: m.analises_processadas_30d },
    { label: 'Lojas ativas',              value: m.lojas_ativas },
  ];

  const fmtVal = v => {
    if (v == null) return loading ? '…' : '—';
    if (typeof v === 'string') return v;
    return Number(v).toLocaleString('pt-BR');
  };

  return (
    <div style={{ padding: '28px 32px 56px', maxWidth: 1480, margin: '0 auto' }}>

      {/* ── Header ──────────────────────────────────────────────── */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-end', marginBottom: 24, flexWrap:'wrap', gap: 16 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--g-900)' }}>Relatórios</h1>
          <div style={{ marginTop: 4, fontSize: 13, color: 'var(--g-500)', display:'inline-flex', alignItems:'center', gap: 6 }}>
            Powered by{' '}
            <div style={{ width:16, height:16, borderRadius:'50%', background:'#A78BFA', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontWeight:700, fontSize:9, flexShrink:0 }}>V</div>
            {' '}VERA · análise contínua da operação
          </div>
        </div>
        <div style={{ display:'flex', gap: 8, flexWrap:'wrap', alignItems:'center' }}>
          {lojas.length > 0 && (
            <select
              value={selectedLoja}
              onChange={e => setSelectedLoja(e.target.value)}
              style={{
                height: 34, padding: '0 12px', borderRadius: 8,
                border: '1px solid var(--g-200)', background: 'white',
                fontSize: 13, color: 'var(--g-700)', cursor: 'pointer',
              }}
            >
              <option value="">Todas as lojas</option>
              {lojas.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
            </select>
          )}
          <div style={{ display:'flex', gap: 4 }}>
            {PERIODS.map(p => (
              <button
                key={p.id}
                onClick={() => setPeriod(p.id)}
                style={{
                  height: 34, padding: '0 14px', borderRadius: 8, fontSize: 13,
                  cursor: 'pointer', fontWeight: period === p.id ? 700 : 400,
                  border: period === p.id ? '2px solid var(--accent, #B70C00)' : '1px solid var(--g-200)',
                  background: period === p.id ? 'var(--accent-bg, #FFF5F5)' : 'white',
                  color: period === p.id ? 'var(--accent, #B70C00)' : 'var(--g-700)',
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Banner VERA ──────────────────────────────────────────── */}
      <div className="cv2-card" style={{ display:'flex', alignItems:'flex-start', gap: 16, marginBottom: 24, background:'#1E1B2E', border:'1px solid #3B2F6B' }}>
        <div style={{ flexShrink: 0 }}>
          <div style={{ width:36, height:36, borderRadius:'50%', background:'#A78BFA', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontWeight:700, fontSize:16, flexShrink:0 }}>V</div>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color:'#A78BFA', letterSpacing: 1, textTransform:'uppercase', marginBottom: 6 }}>
            VERA · Análise do período
          </div>
          <div style={{ fontSize: 14, color:'white', lineHeight: 1.55 }}>
            {loading && 'Carregando análise do período…'}
            {error   && `Não foi possível carregar os dados: ${error}`}
            {!loading && !error && dashData && (
              <>
                {m.tarefas_concluidas_30d != null && (
                  <><strong style={{ color:'#10B981' }}>{m.tarefas_concluidas_30d}</strong> tarefas concluídas nos últimos 30 dias.{' '}</>
                )}
                {m.taxa_conclusao != null && (
                  <>Taxa de conclusão: <strong style={{ color: m.taxa_conclusao >= 70 ? '#10B981' : '#F59E0B' }}>{m.taxa_conclusao}%</strong>.{' '}</>
                )}
                {m.onboarding_em_andamento > 0 && (
                  <><strong style={{ color:'#F59E0B' }}>{m.onboarding_em_andamento}</strong> {m.onboarding_em_andamento === 1 ? 'cliente' : 'clientes'} em onboarding ativo.</>
                )}
                {!m.tarefas_concluidas_30d && !m.taxa_conclusao && (
                  'Nenhuma tarefa concluída no período. Verifique os dados da operação.'
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── KPI strip ────────────────────────────────────────────── */}
      <div className="cv2-kpis" style={{ marginBottom: 24 }}>
        {kpis.map(k => (
          <div key={k.label} className="cv2-kpi">
            <span className="l">{k.label}</span>
            <span className="v" style={{ opacity: loading ? 0.4 : 1, transition: 'opacity .2s' }}>{fmtVal(k.value)}</span>
          </div>
        ))}
      </div>

      {/* ── Erro inline ──────────────────────────────────────────── */}
      {error && !loading && (
        <div style={{ background:'#FEF2F2', border:'1px solid #FECACA', borderRadius: 10, padding: '12px 16px', marginBottom: 24, color:'#DC2626', fontSize: 13 }}>
          <strong>Erro:</strong> {error}
        </div>
      )}

      {/* ── Tabs ─────────────────────────────────────────────────── */}
      <div style={{ display:'flex', gap: 8, marginBottom: 24, flexWrap:'wrap' }}>
        {TABS.map(t => (
          <button
            key={t.id}
            className={`cv2-btn${tab === t.id ? '' : ' sec'}`}
            onClick={() => setTab(t.id)}
            style={{ display:'inline-flex', alignItems:'center', gap: 6 }}
          >
            <Ico name={t.icon} size={14}/> {t.label}
          </button>
        ))}
      </div>

      {/* ── Tab: Overview ────────────────────────────────────────── */}
      {tab === 'overview' && (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap: 20 }}>
          <div className="cv2-card" style={{ gridColumn: '1 / -1' }}>
            <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color:'var(--g-900)' }}>Tarefas concluídas por dia · 30 dias</div>
                <div style={{ fontSize: 12, color:'var(--g-500)', marginTop: 2 }}>Total no período: {fmtVal(m.tarefas_concluidas_30d)} tarefas</div>
              </div>
            </div>
            <TarefasChart data={tarefasPorDia} loading={loading}/>
          </div>

          <div className="cv2-card">
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color:'var(--g-900)' }}>Onboarding ativo</div>
              <div style={{ fontSize: 12, color:'var(--g-500)', marginTop: 2 }}>Clientes com checklist em andamento</div>
            </div>
            <div style={{ padding: '24px 0', textAlign:'center' }}>
              <div style={{ fontSize: 60, fontWeight: 800, color:'#A78BFA', fontFeatureSettings:"'tnum'" }}>
                {fmtVal(m.onboarding_em_andamento)}
              </div>
              <div style={{ fontSize: 13, color:'var(--g-500)', marginTop: 4 }}>clientes em onboarding</div>
            </div>
          </div>

          <div className="cv2-card">
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color:'var(--g-900)' }}>Contratos assinados (30d)</div>
              <div style={{ fontSize: 12, color:'var(--g-500)', marginTop: 2 }}>Novos contratos no período</div>
            </div>
            <div style={{ padding: '24px 0', textAlign:'center' }}>
              <div style={{ fontSize: 60, fontWeight: 800, color:'#10B981', fontFeatureSettings:"'tnum'" }}>
                {fmtVal(m.contratos_assinados_30d)}
              </div>
              <div style={{ fontSize: 13, color:'var(--g-500)', marginTop: 4 }}>contratos novos</div>
            </div>
          </div>
        </div>
      )}

      {/* ── Tabs em breve ────────────────────────────────────────── */}
      {['channels', 'agents', 'funnel', 'sentiment'].includes(tab) && (
        <div className="cv2-card" style={{ textAlign:'center', padding: '64px 24px' }}>
          <div style={{ fontSize: 44, marginBottom: 12 }}>📊</div>
          <div style={{ fontSize: 18, fontWeight: 700, color:'var(--g-900)', marginBottom: 8 }}>
            Em breve
          </div>
          <div style={{ fontSize: 14, color:'var(--g-500)', maxWidth: 400, margin: '0 auto' }}>
            A VERA está preparando métricas de <strong>{TABS.find(t => t.id === tab)?.label.toLowerCase()}</strong> com dados reais da operação.
          </div>
        </div>
      )}
    </div>
  );
}

// ── TarefasChart — barras SVG simples ────────────────────────────────────────

function TarefasChart({ data, loading }) {
  if (loading) {
    return (
      <div style={{ height: 160, display:'flex', alignItems:'center', justifyContent:'center', color:'var(--g-400)', fontSize: 13 }}>
        Carregando…
      </div>
    );
  }
  if (!data.length) {
    return (
      <div style={{ height: 160, display:'flex', alignItems:'center', justifyContent:'center', color:'var(--g-400)', fontSize: 13 }}>
        Sem dados no período
      </div>
    );
  }

  const max  = Math.max(...data.map(d => d.concluidas), 1);
  const W    = 640, H = 140, padX = 8, padY = 12;
  const n    = data.length;
  const slot = (W - padX * 2) / n;
  const barW = Math.max(2, slot - 4);

  return (
    <svg viewBox={`0 0 ${W} ${H + 20}`} style={{ width:'100%', height: 168 }}>
      {data.map((d, i) => {
        const barH = Math.max(2, (d.concluidas / max) * (H - padY));
        const x    = padX + i * slot;
        const y    = H - barH;
        const showLabel = n <= 10 || i % Math.ceil(n / 8) === 0;
        const dayNum    = d.dia.slice(8);
        return (
          <g key={d.dia}>
            <rect
              x={x}
              y={y}
              width={barW}
              height={barH}
              fill={d.concluidas > 0 ? '#B70C00' : 'var(--g-100)'}
              rx="2"
              opacity={d.concluidas > 0 ? 0.85 : 0.4}
            />
            {showLabel && (
              <text
                x={x + barW / 2}
                y={H + 15}
                textAnchor="middle"
                fontSize="9"
                fill="var(--g-400)"
              >
                {dayNum}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
