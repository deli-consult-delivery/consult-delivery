import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase.js';

const BRIDGE = import.meta.env.VITE_BRIDGE_URL || 'https://bridge.consultdelivery.com.br';

// ─── Pipeline ao Vivo — Kanban de execuções de agentes ───────────────────────
// Fonte: agent_runs + agents (nome legível)
// Colunas: Aguardando (queued) → Executando (running) → Concluído (success) → Falhou (failed)
// Realtime: supabase.channel() atualiza sem refresh

const COLUNAS = [
  { id: 'queued',  label: 'Aguardando',  cor: '#8b6914', bg: '#fdf7e3', borda: '#f0d060' },
  { id: 'running', label: 'Executando',  cor: '#1563b0', bg: '#eaf2fd', borda: '#90c0f0' },
  { id: 'success', label: 'Concluído',   cor: '#1e7d43', bg: '#e8f3ec', borda: '#7dd4a8' },
  { id: 'failed',  label: 'Falhou',      cor: '#B70C00', bg: '#faeae8', borda: '#f0b4ae' },
];

const AGENTE_LABELS = {
  'breno-responder':         'BRENO',
  'cora-processar-cobranca': 'CORA',
  'deli-orquestradora':      'DELI',
  'lara-regua':              'LARA',
  'sofia-sdr':               'SOFIA',
  'max-consultor':           'MAX',
};

function nomeAgente(agentId) {
  if (!agentId) return 'Agente';
  const label = AGENTE_LABELS[agentId];
  if (label) return label;
  return agentId.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function scoreBar(score) {
  if (score == null) return null;
  const pct = Math.round(score * 100);
  const cor = pct >= 80 ? '#1e7d43' : pct >= 50 ? '#8b6914' : '#B70C00';
  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
        <span style={{ fontSize: 10, color: 'var(--tx2)', fontWeight: 600 }}>Confiança</span>
        <span style={{ fontSize: 10, fontWeight: 700, color: cor }}>{pct}%</span>
      </div>
      <div style={{ height: 4, borderRadius: 2, background: 'var(--g1)' }}>
        <div style={{ height: 4, borderRadius: 2, width: `${pct}%`, background: cor, transition: 'width .3s' }} />
      </div>
    </div>
  );
}

function fmtHora(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function fmtDur(ms) {
  if (!ms) return null;
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function extrairCliente(run) {
  // Tenta extrair nome do cliente a partir do input JSONB do run
  const inp = run.input || {};
  return inp.contact_name || inp.sender_name || inp.cliente_nome || inp.loja_nome || null;
}

function CardRun({ run }) {
  const [expandido, setExpandido] = useState(false);
  const col = COLUNAS.find(c => c.id === run.status) || COLUNAS[0];
  const cliente = extrairCliente(run);
  const agente = nomeAgente(run.agent_id);
  const dur = fmtDur(run.duration_ms);

  return (
    <div
      onClick={() => setExpandido(v => !v)}
      style={{
        background: 'var(--white)',
        border: `1px solid var(--g1)`,
        borderLeft: `3px solid ${col.borda}`,
        borderRadius: 6,
        padding: '10px 12px',
        marginBottom: 8,
        cursor: 'pointer',
        boxShadow: '0 1px 3px rgba(0,0,0,.06)',
        transition: 'box-shadow .15s',
      }}
    >
      {/* Header do cartão */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginBottom: 6 }}>
        <div style={{
          flexShrink: 0,
          fontSize: 10, fontWeight: 700, letterSpacing: '.5px',
          background: col.bg, color: col.cor,
          padding: '2px 6px', borderRadius: 4,
        }}>
          {agente}
        </div>
        {run.pipeline_stage && (
          <div style={{
            fontSize: 10, color: 'var(--tx2)',
            background: 'var(--g1)', padding: '2px 6px', borderRadius: 4,
          }}>
            {run.pipeline_stage}
          </div>
        )}
        {dur && (
          <div style={{ fontSize: 10, color: 'var(--tx2)', marginLeft: 'auto' }}>
            {dur}
          </div>
        )}
      </div>

      {/* Cliente */}
      {cliente && (
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--tx1)', marginBottom: 4 }}>
          {cliente}
        </div>
      )}

      {/* Explanation */}
      {run.explanation && (
        <div style={{
          fontSize: 11.5, color: 'var(--tx2)', lineHeight: 1.5,
          display: expandido ? 'block' : '-webkit-box',
          WebkitLineClamp: expandido ? 'unset' : 2,
          WebkitBoxOrient: 'vertical',
          overflow: expandido ? 'visible' : 'hidden',
        }}>
          {run.explanation}
        </div>
      )}

      {/* Score de confiança */}
      {scoreBar(run.confidence_score)}

      {/* Hora + run id (expandido) */}
      {expandido && (
        <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--g1)' }}>
          <div style={{ fontSize: 10.5, color: 'var(--tx2)' }}>
            Início: {fmtHora(run.created_at)}
            {run.completed_at && ` · Fim: ${fmtHora(run.completed_at)}`}
          </div>
          <div style={{ fontSize: 10, color: 'var(--tx3)', marginTop: 2, wordBreak: 'break-all' }}>
            {run.trigger_dev_run_id || run.id}
          </div>
          {typeof run.output?.resposta === 'string' && run.output.resposta && (
            <div style={{ marginTop: 6, fontSize: 11, color: 'var(--tx2)', borderLeft: '2px solid var(--g1)', paddingLeft: 8 }}>
              {run.output.resposta.slice(0, 200)}{run.output.resposta.length > 200 ? '…' : ''}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Coluna({ col, runs }) {
  return (
    <div style={{
      flex: '0 0 280px', minWidth: 0,
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Cabeçalho da coluna */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '0 0 12px 0', marginBottom: 4,
      }}>
        <div style={{
          width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
          background: col.cor,
          boxShadow: col.id === 'running' ? `0 0 0 3px ${col.bg}` : 'none',
        }} />
        <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--tx1)' }}>{col.label}</span>
        <span style={{
          marginLeft: 'auto',
          fontSize: 11, fontWeight: 700, color: col.cor,
          background: col.bg, padding: '2px 7px', borderRadius: 10,
        }}>{runs.length}</span>
      </div>

      {/* Cartões */}
      <div style={{ flex: 1, overflowY: 'auto', paddingRight: 2 }}>
        {runs.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--tx3)', fontSize: 12, paddingTop: 24 }}>
            Nenhuma execução
          </div>
        ) : (
          runs.map(r => <CardRun key={r.id} run={r} />)
        )}
      </div>
    </div>
  );
}

// ─── Saúde do Pipeline ────────────────────────────────────────────────────
function PipelineHealthCard({ sessionToken }) {
  const [health, setHealth] = useState(null);
  const [loadingH, setLoadingH] = useState(true);

  useEffect(() => {
    if (!sessionToken) return;
    setLoadingH(true);
    fetch(`${BRIDGE}/api/pipeline/health?days=7`, {
      headers: { Authorization: `Bearer ${sessionToken}` },
    })
      .then(r => r.ok ? r.json() : null)
      .then(d => { setHealth(d); setLoadingH(false); })
      .catch(() => setLoadingH(false));
  }, [sessionToken]);

  const coreTaxa = !health?.success_rate ? 'var(--tx3)'
    : health.success_rate >= 80 ? '#1e7d43'
    : health.success_rate >= 50 ? '#8b6914'
    : '#B70C00';

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
      background: 'var(--g0,#f9f9f9)', border: '1px solid var(--g1)', borderRadius: 8,
      padding: '10px 16px', margin: '0 0 12px 0', fontSize: 12,
    }}>
      <span style={{ fontWeight: 700, color: 'var(--tx2)', fontSize: 11, letterSpacing: '.5px', textTransform: 'uppercase' }}>
        Saúde 7d
      </span>
      {loadingH ? (
        <span style={{ color: 'var(--tx3)' }}>…</span>
      ) : !health ? (
        <span style={{ color: 'var(--tx3)' }}>indisponível</span>
      ) : (
        <>
          <span style={{ color: 'var(--tx2)' }}>
            <strong style={{ color: 'var(--tx1)' }}>{health.total_runs}</strong> runs
          </span>
          <span style={{ color: coreTaxa, fontWeight: 700 }}>
            {health.success_rate ?? '—'}% ok
          </span>
          {health.avg_duration_ms != null && (
            <span style={{ color: 'var(--tx2)' }}>
              avg <strong style={{ color: 'var(--tx1)' }}>{(health.avg_duration_ms / 1000).toFixed(1)}s</strong>
            </span>
          )}
          {health.top_agents?.length > 0 && (
            <span style={{ color: 'var(--tx2)' }}>
              top: {health.top_agents.slice(0, 3).map(a =>
                `${a.agent_id.split('-')[0].toUpperCase()} (${a.count})`
              ).join(', ')}
            </span>
          )}
        </>
      )}
    </div>
  );
}

// ─── Componente principal ──────────────────────────────────────────────────
export default function PipelineScreen({ tenantDbId }) {
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState(null);
  const [janela, setJanela] = useState(24); // horas
  const [sessionToken, setSessionToken] = useState(null);
  const channelRef = useRef(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSessionToken(data?.session?.access_token ?? null);
    });
  }, []);

  async function carregar(tenantId, horas) {
    const desde = new Date(Date.now() - horas * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from('agent_runs')
      .select('id, tenant_id, agent_id, status, input, output, duration_ms, cost_usd, created_at, completed_at, trigger_dev_run_id, explanation, confidence_score, pipeline_stage, pipeline_position')
      .eq('tenant_id', tenantId)
      .gte('created_at', desde)
      .order('pipeline_position', { ascending: true })
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) {
      setErro(error.message);
    } else {
      setRuns(data || []);
      setErro(null);
    }
    setLoading(false);
  }

  useEffect(() => {
    if (!tenantDbId) return;
    setLoading(true);
    carregar(tenantDbId, janela);

    // Realtime: escuta inserções e atualizações de agent_runs do tenant
    if (channelRef.current) supabase.removeChannel(channelRef.current);

    channelRef.current = supabase
      .channel(`pipeline-runs-${tenantDbId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'agent_runs',
        filter: `tenant_id=eq.${tenantDbId}`,
      }, payload => {
        if (payload.eventType === 'INSERT') {
          const desde = new Date(Date.now() - janela * 60 * 60 * 1000);
          if (new Date(payload.new.created_at) >= desde) {
            setRuns(prev => [payload.new, ...prev].slice(0, 200));
          }
        } else if (payload.eventType === 'UPDATE') {
          setRuns(prev => prev.map(r => r.id === payload.new.id ? payload.new : r));
        } else if (payload.eventType === 'DELETE') {
          setRuns(prev => prev.filter(r => r.id !== payload.old.id));
        }
      })
      .subscribe((status, err) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setErro(`Realtime indisponível: ${err?.message ?? status}`);
        }
      });

    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current);
    };
  }, [tenantDbId, janela]);

  const runsPerCol = col => runs
    .filter(r => r.status === col.id)
    .sort((a, b) => (a.pipeline_position ?? 0) - (b.pipeline_position ?? 0) || new Date(b.created_at) - new Date(a.created_at));

  const totalAtivos = runs.filter(r => r.status === 'running' || r.status === 'queued').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Cabeçalho */}
      <div style={{ padding: '18px 24px 14px', borderBottom: '1px solid var(--g1)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--tx1)' }}>
              Pipeline ao Vivo
            </h2>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--tx2)' }}>
              Execuções de agentes em tempo real
            </p>
          </div>

          {/* Indicador ativo */}
          {totalAtivos > 0 && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: '#eaf2fd', color: '#1563b0',
              padding: '4px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600,
            }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#1563b0', animation: 'pulse 1.5s infinite' }} />
              {totalAtivos} ativo{totalAtivos !== 1 ? 's' : ''}
            </div>
          )}

          {/* Seletor de janela */}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
            {[6, 24, 72].map(h => (
              <button
                key={h}
                onClick={() => setJanela(h)}
                style={{
                  padding: '4px 10px', borderRadius: 6, fontSize: 11.5, fontWeight: 600,
                  border: '1px solid var(--g1)', cursor: 'pointer',
                  background: janela === h ? 'var(--red)' : 'var(--white)',
                  color: janela === h ? '#fff' : 'var(--tx2)',
                }}
              >
                {h < 24 ? `${h}h` : `${h / 24}d`}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Card de saúde do pipeline */}
      <div style={{ padding: '12px 24px 0' }}>
        <PipelineHealthCard sessionToken={sessionToken} />
      </div>

      {/* Corpo: kanban */}
      {loading ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--tx2)' }}>
          Carregando pipeline…
        </div>
      ) : erro ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#B70C00', fontSize: 13 }}>
          Erro: {erro}
        </div>
      ) : (
        <div style={{
          flex: 1, overflowX: 'auto', overflowY: 'hidden',
          display: 'flex', gap: 16, padding: '16px 24px',
          alignItems: 'flex-start',
        }}>
          {COLUNAS.map(col => (
            <Coluna key={col.id} col={col} runs={runsPerCol(col)} />
          ))}
        </div>
      )}
    </div>
  );
}
