import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase.js';
import './console.css';

// ============================================================
// Console v2 · F1 — Defesa Comercial (copiloto)  [D6 aprovada 2026-06-07]
// PR5: fila REAL — tela Defesa lê defesa_casos sob RLS; Aprovar/
// Editar/Descartar atualizam o caso (auditoria preservada, sem DELETE).
// Radar segue com DADOS DE EXEMPLO até PR6.
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
      <div className={`d${neg ? ' neg' : ''}${mut ? ' mut' : ''}`}>{d || ' '}</div>
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
        <Kpi l="R$ defendido no mês" v={kpis ? fmtBRL(kpis.defendidoCentavos) : '…'} d="casos ganhos" />
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

function Defesa({ tenantDbId, userId }) {
  const [casos, setCasos] = useState(null);
  const [erro, setErro] = useState(null);
  const [editando, setEditando] = useState(null);   // id do caso em edição
  const [textoEdit, setTextoEdit] = useState('');
  const [agindo, setAgindo] = useState(null);        // id do caso com ação em curso

  const carregar = useCallback(async () => {
    if (!tenantDbId) return;
    const { data, error } = await supabase
      .from('defesa_casos')
      .select('id, tipo, canal, pedido_ref, valor_centavos, motivo, analise, draft_resposta, status, created_at')
      .eq('tenant_id', tenantDbId)
      .eq('status', 'aguardando_ok')
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) { setErro(error.message); return; }
    setCasos(data ?? []);
  }, [tenantDbId]);

  useEffect(() => { carregar(); }, [carregar]);

  async function mudarStatus(caso, novoStatus, extras = {}) {
    setAgindo(caso.id);
    const { error } = await supabase
      .from('defesa_casos')
      .update({ status: novoStatus, updated_at: new Date().toISOString(), ...extras })
      .eq('id', caso.id);
    setAgindo(null);
    if (error) { setErro(error.message); return; }
    setCasos(cs => cs.filter(c => c.id !== caso.id));
  }

  const aprovar = (caso) => mudarStatus(caso, 'aprovado', { aprovado_por: userId ?? null, aprovado_em: new Date().toISOString() });
  const descartar = (caso) => mudarStatus(caso, 'descartado');

  async function salvarEdicao(caso) {
    setAgindo(caso.id);
    const { error } = await supabase
      .from('defesa_casos')
      .update({ draft_resposta: textoEdit, updated_at: new Date().toISOString() })
      .eq('id', caso.id);
    setAgindo(null);
    if (error) { setErro(error.message); return; }
    setCasos(cs => cs.map(c => c.id === caso.id ? { ...c, draft_resposta: textoEdit } : c));
    setEditando(null);
  }

  return (
    <div>
      <h1>Defesa Comercial <span className="cv2-mock" style={{ background: 'var(--green-soft)', color: 'var(--green)' }}>FILA REAL</span></h1>
      <div className="cv2-rule" />
      <div className="cv2-sub">Casos preparados pelo agente — revise e dê o OK. Nada é enviado sem a sua aprovação.{erro ? ` · erro: ${erro}` : ''}</div>
      <div className="cv2-kpis">
        <Kpi l="Aguardando seu OK" v={casos ? casos.length : '…'} d="nesta fila" neg={casos ? casos.length > 0 : false} />
      </div>
      {casos && casos.map(c => {
        const an = c.analise || {};
        const emEdicao = editando === c.id;
        return (
          <div key={c.id} className="cv2-caso">
            <div className="cv2-spread">
              <div style={{ minWidth: 0 }}>
                <span className={`cv2-bdg ${c.tipo === 'cancelamento' ? 'err' : 'warn'}`}>{c.tipo === 'cancelamento' ? `cancelamento · ${fmtBRL(c.valor_centavos)}` : 'avaliação'}</span>
                {an.chance_vitoria && <span className={`cv2-bdg ${an.chance_vitoria === 'alta' ? 'ok' : an.chance_vitoria === 'media' ? 'warn' : 'mut'}`} style={{ marginLeft: 6 }}>chance {an.chance_vitoria}</span>}
                <b style={{ marginLeft: 8, fontSize: 13 }}>{an.loja_nome || c.pedido_ref || c.canal}</b>
                <div style={{ color: 'var(--tx2)', fontSize: 12, marginTop: 3 }}>{c.motivo}</div>
                {Array.isArray(an.fundamentos) && an.fundamentos.length > 0 && (
                  <div style={{ color: 'var(--tx2)', fontSize: 11.5, marginTop: 4 }}><b>Fundamentos:</b> {an.fundamentos.join(' · ')}</div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                <button className="cv2-btn" disabled={agindo === c.id} onClick={() => aprovar(c)}>Aprovar</button>
                <button className="cv2-btn sec" disabled={agindo === c.id} onClick={() => { setEditando(emEdicao ? null : c.id); setTextoEdit(c.draft_resposta || ''); }}>{emEdicao ? 'Cancelar' : 'Editar'}</button>
                <button className="cv2-btn danger" disabled={agindo === c.id} onClick={() => descartar(c)}>Descartar</button>
              </div>
            </div>
            {emEdicao ? (
              <div style={{ marginTop: 8 }}>
                <textarea
                  value={textoEdit}
                  onChange={e => setTextoEdit(e.target.value)}
                  rows={8}
                  style={{ width: '100%', fontFamily: 'inherit', fontSize: 12.5, padding: 10, border: '1px solid var(--line)', borderRadius: 4, resize: 'vertical' }}
                />
                <div style={{ marginTop: 8 }}>
                  <button className="cv2-btn" disabled={agindo === c.id} onClick={() => salvarEdicao(c)}>Salvar texto</button>
                </div>
              </div>
            ) : (
              <div className="draft" style={{ whiteSpace: 'pre-wrap' }}>{c.draft_resposta}</div>
            )}
          </div>
        );
      })}
      {casos && !casos.length && <div className="cv2-card" style={{ textAlign: 'center', color: 'var(--tx2)' }}>Fila limpa — nenhum caso esperando você.</div>}
      {!casos && !erro && <div className="cv2-card" style={{ textAlign: 'center', color: 'var(--tx2)' }}>Carregando fila…</div>}
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
          {tela === 'visao' && <VisaoGeral tenantNome={tenantNome} tenantDbId={tenantDbId} onIrDefesa={() => setTela('defesa')} />}
          {tela === 'defesa' && <Defesa tenantDbId={tenantDbId} userId={userId} />}
          {tela === 'radar' && <Radar tenantNome={tenantNome} />}
        </div>
      </div>
    </div>
  );
}
