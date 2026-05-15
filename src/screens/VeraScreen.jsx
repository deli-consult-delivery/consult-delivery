import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase.js';
import AgentAvatar from '../components/AgentAvatar.jsx';
import Icon from '../components/Icon.jsx';

const VERA_COLOR  = '#10B981';
const VERA_BG     = 'rgba(16,185,129,0.08)';
const BRIDGE      = import.meta.env.VITE_BRIDGE_URL || 'http://localhost:3001';

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso) {
  if (!iso) return '–';
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

function fmtDateFull(iso) {
  if (!iso) return '–';
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function tipoBadge(tipo) {
  const cfg = {
    diario:     { label: 'Diário',   color: '#3B82F6' },
    semanal:    { label: 'Semanal',  color: '#8B5CF6' },
    mensal:     { label: 'Mensal',   color: '#F59E0B' },
    anomalia:   { label: 'Anomalia', color: '#EF4444' },
    customizado:{ label: 'Custom',   color: '#6B7280' },
  };
  const c = cfg[tipo] || cfg.customizado;
  return (
    <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.05em', color: c.color,
      background: `${c.color}22`, padding: '2px 7px', borderRadius: 10, textTransform: 'uppercase' }}>
      {c.label}
    </span>
  );
}

function SevBadge({ sev }) {
  const cfg = {
    info:     { label: 'Info',    color: '#3B82F6' },
    warning:  { label: 'Atenção', color: '#F59E0B' },
    critical: { label: 'Crítico', color: '#EF4444' },
  };
  const c = cfg[sev] || cfg.info;
  return (
    <span style={{ fontSize: 10, fontWeight: 700, color: c.color, background: `${c.color}22`,
      padding: '2px 8px', borderRadius: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
      {c.label}
    </span>
  );
}

function Spinner() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" style={{ animation: 'spin 0.8s linear infinite', flexShrink: 0 }}>
      <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2.5" strokeDasharray="60" strokeDashoffset="20" />
    </svg>
  );
}

// ── Markdown simples (para conteúdo_markdown dos relatórios) ─────────────────
function MarkdownView({ content }) {
  if (!content) return <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>Sem conteúdo.</p>;

  const lines = content.split('\n');
  const elements = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith('# ')) {
      elements.push(<h2 key={i} style={{ fontSize: 16, fontWeight: 700, color: VERA_COLOR, margin: '16px 0 8px' }}>{line.slice(2)}</h2>);
    } else if (line.startsWith('## ')) {
      elements.push(<h3 key={i} style={{ fontSize: 14, fontWeight: 700, color: 'rgba(255,255,255,0.85)', margin: '12px 0 6px' }}>{line.slice(3)}</h3>);
    } else if (line.startsWith('- ')) {
      elements.push(<li key={i} style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)', lineHeight: 1.7, listStyle: 'disc', marginLeft: 18 }}>{line.slice(2)}</li>);
    } else if (line.trim() === '') {
      elements.push(<div key={i} style={{ height: 6 }} />);
    } else {
      elements.push(<p key={i} style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)', lineHeight: 1.7, margin: '4px 0' }}>{line}</p>);
    }
    i++;
  }
  return <div style={{ maxWidth: 680 }}>{elements}</div>;
}

// ── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, empty }) {
  return (
    <div style={{ padding: '14px 16px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 12, minWidth: 0 }}>
      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', fontWeight: 600, textTransform: 'uppercase',
        letterSpacing: '0.06em', marginBottom: 8 }}>{label}</div>
      {empty
        ? <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.25)', fontStyle: 'italic' }}>Aguardando snapshot</div>
        : <div style={{ fontSize: 24, fontWeight: 700, color: 'rgba(255,255,255,0.9)', letterSpacing: '-0.02em' }}>{value ?? '–'}</div>
      }
      {sub && !empty && <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

// ── Tab: Dashboard ────────────────────────────────────────────────────────────
function DashboardTab({ tenantDbId, snapshots, anomalias, reports, loading }) {
  const latest  = snapshots[0];
  const m       = latest?.metricas || {};
  const prev    = snapshots[1]?.metricas || {};

  const cobrancas    = m.cobrancas || {};
  const conversas    = m.conversas || {};
  const negocio      = m.negocio   || {};
  const agentesData  = m.agentes   || {};

  const taxaCORA  = cobrancas.total > 0 ? Math.round((cobrancas.pagas / cobrancas.total) * 100) : null;
  const prospectsNovos = m.num_prospects_novos ?? negocio.num_prospects_novos ?? 0;
  const prospectsQualif = negocio.num_prospects_qualificados ?? 0;
  const conversasNovas  = conversas.num_conversas_novas ?? 0;
  const custoUsd        = typeof agentesData.custo_total_usd === 'number' ? agentesData.custo_total_usd.toFixed(3) : null;
  const numRuns         = agentesData.num_runs ?? null;

  const anomaliasAbertas = anomalias.filter(a => !a.resolvida && a.severidade === 'critical').length;

  const hasSnapshot = !!latest;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* KPIs */}
      <section>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase',
          letterSpacing: '0.08em', marginBottom: 12 }}>
          {hasSnapshot ? `Snapshot · ${latest.data}` : 'KPIs — sem snapshot ainda'}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
          <KpiCard label="Prospects Novos"       value={prospectsNovos}  sub="criados hoje"         empty={!hasSnapshot} />
          <KpiCard label="Qualificados"           value={prospectsQualif} sub="no funil SOFIA"        empty={!hasSnapshot} />
          <KpiCard label="Recuperação CORA"       value={taxaCORA != null ? `${taxaCORA}%` : '–'}
            sub={`${cobrancas.pagas ?? 0} de ${cobrancas.total ?? 0} cobranças`}                      empty={!hasSnapshot} />
          <KpiCard label="Conversas Novas"        value={conversasNovas}  sub="abertas hoje"          empty={!hasSnapshot} />
          <KpiCard label="Runs de Agentes"        value={numRuns}         sub="execuções hoje"        empty={!hasSnapshot} />
          <KpiCard label="Custo Agentes (USD)"    value={custoUsd ? `$${custoUsd}` : '–'} sub="hoje"  empty={!hasSnapshot} />
          <KpiCard label="Alertas Críticos"
            value={<span style={{ color: anomaliasAbertas > 0 ? '#EF4444' : VERA_COLOR }}>{anomaliasAbertas}</span>}
            sub="anomalias críticas"                                                                    empty={false} />
        </div>
        {!hasSnapshot && (
          <div style={{ marginTop: 12, padding: '10px 14px', background: 'rgba(16,185,129,0.06)',
            border: '1px solid rgba(16,185,129,0.2)', borderRadius: 8, fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
            Execute <code style={{ color: VERA_COLOR }}>vera-snapshot-diario</code> no Trigger.dev para popular os KPIs.
          </div>
        )}
      </section>

      {/* Últimos relatórios */}
      <section>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase',
          letterSpacing: '0.08em', marginBottom: 12 }}>Últimos Relatórios</div>
        {loading ? (
          <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>Carregando…</div>
        ) : reports.length === 0 ? (
          <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>
            Nenhum relatório ainda. Execute <code style={{ color: VERA_COLOR }}>vera-relatorio-diario</code> no Trigger.dev.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {reports.slice(0, 5).map(r => (
              <div key={r.id} style={{ padding: '10px 14px', background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10,
                display: 'flex', alignItems: 'center', gap: 10 }}>
                {tipoBadge(r.tipo)}
                <span style={{ flex: 1, fontSize: 13, color: 'rgba(255,255,255,0.8)', minWidth: 0,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.titulo}</span>
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', flexShrink: 0 }}>{fmtDate(r.created_at)}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Anomalias recentes */}
      {anomalias.filter(a => !a.resolvida).length > 0 && (
        <section>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#EF4444', textTransform: 'uppercase',
            letterSpacing: '0.08em', marginBottom: 12 }}>Anomalias Ativas</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {anomalias.filter(a => !a.resolvida).slice(0, 3).map(a => (
              <div key={a.id} style={{ padding: '10px 14px', background: 'rgba(239,68,68,0.06)',
                border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10,
                display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <SevBadge sev={a.severidade} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.7)' }}>{a.metrica}</div>
                  {a.explicacao && <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', marginTop: 2 }}>{a.explicacao}</div>}
                </div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', flexShrink: 0 }}>{fmtDate(a.detectada_em)}</div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// ── Tab: Relatórios ───────────────────────────────────────────────────────────
function RelatoriosTab({ tenantDbId, userId, reports, loading, onReload }) {
  const [filter, setFilter]   = useState('todos');
  const [expanded, setExpanded] = useState(null);
  const [generating, setGenerating] = useState(false);

  const filtered = filter === 'todos' ? reports : reports.filter(r => r.tipo === filter);

  const gerarRelatorio = async () => {
    setGenerating(true);
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      const res = await fetch(`${BRIDGE}/agents/vera-relatorio-diario/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ tenant_id: tenantDbId, triggered_by: userId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao gerar relatório');
      setTimeout(() => { onReload(); setGenerating(false); }, 8000);
    } catch (e) {
      alert(`Erro: ${e.message}`);
      setGenerating(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Filtros + ação */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {['todos','diario','semanal','mensal','anomalia'].map(t => (
          <button key={t} onClick={() => setFilter(t)} style={{
            padding: '5px 12px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
            background: filter === t ? VERA_COLOR : 'rgba(255,255,255,0.07)',
            color: filter === t ? '#000' : 'rgba(255,255,255,0.6)',
          }}>
            {t === 'todos' ? 'Todos' : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <button onClick={gerarRelatorio} disabled={generating} style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px',
          background: VERA_COLOR, color: '#000', border: 'none', borderRadius: 8, cursor: 'pointer',
          fontWeight: 700, fontSize: 12, opacity: generating ? 0.6 : 1,
        }}>
          {generating ? <Spinner /> : <Icon name="sparkles" size={13} />}
          {generating ? 'Gerando…' : 'Gerar Diário'}
        </button>
      </div>

      {/* Lista */}
      {loading ? (
        <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>Carregando…</div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: '24px', textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>
          Nenhum relatório {filter !== 'todos' ? `do tipo "${filter}"` : ''} ainda.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map(r => (
            <div key={r.id} style={{ background: 'rgba(255,255,255,0.03)',
              border: `1px solid ${expanded === r.id ? VERA_COLOR + '44' : 'rgba(255,255,255,0.08)'}`,
              borderRadius: 12, overflow: 'hidden' }}>
              {/* Header */}
              <div onClick={() => setExpanded(expanded === r.id ? null : r.id)}
                style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                {tipoBadge(r.tipo)}
                <span style={{ flex: 1, fontSize: 13, color: 'rgba(255,255,255,0.85)', fontWeight: 600,
                  minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.titulo}
                </span>
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', flexShrink: 0 }}>
                  {fmtDate(r.created_at)}
                </span>
                <Icon name="chevdown" size={13}
                  style={{ color: 'rgba(255,255,255,0.3)', flexShrink: 0,
                    transform: expanded === r.id ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
              </div>
              {/* Expanded content */}
              {expanded === r.id && (
                <div style={{ padding: '0 16px 16px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                  {r.resumo_executivo && (
                    <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', lineHeight: 1.7,
                      margin: '12px 0', fontStyle: 'italic' }}>{r.resumo_executivo}</p>
                  )}
                  <MarkdownView content={r.conteudo_markdown} />
                  {r.destinatarios?.length > 0 && (
                    <div style={{ marginTop: 12, fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>
                      Destinatários: {r.destinatarios.join(', ')}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Tab: Anomalias ────────────────────────────────────────────────────────────
function AnomaliaTab({ tenantDbId, anomalias, loading, onReload }) {
  const [filtro, setFiltro] = useState('abertas');

  const lista = filtro === 'abertas'
    ? anomalias.filter(a => !a.resolvida)
    : filtro === 'criticas'
    ? anomalias.filter(a => !a.resolvida && a.severidade === 'critical')
    : anomalias.filter(a => a.resolvida);

  const resolver = async (id) => {
    await supabase.from('vera_anomalias').update({ resolvida: true }).eq('id', id);
    onReload();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Filtros */}
      <div style={{ display: 'flex', gap: 8 }}>
        {[['abertas','Abertas'],['criticas','Críticas'],['resolvidas','Resolvidas']].map(([v,l]) => (
          <button key={v} onClick={() => setFiltro(v)} style={{
            padding: '5px 12px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
            background: filtro === v ? (v === 'criticas' ? '#EF4444' : VERA_COLOR) : 'rgba(255,255,255,0.07)',
            color: filtro === v ? (v === 'criticas' ? '#fff' : '#000') : 'rgba(255,255,255,0.6)',
          }}>{l}</button>
        ))}
      </div>

      {loading ? (
        <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>Carregando…</div>
      ) : lista.length === 0 ? (
        <div style={{ padding: '32px', textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>
          {filtro === 'abertas' ? 'Nenhuma anomalia ativa. Boa notícia!' : 'Nenhuma anomalia nesse filtro.'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {lista.map(a => (
            <div key={a.id} style={{ padding: '14px 16px',
              background: a.severidade === 'critical' ? 'rgba(239,68,68,0.06)' : a.severidade === 'warning' ? 'rgba(245,158,11,0.06)' : 'rgba(59,130,246,0.06)',
              border: `1px solid ${a.severidade === 'critical' ? 'rgba(239,68,68,0.2)' : a.severidade === 'warning' ? 'rgba(245,158,11,0.2)' : 'rgba(59,130,246,0.2)'}`,
              borderRadius: 12, display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <SevBadge sev={a.severidade} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.85)' }}>{a.metrica}</div>
                {a.explicacao && (
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', marginTop: 4, lineHeight: 1.5 }}>{a.explicacao}</div>
                )}
                {(a.valor_esperado != null || a.valor_observado != null) && (
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 6 }}>
                    Esperado: {a.valor_esperado ?? '–'} · Observado: {a.valor_observado ?? '–'}
                  </div>
                )}
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 4 }}>
                  {fmtDateFull(a.detectada_em)}
                </div>
              </div>
              {!a.resolvida && (
                <button onClick={() => resolver(a.id)} style={{
                  padding: '5px 12px', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: 8, color: 'rgba(255,255,255,0.6)', fontSize: 11, cursor: 'pointer', flexShrink: 0,
                }}>Resolver</button>
              )}
              {a.resolvida && (
                <span style={{ fontSize: 11, color: VERA_COLOR, flexShrink: 0 }}>✓ Resolvida</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Tab: Chat VERA ────────────────────────────────────────────────────────────
function ChatTab({ tenantDbId, userId }) {
  const [history, setHistory]   = useState([
    { role: 'vera', content: 'Olá! Sou VERA, sua analista de BI. Faça uma pergunta sobre métricas da plataforma — prospects, cobranças, conversas, custo de agentes.' }
  ]);
  const [input, setInput]       = useState('');
  const [loading, setLoading]   = useState(false);
  const pendingRef              = useRef(null);
  const bottomRef               = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history]);

  // Subscrevera agent_runs para capturar resposta da VERA
  useEffect(() => {
    if (!tenantDbId) return;
    const ch = supabase.channel('vera-chat-runs')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'agent_runs',
        filter: `tenant_id=eq.${tenantDbId}` }, (p) => {
        const run = p.new;
        if (run.agent_id !== 'vera' || !pendingRef.current) return;
        if (run.trigger_dev_run_id !== pendingRef.current) return;
        if (run.status === 'success') {
          const resposta = run.output?.resposta || 'Análise concluída — dados disponíveis nos relatórios.';
          setHistory(h => [...h, { role: 'vera', content: resposta }]);
          setLoading(false);
          pendingRef.current = null;
        }
      })
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [tenantDbId]);

  const send = async () => {
    const q = input.trim();
    if (!q || loading) return;
    setInput('');
    setHistory(h => [...h, { role: 'user', content: q }]);
    setLoading(true);

    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      const res = await fetch(`${BRIDGE}/agents/vera-responder-pergunta/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ tenant_id: tenantDbId, pergunta: q, triggered_by: userId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao chamar VERA');
      pendingRef.current = data.trigger_run_id || data.run_id;

      // Timeout de 30s
      setTimeout(() => {
        if (pendingRef.current) {
          setHistory(h => [...h, { role: 'vera', content: 'Análise demorou mais que o esperado. Verifique os relatórios ou tente novamente.' }]);
          setLoading(false);
          pendingRef.current = null;
        }
      }, 30000);
    } catch (e) {
      setHistory(h => [...h, { role: 'vera', content: `Erro: ${e.message}. Verifique se o Bridge Server está online.` }]);
      setLoading(false);
    }
  };

  const SUGGESTIONS = [
    'Quantos prospects foram criados essa semana?',
    'Qual a taxa de recuperação CORA hoje?',
    'Quantas conversas novas tivemos ontem?',
    'Qual o custo total dos agentes nessa semana?',
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '60vh', minHeight: 400 }}>
      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12, paddingBottom: 12 }}
        className="dark-scroll">
        {history.map((msg, i) => (
          <div key={i} style={{
            display: 'flex', gap: 10, alignItems: 'flex-start',
            flexDirection: msg.role === 'user' ? 'row-reverse' : 'row',
          }}>
            {msg.role === 'vera'
              ? <AgentAvatar id="vera" size={28} />
              : <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(255,255,255,0.1)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, flexShrink: 0 }}>W</div>
            }
            <div style={{
              maxWidth: '75%', padding: '10px 14px', borderRadius: 12, fontSize: 13, lineHeight: 1.6,
              background: msg.role === 'vera' ? VERA_BG : 'rgba(255,255,255,0.07)',
              border: `1px solid ${msg.role === 'vera' ? VERA_COLOR + '30' : 'rgba(255,255,255,0.1)'}`,
              color: 'rgba(255,255,255,0.85)',
            }}>
              {msg.content}
            </div>
          </div>
        ))}
        {loading && (
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <AgentAvatar id="vera" size={28} />
            <div style={{ padding: '10px 14px', borderRadius: 12, background: VERA_BG,
              border: `1px solid ${VERA_COLOR}30`, display: 'flex', alignItems: 'center', gap: 8,
              color: VERA_COLOR, fontSize: 13 }}>
              <Spinner /> Analisando dados…
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Suggestions */}
      {history.length === 1 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
          {SUGGESTIONS.map(s => (
            <button key={s} onClick={() => setInput(s)} style={{
              padding: '5px 10px', fontSize: 11, borderRadius: 20, cursor: 'pointer',
              background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)',
              color: VERA_COLOR,
            }}>{s}</button>
          ))}
        </div>
      )}

      {/* Input */}
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
          placeholder="Faça uma pergunta sobre as métricas…"
          disabled={loading}
          style={{ flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 10, padding: '10px 14px', color: 'rgba(255,255,255,0.85)', fontSize: 13,
            outline: 'none', fontFamily: 'inherit' }}
        />
        <button onClick={send} disabled={loading || !input.trim()} style={{
          padding: '10px 16px', background: VERA_COLOR, border: 'none', borderRadius: 10,
          color: '#000', fontWeight: 700, fontSize: 13, cursor: 'pointer',
          opacity: loading || !input.trim() ? 0.5 : 1,
        }}>
          <Icon name="send" size={14} />
        </button>
      </div>
    </div>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function VeraScreen({ tenantDbId, userId }) {
  const [tab,       setTab]       = useState('dashboard');
  const [snapshots, setSnapshots] = useState([]);
  const [reports,   setReports]   = useState([]);
  const [anomalias, setAnomalias] = useState([]);
  const [loading,   setLoading]   = useState(true);

  useEffect(() => {
    if (tenantDbId) loadAll();
  }, [tenantDbId, tab]);

  async function loadAll() {
    setLoading(true);
    try {
      const [snapRes, reportRes, anomRes] = await Promise.all([
        supabase.from('vera_metricas_snapshot')
          .select('data, metricas')
          .eq('tenant_id', tenantDbId)
          .order('data', { ascending: false })
          .limit(14),
        supabase.from('vera_reports')
          .select('id, tipo, titulo, resumo_executivo, conteudo_markdown, metricas, destinatarios, created_at')
          .eq('tenant_id', tenantDbId)
          .order('created_at', { ascending: false })
          .limit(50),
        supabase.from('vera_anomalias')
          .select('id, metrica, severidade, valor_esperado, valor_observado, explicacao, detectada_em, resolvida, notificado')
          .eq('tenant_id', tenantDbId)
          .order('detectada_em', { ascending: false })
          .limit(50),
      ]);
      if (snapRes.data)   setSnapshots(snapRes.data);
      if (reportRes.data) setReports(reportRes.data);
      if (anomRes.data)   setAnomalias(anomRes.data);
    } finally {
      setLoading(false);
    }
  }

  const TABS = [
    { id: 'dashboard',  label: 'Dashboard'  },
    { id: 'relatorios', label: 'Relatórios' },
    { id: 'anomalias',  label: 'Anomalias',
      badge: anomalias.filter(a => !a.resolvida && a.severidade === 'critical').length || null },
    { id: 'chat',       label: 'Chat VERA'  },
  ];

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', width: '100%', padding: '0 4px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24 }}>
        <AgentAvatar id="vera" size={40} />
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: 'rgba(255,255,255,0.92)' }}>VERA</h1>
            <span style={{ fontSize: 11, fontWeight: 700, color: VERA_COLOR,
              background: VERA_BG, border: `1px solid ${VERA_COLOR}44`,
              padding: '2px 8px', borderRadius: 10 }}>BI · Relatórios</span>
            <span style={{ fontSize: 10, fontWeight: 700, color: VERA_COLOR,
              background: VERA_BG, padding: '2px 8px', borderRadius: 10,
              animation: 'pulse 2s infinite' }}>● ATIVA</span>
          </div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>
            Monitora métricas, detecta anomalias e responde perguntas em linguagem natural
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, borderBottom: '1px solid rgba(255,255,255,0.08)',
        paddingBottom: 1 }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: '8px 16px', background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 13, fontWeight: tab === t.id ? 700 : 500,
            color: tab === t.id ? VERA_COLOR : 'rgba(255,255,255,0.45)',
            borderBottom: `2px solid ${tab === t.id ? VERA_COLOR : 'transparent'}`,
            marginBottom: -1, display: 'flex', alignItems: 'center', gap: 6, transition: 'color 0.15s',
          }}>
            {t.label}
            {t.badge > 0 && (
              <span style={{ fontSize: 10, fontWeight: 700, color: '#fff',
                background: '#EF4444', padding: '1px 6px', borderRadius: 10 }}>{t.badge}</span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      {tab === 'dashboard' && (
        <DashboardTab tenantDbId={tenantDbId} snapshots={snapshots}
          anomalias={anomalias} reports={reports} loading={loading} />
      )}
      {tab === 'relatorios' && (
        <RelatoriosTab tenantDbId={tenantDbId} userId={userId}
          reports={reports} loading={loading} onReload={loadAll} />
      )}
      {tab === 'anomalias' && (
        <AnomaliaTab tenantDbId={tenantDbId} anomalias={anomalias}
          loading={loading} onReload={loadAll} />
      )}
      {tab === 'chat' && (
        <ChatTab tenantDbId={tenantDbId} userId={userId} />
      )}
    </div>
  );
}
