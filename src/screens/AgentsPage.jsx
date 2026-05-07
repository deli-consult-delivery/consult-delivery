import { useState as uSAg, useEffect as uEAg, useRef as uRAg, useMemo as uMAg } from 'react';
import Icon from '../components/Icon.jsx';
import AgentAvatar from '../components/AgentAvatar.jsx';
import { TENANTS } from '../data.js';

// ─── Mock de superagentes (templates) ─────────────────────────
const SUPERAGENTS = [
  {
    id: 'campaign',
    name: 'Otimizador de Campanha',
    desc: 'Analisa pedidos e cria a campanha do dia',
    agent: 'lara',
    runs: '128 execuções',
    eta: '~45s',
  },
  {
    id: 'cardapio',
    name: 'Auditor de Cardápio',
    desc: 'Detecta fotos ruins e preços fora do mercado',
    agent: 'max',
    runs: '64 execuções',
    eta: '~2 min',
  },
  {
    id: 'cobranca',
    name: 'Régua de Cobrança',
    desc: 'Dispara mensagens para inadimplentes em escala',
    agent: 'cora',
    runs: '312 execuções',
    eta: '~30s',
  },
  {
    id: 'relatorio',
    name: 'Relatório Semanal',
    desc: 'Compila KPIs e envia ao gestor por WhatsApp',
    agent: 'vera',
    runs: '52 execuções',
    eta: '~1 min',
  },
];

// Histórico recente de execuções
const RECENT_RUNS = [
  { id: 'r1', title: 'Cobrança em massa — pizzaria',  agent: 'cora', time: 'há 2h' },
  { id: 'r2', title: 'Campanha de terça do hambúrguer', agent: 'lara', time: 'ontem' },
  { id: 'r3', title: 'Auditoria do iFood — Sushi Master', agent: 'max', time: 'ontem' },
  { id: 'r4', title: 'Relatório semanal — Açaí Premium', agent: 'vera', time: '2 dias' },
];

// Sugestões rápidas no input
const PROMPT_SUGGESTIONS = [
  'Quais clientes estão prestes a churnar?',
  'Crie um post pra hoje da Pizzaria',
  'Gera relatório semanal da Burger House',
  'Quem deve mais de R$ 500?',
];

// ─── Composer (input grande com gradiente, estilo ClickUp) ────
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
      {/* Tabs */}
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

      {/* Composer */}
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

// ─── Card de superagente (template) ───────────────────────────
const SuperAgentCard = ({ sa, onRun }) => {
  return (
    <div className="sa-card" onClick={() => onRun(sa)}>
      <div className="sa-card-top">
        <AgentAvatar id={sa.agent} size={32}/>
        <span className="sa-eta">{sa.eta}</span>
      </div>
      <div className="sa-card-name">{sa.name}</div>
      <div className="sa-card-desc">{sa.desc}</div>
      <div className="sa-card-foot">{sa.runs}</div>
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
        {/* User prompt bubble */}
        <div className="run-msg user">
          <div className="run-bubble user">{prompt}</div>
        </div>

        {/* Stages */}
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

        {/* Result */}
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
const AISidebar = ({ onPick, current }) => {
  const items = [
    { id: 'create', icon: 'plus',  label: 'Criar agente' },
    { id: 'all',    icon: 'bot',   label: 'Todos os agentes', count: 7 },
    { id: 'mine',   icon: 'star',  label: 'Meus agentes',     count: 3 },
    { id: 'log',    icon: 'refresh', label: 'Atividade' },
  ];
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

      <div className="ai-sb-section">Superagentes recentes</div>
      <div>
        {SUPERAGENTS.slice(0, 2).map(sa => (
          <div key={sa.id} className="ai-sb-item">
            <AgentAvatar id={sa.agent} size={18}/>
            <span style={{ flex: 1, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {sa.name}
            </span>
          </div>
        ))}
      </div>

      <div className="ai-sb-section">Conversas recentes</div>
      <div>
        {RECENT_RUNS.map(r => (
          <div key={r.id} className="ai-sb-item">
            <Icon name="msg" size={14}/>
            <span style={{ flex: 1, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {r.title}
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
  const [mode, setMode] = uSAg('agent'); // 'ask' or 'agent'
  const [prompt, setPrompt] = uSAg('');
  const [running, setRunning] = uSAg(null); // prompt being run
  const [sbActive, setSbActive] = uSAg('create');

  const tenantName = TENANTS.find(t => t.id === tenant)?.name || '';

  const submit = () => {
    if (!prompt.trim()) return;
    setRunning(prompt);
  };

  const runTemplate = (sa) => {
    const exemplos = {
      campaign: 'Crie a campanha de hoje pra Pizzaria do João baseado no que vendeu mais essa semana',
      cardapio: 'Audite o cardápio do iFood e me diga o que tá ruim',
      cobranca: 'Dispare a régua de cobrança pra todos com mais de 7 dias atrasado',
      relatorio: 'Gera o relatório semanal e me manda no WhatsApp',
    };
    setRunning(exemplos[sa.id] || sa.desc);
  };

  return (
    <div className="agents-hub">
      <AISidebar current={sbActive} onPick={(it) => setSbActive(it.id)}/>

      <div className="hub-stage">
        {/* Background glow */}
        <div className="hub-glow"/>
        <div className="hub-grid"/>

        {/* Top bar within stage */}
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
          {/* Brand */}
          <div className="hub-brand">
            <img src="assets/rocket-logo.png" alt="" className="hub-brand-icon"/>
            <h1 className="hub-brand-title">
              DELI <span className="hub-brand-tm">Hub</span>
              <sup className="hub-brand-sup">™</sup>
            </h1>
          </div>
          <div className="hub-tagline">
            Sua equipe de 7 agentes IA. Pergunte, delegue, e veja acontecer.
          </div>

          {/* Composer */}
          <PromptComposer
            value={prompt}
            onChange={setPrompt}
            onSend={submit}
            mode={mode}
            setMode={setMode}
          />

          {/* Quick chips (only on Ask mode) */}
          {mode === 'ask' && (
            <div className="hub-chips">
              {PROMPT_SUGGESTIONS.map(s => (
                <button key={s} className="hub-chip" onClick={() => setPrompt(s)}>{s}</button>
              ))}
            </div>
          )}

          {/* Templates / superagentes (only on Agents mode) */}
          {mode === 'agent' && (
            <div className="sa-grid">
              {SUPERAGENTS.map(sa => (
                <SuperAgentCard key={sa.id} sa={sa} onRun={runTemplate}/>
              ))}
            </div>
          )}

          {/* Stat strip */}
          <div className="hub-stats">
            <div className="hub-stat">
              <span className="hub-stat-v">7</span>
              <span className="hub-stat-l">agentes ativos</span>
            </div>
            <span className="hub-stat-sep"/>
            <div className="hub-stat">
              <span className="hub-stat-v">312</span>
              <span className="hub-stat-l">tarefas executadas hoje</span>
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

        {/* Run panel */}
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
