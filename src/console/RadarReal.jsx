import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase.js';
import { lerMetricas } from '../lib/radar-metricas.js';
import { lerSeries, agregar } from '../lib/radar-series.js';
import { listTarefasIA, aprovarTarefa, rejeitarTarefa } from '../lib/api.js';

// ============================================================
// Console v2 — PR12b: Radar REAL (iFood: Dashboard loja-por-loja)
// Cruza as métricas importadas (radar_metricas, via planilhas iFood)
// com os casos da Defesa (defesa_casos) e monta o diagnóstico.
// Seletor de loja no topo: cada loja é analisada isolada — os
// dados de uma loja nunca se misturam com os de outra (loja_id).
// Sem dados ainda → chama o usuário para Importar relatórios.
// ============================================================

const fmtBRL = n => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtNum = n => Number(n || 0).toLocaleString('pt-BR');

const SEM_LOJA = '__none__'; // fonte sem loja vinculada (loja_id null)

// ---- Fase 6: Ações recomendadas (rascunhos de tarefa) ----
// Espelham os CHECK de tarefas_loja (status/prioridade). cls → badge cv2-bdg.
const STATUS_LABEL = {
  rascunho: 'Rascunho', aguardando_envio: 'Aguardando envio', aguardando_aprovacao: 'Aguardando aprovação',
  aprovada: 'Aprovada', rejeitada: 'Rejeitada', em_execucao: 'Em execução',
  aguardando_validacao: 'Aguardando validação', concluida: 'Concluída', cancelada: 'Cancelada',
};
const STATUS_CLS = {
  rascunho: 'mut', aguardando_envio: 'warn', aguardando_aprovacao: 'warn',
  aprovada: 'ok', rejeitada: 'err', em_execucao: 'ok',
  aguardando_validacao: 'warn', concluida: 'ok', cancelada: 'mut',
};
const PRIO_LABEL = { quick_win: 'Quick win', estrutural: 'Estrutural', material_cliente: 'Material' };

// ---- Fase 4: filtro temporal universal (data_ref) ----
// data_ref é o fim do período de cada relatório. Os relatórios do iFood
// (Vendas/Cardápio/Conciliação) vêm já agregados por período — não há grão
// diário a recuperar neles (anti-padrão P1: não fabricar dado). O filtro
// recorta QUAL snapshot mostrar pela data de referência. Série diária de
// verdade (Operação/Cancelamentos) é a Fase 5.
const JANELAS = [
  { key: 'tudo', label: 'Tudo' },
  { key: 'dia', label: 'Dia' },
  { key: 'semana', label: 'Semana' },
  { key: 'mes', label: 'Mês' },
  { key: 'custom', label: 'Personalizado' },
];

const ymd = d => {
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mo}-${da}`;
};

// Converte a janela escolhida em {inicio, fim} (strings 'YYYY-MM-DD') p/ o helper.
// 'tudo' (e 'custom' sem datas) → undefined = comportamento legado (snapshot mais recente).
function calcPeriodo(janela, ini, fim) {
  const desde = n => { const d = new Date(); d.setDate(d.getDate() - n); return ymd(d); };
  const hoje = ymd(new Date());
  switch (janela) {
    case 'dia': return { inicio: hoje, fim: hoje };
    case 'semana': return { inicio: desde(6), fim: hoje };
    case 'mes': return { inicio: desde(29), fim: hoje };
    case 'custom':
      if (!ini && !fim) return undefined;
      return { inicio: ini || undefined, fim: fim || undefined };
    default: return undefined; // 'tudo'
  }
}

const fmtData = s => {
  if (!s) return '';
  const [y, mo, d] = String(s).slice(0, 10).split('-');
  return `${d}/${mo}/${y}`;
};

const dateInputStyle = { padding: '6px 9px', border: '1px solid var(--line)', borderRadius: 4, fontFamily: 'inherit', fontSize: 12.5, background: '#fff', color: 'var(--ink)' };

function Kpi({ l, v, d, neg, mut }) {
  return (
    <div className="cv2-kpi">
      <div className="l">{l}</div>
      <div className="v">{v}</div>
      <div className={`d${neg ? ' neg' : ''}${mut ? ' mut' : ''}`}>{d || ' '}</div>
    </div>
  );
}

// ---- Fase 5: série diária de verdade (radar_series) ----
// As 6 métricas que o parser persiste com grão diário (Operação é o único
// relatório do iFood com coluna-por-dia). Os nomes ESPELHAM os de processar-fontes.ts
// (pushSerie). `neg` = pior quando sobe (pinta vermelho); `tipo` define o formato.
const SERIE_METRICAS = [
  { key: 'operacao_pedidos_totais', label: 'Pedidos', tipo: 'num', neg: false },
  { key: 'operacao_atrasados_5min', label: 'Atrasos >5min', tipo: 'num', neg: true },
  { key: 'operacao_cancelamentos_super_qtd', label: 'Cancelam. Super', tipo: 'num', neg: true },
  { key: 'operacao_avaliacoes_qtd', label: 'Avaliações', tipo: 'num', neg: false },
  { key: 'operacao_chamados', label: 'Chamados', tipo: 'num', neg: true },
  { key: 'operacao_valor_cancelado', label: 'R$ cancelado', tipo: 'brl', neg: true },
];

const GRAOS = [
  { key: 'dia', label: 'Dia' },
  { key: 'semana', label: 'Semana' },
  { key: 'mes', label: 'Mês' },
];

// número compacto p/ o rótulo em cima da barra (1.2k, 340)
const fmtCurto = n => {
  const v = Number(n) || 0;
  if (Math.abs(v) >= 1000) return `${(v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}k`;
  return v.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
};

// chave do bucket (de agregar) → rótulo curto do eixo X
const rotuloChave = (chave, grao) => {
  const p = String(chave).split('-');
  if (grao === 'mes') return `${p[1]}/${p[0].slice(2)}`;   // 'YYYY-MM'    → 'MM/AA'
  return `${p[2]}/${p[1]}`;                                // 'YYYY-MM-DD' → 'DD/MM'
};

// Gráfico de barras CSS da série diária (Fase 5). Recebe TODAS as linhas das 6
// métricas de Operação já lidas; filtra pela métrica escolhida e agrega no grão
// escolhido (dia/semana/mês) via radar-series.js. Sem dependência externa — o
// guard `serie.length > 0` no chamador garante que "Vendas continua sem série".
function SerieDiaria({ serie }) {
  const [metricaSel, setMetricaSel] = useState(SERIE_METRICAS[0].key);
  const [grao, setGrao] = useState('dia');

  const meta = SERIE_METRICAS.find(s => s.key === metricaSel) || SERIE_METRICAS[0];
  const dados = agregar(serie.filter(r => r.metrica === metricaSel), grao);
  const max = dados.reduce((mx, d) => Math.max(mx, d.valor), 0);
  const total = dados.reduce((s, d) => s + d.valor, 0);
  const fmtV = meta.tipo === 'brl' ? fmtBRL : fmtNum;
  const cor = meta.neg ? 'var(--red)' : 'var(--green)';
  const step = Math.max(1, Math.ceil(dados.length / 12)); // afina rótulos do eixo X
  const mostraValor = dados.length > 0 && dados.length <= 14;
  const gap = dados.length > 40 ? 1 : 3;

  return (
    <div className="cv2-card">
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <h3 style={{ margin: 0 }}>Evolução diária — operação</h3>
        <span style={{ fontSize: 12, color: 'var(--tx2)' }}>Total no período: <b style={{ color: 'var(--ink)' }}>{fmtV(total)}</b></span>
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--tx2)', margin: '4px 0 12px', lineHeight: 1.6 }}>
        Série dia-a-dia extraída do relatório de Operação — o único do iFood com grão diário. Semana e mês somam os dias.
      </div>

      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
        {SERIE_METRICAS.map(s => (
          <button key={s.key} type="button" className={`cv2-btn${metricaSel === s.key ? '' : ' sec'}`} style={{ padding: '5px 10px', fontSize: 12 }} onClick={() => setMetricaSel(s.key)}>{s.label}</button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 14 }}>
        {GRAOS.map(g => (
          <button key={g.key} type="button" className={`cv2-btn${grao === g.key ? '' : ' sec'}`} style={{ padding: '5px 10px', fontSize: 12 }} onClick={() => setGrao(g.key)}>{g.label}</button>
        ))}
      </div>

      {dados.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--tx2)' }}>Sem série para esta métrica no período selecionado.</div>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap, height: 170 }}>
            {dados.map(d => (
              <div key={d.chave} title={`${rotuloChave(d.chave, grao)}: ${fmtV(d.valor)}`} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%', minWidth: 0 }}>
                {mostraValor && <span style={{ fontSize: 9.5, color: 'var(--tx2)', marginBottom: 2, whiteSpace: 'nowrap' }}>{d.valor ? fmtCurto(d.valor) : ''}</span>}
                <div style={{ width: '100%', height: `${max > 0 ? Math.max((d.valor / max) * 100, d.valor > 0 ? 2 : 0) : 0}%`, background: cor, borderRadius: '3px 3px 0 0', minHeight: d.valor > 0 ? 2 : 0 }} />
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap, marginTop: 5 }}>
            {dados.map((d, i) => (
              <div key={d.chave} style={{ flex: 1, textAlign: 'center', fontSize: 9.5, color: 'var(--tx2)', whiteSpace: 'nowrap', overflow: 'hidden' }}>{i % step === 0 ? rotuloChave(d.chave, grao) : ''}</div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default function RadarReal({ tenantNome, tenantDbId }) {
  const [lojas, setLojas] = useState(null);  // [{id, nome}] — lojas com relatório processado no Radar
  const [lojaId, setLojaId] = useState('');  // loja selecionada (uuid ou SEM_LOJA)
  const [m, setM] = useState(null);          // mapa metrica -> {valor, valor_texto, metadata, periodo}
  const [casos, setCasos] = useState({ total: 0, atraso: 0, defendidoCentavos: 0 });
  const [serie, setSerie] = useState([]);    // linhas de radar_series (Fase 5) — série diária de Operação
  const [erro, setErro] = useState(null);
  const [janela, setJanela] = useState('tudo');   // janela temporal: tudo|dia|semana|mes|custom
  const [customIni, setCustomIni] = useState('');  // 'YYYY-MM-DD' (date input)
  const [customFim, setCustomFim] = useState('');
  const [tarefas, setTarefas] = useState([]);      // Fase 6: tarefas IA (rascunhos + acompanhamento) da loja
  const [acao, setAcao] = useState(null);          // id da tarefa em processamento (aprovar/rejeitar)

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
      const periodo = calcPeriodo(janela, customIni, customFim);
      const porLoja = q => (lojaId === SEM_LOJA ? q.is('loja_id', null) : q.eq('loja_id', lojaId));
      const [mapa, { data: casosRows, error: e3 }, serieRows, { count: cTotal, error: eCt }, { count: cAtraso, error: eCa }] = await Promise.all([
        lerMetricas(supabase, {
          tenantId: tenantDbId,
          lojaId: lojaId === SEM_LOJA ? null : lojaId,
          periodo,
          select: 'metrica, valor, valor_texto, metadata, periodo_inicio, periodo_fim, data_ref, created_at',
        }),
        porLoja(supabase.from('defesa_casos')
          .select('motivo, status, resultado_valor_centavos')
          .eq('tenant_id', tenantDbId)).limit(500),
        // Série diária (Fase 5). Resiliente: uma falha aqui esconde só o gráfico,
        // não derruba o resto do dashboard. periodo recorta a janela; o grão
        // (dia/semana/mês) é re-agregado no cliente pelo próprio gráfico.
        lerSeries(supabase, {
          tenantId: tenantDbId,
          lojaId: lojaId === SEM_LOJA ? null : lojaId,
          metrica: SERIE_METRICAS.map(s => s.key),
          periodo,
        }).catch(() => []),
        // Counts reais de defesa_casos (sem o cap de 500) — para o KPI "R$
        // defendido (Defesa)" não sub-contar. 2 queries head:true paralelas:
        // total de casos + casos com motivo de atraso. Mesmo padrão de
        // ConsoleV2.jsx:251. Falha → mantém o último valor (não zera por erro
        // transitório). defendidoCentavos (soma de resultado_valor_centavos
        // onde status='ganho') continua do array capado — aggregação exigiria
        // RPC/SUM server-side, fora do escopo (dívida honesta).
        porLoja(supabase.from('defesa_casos').select('*', { count: 'exact', head: true })
          .eq('tenant_id', tenantDbId)),
        porLoja(supabase.from('defesa_casos').select('*', { count: 'exact', head: true })
          .eq('tenant_id', tenantDbId).ilike('motivo', '%atras%')),
      ]);
      if (e3) throw e3;
      setM(mapa);
      setSerie(serieRows ?? []);
      const cs = casosRows ?? [];
      const defendido = cs.filter(c => c.status === 'ganho').reduce((s, c) => s + (Number(c.resultado_valor_centavos) || 0), 0);
      // total/atraso: counts reais quando disponíveis (fallback do array capado
      // se a query de count falhou — sem flash de "0" no KPI).
      setCasos({
        total: !eCt ? (cTotal ?? 0) : cs.length,
        atraso: !eCa ? (cAtraso ?? 0) : cs.filter(c => /atras/i.test(c.motivo || '')).length,
        defendidoCentavos: defendido,
      });
    } catch (err) {
      setErro(err?.message || 'erro ao carregar');
    }
  }, [tenantDbId, lojaId, janela, customIni, customFim]);

  useEffect(() => { carregar(); }, [carregar]);

  // 3) Fase 6 — Ações recomendadas (tarefas geradas pela IA para esta loja).
  //    Resiliente: falha aqui esvazia a lista, não derruba o dashboard.
  const carregarTarefas = useCallback(async () => {
    if (!lojaId || lojaId === SEM_LOJA) { setTarefas([]); return; }
    try { setTarefas(await listTarefasIA(lojaId)); }
    catch { setTarefas([]); }
  }, [lojaId]);

  useEffect(() => { carregarTarefas(); }, [carregarTarefas]);

  const onAprovar = async (id) => {
    setAcao(id);
    try { await aprovarTarefa(id, lojaId); await carregarTarefas(); }
    catch (e) { setErro(e?.message || 'erro ao aprovar'); }
    finally { setAcao(null); }
  };
  const onRejeitar = async (id) => {
    setAcao(id);
    try { await rejeitarTarefa(id, lojaId); await carregarTarefas(); }
    catch (e) { setErro(e?.message || 'erro ao rejeitar'); }
    finally { setAcao(null); }
  };

  const val = k => (m && m[k] ? Number(m[k].valor) : null);
  const txt = k => (m && m[k] ? m[k].valor_texto : null);

  // carregando a lista de lojas
  if (lojas === null) return null;

  // tenant sem nenhum relatório processado no Radar
  if (lojas.length === 0) {
    return (
      <div>
        <h1>iFood: Dashboard <span className="cv2-mock">SEM DADOS AINDA</span></h1>
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

  // Estado do filtro temporal (Fase 4)
  const periodoAtivo = janela !== 'tudo' && !(janela === 'custom' && !customIni && !customFim);
  const semMetricas = m != null && Object.keys(m).length === 0;
  const dataRefMax = m
    ? Object.values(m).map(r => r.data_ref).filter(Boolean).sort().pop() || null
    : null;

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

  // Fase 6 — separa rascunhos (aguardam aprovação) do que já está em acompanhamento.
  const rascunhos = tarefas.filter(t => t.status === 'rascunho');
  const acompanhamento = tarefas.filter(t => t.status !== 'rascunho');

  return (
    <div>
      <h1>iFood: Dashboard <span className="cv2-mock" style={{ background: 'var(--green-soft)', color: 'var(--green)' }}>DADOS REAIS</span></h1>
      <div className="cv2-rule" />

      <div className="cv2-card" style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
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

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--line)' }}>
          <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px', color: 'var(--tx2)' }}>Período</span>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {JANELAS.map(j => (
              <button
                key={j.key}
                type="button"
                className={`cv2-btn${janela === j.key ? '' : ' sec'}`}
                style={{ padding: '6px 11px' }}
                onClick={() => setJanela(j.key)}
              >{j.label}</button>
            ))}
          </div>
          {janela === 'custom' && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input type="date" value={customIni} max={customFim || undefined} onChange={e => setCustomIni(e.target.value)} style={dateInputStyle} aria-label="Data inicial" />
              <span style={{ fontSize: 12, color: 'var(--tx2)' }}>até</span>
              <input type="date" value={customFim} min={customIni || undefined} onChange={e => setCustomFim(e.target.value)} style={dateInputStyle} aria-label="Data final" />
            </span>
          )}
          {periodoAtivo && (
            <span style={{ fontSize: 11.5, color: 'var(--tx2)', flexBasis: '100%', lineHeight: 1.6 }}>
              O iFood entrega estes relatórios agregados por período — o filtro recorta pela data de referência (fim do período de cada relatório){dataRefMax ? `; mostrando dados até ${fmtData(dataRefMax)}` : ''}. A série diária de verdade (Operação, Cancelamentos) chega na próxima fase.
            </span>
          )}
        </div>
      </div>

      {periodoAtivo && semMetricas ? (
        <div className="cv2-card" style={{ maxWidth: 620 }}>
          <h3 style={{ margin: '0 0 8px' }}>Nenhum relatório do iFood nesta janela de período</h3>
          <div style={{ fontSize: 13, color: 'var(--tx2)', lineHeight: 1.7 }}>
            {lojaNome} não tem relatórios do iFood com data de referência dentro do período selecionado. Os relatórios do iFood são datados pelo fim do período de cada arquivo — amplie a janela de tempo ou volte para <strong>Tudo</strong> para ver o último diagnóstico disponível desta loja.
          </div>
        </div>
      ) : (
      <>
      <div className="cv2-sub">Diagnóstico de {lojaNome} a partir dos relatórios importados do iFood.{erro ? ` · erro: ${erro}` : ''}</div>
      <div className="cv2-kpis">
        <Kpi l="Faturamento (entrada)" v={entrada != null ? fmtBRL(entrada) : '—'} d={pedidos != null ? `${fmtNum(pedidos)} pedidos` : ''} />
        <Kpi l="Taxas iFood" v={taxas != null ? fmtBRL(Math.abs(taxas)) : '—'} d={pctTaxas != null ? `${pctTaxas}% do faturamento` : ''} neg />
        <Kpi l="Ticket médio" v={ticket != null ? fmtBRL(ticket) : '—'} d={melhorDia ? `melhor dia: ${melhorDia}` : ''} mut />
        <Kpi l="Conversão do cardápio" v={conv != null ? `${conv}%` : '—'} d={conv != null ? (conv < 25 ? 'abaixo do ideal' : 'saudável') : ''} neg={conv != null && conv < 25} />
        <Kpi l="Cancelamentos" v={cancQtd != null ? fmtNum(cancQtd) : '—'} d={cancMotivo ? `top: ${cancMotivo}` : ''} neg={cancQtd > 0} />
        <Kpi l="R$ defendido (Defesa)" v={fmtBRL(casos.defendidoCentavos / 100)} d={`${casos.total} casos · ${casos.atraso} por atraso · aprox. (500 recentes)`} mut />
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
          {serie.length > 0 && <SerieDiaria serie={serie} />}
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

      {tarefas.length > 0 && (
        <div className="cv2-card">
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <h3 style={{ margin: 0 }}>Ações recomendadas</h3>
            <span style={{ fontSize: 12, color: 'var(--tx2)' }}>{rascunhos.length > 0 ? `${rascunhos.length} aguardando sua aprovação` : 'nenhum rascunho pendente'}</span>
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--tx2)', margin: '4px 0 12px', lineHeight: 1.6 }}>O diagnóstico semanal gera estes rascunhos a partir dos sinais reais da loja. Nada vira tarefa sem a sua aprovação.</div>
          {rascunhos.map(t => (
            <div key={t.id} style={{ border: '1px solid var(--line)', borderRadius: 6, padding: '12px 14px', marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                <span className={`cv2-bdg ${STATUS_CLS[t.status] || 'mut'}`}>{STATUS_LABEL[t.status] || t.status}</span>
                <span className="cv2-bdg mut">{PRIO_LABEL[t.prioridade] || t.prioridade}</span>
                <b style={{ fontSize: 13.5 }}>{t.titulo}</b>
              </div>
              {t.situacao && <div style={{ fontSize: 12.5, color: 'var(--tx2)', lineHeight: 1.6, marginBottom: 4 }}>{t.situacao}</div>}
              {t.o_que_sera_feito && <div style={{ fontSize: 12.5, lineHeight: 1.6, marginBottom: 4 }}><b>O que será feito:</b> {t.o_que_sera_feito}</div>}
              {t.por_que_importa && <div style={{ fontSize: 11.5, color: 'var(--tx2)', lineHeight: 1.6, marginBottom: 10 }}>{t.por_que_importa}</div>}
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="cv2-btn" style={{ padding: '6px 14px' }} disabled={acao === t.id} onClick={() => onAprovar(t.id)}>{acao === t.id ? '…' : 'Aprovar'}</button>
                <button type="button" className="cv2-btn sec" style={{ padding: '6px 14px' }} disabled={acao === t.id} onClick={() => onRejeitar(t.id)}>Rejeitar</button>
              </div>
            </div>
          ))}
          {acompanhamento.length > 0 && (
            <>
              <div className="cv2-sub" style={{ marginTop: rascunhos.length ? 14 : 0 }}>Acompanhamento</div>
              <div className="cv2-tbl-wrap">
                <table>
                  <thead><tr><th>Tarefa</th><th>Prioridade</th><th>Status</th></tr></thead>
                  <tbody>
                    {acompanhamento.map(t => (
                      <tr key={t.id}><td>{t.titulo}</td><td>{PRIO_LABEL[t.prioridade] || t.prioridade}</td><td><span className={`cv2-bdg ${STATUS_CLS[t.status] || 'mut'}`}>{STATUS_LABEL[t.status] || t.status}</span></td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
      </>
      )}
    </div>
  );
}
