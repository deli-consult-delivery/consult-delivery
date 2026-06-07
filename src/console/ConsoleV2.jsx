import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase.js';
import './console.css';

// ============================================================
// Console v2 · F1 — Defesa Comercial (copiloto)  [D6 aprovada 2026-06-07]
// PR2b: KPIs por COUNT exato (PostgREST corta selects em 1000 linhas —
// padrão P5 no qa-knowledge). Custo busca só linhas com cost_usd > 0.
// Defesa e Radar seguem com DADOS DE EXEMPLO até PR4/PR6.
// ============================================================

const GRUPOS = [
  { label: 'Início', items: [{ id: 'visao', label: 'Visão Geral' }] },
  { label: 'Operação', items: [
    { id: 'defesa', label: 'Defesa Comercial' },
    { id: 'radar', label: 'Radar (grátis)' },
  ]},
  { label: 'Agentes IA', locked: true, items: [
    { id: 'x1', label: 'Análise de Loja' }, { id: 'x2', label: 'Cardápio' }, { id: 'x3', label: 'Multicanal' },
  ]},
  { label: 'Dados', locked: true, items: [{ id: 'x4', label: 'Custos de IA' }] },
  { label: 'Admin', locked: true, items: [{ id: 'x5', label: 'White-label' }] },
];

const CASOS_EXEMPLO = [
  { id: 1, tipo: 'cancelamento', loja: 'Uraka Burger — Centro', valor: 89.0, motivo: 'Cliente alegou item errado; foto anexada não mostra erro', risco: 'alta chance de reversão',
    draft: 'Prezados, contestamos o cancelamento do pedido #4821. A foto anexada pelo cliente mostra o item conforme descrito no cardápio (combo casal, 2 acompanhamentos). Solicitamos revisão e estorno do valor de R$ 89,00 ao estabelecimento.' },
  { id: 2, tipo: 'avaliacao', loja: 'Uraka Burger — Centro', valor: 0, motivo: 'Avaliação 1 estrela: “demorou demais” — atraso foi do entregador do app', risco: 'responder em até 2h protege ranking',
    draft: 'Olá! Sentimos muito pela demora. Verificamos que seu pedido saiu da loja em 18 minutos — dentro do prazo — e o atraso ocorreu na etapa de entrega do aplicativo. Já reportamos à plataforma. Adoraríamos te receber de novo: seu próximo combo tem cortesia da casa.' },
  { id: 3, tipo: 'cancelamento', loja: 'Salgados da Mônica', valor: 45.5, motivo: 'Pedido cancelado após preparo iniciado (12 min)', risco: 'média chance',
    draft: 'Contestamos o cancelamento do pedido #1077: o preparo já estava iniciado há 12 minutos quando o cancelamento ocorreu, conforme registro do KDS. Solicitamos o ressarcimento integral de R$ 45,50 conforme política da plataforma.' },
];

const OK_STATUSES = ['ok', 'completed', 'success'];

function useKpisReais(tenantDbId) {
  const [kpis, setKpis] = useState(null);
  const [erro, setErro] = useState(null);
  useEffect(() => {
    if (!tenantDbId) return;
    let alive = true;
    (async () => {
      try {
        const desde = new Date(Date.now() - 30 * 86400000).toISOString();
        const base = () => supabase.from('agent_runs').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantDbId).gte('created_at', desde);
        const [
          { count: total, error: e1 },
          { count: ok, error: e2 },
          { data: comCusto, error: e3 },
          { count: agentes, error: e4 },
        ] = await Promise.all([
          base(),
          base().in('status', OK_STATUSES),
          supabase.from('agent_runs').select('cost_usd').eq('tenant_id', tenantDbId).gte('created_at', desde).gt('cost_usd', 0),
          supabase.from('tenant_agents').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantDbId),
        ]);
        if (e1 || e2 || e3 || e4) throw (e1 || e2 || e3 || e4);
        const t = total ?? 0;
        const o = ok ?? 0;
        const custo = (comCusto ?? []).reduce((s, r) => s + (Number(r.cost_usd) || 0), 0);
        if (alive) setKpis({ total: t, ok: o, falhas: t - o, taxa: t ? Math.round((o / t) * 100) : null, custo, agentes: agentes ?? 0 });
      } catch (err) {
        if (alive) setErro(err?.message || 'erro ao carregar');
      }
    })();
    return () => { alive = false; };
  }, [tenantDbId]);
  return { kpis, erro };
}

function Kpi({ l, v, d, neg, mut }) {
  return (
    <div className="cv2-kpi">
      <div className="l">{l}</div>
      <div className="v">{v}</div>
      <div className={`d${neg ? ' neg' : ''}${mut ? ' mut' : ''}`}>{d || ' '}</div>
    </div>
  );
}

function VisaoGeral({ tenantNome, tenantDbId }) {
  const { kpis, erro } = useKpisReais(tenantDbId);
  const fmt = n => (n ?? 0).toLocaleString('pt-BR');
  return (
    <div>
      <h1>Visão Geral <span className="cv2-mock" style={{ background: 'var(--green-soft)', color: 'var(--green)' }}>DADOS REAIS · ÚLTIMOS 30 DIAS</span></h1>
      <div className="cv2-rule" />
      <div className="cv2-sub">{tenantNome}{erro ? ` · erro ao carregar: ${erro}` : ''}</div>
      <div className="cv2-kpis">
        <Kpi l="Execuções de agentes" v={kpis ? fmt(kpis.total) : '…'} d={kpis ? `${fmt(kpis.ok)} ok · ${fmt(kpis.falhas)} falhas` : 'carregando'} neg={kpis ? kpis.falhas > 0 : false} />
        <Kpi l="Taxa de sucesso" v={kpis ? (kpis.taxa != null ? `${kpis.taxa}%` : '—') : '…'} d={kpis && kpis.taxa != null ? (kpis.taxa >= 95 ? 'saudável' : 'investigar falhas') : ''} mut />
        <Kpi l="Custo de IA (30d)" v={kpis ? `US$ ${kpis.custo.toFixed(4)}` : '…'} d="todos os agentes" mut />
        <Kpi l="Agentes habilitados" v={kpis ? fmt(kpis.agentes) : '…'} d="neste workspace" mut />
        <Kpi l="R$ defendido no mês" v="—" d="agente Defesa entra no PR4" mut />
        <Kpi l="Casos aguardando seu OK" v="—" d="agente Defesa entra no PR4" mut />
      </div>
      <div className="cv2-card">
        <h3>Como funciona o copiloto</h3>
        <div style={{ fontSize: 13, color: 'var(--tx2)', lineHeight: 1.8 }}>
          1. Os agentes vigiam cancelamentos e avaliações das suas lojas · 2. Preparam a contestação ou a resposta com a melhor chance de vitória · 3. <b style={{ color: 'var(--ink)' }}>Você só dá o OK</b> (aqui ou pelo WhatsApp) · 4. O painel mostra o dinheiro defendido, mês a mês.
        </div>
      </div>
    </div>
  );
}

function Defesa() {
  const [aprovados, setAprovados] = useState([]);
  const [descartados, setDescartados] = useState([]);
  const pend = CASOS_EXEMPLO.filter(c => !aprovados.includes(c.id) && !descartados.includes(c.id));
  return (
    <div>
      <h1>Defesa Comercial <span className="cv2-mock">DADOS DE EXEMPLO · agente real no PR4</span></h1>
      <div className="cv2-rule" />
      <div className="cv2-sub">Casos preparados pelos agentes — revise e dê o OK. Nada é enviado sem a sua aprovação.</div>
      <div className="cv2-kpis">
        <Kpi l="Pendentes" v={pend.length} d="aguardando OK" neg={pend.length > 0} />
        <Kpi l="Aprovados agora" v={aprovados.length} d="serão enviados" mut />
        <Kpi l="Descartados" v={descartados.length} d="" mut />
      </div>
      {pend.map(c => (
        <div key={c.id} className="cv2-caso">
          <div className="cv2-spread">
            <div>
              <span className={`cv2-bdg ${c.tipo === 'cancelamento' ? 'err' : 'warn'}`}>{c.tipo === 'cancelamento' ? `cancelamento · R$ ${c.valor.toFixed(2)}` : 'avaliação'}</span>
              <b style={{ marginLeft: 8, fontSize: 13 }}>{c.loja}</b>
              <div style={{ color: 'var(--tx2)', fontSize: 12, marginTop: 3 }}>{c.motivo} · <i>{c.risco}</i></div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="cv2-btn" onClick={() => setAprovados(a => [...a, c.id])}>Aprovar</button>
              <button className="cv2-btn sec">Editar</button>
              <button className="cv2-btn danger" onClick={() => setDescartados(d => [...d, c.id])}>Descartar</button>
            </div>
          </div>
          <div className="draft">“{c.draft}”</div>
        </div>
      ))}
      {!pend.length && <div className="cv2-card" style={{ textAlign: 'center', color: 'var(--tx2)' }}>Fila limpa — nenhum caso esperando você.</div>}
    </div>
  );
}

function Radar({ tenantNome }) {
  return (
    <div>
      <h1>Radar <span className="cv2-mock">DADOS DE EXEMPLO · rotina semanal no PR6</span></h1>
      <div className="cv2-rule" />
      <div className="cv2-sub">Diagnóstico semanal gratuito — mostra quanto dinheiro está vazando antes de você contratar a Defesa.</div>
      <div className="cv2-kpis">
        <Kpi l="Nota média (semana)" v="4,3" d="caiu 0,2" neg />
        <Kpi l="Cancelamentos" v="7" d="R$ 312 perdidos" neg />
        <Kpi l="Avaliações sem resposta" v="12" d="ranking em risco" neg />
        <Kpi l="Perda estimada do mês" v="R$ 1.180" d="a Defesa custa R$ 147" mut />
      </div>
      <div className="cv2-card">
        <h3>{tenantNome}: o que o Radar viu esta semana</h3>
        <table>
          <thead><tr><th>Sinal</th><th>Impacto</th><th>Ação sugerida</th></tr></thead>
          <tbody>
            <tr><td>3 cancelamentos com perfil de “golpe do estorno”</td><td><span className="cv2-bdg err">R$ 198</span></td><td>contestáveis — a Defesa prepara em minutos</td></tr>
            <tr><td>Avaliação 1★ sem resposta há 3 dias</td><td><span className="cv2-bdg warn">ranking</span></td><td>resposta pronta aguardando OK</td></tr>
            <tr><td>Tempo médio de resposta a avaliações: 2,4 dias</td><td><span className="cv2-bdg warn">conversão</span></td><td>meta com Defesa: minutos</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function ConsoleV2({ tenantInfo, tenantDbId, userId, onExit }) {
  const [tela, setTela] = useState('visao');
  const tenantNome = tenantInfo?.name || 'Workspace';
  return (
    <div className="cv2">
      <aside className="cv2-sb">
        <div className="cv2-brand">
          <img src="/assets/rocket-logo.png" alt="" />
          <div>
            <span className="anton">Consult</span>
            <span className="anton">Delivery</span>
            <small>CONSOLE · F1 BETA</small>
          </div>
        </div>
        {GRUPOS.map((g, i) => (
          <div key={i}>
            <div className="cv2-grp">{g.label}</div>
            {g.items.map(it => g.locked ? (
              <div key={it.id} className="cv2-item lock" title="Disponível na Fase 2 — após o gate D+90 (regra anti-dispersão da D6)">
                {it.label}<span className="f2">F2</span>
              </div>
            ) : (
              <div key={it.id} className={`cv2-item${tela === it.id ? ' on' : ''}`} onClick={() => setTela(it.id)}>{it.label}</div>
            ))}
          </div>
        ))}
        <div style={{ marginTop: 'auto', padding: 14, borderTop: '1px solid var(--line)' }}>
          <button className="cv2-btn sec" style={{ width: '100%', justifyContent: 'center' }} onClick={onExit}>Voltar ao console clássico</button>
        </div>
      </aside>
      <div className="cv2-main">
        <div className="cv2-tb">
          <span className="crumb">Console › <b>{tela === 'visao' ? 'Visão Geral' : tela === 'defesa' ? 'Defesa Comercial' : 'Radar'}</b></span>
          <span style={{ flex: 1 }} />
          <span className="cv2-pill">Cliente <b>{tenantNome}</b></span>
          <span className="cv2-pill"><b>BETA F1</b></span>
        </div>
        <div className="cv2-ct">
          {tela === 'visao' && <VisaoGeral tenantNome={tenantNome} tenantDbId={tenantDbId} />}
          {tela === 'defesa' && <Defesa />}
          {tela === 'radar' && <Radar tenantNome={tenantNome} />}
        </div>
      </div>
    </div>
  );
}
