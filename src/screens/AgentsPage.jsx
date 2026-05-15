import { useState as uSAg, useEffect as uEAg, useRef as uRAg, useMemo as uMAg } from 'react';
import Icon from '../components/Icon.jsx';
import AgentAvatar from '../components/AgentAvatar.jsx';
import { TENANTS } from '../data.js';
import { supabase } from '../lib/supabase.js';

// ─── Agentes conhecidos (metadados estáticos) ──────────────────
const AGENT_META = {
  lara:           { name: 'LARA',         desc: 'CRM food service + régua de disparo',       eta: '~45s' },
  cora:           { name: 'CORA',         desc: 'Cobrança inteligente e régua de inadimplência', eta: '~30s' },
  vera:           { name: 'VERA',         desc: 'BI e relatórios semanais',                  eta: '~1 min' },
  breno:          { name: 'BRENO',        desc: 'Atendimento e suporte ao cliente',           eta: '~20s' },
  sofia:          { name: 'SOFIA',        desc: 'SDR / prospecção de novos clientes',         eta: '~2 min' },
  deli:           { name: 'DELI',         desc: 'COO digital — orquestração e monitoramento', eta: '~1 min' },
  max:            { name: 'MAX',          desc: 'Consultor técnico e auditoria de cardápio',  eta: '~2 min' },
  nova:           { name: 'NOVA',         desc: 'Agente de novidades e conteúdo',             eta: '~1 min' },
  'analise-ifood': { name: 'Analista iFood', desc: 'Análise de métricas e relatório iFood',  eta: '~3 min' },
  'bom-dia':       { name: 'Bom Dia',        desc: 'Artes motivacionais diárias para WhatsApp (seg–sáb)', eta: '~2 min' },
};

// Sugestões rápidas no input
const PROMPT_SUGGESTIONS = [
  'Quais clientes estão prestes a churnar?',
  'Crie um post pra hoje da Pizzaria',
  'Gera relatório semanal da Burger House',
  'Quem deve mais de R$ 500?',
];

// ─── Helpers ───────────────────────────────────────────────────
const STATUS_LABEL = { success: 'Concluído', failed: 'Falhou', running: 'Executando', queued: 'Na fila' };
const STATUS_COLOR = { success: 'var(--cora-green, #22c55e)', failed: '#ef4444', running: '#f59e0b', queued: '#6b7280' };

function fmtTime(iso) {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min}min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h}h`;
  const d = Math.floor(h / 24);
  if (d === 1) return 'ontem';
  return `há ${d} dias`;
}

function fmtCost(usd) {
  if (!usd) return '—';
  return `$${Number(usd).toFixed(4)}`;
}

function inputPreview(input) {
  if (!input) return '—';
  if (typeof input === 'string') return input.slice(0, 80);
  if (typeof input === 'object') {
    const str = JSON.stringify(input);
    return str.slice(0, 80) + (str.length > 80 ? '…' : '');
  }
  return '—';
}

// ─── Composer (input grande com gradiente) ─────────────────────
const PromptComposer = ({ value, onChange, onSend, disabled, mode, setMode }) => {
  const ref = uRAg(null);

  uEAg(() => {
    if (ref.current) {
      ref.current.style.height = 'auto';
      ref.current.style.height = Math.min(220, ref.current.scrollHeight) + 'px';
    }
  }, [value]);

  const onKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (value.trim() && !disabled) onSend();
    }
  };

  return (
    <div className="deli-composer-wrap">
      <div className="deli-tabs">
        <button
          className={`deli-tab ${mode === 'ask' ? 'on' : ''}`}
          onClick={() => setMode('ask')}
        >
          <Icon name="sparkles" size={14}/> Faça uma pergunta
        </button>
        <button
          className={`deli-tab ${mode === 'agent' ? 'on' : ''}`}
          onClick={() => setMode('agent')}
        >
          <Icon name="bot" size={14}/> Agentes
        </button>
      </div>

      <div className="deli-composer">
        <textarea
          ref={ref}
          className="deli-input"
          placeholder={
            mode === 'ask'
              ? 'Pergunte algo sobre seus clientes, pedidos, finanças…'
              : 'Descreva uma tarefa pra DELI orquestrar entre seus agentes…'
          }
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKey}
          rows={1}
        />
        <div className="deli-composer-foot">
          <div style={{ display:'flex', gap: 6 }}>
            <button className="deli-attach" title="Anexar"><Icon name="plus" size={16}/></button>
            <button className="deli-attach" title="Mencionar agente"><span style={{fontSize:13,fontWeight:700}}>@</span></button>
            <button className="deli-attach" title="Anexar arquivo"><Icon name="paperclip" size={14}/></button>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap: 10 }}>
            <span className="deli-hint">⏎ enviar · ⇧⏎ nova linha</span>
            <button
              className={`deli-send ${value.trim() ? 'ready' : ''}`}
              onClick={onSend}
              disabled={!value.trim() || disabled}
              title="Enviar"
            >
              <Icon name="arrowright" size={16}/>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Card de agente com dados reais ───────────────────────────
const SuperAgentCard = ({ agentId, stats, onRun }) => {
  const meta = AGENT_META[agentId] || { name: agentId, desc: '', eta: '—' };
  const runsLabel = stats ? `${stats.total_runs} execuç${stats.total_runs === 1 ? 'ão' : 'ões'}` : '0 execuções';

  const handleRun = () => {
    onRun({ id: agentId, name: meta.name, desc: meta.desc });
  };

  return (
    <div className="sa-card" onClick={handleRun}>
      <div className="sa-card-top">
        <AgentAvatar id={agentId} size={32}/>
        <span className="sa-eta">{meta.eta}</span>
      </div>
      <div className="sa-card-name">{meta.name}</div>
      <div className="sa-card-desc">{meta.desc}</div>
      <div className="sa-card-foot" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>{runsLabel}</span>
        {stats?.last_status && (
          <span style={{ fontSize: 10, color: STATUS_COLOR[stats.last_status] }}>
            {STATUS_LABEL[stats.last_status]}
          </span>
        )}
      </div>
    </div>
  );
};

// ─── Item de run na lista de histórico ────────────────────────
const RunItem = ({ run }) => {
  const meta = AGENT_META[run.agent_id] || { name: run.agent_id };
  return (
    <div className="ai-sb-item" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 2, padding: '8px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
        <AgentAvatar id={run.agent_id} size={18}/>
        <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: 'white', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {meta.name}
        </span>
        <span style={{ fontSize: 10, color: STATUS_COLOR[run.status] || 'rgba(255,255,255,0.5)', flexShrink: 0 }}>
          {STATUS_LABEL[run.status] || run.status}
        </span>
      </div>
      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', paddingLeft: 26, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>
        {inputPreview(run.input)}
      </div>
      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', paddingLeft: 26 }}>
        {fmtTime(run.created_at)}{run.cost_usd ? ` · ${fmtCost(run.cost_usd)}` : ''}
      </div>
    </div>
  );
};

// ─── Resultado: chat com agente em ação ───────────────────────
const STAGES = [
  { id: 'parse', label: 'Interpretando solicitação', agent: 'deli', dur: 800 },
  { id: 'route', label: 'Roteando para CORA', agent: 'cora', dur: 1000 },
  { id: 'fetch', label: 'Buscando inadimplentes do Supabase', agent: 'cora', dur: 1400 },
  { id: 'gen',   label: 'Gerando mensagens personalizadas', agent: 'cora', dur: 1600 },
  { id: 'send',  label: 'Enviando via WhatsApp Business API', agent: 'cora', dur: 1200 },
  { id: 'done',  label: 'Concluído', agent: 'deli', dur: 0 },
];

const RunPanel = ({ prompt, onClose, tenant }) => {
  const [stage, setStage] = uSAg(0);
  const [done, setDone] = uSAg(false);

  uEAg(() => {
    if (stage >= STAGES.length - 1) { setDone(true); return; }
    const t = setTimeout(() => setStage(s => s + 1), STAGES[stage].dur);
    return () => clearTimeout(t);
  }, [stage]);

  const tenantName = TENANTS.find(t => t.id === tenant)?.name || '';

  return (
    <div className="run-panel fade-in">
      <div className="run-head">
        <div style={{ display:'flex', alignItems:'center', gap: 10 }}>
          <AgentAvatar id="deli" size={32}/>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'white' }}>DELI · Orquestrador</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)' }}>
              {done ? 'Tarefa concluída' : 'Executando…'} · {tenantName}
            </div>
          </div>
        </div>
        <button className="run-close" onClick={onClose}><Icon name="x" size={16}/></button>
      </div>

      <div className="run-body dark-scroll">
        <div className="run-msg user">
          <div className="run-bubble user">{prompt}</div>
        </div>

        <div className="run-stages">
          {STAGES.slice(0, -1).map((s, i) => {
            const state = i < stage ? 'done' : i === stage && !done ? 'active' : i === stage && done ? 'done' : 'pending';
            return (
              <div key={s.id} className={`run-stage ${state}`}>
                <div className="run-stage-bullet">
                  {state === 'done' && <Icon name="check" size={12}/>}
                  {state === 'active' && <span className="run-spin"/>}
                  {state === 'pending' && <span className="run-dot"/>}
                </div>
                <div className="run-stage-label">{s.label}</div>
                {state === 'active' && (
                  <span className="run-typing">
                    <span/><span/><span/>
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {done && (
          <div className="run-result fade-in">
            <div className="run-result-head">
              <AgentAvatar id="cora" size={26}/>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'white' }}>CORA respondeu</span>
              <span className="run-badge ok">✓ executado</span>
            </div>
            <div className="run-result-body">
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)', lineHeight: 1.55 }}>
                Disparei a régua de cobrança para <b style={{ color: 'white' }}>8 clientes</b> da {tenantName}.
                Total recuperável: <b style={{ color: 'var(--cora-green)' }}>R$ 2.340</b>.
              </div>
              <div className="run-result-grid">
                <div className="run-stat">
                  <div className="run-stat-v">8</div>
                  <div className="run-stat-l">mensagens</div>
                </div>
                <div className="run-stat">
                  <div className="run-stat-v">5</div>
                  <div className="run-stat-l">já visualizadas</div>
                </div>
                <div className="run-stat">
                  <div className="run-stat-v">2</div>
                  <div className="run-stat-l">responderam</div>
                </div>
                <div className="run-stat">
                  <div className="run-stat-v">R$ 340</div>
                  <div className="run-stat-l">recuperado</div>
                </div>
              </div>
              <div className="run-actions">
                <button className="btn-primary" style={{ background: 'white', color: 'var(--black)' }}>
                  <Icon name="eye" size={14}/> Ver no CORA
                </button>
                <button className="btn-ghost" style={{ color: 'rgba(255,255,255,0.7)' }}>
                  Salvar como superagente
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="run-foot">
        <div className="run-input-wrap">
          <input className="run-input" placeholder="Continuar conversando com DELI…"/>
          <button className="run-input-send"><Icon name="send" size={14}/></button>
        </div>
      </div>
    </div>
  );
};

// ─── Sub-sidebar IA ───────────────────────────────────────────
const AISidebar = ({ onPick, current, agentStats, recentRuns, loadingRuns }) => {
  const items = [
    { id: 'create', icon: 'plus',    label: 'Criar agente' },
    { id: 'all',    icon: 'bot',     label: 'Todos os agentes', count: Object.keys(agentStats).length || null },
    { id: 'mine',   icon: 'star',    label: 'Meus agentes',     count: 3 },
    { id: 'log',    icon: 'refresh', label: 'Atividade' },
  ];

  // Agentes com ao menos 1 run, ordenados por last_run_at desc (para sidebar)
  const activeAgents = Object.entries(agentStats)
    .filter(([, s]) => s.total_runs > 0)
    .sort(([, a], [, b]) => (b.last_run_at || '').localeCompare(a.last_run_at || ''))
    .slice(0, 2);

  return (
    <aside className="ai-sidebar">
      <div className="ai-sb-head">
        <span style={{ fontSize: 13, fontWeight: 700, color: 'white', letterSpacing: 0.3 }}>
          IA · DELI Hub
        </span>
        <button className="ai-sb-collapse"><Icon name="chevleft" size={14}/></button>
      </div>

      <button className="ai-sb-cta" onClick={() => onPick({ id: 'ask' })}>
        <Icon name="sparkles" size={14}/> Pergunte ou crie
      </button>

      <div className="ai-sb-section">Superagentes</div>
      <div>
        {items.map(it => (
          <div
            key={it.id}
            className={`ai-sb-item ${current === it.id ? 'on' : ''}`}
            onClick={() => onPick(it)}
          >
            <Icon name={it.icon} size={15}/>
            <span style={{ flex: 1 }}>{it.label}</span>
            {it.count != null && <span className="ai-sb-count">{it.count}</span>}
          </div>
        ))}
      </div>

      <div className="ai-sb-section">Agentes recentes</div>
      <div>
        {activeAgents.length === 0 && !loadingRuns && (
          <div style={{ padding: '6px 12px', fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
            Nenhuma execução ainda
          </div>
        )}
        {activeAgents.map(([agentId, stats]) => {
          const meta = AGENT_META[agentId] || { name: agentId };
          return (
            <div key={agentId} className="ai-sb-item">
              <AgentAvatar id={agentId} size={18}/>
              <span style={{ flex: 1, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {meta.name}
              </span>
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>
                {stats.total_runs}
              </span>
            </div>
          );
        })}
      </div>

      <div className="ai-sb-section">Execuções recentes</div>
      <div>
        {loadingRuns && (
          <div style={{ padding: '6px 12px', fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
            Carregando…
          </div>
        )}
        {!loadingRuns && recentRuns.length === 0 && (
          <div style={{ padding: '6px 12px', fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
            Nenhuma execução encontrada
          </div>
        )}
        {recentRuns.slice(0, 4).map(r => (
          <div key={r.id} className="ai-sb-item">
            <Icon name="msg" size={14}/>
            <span style={{ flex: 1, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {(AGENT_META[r.agent_id]?.name || r.agent_id)} · {inputPreview(r.input).slice(0, 30)}
            </span>
          </div>
        ))}
      </div>

      <div className="ai-sb-foot">
        <div className="ai-sb-credits">
          <div className="ai-sb-credits-row">
            <Icon name="sparkles" size={13}/>
            <span style={{ fontWeight: 700, color: 'white' }}>Ilimitado</span>
            <span style={{ marginLeft: 'auto', color: 'var(--cora-green)', fontWeight: 700 }}>6,5k</span>
          </div>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', marginTop: 4 }}>
            Pergunte à IA · créditos restantes
          </div>
          <div className="ai-sb-credits-bar">
            <div className="ai-sb-credits-fill" style={{ width: '65%' }}/>
          </div>
        </div>
      </div>
    </aside>
  );
};

// ─── Tela principal ───────────────────────────────────────────
const AgentsHub = ({ tenant, tenantDbId, userId }) => {
  const [mode, setMode] = uSAg('agent');
  const [prompt, setPrompt] = uSAg('');
  const [running, setRunning] = uSAg(null);
  const [sbActive, setSbActive] = uSAg('create');

  // ── Dados reais do Supabase ────────────────────────────────
  const [recentRuns, setRecentRuns] = uSAg([]);
  const [agentStats, setAgentStats] = uSAg({});
  const [loadingRuns, setLoadingRuns] = uSAg(true);

  const tenantName = TENANTS.find(t => t.id === tenant)?.name || '';

  // Calcula stats por agente a partir da lista de runs
  const buildStats = (runs) => {
    const stats = {};
    for (const run of runs) {
      const id = run.agent_id;
      if (!stats[id]) {
        stats[id] = { total_runs: 0, total_cost_usd: 0, last_run_at: null, last_status: null };
      }
      stats[id].total_runs += 1;
      stats[id].total_cost_usd += Number(run.cost_usd || 0);
      if (!stats[id].last_run_at || run.created_at > stats[id].last_run_at) {
        stats[id].last_run_at = run.created_at;
        stats[id].last_status = run.status;
      }
    }
    return stats;
  };

  // Carrega runs iniciais
  uEAg(() => {
    if (!tenantDbId) return;

    let cancelled = false;

    const load = async () => {
      setLoadingRuns(true);
      const { data, error } = await supabase
        .from('agent_runs')
        .select('id, agent_id, status, cost_usd, duration_ms, created_at, input, output')
        .eq('tenant_id', tenantDbId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (cancelled) return;

      if (error) {
        console.error('[AgentsPage] Erro ao buscar agent_runs:', error.message);
        setLoadingRuns(false);
        return;
      }

      const runs = data || [];
      setRecentRuns(runs.slice(0, 20));
      setAgentStats(buildStats(runs));
      setLoadingRuns(false);
    };

    load();
    return () => { cancelled = true; };
  }, [tenantDbId]);

  // Realtime: escuta INSERT e UPDATE em agent_runs do tenant
  uEAg(() => {
    if (!tenantDbId) return;

    const channel = supabase
      .channel(`agent_runs:tenant:${tenantDbId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'agent_runs',
          filter: `tenant_id=eq.${tenantDbId}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const newRun = payload.new;
            setRecentRuns((prev) => {
              const updated = [newRun, ...prev].slice(0, 20);
              return updated;
            });
            setAgentStats((prev) => {
              const id = newRun.agent_id;
              const existing = prev[id] || { total_runs: 0, total_cost_usd: 0, last_run_at: null, last_status: null };
              return {
                ...prev,
                [id]: {
                  total_runs: existing.total_runs + 1,
                  total_cost_usd: existing.total_cost_usd + Number(newRun.cost_usd || 0),
                  last_run_at: newRun.created_at,
                  last_status: newRun.status,
                },
              };
            });
          } else if (payload.eventType === 'UPDATE') {
            const updatedRun = payload.new;
            setRecentRuns((prev) =>
              prev.map((r) => (r.id === updatedRun.id ? { ...r, ...updatedRun } : r))
            );
            setAgentStats((prev) => {
              const id = updatedRun.agent_id;
              if (!prev[id]) return prev;
              // Atualiza apenas o status do último run se for o mais recente
              const isLatest = !prev[id].last_run_at || updatedRun.created_at >= prev[id].last_run_at;
              return {
                ...prev,
                [id]: {
                  ...prev[id],
                  last_status: isLatest ? updatedRun.status : prev[id].last_status,
                  last_run_at: isLatest ? updatedRun.created_at : prev[id].last_run_at,
                },
              };
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tenantDbId]);

  // Stats agregados para a barra inferior
  const totalRuns = uMAg(
    () => Object.values(agentStats).reduce((sum, s) => sum + s.total_runs, 0),
    [agentStats]
  );
  const activeAgentCount = uMAg(
    () => Object.keys(agentStats).filter((id) => agentStats[id].total_runs > 0).length,
    [agentStats]
  );

  const submit = () => {
    if (!prompt.trim()) return;
    setRunning(prompt);
  };

  const runTemplate = (sa) => {
    const exemplos = {
      lara: 'Crie a campanha de hoje pra Pizzaria do João baseado no que vendeu mais essa semana',
      max:  'Audite o cardápio do iFood e me diga o que tá ruim',
      cora: 'Dispare a régua de cobrança pra todos com mais de 7 dias atrasado',
      vera: 'Gera o relatório semanal e me manda no WhatsApp',
    };
    setRunning(exemplos[sa.id] || sa.desc);
  };

  // Agentes a exibir nos cards: todos os conhecidos + qualquer um novo que apareceu nos runs
  const displayAgentIds = uMAg(() => {
    const known = Object.keys(AGENT_META);
    const fromRuns = Object.keys(agentStats).filter((id) => !known.includes(id));
    return [...known, ...fromRuns];
  }, [agentStats]);

  return (
    <div className="agents-hub">
      <AISidebar
        current={sbActive}
        onPick={(it) => setSbActive(it.id)}
        agentStats={agentStats}
        recentRuns={recentRuns}
        loadingRuns={loadingRuns}
      />

      <div className="hub-stage">
        <div className="hub-glow"/>
        <div className="hub-grid"/>

        <div className="hub-topline">
          <div style={{ display:'flex', alignItems:'center', gap: 10, color: 'rgba(255,255,255,0.6)', fontSize: 12 }}>
            <Icon name="info" size={13}/>
            Trabalhando com <b style={{ color: 'white', marginLeft: 4 }}>{tenantName}</b>
          </div>
          <div style={{ display:'flex', gap: 8 }}>
            <button className="hub-pill"><Icon name="info" size={13}/> Obter ajuda</button>
            <button className="hub-pill primary"><Icon name="plus" size={13}/> Começar do zero</button>
          </div>
        </div>

        <div className="hub-center">
          <div className="hub-brand">
            <img src="assets/rocket-logo.png" alt="" className="hub-brand-icon"/>
            <h1 className="hub-brand-title">
              DELI <span className="hub-brand-tm">Hub</span>
              <sup className="hub-brand-sup">™</sup>
            </h1>
          </div>
          <div className="hub-tagline">
            Sua equipe de agentes IA. Pergunte, delegue, e veja acontecer.
          </div>

          <PromptComposer
            value={prompt}
            onChange={setPrompt}
            onSend={submit}
            disabled={!!running}
            mode={mode}
            setMode={setMode}
          />

          {mode === 'ask' && (
            <div className="hub-chips">
              {PROMPT_SUGGESTIONS.map(s => (
                <button key={s} className="hub-chip" onClick={() => setPrompt(s)}>{s}</button>
              ))}
            </div>
          )}

          {mode === 'agent' && (
            <>
              {loadingRuns && (
                <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.4)', fontSize: 12, padding: '24px 0' }}>
                  Carregando agentes…
                </div>
              )}
              {!loadingRuns && (
                <div className="sa-grid">
                  {displayAgentIds.map((agentId) => (
                    <SuperAgentCard
                      key={agentId}
                      agentId={agentId}
                      stats={agentStats[agentId] || null}
                      onRun={runTemplate}
                    />
                  ))}
                </div>
              )}
            </>
          )}

          {/* Histórico de runs recentes (sempre visível, abaixo dos cards) */}
          {!loadingRuns && recentRuns.length > 0 && (
            <div style={{ marginTop: 24, width: '100%', maxWidth: 700 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.4)', letterSpacing: 1, marginBottom: 8, textTransform: 'uppercase' }}>
                Últimas execuções
              </div>
              <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 10, border: '1px solid rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                {recentRuns.map((r) => (
                  <RunItem key={r.id} run={r}/>
                ))}
              </div>
            </div>
          )}

          <div className="hub-stats">
            <div className="hub-stat">
              <span className="hub-stat-v">
                {loadingRuns ? '…' : activeAgentCount}
              </span>
              <span className="hub-stat-l">agentes ativos</span>
            </div>
            <span className="hub-stat-sep"/>
            <div className="hub-stat">
              <span className="hub-stat-v">
                {loadingRuns ? '…' : totalRuns}
              </span>
              <span className="hub-stat-l">execuções registradas</span>
            </div>
            <span className="hub-stat-sep"/>
            <div className="hub-stat">
              <span className="hub-stat-v">R$ 14k</span>
              <span className="hub-stat-l">recuperado este mês</span>
            </div>
            <span className="hub-stat-sep"/>
            <div className="hub-stat">
              <span className="hub-stat-v">99.4%</span>
              <span className="hub-stat-l">uptime API</span>
            </div>
          </div>
        </div>

        {running && (
          <RunPanel
            prompt={running}
            onClose={() => { setRunning(null); setPrompt(''); }}
            tenant={tenant}
          />
        )}
      </div>
    </div>
  );
};

export default AgentsHub;
