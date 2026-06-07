import { useState } from 'react';
import './console.css';

// ============================================================
// Console v2 · F1 — Defesa Comercial (copiloto)  [D6 aprovada 2026-06-07]
// PR1: shell + telas com DADOS DE EXEMPLO (wiring real: PR2+).
// Grupos F2+ visíveis porém travados — regra anti-dispersão da D6.
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

function Kpi({ l, v, d, neg, mut }) {
  return (
    <div className="cv2-kpi">
      <div className="l">{l}</div>
      <div className="v">{v}</div>
      <div className={`d${neg ? ' neg' : ''}${mut ? ' mut' : ''}`}>{d || ' '}</div>
    </div>
  );
}

function VisaoGeral({ tenantNome }) {
  return (
    <div>
      <h1>Visão Geral <span className="cv2-mock">DADOS DE EXEMPLO · PR2 liga ao banco</span></h1>
      <div className="cv2-rule" />
      <div className="cv2-sub">{tenantNome} · últimos 30 dias</div>
      <div className="cv2-kpis">
        <Kpi l="R$ defendido no mês" v="R$ 1.240" d="8,4x a mensalidade" />
        <Kpi l="Contestações ganhas" v="9 de 21" d="43% de vitória" />
        <Kpi l="Avaliações respondidas" v="34" d="tempo médio 11 min" />
        <Kpi l="Casos aguardando seu OK" v="3" d="abrir Defesa Comercial" neg />
        <Kpi l="Horas de gerente poupadas" v="~12h" d="≈ R$ 480 em mão de obra" mut />
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
          {tela === 'visao' && <VisaoGeral tenantNome={tenantNome} />}
          {tela === 'defesa' && <Defesa />}
          {tela === 'radar' && <Radar tenantNome={tenantNome} />}
        </div>
      </div>
    </div>
  );
}
