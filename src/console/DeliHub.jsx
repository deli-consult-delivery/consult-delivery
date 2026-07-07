import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase.js';
import BomDiaScreen from '../screens/BomDiaScreen.jsx';
import EncerramentoScreen from '../screens/EncerramentoScreen.jsx';

// ─── Metadados dos agentes ────────────────────────────────────────
const AGENT_META = {
  lara:            { name: 'LARA',          desc: 'CRM food service + régua de disparo',              eta: '~45s',   color: '#7c3aed', letter: 'L' },
  cora:            { name: 'CORA',          desc: 'Cobrança inteligente e régua de inadimplência',    eta: '~30s',   color: '#16a34a', letter: 'C' },
  vera:            { name: 'VERA',          desc: 'BI e relatórios semanais',                         eta: '~1 min', color: '#2563eb', letter: 'V' },
  breno:           { name: 'BRENO',         desc: 'Atendimento e suporte ao cliente',                 eta: '~20s',   color: '#0891b2', letter: 'B' },
  sofia:           { name: 'SOFIA',         desc: 'SDR / prospecção de novos clientes',              eta: '~2 min', color: '#db2777', letter: 'S' },
  deli:            { name: 'DELI',          desc: 'COO digital — orquestração e monitoramento',       eta: '~1 min', color: '#B70C00', letter: 'D' },
  max:             { name: 'MAX',           desc: 'Consultor técnico e auditoria de cardápio',        eta: '~2 min', color: '#92400e', letter: 'M' },
  nova:            { name: 'NOVA',          desc: 'Agente de novidades e conteúdo',                   eta: '~1 min', color: '#0f766e', letter: 'N' },
  'analise-ifood': { name: 'Analista iFood', desc: 'Análise de métricas e relatório iFood',           eta: '~3 min', color: '#ea580c', letter: 'A' },
  'bom-dia':       { name: 'Bom Dia',       desc: 'Artes motivacionais diárias (seg–sáb)',            eta: '~2 min', color: '#ca8a04', letter: '☀' },
  'encerramento':  { name: 'Encerramento',  desc: 'Finalização de expediente diária (seg–sáb)',      eta: '~2 min', color: '#475569', letter: '🌙' },
};

const OVERLAY_AGENTS = new Set(['bom-dia', 'encerramento']);

const STATUS_CLASS = { success: 'ok', failed: 'err', running: 'warn', queued: 'mut' };
const STATUS_LABEL = { success: 'Concluído', failed: 'Falhou', running: 'Executando', queued: 'Na fila' };

function fmtTime(iso) {
  if (!iso) return '—';
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min}min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h}h`;
  const d = Math.floor(h / 24);
  return d === 1 ? 'ontem' : `há ${d}d`;
}

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function buildStats(runs) {
  const stats = {};
  for (const r of runs) {
    const id = r.agent_id || 'desconhecido';
    if (!stats[id]) stats[id] = { total: 0, success: 0, cost: 0, last_at: null, last_status: null };
    stats[id].total++;
    if (r.status === 'success') stats[id].success++;
    stats[id].cost += Number(r.cost_usd) || 0;
    if (!stats[id].last_at || r.created_at > stats[id].last_at) {
      stats[id].last_at = r.created_at;
      stats[id].last_status = r.status;
    }
  }
  return stats;
}

// ─── Sub-componentes ──────────────────────────────────────────────

function Avatar({ letter, color, size = 40 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: 6, flexShrink: 0,
      background: color, color: '#fff',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: "'Anton', sans-serif", fontSize: size * 0.45, letterSpacing: 1,
    }}>
      {letter}
    </div>
  );
}

function AgentCard({ agentId, meta, stats, onRun }) {
  const s = stats || {};
  const isOverlay = OVERLAY_AGENTS.has(agentId);

  return (
    <div className="cv2-card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <Avatar letter={meta.letter} color={meta.color} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <b style={{ fontSize: 13, fontFamily: "'Anton', sans-serif", letterSpacing: 0.5 }}>{meta.name}</b>
            {s.last_status && (
              <span className={`cv2-bdg ${STATUS_CLASS[s.last_status] || 'mut'}`} style={{ fontSize: 10 }}>
                {STATUS_LABEL[s.last_status] || s.last_status}
              </span>
            )}
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--tx2)', marginTop: 2, lineHeight: 1.4 }}>{meta.desc}</div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 11, color: 'var(--tx2)', display: 'flex', gap: 12 }}>
          <span>{s.total ?? 0} execuções</span>
          {s.last_at && <span>{fmtTime(s.last_at)}</span>}
          <span style={{ color: 'var(--tx2)' }}>{meta.eta}</span>
        </div>
        <button
          className={`cv2-btn${isOverlay ? '' : ' sec'}`}
          style={{ fontSize: 11.5, padding: '5px 12px' }}
          onClick={() => onRun(agentId)}
        >
          {isOverlay ? 'Abrir' : 'Executar'}
        </button>
      </div>
    </div>
  );
}

function RunRow({ run }) {
  const meta = AGENT_META[run.agent_id];
  const label = meta?.name || run.agent_id || '—';
  const sc = STATUS_CLASS[run.status] || 'mut';

  return (
    <tr>
      <td style={{ fontWeight: 600, fontSize: 12.5 }}>
        {meta && (
          <span style={{
            display: 'inline-block', width: 18, height: 18, borderRadius: 3, background: meta.color,
            color: '#fff', fontSize: 10, fontFamily: "'Anton', sans-serif",
            textAlign: 'center', lineHeight: '18px', marginRight: 6, verticalAlign: 'middle',
          }}>{meta.letter}</span>
        )}
        {label}
      </td>
      <td><span className={`cv2-bdg ${sc}`} style={{ fontSize: 10 }}>{STATUS_LABEL[run.status] || run.status}</span></td>
      <td style={{ fontSize: 11.5, color: 'var(--tx2)' }}>{fmtDate(run.created_at)}</td>
      <td style={{ fontSize: 11.5, color: 'var(--tx2)', textAlign: 'right' }}>
        {run.cost_usd ? `US$ ${Number(run.cost_usd).toFixed(4)}` : '—'}
      </td>
    </tr>
  );
}

function PromptBox({ onSend, loading }) {
  const [text, setText] = useState('');

  const handleSend = () => {
    if (!text.trim() || loading) return;
    onSend(text.trim());
    setText('');
  };

  return (
    <div className="cv2-card" style={{ padding: 16 }}>
      <div style={{ fontSize: 12, color: 'var(--tx2)', marginBottom: 8, fontWeight: 600 }}>
        DELEGUE UMA TAREFA
      </div>
      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleSend(); }}
        rows={3}
        placeholder="Descreva uma tarefa pra DELI orquestrar entre seus agentes… (Ctrl+Enter para enviar)"
        style={{
          width: '100%', fontFamily: 'inherit', fontSize: 13, padding: '10px 12px',
          border: '1px solid var(--line)', borderRadius: 6, resize: 'vertical',
          background: 'var(--bg)', color: 'var(--ink)', boxSizing: 'border-box',
        }}
      />
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
        <button
          className="cv2-btn"
          disabled={!text.trim() || loading}
          onClick={handleSend}
          style={{ fontSize: 12.5 }}
        >
          {loading ? 'Enviando…' : 'Enviar para DELI →'}
        </button>
      </div>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────

export default function DeliHub({ tenantDbId, userId }) {
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [overlay, setOverlay] = useState(null); // null | 'bom-dia' | 'encerramento'
  const [erro, setErro] = useState(null);
  // Contagens reais (não capadas) — mesmo padrão de ConsoleV2.jsx:251 (count exact,
  // head true). Sem isso, o KPI "Execuções (30d)" mostrava 50 (o cap da lista) em
  // vez do total real (ex.: 3904 no tenant Consult). A lista `runs` continua capada
  // em 50 para o feed de recentes; os KPIs usam estes counts reais.
  const [totalRuns, setTotalRuns] = useState(0);
  const [totalOk, setTotalOk] = useState(0);

  const carregar = useCallback(async () => {
    if (!tenantDbId) return;
    setLoading(true);
    try {
      const desde = new Date(Date.now() - 30 * 86400000).toISOString();
      // Lista das 50 recentes para o feed (continua capada — é o feed, não o total)
      const { data, error } = await supabase
        .from('agent_runs')
        .select('id, agent_id, status, cost_usd, created_at, input')
        .eq('tenant_id', tenantDbId)
        .gte('created_at', desde)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      setRuns(data || []);

      // Contagens reais (count exact, head true) — 2 queries paralelas:
      // total de runs no período + total de runs success no período. Ambas
      // ignoram o cap de 50 da lista. Falha de rede numa delas → mantém o último
      // valor (não zera o KPI por um erro transitório).
      const [totalRes, okRes] = await Promise.all([
        supabase.from('agent_runs').select('*', { count: 'exact', head: true })
          .eq('tenant_id', tenantDbId).gte('created_at', desde),
        supabase.from('agent_runs').select('*', { count: 'exact', head: true })
          .eq('tenant_id', tenantDbId).gte('created_at', desde).eq('status', 'success'),
      ]);
      if (!totalRes.error) setTotalRuns(totalRes.count ?? 0);
      if (!okRes.error) setTotalOk(okRes.count ?? 0);
    } catch (err) {
      setErro(err?.message || 'Erro ao carregar execuções');
    } finally {
      setLoading(false);
    }
  }, [tenantDbId]);

  useEffect(() => {
    carregar();

    const channel = supabase
      .channel(`deli_hub:${tenantDbId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'agent_runs',
        filter: `tenant_id=eq.${tenantDbId}`,
      }, () => carregar())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [tenantDbId, carregar]);

  async function handleSend(prompt) {
    setSending(true);
    try {
      const BRIDGE = import.meta.env.VITE_BRIDGE_URL || 'https://bridge.consultdelivery.com.br';
      await fetch(`${BRIDGE}/api/deli/conversa`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenant_id: tenantDbId, user_id: userId, message: prompt }),
      });
    } catch {
      // erro não-crítico — apenas log
    } finally {
      setSending(false);
    }
  }

  function handleRun(agentId) {
    if (OVERLAY_AGENTS.has(agentId)) {
      setOverlay(agentId);
    }
    // outros agentes: futuramente abrir run modal
  }

  const stats = buildStats(runs);
  const taxaOk = totalRuns ? Math.round((totalOk / totalRuns) * 100) : 0;
  // ⚠️ Dívida honesta: custoTotal é soma das 50 runs mais recentes (array capado),
  // não do total real. Aggregação de cost_usd no período exige RPC/SUM server-side
  // (PostgREST não suporta aggregação direta); fora do escopo deste fix (P6/P10 —
  // contagem client-side sobre lista capada). O KPI "Execuções (30d)" e a "Taxa
  // de sucesso" agora usam counts reais; "Custo de IA" segue sub-contado.
  const custoTotal = runs.reduce((s, r) => s + (Number(r.cost_usd) || 0), 0);
  const agentesAtivos = Object.keys(stats).filter(id => stats[id].total > 0).length;
  const recentes = runs.slice(0, 10);

  // ── Overlays ──
  if (overlay === 'bom-dia') {
    return (
      <div style={{ position: 'relative', height: '100%' }}>
        <button
          className="cv2-btn sec"
          style={{ position: 'absolute', top: 0, right: 0, zIndex: 10, fontSize: 12 }}
          onClick={() => setOverlay(null)}
        >
          ← Voltar ao Hub
        </button>
        <BomDiaScreen tenantDbId={tenantDbId} userId={userId} />
      </div>
    );
  }

  if (overlay === 'encerramento') {
    return (
      <div style={{ position: 'relative', height: '100%' }}>
        <button
          className="cv2-btn sec"
          style={{ position: 'absolute', top: 0, right: 0, zIndex: 10, fontSize: 12 }}
          onClick={() => setOverlay(null)}
        >
          ← Voltar ao Hub
        </button>
        <EncerramentoScreen tenantDbId={tenantDbId} userId={userId} />
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Header */}
      <div>
        <h1>DELI Hub <span className="cv2-bdg ok" style={{ fontSize: 11, verticalAlign: 'middle' }}>DADOS REAIS</span></h1>
        <div className="cv2-rule" />
        <div className="cv2-sub" style={{ marginTop: 6 }}>
          Central de agentes IA. Execute, delegue e acompanhe o time digital.
        </div>
      </div>

      {erro && (
        <div className="cv2-card" style={{ borderColor: 'var(--danger)', color: 'var(--danger)', padding: '10px 14px' }}>
          Erro: {erro}
        </div>
      )}

      {/* KPIs */}
      <div className="cv2-kpis">
        <div className="cv2-kpi">
          <div className="l">Execuções (30d)</div>
          <div className="v">{loading ? '…' : totalRuns.toLocaleString('pt-BR')}</div>
          <div className="d mut">{loading ? '' : `${totalOk} ok · ${totalRuns - totalOk} falhas`}</div>
        </div>
        <div className="cv2-kpi">
          <div className="l">Taxa de sucesso</div>
          <div className="v">{loading ? '…' : `${taxaOk}%`}</div>
          <div className="d mut">{taxaOk >= 95 ? 'saudável' : taxaOk >= 80 ? 'atenção' : 'crítico'}</div>
        </div>
        <div className="cv2-kpi">
          <div className="l">Custo de IA (30d)</div>
          <div className="v">{loading ? '…' : `US$ ${custoTotal.toFixed(4)}`}</div>
          <div className="d mut">aprox. (50 recentes)</div>
        </div>
        <div className="cv2-kpi">
          <div className="l">Agentes com atividade</div>
          <div className="v">{loading ? '…' : agentesAtivos}</div>
          <div className="d mut">neste workspace</div>
        </div>
      </div>

      {/* Prompt composer */}
      <PromptBox onSend={handleSend} loading={sending} />

      {/* Grid de agentes */}
      <div>
        <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--tx2)', letterSpacing: 0.5, marginBottom: 10 }}>
          AGENTES
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
          {Object.entries(AGENT_META).map(([id, meta]) => (
            <AgentCard
              key={id}
              agentId={id}
              meta={meta}
              stats={stats[id]}
              onRun={handleRun}
            />
          ))}
        </div>
      </div>

      {/* Execuções recentes */}
      <div>
        <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--tx2)', letterSpacing: 0.5, marginBottom: 10 }}>
          EXECUÇÕES RECENTES
        </div>
        {loading ? (
          <div className="cv2-card cv2-sub">Carregando execuções…</div>
        ) : recentes.length === 0 ? (
          <div className="cv2-card cv2-sub">Nenhuma execução nos últimos 30 dias.</div>
        ) : (
          <div className="cv2-card" style={{ padding: 0, overflow: 'hidden' }}>
            <div className="cv2-tbl-wrap">
              <table style={{ width: '100%' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left' }}>Agente</th>
                    <th style={{ textAlign: 'left' }}>Status</th>
                    <th style={{ textAlign: 'left' }}>Data</th>
                    <th style={{ textAlign: 'right' }}>Custo</th>
                  </tr>
                </thead>
                <tbody>
                  {recentes.map(r => <RunRow key={r.id} run={r} />)}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
