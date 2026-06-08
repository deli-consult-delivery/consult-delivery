import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase.js';
import AtivarLoja from './AtivarLoja.jsx';
import Clientes from './Clientes.jsx';
import Estudio from './Estudio.jsx';
import CustosIA from './CustosIA.jsx';
import './console.css';

// ============================================================
// Console v2 · F1+ — [D6 aprovada e REABERTA pelo fundador em 2026-06-07]
// PR6: ciclo do caso · PR7: Ativar loja · PR9: Clientes (multi-tenant)
// + gating D7: Defesa só com assinatura (tenant_agents); Radar grátis.
// E3: Estúdio de Conteúdo (grupo Agentes IA — lock por item).
// T1: Custos de IA (grupo Dados — GAP-4).
// ============================================================

const GRUPOS = [
  { label: 'Início', items: [{ id: 'visao', label: 'Visão Geral' }] },
  { label: 'Operação', items: [
    { id: 'defesa', label: 'Defesa Comercial' },
    { id: 'radar', label: 'Radar (grátis)' },
    { id: 'ativar', label: 'Ativar loja' },
  ]},
  { label: 'Agentes IA', items: [
    { id: 'estudio', label: 'Estúdio de Conteúdo' },
    { id: 'x1', label: 'Análise de Loja', locked: true }, { id: 'x2', label: 'Cardápio', locked: true }, { id: 'x3', label: 'Multicanal', locked: true },
  ]},
  { label: 'Dados', items: [{ id: 'custos', label: 'Custos de IA' }] },
  { label: 'Admin', items: [{ id: 'clientes', label: 'Clientes (plataforma)' }] },
];

const TITULOS = { visao: 'Visão Geral', defesa: 'Defesa Comercial', radar: 'Radar', ativar: 'Ativar loja', clientes: 'Clientes', estudio: 'Estúdio de Conteúdo', custos: 'Custos de IA' };

const OK_STATUSES = ['ok', 'completed', 'success'];
const fmtBRL = c => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

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
        const mesAtual = new Date(); mesAtual.setUTCDate(1); mesAtual.setUTCHours(0, 0, 0, 0);
        const [
          { count: total, error: e1 },
          { count: ok, error: e2 },
          { data: comCusto, error: e3 },
          { count: agentes, error: e4 },
          { data: metricas, error: e5 },
        ] = await Promise.all([
          base(),
          base().in('status', OK_STATUSES),
          supabase.from('agent_runs').select('cost_usd').eq('tenant_id', tenantDbId).gte('created_at', desde).gt('cost_usd', 0),
          supabase.from('tenant_agents').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantDbId),
          supabase.from('defesa_metricas_mensal').select('*').eq('tenant_id', tenantDbId).gte('mes', mesAtual.toISOString()),
        ]);
        if (e1 || e2 || e3 || e4 || e5) throw (e1 || e2 || e3 || e4 || e5);
        const t = total ?? 0;
        const o = ok ?? 0;
        const custo = (comCusto ?? []).reduce((s, r) => s + (Number(r.cost_usd) || 0), 0);
        const m = (metricas ?? [])[0] || {};
        if (alive) setKpis({
          total: t, ok: o, falhas: t - o,
          taxa: t ? Math.round((o / t) * 100) : null,
          custo, agentes: agentes ?? 0,
          defendidoCentavos: Number(m.defendido_centavos) || 0,
          ganhos: Number(m.ganhos) || 0,
          aguardandoOk: Number(m.aguardando_ok) || 0,
        });
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
      <div className={`d${neg ? ' neg' : ''}${mut ? ' mut' : ''}`}>{d || ' '}</div>
    </div>
  );
}

function VisaoGeral({ tenantNome, tenantDbId, onIrDefesa }) {
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
        <Kpi l="R$ defendido no mês" v={kpis ? fmtBRL(kpis.defendidoCentavos) : '…'} d={kpis ? `${fmt(kpis.ganhos)} casos ganhos` : ''} />
        <Kpi l="Casos aguardando seu OK" v={kpis ? fmt(kpis.aguardandoOk) : '…'} d="abrir Defesa Comercial" neg={kpis ? kpis.aguardandoOk > 0 : false} />
      </div>
      <div className="cv2-card">
        <h3>Como funciona o copiloto</h3>
        <div style={{ fontSize: 13, color: 'var(--tx2)', lineHeight: 1.8 }}>
          1. Os agentes vigiam cancelamentos e avaliações das suas lojas · 2. Preparam a contestação ou a resposta com a melhor chance de vitória · 3. <b style={{ color: 'var(--ink)' }}>Você só dá o OK</b> · 4. O painel mostra o dinheiro defendido, mês a mês.
        </div>
        <div style={{ marginTop: 12 }}>
          <button className="cv2-btn" onClick={onIrDefesa}>Abrir fila de Defesa</button>
        </div>
      </div>
    </div>
  );
}

function PaywallDefesa() {
  return (
    <div>
      <h1>Defesa Comercial <span className="cv2-mock">NÃO ATIVA NESTE WORKSPACE</span></h1>
      <div className="cv2-rule" />
      <div className="cv2-card" style={{ maxWidth: 620 }}>
        <h3>Pare de perder dinheiro com cancelamentos</h3>
        <div style={{ fontSize: 13, color: 'var(--tx2)', lineHeight: 1.9 }}>
          A Defesa Comercial vigia os cancelamentos e avaliações da sua loja 24h por dia, prepara a contestação com a melhor chance de vitória e espera o seu OK — pelo painel ou respondendo "@defesa ok" no WhatsApp. O painel mostra, mês a mês, quanto dinheiro foi defendido.
        </div>
        <div style={{ margin: '14px 0 6px', fontSize: 22, fontWeight: 800 }}>R$ 147<span style={{ fontSize: 13, fontWeight: 600, color: 'var(--tx2)' }}> /loja/mês · sem taxa de ativação</span></div>
        <div style={{ fontSize: 12.5, color: 'var(--tx2)', marginBottom: 14 }}>O Radar gratuito continua disponível no menu ao lado — ele mostra quanto está vazando.</div>
        <button className="cv2-btn" onClick={() => { window.location.href = 'mailto:wandson@consultdelivery.com.br?subject=Quero ativar a Defesa Comercial'; }}>Quero ativar a Defesa</button>
        <div style={{ fontSize: 11.5, color: 'var(--tx2)', marginTop: 10 }}>Assinatura automática em breve — por enquanto a ativação é feita pela equipe Consult Delivery em até 1 dia útil.</div>
      </div>
    </div>
  );
}

function CasoCard({ c, children }) {
  const an = c.analise || {};
  return (
    <div className="cv2-caso">
      <div className="cv2-spread">
        <div style={{ minWidth: 0 }}>
          <span className={`cv2-bdg ${c.tipo === 'cancelamento' ? 'err' : 'warn'}`}>{c.tipo === 'cancelamento' ? `cancelamento · ${fmtBRL(c.valor_centavos)}` : 'avaliação'}</span>
          {c.status !== 'aguardando_ok' && <span className="cv2-bdg mut" style={{ marginLeft: 6 }}>{c.status}</span>}
          {an.chance_vitoria && <span className={`cv2-bdg ${an.chance_vitoria === 'alta' ? 'ok' : an.chance_vitoria === 'media' ? 'warn' : 'mut'}`} style={{ marginLeft: 6 }}>chance {an.chance_vitoria}</span>}
          <b style={{ marginLeft: 8, fontSize: 13 }}>{an.loja_nome || c.pedido_ref || c.canal}</b>
          <div style={{ color: 'var(--tx2)', fontSize: 12, marginTop: 3 }}>{c.motivo}</div>
          {Array.isArray(an.fundamentos) && an.fundamentos.length > 0 && c.status === 'aguardando_ok' && (
            <div style={{ color: 'var(--tx2)', fontSize: 11.5, marginTop: 4 }}><b>Fundamentos:</b> {an.fundamentos.join(' · ')}</div>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}

function Defesa({ tenantDbId, userId }) {
  const [fila, setFila] = useState(null);
  const [andamento, setAndamento] = useState(null);
  const [erro, setErro] = useState(null);
  const [editando, setEditando] = useState(null);
  const [textoEdit, setTextoEdit] = useState('');
  const [ganhoDe, setGanhoDe] = useState(null);
  const [valorGanho, setValorGanho] = useState('');
  const [agindo, setAgindo] = useState(null);

  const carregar = useCallback(async () => {
    if (!tenantDbId) return;
    const cols = 'id, tipo, canal, pedido_ref, valor_centavos, motivo, analise, draft_resposta, status, created_at';
    const [{ data: f, error: e1 }, { data: a, error: e2 }] = await Promise.all([
      supabase.from('defesa_casos').select(cols).eq('tenant_id', tenantDbId).eq('status', 'aguardando_ok').order('created_at', { ascending: false }).limit(50),
      supabase.from('defesa_casos').select(cols).eq('tenant_id', tenantDbId).in('status', ['aprovado', 'enviado']).order('created_at', { ascending: false }).limit(50),
    ]);
    if (e1 || e2) { setErro((e1 || e2).message); return; }
    setFila(f ?? []);
    setAndamento(a ?? []);
  }, [tenantDbId]);

  useEffect(() => { carregar(); }, [carregar]);

  async function atualizar(caso, patch) {
    setAgindo(caso.id);
    const { error } = await supabase.from('defesa_casos').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', caso.id);
    setAgindo(null);
    if (error) { setErro(error.message); return false; }
    await carregar();
    return true;
  }

  const aprovar = c => atualizar(c, { status: 'aprovado', aprovado_por: userId ?? null, aprovado_em: new Date().toISOString() });
  const descartar = c => atualizar(c, { status: 'descartado' });
  const marcarEnviado = c => atualizar(c, { status: 'enviado', enviado_em: new Date().toISOString() });
  const marcarPerdido = c => atualizar(c, { status: 'perdido', resultado_valor_centavos: 0 });

  async function confirmarGanho(c) {
    const normalizado = String(valorGanho).replace(/\./g, '').replace(',', '.');
    const reais = Number(normalizado);
    if (!Number.isFinite(reais) || reais < 0) { setErro('valor inválido'); return; }
    const ok = await atualizar(c, { status: 'ganho', resultado_valor_centavos: Math.round(reais * 100) });
    if (ok) { setGanhoDe(null); setValorGanho(''); }
  }

  async function salvarEdicao(caso) {
    const ok = await atualizar(caso, { draft_resposta: textoEdit });
    if (ok) setEditando(null);
  }

  return (
    <div>
      <h1>Defesa Comercial <span className="cv2-mock" style={{ background: 'var(--green-soft)', color: 'var(--green)' }}>FILA REAL</span></h1>
      <div className="cv2-rule" />
      <div className="cv2-sub">Casos preparados pelo agente — revise e dê o OK (aqui ou respondendo "@defesa ok" na conversa do caso).{erro ? ` · erro: ${erro}` : ''}</div>
      <div className="cv2-kpis">
        <Kpi l="Aguardando seu OK" v={fila ? fila.length : '…'} d="revisar agora" neg={fila ? fila.length > 0 : false} />
        <Kpi l="Em andamento" v={andamento ? andamento.length : '…'} d="aprovados/enviados — registre o resultado" mut />
      </div>

      {fila && fila.map(c => {
        const emEdicao = editando === c.id;
        return (
          <div key={c.id}>
            <CasoCard c={c}>
              <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                <button className="cv2-btn" disabled={agindo === c.id} onClick={() => aprovar(c)}>Aprovar</button>
                <button className="cv2-btn sec" disabled={agindo === c.id} onClick={() => { setEditando(emEdicao ? null : c.id); setTextoEdit(c.draft_resposta || ''); }}>{emEdicao ? 'Cancelar' : 'Editar'}</button>
                <button className="cv2-btn danger" disabled={agindo === c.id} onClick={() => descartar(c)}>Descartar</button>
              </div>
            </CasoCard>
            {emEdicao ? (
              <div style={{ margin: '-6px 0 10px' }}>
                <textarea value={textoEdit} onChange={e => setTextoEdit(e.target.value)} rows={8}
                  style={{ width: '100%', fontFamily: 'inherit', fontSize: 12.5, padding: 10, border: '1px solid var(--line)', borderRadius: 4, resize: 'vertical' }} />
                <div style={{ marginTop: 6 }}><button className="cv2-btn" disabled={agindo === c.id} onClick={() => salvarEdicao(c)}>Salvar texto</button></div>
              </div>
            ) : (
              <div className="cv2-caso" style={{ marginTop: -6, borderTop: 'none', borderTopLeftRadius: 0, borderTopRightRadius: 0, paddingTop: 0 }}>
                <div className="draft" style={{ whiteSpace: 'pre-wrap', marginTop: 0 }}>{c.draft_resposta}</div>
              </div>
            )}
          </div>
        );
      })}
      {fila && !fila.length && <div className="cv2-card" style={{ textAlign: 'center', color: 'var(--tx2)' }}>Fila limpa — nenhum caso esperando você.</div>}

      <h1 style={{ fontSize: 15, marginTop: 22 }}>Em andamento — registre o resultado</h1>
      <div className="cv2-rule" />
      <div className="cv2-sub">Quando o marketplace responder, marque <b>Ganho</b> (informe o valor recuperado — alimenta o painel "R$ defendido") ou <b>Perdido</b>.</div>
      {andamento && andamento.map(c => (
        <div key={c.id}>
          <CasoCard c={c}>
            <div style={{ display: 'flex', gap: 8, flexShrink: 0, alignItems: 'center' }}>
              {c.status === 'aprovado' && <button className="cv2-btn sec" disabled={agindo === c.id} onClick={() => marcarEnviado(c)}>Marcar enviado</button>}
              {ganhoDe === c.id ? (
                <>
                  <span style={{ fontSize: 12, color: 'var(--tx2)' }}>R$</span>
                  <input value={valorGanho} onChange={e => setValorGanho(e.target.value)} autoFocus
                    style={{ width: 90, padding: '6px 8px', border: '1px solid var(--line)', borderRadius: 4, fontFamily: 'inherit', fontSize: 12.5 }} />
                  <button className="cv2-btn" disabled={agindo === c.id} onClick={() => confirmarGanho(c)}>Confirmar</button>
                  <button className="cv2-btn sec" onClick={() => { setGanhoDe(null); setValorGanho(''); }}>Cancelar</button>
                </>
              ) : (
                <>
                  <button className="cv2-btn" disabled={agindo === c.id} onClick={() => { setGanhoDe(c.id); setValorGanho((c.valor_centavos / 100).toFixed(2).replace('.', ',')); }}>Ganho</button>
                  <button className="cv2-btn danger" disabled={agindo === c.id} onClick={() => marcarPerdido(c)}>Perdido</button>
                </>
              )}
            </div>
          </CasoCard>
        </div>
      ))}
      {andamento && !andamento.length && <div className="cv2-card" style={{ textAlign: 'center', color: 'var(--tx2)' }}>Nada em andamento.</div>}
    </div>
  );
}

function Radar({ tenantNome }) {
  return (
    <div>
      <h1>Radar <span className="cv2-mock">DADOS DE EXEMPLO · rotina semanal futura</span></h1>
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
            <tr><td>3 cancelamentos com perfil de "golpe do estorno"</td><td><span className="cv2-bdg err">R$ 198</span></td><td>contestáveis — a Defesa prepara em minutos</td></tr>
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
  const [defesaOn, setDefesaOn] = useState(null); // null = carregando
  const tenantNome = tenantInfo?.name || 'Workspace';

  useEffect(() => {
    if (!tenantDbId) return;
    let alive = true;
    supabase.from('tenant_agents').select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantDbId).eq('agent_id', 'defesa')
      .then(({ count }) => { if (alive) setDefesaOn((count ?? 0) > 0); });
    return () => { alive = false; };
  }, [tenantDbId]);

  return (
    <div className="cv2">
      <aside className="cv2-sb">
        <div className="cv2-brand">
          <img src="/assets/rocket-logo.png" alt="" />
          <div>
            <span className="anton">Consult</span>
            <span className="anton">Delivery</span>
            <small>CONSOLE · BETA</small>
          </div>
        </div>
        {GRUPOS.map((g, i) => (
          <div key={i}>
            <div className="cv2-grp">{g.label}</div>
            {g.items.map(it => (g.locked || it.locked) ? (
              <div key={it.id} className="cv2-item lock" title="Em construção — próximas fases do roadmap">
                {it.label}<span className="f2">EM BREVE</span>
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
          <span className="crumb">Console › <b>{TITULOS[tela] || tela}</b></span>
          <span style={{ flex: 1 }} />
          <span className="cv2-pill">Cliente <b>{tenantNome}</b></span>
          <span className="cv2-pill"><b>{defesaOn === false ? 'RADAR GRÁTIS' : 'BETA'}</b></span>
        </div>
        <div className="cv2-ct">
          {tela === 'visao' && <VisaoGeral tenantNome={tenantNome} tenantDbId={tenantDbId} onIrDefesa={() => setTela('defesa')} />}
          {tela === 'defesa' && (defesaOn === false ? <PaywallDefesa /> : <Defesa tenantDbId={tenantDbId} userId={userId} />)}
          {tela === 'radar' && <Radar tenantNome={tenantNome} />}
          {tela === 'ativar' && <AtivarLoja tenantDbId={tenantDbId} />}
          {tela === 'clientes' && <Clientes userId={userId} />}
          {tela === 'estudio' && <Estudio tenantDbId={tenantDbId} userId={userId} />}
          {tela === 'custos' && <CustosIA tenantDbId={tenantDbId} />}
        </div>
      </div>
    </div>
  );
}
