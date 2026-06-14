import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase.js';
import { lerMetricas } from '../lib/radar-metricas.js';

// ============================================================
// Console v2 — PR12b: Radar REAL (Dashboard iFood loja-por-loja)
// Cruza as métricas importadas (radar_metricas, via planilhas iFood)
// com os casos da Defesa (defesa_casos) e monta o diagnóstico.
// Seletor de loja no topo: cada loja é analisada isolada — os
// dados de uma loja nunca se misturam com os de outra (loja_id).
// Sem dados ainda → chama o usuário para Importar relatórios.
// ============================================================

const fmtBRL = n => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtNum = n => Number(n || 0).toLocaleString('pt-BR');

const SEM_LOJA = '__none__'; // fonte sem loja vinculada (loja_id null)

function Kpi({ l, v, d, neg, mut }) {
  return (
    <div className="cv2-kpi">
      <div className="l">{l}</div>
      <div className="v">{v}</div>
      <div className={`d${neg ? ' neg' : ''}${mut ? ' mut' : ''}`}>{d || ' '}</div>
    </div>
  );
}

export default function RadarReal({ tenantNome, tenantDbId }) {
  const [lojas, setLojas] = useState(null);  // [{id, nome}] — lojas com relatório processado no Radar
  const [lojaId, setLojaId] = useState('');  // loja selecionada (uuid ou SEM_LOJA)
  const [m, setM] = useState(null);          // mapa metrica -> {valor, valor_texto, metadata, periodo}
  const [casos, setCasos] = useState({ total: 0, atraso: 0, defendidoCentavos: 0 });
  const [erro, setErro] = useState(null);

  // 1) Lojas que TÊM relatório processado no Radar (a dimensão real de análise).
  //    Não filtra por is_consultoria_ativa: o vínculo aqui é "tem fonte no Radar",
  //    e a flag de consultoria está despopulada em prod (esconderia a única loja com dados).
  useEffect(() => {
    if (!tenantDbId) return;
    let vivo = true;
    (async () => {
      const { data, error } = await supabase.from('radar_fontes')
        .select('loja_id, loja:lojas(nome)')
        .eq('tenant_id', tenantDbId).eq('status', 'processado');
      if (!vivo) return;
      if (error) { setErro(error.message); setLojas([]); return; }
      const mapa = new Map();
      for (const f of data ?? []) {
        const id = f.loja_id ?? SEM_LOJA;
        if (!mapa.has(id)) mapa.set(id, { id, nome: f.loja?.nome ?? 'Sem loja vinculada' });
      }
      const lista = [...mapa.values()].sort((a, b) =>
        a.id === SEM_LOJA ? 1 : b.id === SEM_LOJA ? -1 : a.nome.localeCompare(b.nome, 'pt-BR'));
      setLojas(lista);
      // mantém a seleção se ainda válida; senão cai na primeira loja com dados
      setLojaId(prev => (lista.some(l => l.id === prev) ? prev : (lista[0]?.id ?? '')));
    })();
    return () => { vivo = false; };
  }, [tenantDbId]);

  // 2) Métricas/casos da LOJA selecionada — isolados por loja_id.
  const carregar = useCallback(async () => {
    if (!tenantDbId || !lojaId) return;
    try {
      const porLoja = q => (lojaId === SEM_LOJA ? q.is('loja_id', null) : q.eq('loja_id', lojaId));
      const [mapa, { data: casosRows, error: e3 }] = await Promise.all([
        lerMetricas(supabase, {
          tenantId: tenantDbId,
          lojaId: lojaId === SEM_LOJA ? null : lojaId,
          select: 'metrica, valor, valor_texto, metadata, periodo_inicio, periodo_fim, created_at',
        }),
        porLoja(supabase.from('defesa_casos')
          .select('motivo, status, resultado_valor_centavos')
          .eq('tenant_id', tenantDbId)).limit(500),
      ]);
      if (e3) throw e3;
      setM(mapa);
      const cs = casosRows ?? [];
      const atraso = cs.filter(c => /atras/i.test(c.motivo || '')).length;
      const defendido = cs.filter(c => c.status === 'ganho').reduce((s, c) => s + (Number(c.resultado_valor_centavos) || 0), 0);
      setCasos({ total: cs.length, atraso, defendidoCentavos: defendido });
    } catch (err) {
      setErro(err?.message || 'erro ao carregar');
    }
  }, [tenantDbId, lojaId]);

  useEffect(() => { carregar(); }, [carregar]);

  const val = k => (m && m[k] ? Number(m[k].valor) : null);
  const txt = k => (m && m[k] ? m[k].valor_texto : null);

  // carregando a lista de lojas
  if (lojas === null) return null;

  // tenant sem nenhum relatório processado no Radar
  if (lojas.length === 0) {
    return (
      <div>
        <h1>Dashboard iFood <span className="cv2-mock">SEM DADOS AINDA</span></h1>
        <div className="cv2-rule" />
        <div className="cv2-card" style={{ maxWidth: 620 }}>
          <h3>O Dashboard precisa dos seus relatórios do iFood</h3>
          <div style={{ fontSize: 13, color: 'var(--tx2)', lineHeight: 1.9 }}>
            Baixe os relatórios no Portal do Parceiro (Vendas, Cancelamentos, Cardápio, Conciliação…) e envie em <b>Dados › Importar relatórios</b>. Em minutos o Dashboard monta o diagnóstico desta loja — quanto entra, quanto o iFood retém e onde está vazando dinheiro.
          </div>
        </div>
      </div>
    );
  }

  const lojaNome = lojas.find(l => l.id === lojaId)?.nome ?? tenantNome;

  const taxas = val('conciliacao_taxas');
  const entrada = val('conciliacao_entrada') ?? val('vendas_valor_total');
  const subsidios = val('conciliacao_subsidios');
  const pedidos = val('vendas_total_pedidos');
  const ticket = val('vendas_ticket_medio');
  const conv = val('funil_conversao_pct');
  const visitas = val('funil_visitas');
  const cancQtd = val('cancelamentos_qtd');
  const cancMotivo = txt('cancelamentos_motivo_top');
  const itemTop = txt('cardapio_item_top_valor');
  const melhorDia = txt('vendas_melhor_dia');
  const pctTaxas = (taxas != null && entrada) ? Math.round((Math.abs(taxas) / Math.abs(entrada)) * 100) : null;

  // Qualidade da operação (relatório Super) — só aparece se a loja tiver esse relatório
  const opNivel = txt('operacao_nivel_super');
  const opProjecao = m?.operacao_nivel_super?.metadata?.projecao || null;
  const opAtrasoPct = val('operacao_atrasados_5min_pct');
  const opPreparo = val('operacao_tempo_preparo_medio');
  const opOnline = val('operacao_tempo_online_pct');
  const opAval = val('operacao_avaliacao_media');
  const opAvalQtd = val('operacao_avaliacoes_qtd');
  const opCancSuper = val('operacao_cancelamento_super_pct');
  const opPedidos = val('operacao_pedidos_totais');
  const temOperacao = opNivel != null || opPedidos != null;

  // ---- Fase 3: cruzamentos calculados no cliente (cada KPI some se faltar a fonte, nunca zera) ----
  const repasseLiquido = val('conciliacao_repasse_liquido')
    ?? (entrada != null && taxas != null ? entrada - Math.abs(taxas) - Math.abs(subsidios ?? 0) : null);
  const cargaPct = (entrada && taxas != null)
    ? Math.round(((Math.abs(taxas) + Math.abs(subsidios || 0)) / Math.abs(entrada)) * 100)
    : null;
  const pedidosBase = pedidos ?? opPedidos ?? val('logistica_pedidos');
  const cancPct = (cancQtd != null && pedidosBase)
    ? Math.round((cancQtd / pedidosBase) * 1000) / 10
    : null;
  const cancContest = val('cancelamentos_contestaveis_qtd');
  const valorCancelado = val('operacao_valor_cancelado');
  const concluidos = val('funil_concluidos');
  const visitasNaoConv = (visitas != null && concluidos != null && concluidos <= visitas) ? visitas - concluidos : null;
  const PISO_SUPER = 4.5;
  const gapSuper = opAval != null ? Math.round((opAval - PISO_SUPER) * 100) / 100 : null;
  const negQtd = val('negociacoes_qtd');
  const negPerda = val('negociacoes_perda_parcial');
  const opChamados = val('operacao_chamados');

  const cruzamentos = [
    repasseLiquido != null && { l: 'Receita líquida', v: fmtBRL(repasseLiquido), d: 'o que sobra após taxas e promoções', mut: true },
    cargaPct != null && { l: 'Carga total iFood', v: `${cargaPct}%`, d: 'taxas + promoções sobre o faturamento', neg: cargaPct > 40 },
    cancPct != null && { l: 'Taxa de cancelamento', v: `${cancPct.toLocaleString('pt-BR')}%`, d: `${fmtNum(cancQtd)} de ${fmtNum(pedidosBase)} pedidos`, neg: cancPct > 2 },
    valorCancelado != null && { l: 'R$ perdido em cancelam.', v: fmtBRL(valorCancelado), d: 'valor dos pedidos cancelados', neg: valorCancelado > 0 },
    visitasNaoConv != null && { l: 'Visitas não convertidas', v: fmtNum(visitasNaoConv), d: visitas ? `${Math.round((visitasNaoConv / visitas) * 100)}% das visitas` : 'não viraram pedido', neg: conv != null && conv < 25 },
    gapSuper != null && { l: 'Avaliação vs piso Super', v: opAval.toLocaleString('pt-BR'), d: gapSuper >= 0 ? `+${gapSuper.toLocaleString('pt-BR')} acima do piso 4,5` : `${gapSuper.toLocaleString('pt-BR')} abaixo do piso 4,5`, neg: gapSuper < 0 },
    negQtd != null && { l: 'Negociações', v: fmtNum(negQtd), d: negPerda != null ? `perda parcial ${fmtBRL(negPerda)}` : 'no período', mut: true },
  ].filter(Boolean);

  const sinais = [];
  if (taxas != null) sinais.push({ sinal: `Taxas e comissões do iFood no período`, impacto: fmtBRL(Math.abs(taxas)), cls: 'err', acao: pctTaxas != null ? `${pctTaxas}% do faturamento — revisar plano e logística` : 'revisar plano e logística' });
  if (cancQtd != null && cancQtd > 0) sinais.push({ sinal: `${fmtNum(cancQtd)} cancelamentos — motivo top: ${cancMotivo || 'n/d'}${cancContest != null ? ` · ${fmtNum(cancContest)} contestáveis` : ''}`, impacto: /atras/i.test(cancMotivo || '') ? 'contestável' : 'analisar', cls: /atras/i.test(cancMotivo || '') ? 'warn' : 'mut', acao: valorCancelado != null ? `${fmtBRL(valorCancelado)} em jogo — a Defesa contesta` : 'a Defesa prepara a contestação' });
  if (conv != null) sinais.push({ sinal: `Conversão do cardápio: ${conv}% (${fmtNum(visitas)} visitas)`, impacto: conv < 25 ? 'baixa' : 'ok', cls: conv < 25 ? 'warn' : 'ok', acao: conv < 25 ? 'fotos/descrições e ofertas no cardápio' : 'manter' });
  if (subsidios != null && Math.abs(subsidios) > 0) sinais.push({ sinal: 'Promoções custeadas pela loja', impacto: fmtBRL(Math.abs(subsidios)), cls: 'warn', acao: 'avaliar retorno das ofertas' });
  if (opAtrasoPct != null && opAtrasoPct > 5) sinais.push({ sinal: `${opAtrasoPct}% dos pedidos atrasaram +5 min`, impacto: 'pontualidade', cls: 'warn', acao: 'revisar tempo de preparo e horário de aceite' });
  if (opOnline != null && opOnline < 90) sinais.push({ sinal: `Loja online ${opOnline}% do planejado (meta 90%)`, impacto: 'disponibilidade', cls: 'warn', acao: 'reduzir pausas/fechamentos no pico' });
  if (opCancSuper != null && opCancSuper > 1) sinais.push({ sinal: `Cancelamentos com impacto no Super: ${opCancSuper}%`, impacto: 'nível Super', cls: 'err', acao: 'meta ≤1% — atacar a causa dos cancelamentos' });
  if (opChamados != null && opChamados > 0) sinais.push({ sinal: `${fmtNum(opChamados)} chamados abertos no suporte iFood`, impacto: 'suporte', cls: 'mut', acao: 'acompanhar a resolução dos chamados' });

  return (
    <div>
      <h1>Dashboard iFood <span className="cv2-mock" style={{ background: 'var(--green-soft)', color: 'var(--green)' }}>DADOS REAIS</span></h1>
      <div className="cv2-rule" />

      <div className="cv2-card" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <label htmlFor="radar-loja" style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px', color: 'var(--tx2)' }}>Loja</label>
        <select
          id="radar-loja"
          value={lojaId}
          onChange={e => setLojaId(e.target.value)}
          style={{ padding: '8px 11px', border: '1px solid var(--line)', borderRadius: 4, fontFamily: 'inherit', fontSize: 13, background: '#fff', minWidth: 240 }}
        >
          {lojas.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
        </select>
        <span style={{ fontSize: 12, color: 'var(--tx2)' }}>
          {lojas.length} {lojas.length === 1 ? 'loja com relatórios' : 'lojas com relatórios'} — analisando uma por vez
        </span>
      </div>

      <div className="cv2-sub">Diagnóstico de {lojaNome} a partir dos relatórios importados do iFood.{erro ? ` · erro: ${erro}` : ''}</div>
      <div className="cv2-kpis">
        <Kpi l="Faturamento (entrada)" v={entrada != null ? fmtBRL(entrada) : '—'} d={pedidos != null ? `${fmtNum(pedidos)} pedidos` : ''} />
        <Kpi l="Taxas iFood" v={taxas != null ? fmtBRL(Math.abs(taxas)) : '—'} d={pctTaxas != null ? `${pctTaxas}% do faturamento` : ''} neg />
        <Kpi l="Ticket médio" v={ticket != null ? fmtBRL(ticket) : '—'} d={melhorDia ? `melhor dia: ${melhorDia}` : ''} mut />
        <Kpi l="Conversão do cardápio" v={conv != null ? `${conv}%` : '—'} d={conv != null ? (conv < 25 ? 'abaixo do ideal' : 'saudável') : ''} neg={conv != null && conv < 25} />
        <Kpi l="Cancelamentos" v={cancQtd != null ? fmtNum(cancQtd) : '—'} d={cancMotivo ? `top: ${cancMotivo}` : ''} neg={cancQtd > 0} />
        <Kpi l="R$ defendido (Defesa)" v={fmtBRL(casos.defendidoCentavos / 100)} d={`${casos.total} casos · ${casos.atraso} por atraso`} mut />
      </div>

      {cruzamentos.length > 0 && (
        <>
          <div className="cv2-sub" style={{ marginTop: 18 }}>Saúde financeira &amp; cruzamentos — calculados a partir dos relatórios desta loja</div>
          <div className="cv2-kpis">
            {cruzamentos.map((k) => <Kpi key={k.l} l={k.l} v={k.v} d={k.d} neg={k.neg} mut={k.mut} />)}
          </div>
        </>
      )}

      {temOperacao && (
        <>
          <div className="cv2-sub" style={{ marginTop: 18 }}>
            Qualidade da operação — relatório Super{opNivel ? ` · ${opNivel}` : ''}{opProjecao ? ` (projeção: ${opProjecao})` : ''}
          </div>
          <div className="cv2-kpis">
            <Kpi l="Nível Super" v={opNivel || '—'} d={opProjecao ? `projeção: ${opProjecao}` : ''} mut />
            <Kpi l="Atrasos >5 min" v={opAtrasoPct != null ? `${opAtrasoPct}%` : '—'} d={opPedidos != null ? `de ${fmtNum(opPedidos)} pedidos` : ''} neg={opAtrasoPct != null && opAtrasoPct > 5} />
            <Kpi l="Tempo de preparo" v={opPreparo != null ? `${opPreparo} min` : '—'} d="média do período" mut />
            <Kpi l="Tempo online" v={opOnline != null ? `${opOnline}%` : '—'} d="meta 90%" neg={opOnline != null && opOnline < 90} />
            <Kpi l="Avaliação média" v={opAval != null ? opAval.toLocaleString('pt-BR') : '—'} d={opAvalQtd != null ? `${fmtNum(opAvalQtd)} avaliações` : ''} mut />
            <Kpi l="Cancelam. Super" v={opCancSuper != null ? `${opCancSuper}%` : '—'} d="meta ≤1%" neg={opCancSuper != null && opCancSuper > 1} />
          </div>
        </>
      )}

      <div className="cv2-card">
        <h3>O que o Dashboard viu</h3>
        <div className="cv2-tbl-wrap">
        <table>
          <thead><tr><th>Sinal</th><th>Impacto</th><th>Ação sugerida</th></tr></thead>
          <tbody>
            {sinais.map((s, i) => (
              <tr key={i}><td>{s.sinal}</td><td><span className={`cv2-bdg ${s.cls}`}>{s.impacto}</span></td><td>{s.acao}</td></tr>
            ))}
            {itemTop && <tr><td>Item campeão de faturamento</td><td><span className="cv2-bdg ok">{itemTop}</span></td><td>destacar no topo do cardápio e em ofertas</td></tr>}
            {!sinais.length && <tr><td colSpan={3} style={{ textAlign: 'center', color: 'var(--tx2)' }}>Esta loja ainda não tem métricas — importe os relatórios dela em Dados › Importar relatórios.</td></tr>}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
}
