import { schedules, logger } from "@trigger.dev/sdk/v3";
import * as XLSX from "xlsx";
import { getSupabase } from "../_shared/supabase";
import { getAnthropic } from "../_shared/claude";
import { notify } from "../_shared/notify";
import { calcularCustoUsd } from "../_shared/pricing";

// =====================================================
// RADAR — processa fontes (relatórios iFood) — PR12a
// Cron 5min: radar_fontes pendentes → baixa do bucket 'radar' →
//  planilha: detecta tipo pelo CABEÇALHO REAL (assinaturas extraídas
//   das planilhas da Café Container, 2026-06-08) e normaliza métricas
//  print: visão Claude extrai métricas em JSON
// → grava radar_metricas + marca processado/erro (parar no 1º erro da fonte).
// =====================================================

type Linha = (string | number | null)[];

function sheetRows(wb: XLSX.WorkBook, nome: string): Linha[] {
  const ws = wb.Sheets[nome];
  if (!ws) return [];
  return XLSX.utils.sheet_to_json<Linha>(ws, { header: 1, raw: true, defval: null });
}

function parsePeriodo(p: unknown): { ini: string | null; fim: string | null } {
  const s = String(p ?? "");
  // 1) Formato estrito (Vendas/Cardápio): DD/MM/YYYY - DD/MM/YYYY. Mantido idêntico —
  //    casa primeiro e retorna, sem nunca cair no fallback abaixo (zero regressão).
  const m = s.match(/(\d{2})\/(\d{2})\/(\d{4})\s*-\s*(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return { ini: `${m[3]}-${m[2]}-${m[1]}`, fim: `${m[6]}-${m[5]}-${m[4]}` };
  // 2) Formato curto (Operação: "Diário (09/05 a 07/06)"): DD/MM[/YYYY] <sep> DD/MM[/YYYY],
  //    separador "a"/"à"/"até"/"-"/"–"/"—", ano possivelmente ausente. Ano ausente é
  //    INFERIDO da data de processamento (o relatório é processado logo após o upload,
  //    então o período é recente): o fim é o DD/MM mais recente <= hoje; o início recua
  //    1 ano só se cruzar a virada de ano. Nunca fabrica dado — só DD/MM presentes na fonte.
  const f = s.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?\s*(?:a|à|até|-|–|—)\s*(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?/i);
  if (!f) return { ini: null, fim: null };
  const hojeISO = new Date().toISOString().slice(0, 10);
  const iso = (ano: number, mm: string, dd: string) => `${ano}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  const refAno = Number(hojeISO.slice(0, 4));
  let anoFim = f[6] ? Number(f[6]) : refAno;
  if (!f[6] && iso(anoFim, f[5], f[4]) > hojeISO) anoFim -= 1; // fim no futuro → era ano passado
  const fim = iso(anoFim, f[5], f[4]);
  let anoIni = f[3] ? Number(f[3]) : anoFim;
  if (!f[3] && iso(anoIni, f[2], f[1]) > fim) anoIni -= 1; // início depois do fim → virada de ano
  return { ini: iso(anoIni, f[2], f[1]), fim };
}

const num = (v: unknown): number => { const n = Number(String(v ?? "").replace(",", ".")); return Number.isFinite(n) ? n : 0; };

// Falha alto: coluna obrigatória ausente vira erro explícito da fonte (status 'erro' +
// erro_detalhe), em vez de virar índice -1 e gravar 0/dados errados silenciosamente.
function reqCol(head: string[], pred: (h: string) => boolean, col: string, aba: string): number {
  const i = head.findIndex(pred);
  if (i < 0) throw new Error(`coluna "${col}" não encontrada na aba "${aba}"`);
  return i;
}

interface Metrica { metrica: string; valor?: number; valor_texto?: string; metadata?: Record<string, unknown> }
interface SeriePonto { metrica: string; dia: string; valor: number }

// Mapeia cada coluna-dia "dd/mm" (header da Operação) para data ISO YYYY-MM-DD,
// ancorando no período REAL do relatório [ini, fim]. Para cada "dd/mm" escolhe o
// ANO (entre o de ini e o de fim) cujo ISO cai DENTRO do intervalo — robusto à
// ORDEM das colunas e à virada de ano (dez→jan), sem depender de monotonia.
// Coluna fora do intervalo → null: não persiste (anti-padrão P1, não adivinha o dia).
// Sem período datável (ini OU fim ausente) → tudo null (sem âncora confiável).
function diasDaSerie(headersDia: string[], periodo: { ini: string | null; fim: string | null }): (string | null)[] {
  const { ini, fim } = periodo;
  if (!ini || !fim) return headersDia.map(() => null);
  const anoIni = Number(ini.slice(0, 4));
  const anoFim = Number(fim.slice(0, 4));
  return headersDia.map(h => {
    const m = String(h ?? "").trim().match(/^(\d{2})\/(\d{2})$/);
    if (!m) return null;
    const [, dd, mm] = m;
    for (let ano = anoIni; ano <= anoFim; ano++) {
      const iso = `${ano}-${mm}-${dd}`;
      if (iso >= ini && iso <= fim) return iso; // ancora dentro do período do relatório
    }
    return null; // nenhum ano cai no intervalo → não persiste (não adivinha)
  });
}

function detectarEExtrair(wb: XLSX.WorkBook): { tipo: string; periodo: { ini: string | null; fim: string | null }; metricas: Metrica[]; series?: SeriePonto[]; resumo: Record<string, unknown> } {
  const abas = wb.SheetNames;
  const out: Metrica[] = [];
  let periodo: { ini: string | null; fim: string | null } = { ini: null, fim: null };

  // ---- VENDAS (abas: Vendas / Horário com mais vendas / Formas de pagamento / Dias) ----
  if (abas.includes("Vendas")) {
    const rows = sheetRows(wb, "Vendas");
    const head = (rows[0] ?? []).map(String);
    const iPed = head.findIndex(h => h.startsWith("Total de vendas"));
    if (iPed > -1) {
      const iVal = reqCol(head, h => h.startsWith("Valor total de vendas"), "Valor total de vendas", "Vendas");
      periodo = parsePeriodo(rows[1]?.[0]);
      let pedidos = 0, valor = 0;
      for (const r of rows.slice(1)) { pedidos += num(r[iPed]); valor += num(r[iVal]); }
      out.push({ metrica: "vendas_total_pedidos", valor: pedidos });
      out.push({ metrica: "vendas_valor_total", valor: Math.round(valor * 100) / 100 });
      out.push({ metrica: "vendas_ticket_medio", valor: pedidos ? Math.round((valor / pedidos) * 100) / 100 : 0 });
      const dias = sheetRows(wb, "Dias com mais vendas").slice(1).filter(r => r[8]);
      if (dias.length) {
        const top = dias.reduce((a, b) => (num(b[9]) > num(a[9]) ? b : a));
        out.push({ metrica: "vendas_melhor_dia", valor: num(top[9]), valor_texto: String(top[8]) });
      }
      return { tipo: "vendas", periodo, metricas: out, resumo: { pedidos, valor } };
    }
  }

  // ---- CANCELAMENTOS ----
  if (abas.some(a => a.toLowerCase().includes("cancelamento"))) {
    const abaCanc = abas.find(a => a.toLowerCase().includes("cancelamento"))!;
    const rows = sheetRows(wb, abaCanc);
    const head = (rows[0] ?? []).map(String);
    const iMotivo = head.findIndex(h => h.startsWith("Motivo"));
    if (iMotivo > -1) {
      const iData = reqCol(head, h => h.startsWith("Data e hora"), "Data e hora", abaCanc);
      const dados = rows.slice(1).filter(r => r[iData]);
      const porMotivo: Record<string, number> = {};
      for (const r of dados) { const m = String(r[iMotivo] ?? "sem motivo"); porMotivo[m] = (porMotivo[m] ?? 0) + 1; }
      const datas = dados.map(r => String(r[iData]).slice(0, 10)).sort();
      periodo = { ini: datas[0] ?? null, fim: datas[datas.length - 1] ?? null };
      out.push({ metrica: "cancelamentos_qtd", valor: dados.length, metadata: { por_motivo: porMotivo } });
      // contestáveis pela Defesa: mesmo critério já usado no dashboard (RadarReal) e no diagnóstico semanal — motivo por atraso
      const motivosContestaveis = Object.entries(porMotivo).filter(([mtv]) => /atras/i.test(mtv));
      const contestaveis = motivosContestaveis.reduce((s, [, n]) => s + n, 0);
      out.push({ metrica: "cancelamentos_contestaveis_qtd", valor: contestaveis, metadata: { criterio: "motivo contém 'atraso'", motivos: Object.fromEntries(motivosContestaveis) } });
      const top = Object.entries(porMotivo).sort((a, b) => b[1] - a[1])[0];
      if (top) out.push({ metrica: "cancelamentos_motivo_top", valor: top[1], valor_texto: top[0] });
      return { tipo: "cancelamentos", periodo, metricas: out, resumo: { qtd: dados.length, por_motivo: porMotivo } };
    }
  }

  // ---- NEGOCIAÇÕES ----
  if (abas.some(a => a.toLowerCase().includes("negocia"))) {
    const abaNeg = abas.find(a => a.toLowerCase().includes("negocia"))!;
    const rows = sheetRows(wb, abaNeg);
    const head = (rows[0] ?? []).map(String);
    const iVal = reqCol(head, h => h.startsWith("Valor total do cancelament"), "Valor total do cancelamento", abaNeg);
    const dados = rows.slice(1).filter(r => r[5]);
    let perda = 0;
    for (const r of dados) perda += num(r[iVal]);
    out.push({ metrica: "negociacoes_qtd", valor: dados.length });
    out.push({ metrica: "negociacoes_perda_parcial", valor: Math.round(perda * 100) / 100 });
    return { tipo: "negociacoes", periodo, metricas: out, resumo: { qtd: dados.length, perda } };
  }

  // ---- CARDÁPIO (Funil Loja / Itens / Complementos) ----
  if (abas.includes("Funil Loja")) {
    const funil = sheetRows(wb, "Funil Loja");
    const head = (funil[0] ?? []).map(String);
    const d = funil[1] ?? [];
    periodo = parsePeriodo(d[0]);
    const iVis = reqCol(head, h => h === "Visitas", "Visitas", "Funil Loja");
    const iConc = reqCol(head, h => h === "Concluídos", "Concluídos", "Funil Loja");
    const visitas = num(d[iVis]), concluidos = num(d[iConc]);
    out.push({ metrica: "funil_visitas", valor: visitas });
    out.push({ metrica: "funil_concluidos", valor: concluidos });
    out.push({ metrica: "funil_conversao_pct", valor: visitas ? Math.round((concluidos / visitas) * 1000) / 10 : 0 });
    const itens = sheetRows(wb, "Itens").slice(1).filter(r => r[3]);
    if (itens.length) {
      const top = itens.reduce((a, b) => (num(b[10]) > num(a[10]) ? b : a));
      out.push({ metrica: "cardapio_item_top_valor", valor: Math.round(num(top[10]) * 100) / 100, valor_texto: String(top[3]) });
      out.push({ metrica: "cardapio_itens_qtd", valor: itens.length });
      // itens sem giro no período (faturamento 0 na col 10) — peso morto no cardápio
      out.push({ metrica: "cardapio_itens_sem_giro", valor: itens.filter(r => num(r[10]) === 0).length });
    }
    return { tipo: "cardapio", periodo, metricas: out, resumo: { visitas, concluidos } };
  }

  // ---- LOGÍSTICA ----
  {
    const primeira = sheetRows(wb, abas[0]);
    const head = (primeira[0] ?? []).map(String);
    if (head.includes("SERVIÇO LOGÍSTICO")) {
      const dados = primeira.slice(1).filter(r => r[3]);
      const iData = reqCol(head, h => h === "DATA E HORA DO PEDIDO", "DATA E HORA DO PEDIDO", abas[0]);
      const datas = dados.map(r => String(r[iData]).slice(0, 10)).sort();
      periodo = { ini: datas[0] ?? null, fim: datas[datas.length - 1] ?? null };
      const porTurno: Record<string, number> = {};
      const porServico: Record<string, number> = {};
      const iTurno = reqCol(head, h => h === "TURNO", "TURNO", abas[0]);
      const iServ = reqCol(head, h => h === "SERVIÇO LOGÍSTICO", "SERVIÇO LOGÍSTICO", abas[0]);
      for (const r of dados) {
        const t = String(r[iTurno] ?? "?"); porTurno[t] = (porTurno[t] ?? 0) + 1;
        const s = String(r[iServ] ?? "?"); porServico[s] = (porServico[s] ?? 0) + 1; // iFood vs entrega própria
      }
      out.push({ metrica: "logistica_pedidos", valor: dados.length, metadata: { por_turno: porTurno, por_servico: porServico } });
      return { tipo: "logistica", periodo, metricas: out, resumo: { pedidos: dados.length } };
    }
    // ---- CONCILIAÇÃO ----
    if (head.includes("competencia") && head.includes("tipo_lancamento")) {
      const dados = primeira.slice(1).filter(r => r[0]);
      const iTipo = head.indexOf("tipo_lancamento");
      const iVal = reqCol(head, h => h === "valor", "valor", abas[0]);
      const porTipo: Record<string, number> = {};
      let liquidoTotal = 0; // repasse líquido = soma de TODOS os lançamentos do extrato (cada valor já vem com sinal)
      for (const r of dados) { const t = String(r[iTipo] ?? "?"); const v = num(r[iVal]); porTipo[t] = Math.round(((porTipo[t] ?? 0) + v) * 100) / 100; liquidoTotal += v; }
      out.push({ metrica: "conciliacao_lancamentos", valor: dados.length, metadata: { por_tipo: porTipo } });
      out.push({ metrica: "conciliacao_entrada", valor: porTipo["Entrada Financeira"] ?? 0 });
      out.push({ metrica: "conciliacao_taxas", valor: Math.round((((porTipo["Retenção"] ?? 0) + (porTipo["Cobrança"] ?? 0))) * 100) / 100 });
      out.push({ metrica: "conciliacao_subsidios", valor: porTipo["Subsídio"] ?? 0 });
      // o que de fato cai na conta no período: entrada − taxas + subsídios ± estornos/antecipações/ajustes (todos já somados com sinal acima)
      out.push({ metrica: "conciliacao_repasse_liquido", valor: Math.round(liquidoTotal * 100) / 100 });
      const comp = String(dados[0]?.[0] ?? "");
      if (/^\d{4}-\d{2}$/.test(comp)) {
        const [ano, mes] = comp.split("-").map(Number);
        const ultimoDia = new Date(Date.UTC(ano, mes, 0)).getUTCDate(); // dia 0 do mês seguinte = último dia deste mês
        periodo = { ini: `${comp}-01`, fim: `${comp}-${String(ultimoDia).padStart(2, "0")}` };
      }
      return { tipo: "conciliacao", periodo, metricas: out, resumo: { por_tipo: porTipo } };
    }
  }

  // ---- QUALIDADE DA OPERAÇÃO (Super Restaurantes) ----
  // Layout largo: cabeçalho com "Nome da loja:" + seção "Qualidade da Operação";
  // 1 linha por indicador, colunas = dias (header "Indicador","Meta","dd/mm"...).
  // Agrega o período: somas para contagens; razões ponderadas pelos volumes reais
  // para percentuais/médias (evita média-de-médias enviesada por dias sem volume).
  {
    const abaOp = abas.find(a => {
      const rs = sheetRows(wb, a);
      const tem = (label: string) => rs.some(r => String(r?.[0] ?? "").trim() === label);
      return tem("Nome da loja:") && tem("Qualidade da Operação");
    });
    if (abaOp) {
      const rows = sheetRows(wb, abaOp);
      const linha = (label: string): Linha | null => rows.find(r => String(r?.[0] ?? "").trim() === label) ?? null;
      const iHeader = rows.findIndex(r => String(r?.[0] ?? "").trim() === "Indicador" && String(r?.[1] ?? "").trim() === "Meta");
      const headerRow = rows[iHeader] ?? [];
      const diaCols: number[] = [];
      for (let c = 2; c < headerRow.length; c++) {
        if (/^\d{2}\/\d{2}$/.test(String(headerRow[c] ?? "").trim())) diaCols.push(c);
      }
      const serie = (label: string): number[] => { const r = linha(label); return r ? diaCols.map(c => num(r[c])) : []; };
      const soma = (label: string) => serie(label).reduce((a, b) => a + b, 0);
      const r2 = (n: number) => Math.round(n * 100) / 100;
      const mediaPond = (label: string, pesos: number[]): number | null => {
        const s = serie(label); let acc = 0, den = 0;
        for (let i = 0; i < s.length; i++) { const p = pesos[i] ?? 0; acc += s[i] * p; den += p; }
        return den > 0 ? acc / den : null;
      };
      const mediaSimples = (label: string): number | null => {
        const s = serie(label); return s.length ? s.reduce((a, b) => a + b, 0) / s.length : null;
      };

      const pedidos = serie("Pedidos totais");
      const somaPedidos = pedidos.reduce((a, b) => a + b, 0);
      const atrasadosSerie = serie("Pedidos atrasados em mais que 5 min");
      const atrasados = atrasadosSerie.reduce((a, b) => a + b, 0);
      const canceladosImpacto = soma("Pedidos cancelados com impacto no Super");
      const avalSerie = serie("Quantidade de avaliações");
      const avalQtd = avalSerie.reduce((a, b) => a + b, 0);

      const rNivel = linha("Nível Super");
      const nivelTxt = rNivel ? String(rNivel[2] ?? "").trim() : null;
      const nivelMatch = nivelTxt ? String(nivelTxt).match(/\d+/) : null;
      const nivelNum = nivelMatch ? num(nivelMatch[0]) : null; // sem dígito → null (não 0)
      const projecao = rNivel ? String(rNivel[3] ?? "").trim() : null;

      const rPeriodo = linha("Período:");
      const periodoLabel = rPeriodo ? String(rPeriodo[1] ?? "").trim() : null;
      // Ancora data_ref no período REAL do relatório, não na data de processamento.
      // O label da Operação vem como "Diário (DD/MM a DD/MM)" (sem ano) — parsePeriodo
      // casa esse formato curto (ramo 2) e infere o ano; só se nem assim parsear é que
      // cai no fallback created_at de hoje. Nunca fabrica data.
      if (periodoLabel) { const p = parsePeriodo(periodoLabel); if (p.fim) periodo = p; }

      const avalMedia = mediaPond("Média das avaliações", avalSerie);       // pondera pela qtd de avaliações do dia
      const preparoMedio = mediaPond("Tempo médio de preparo (min)", pedidos); // pondera pelo nº de pedidos do dia
      const atrasoMedio = mediaPond("Tempo médio de atraso (min)", atrasadosSerie);
      const onlinePct = mediaSimples("Tempo online real vs planejado (%)");  // fração 0-1 → vira 0-100

      const meta = { dias: diaCols.length, periodo_label: periodoLabel };
      if (nivelTxt) out.push({ metrica: "operacao_nivel_super", valor: nivelNum ?? undefined, valor_texto: nivelTxt, metadata: { ...meta, projecao } });
      out.push({ metrica: "operacao_pedidos_totais", valor: somaPedidos, metadata: meta });
      out.push({ metrica: "operacao_valor_cancelado", valor: r2(soma("Valor total do cancelamento com entrega (R$)")), metadata: meta });
      out.push({ metrica: "operacao_atrasados_5min", valor: atrasados, metadata: meta });
      out.push({ metrica: "operacao_atrasados_5min_pct", valor: somaPedidos > 0 ? r2((atrasados / somaPedidos) * 100) : 0, metadata: meta });
      out.push({ metrica: "operacao_cancelamento_super_pct", valor: somaPedidos > 0 ? r2((canceladosImpacto / somaPedidos) * 100) : 0, metadata: meta });
      out.push({ metrica: "operacao_cancelamentos_super_qtd", valor: canceladosImpacto, metadata: meta }); // absoluto (antes só o % chegava ao dashboard)
      out.push({ metrica: "operacao_chamados", valor: soma("Pedidos com chamados"), metadata: meta });
      out.push({ metrica: "operacao_avaliacoes_qtd", valor: avalQtd, metadata: meta });
      if (avalMedia != null) out.push({ metrica: "operacao_avaliacao_media", valor: r2(avalMedia), metadata: meta });
      if (preparoMedio != null) out.push({ metrica: "operacao_tempo_preparo_medio", valor: r2(preparoMedio), metadata: meta });
      if (atrasoMedio != null) out.push({ metrica: "operacao_tempo_atraso_medio", valor: r2(atrasoMedio), metadata: meta });
      if (onlinePct != null) out.push({ metrica: "operacao_tempo_online_pct", valor: r2(onlinePct * 100), metadata: meta });

      // metas reais da planilha (coluna "Meta", índice 1) — substituem as metas hardcoded no dashboard.
      // Só captura indicadores que têm meta preenchida; célula vazia é ignorada (sem fabricar alvo).
      const metasIndicadores: Record<string, string> = {};
      for (const lb of [
        "Nível Super",
        "Pedidos atrasados em mais que 5 min",
        "Pedidos cancelados com impacto no Super",
        "Média das avaliações",
        "Tempo médio de preparo (min)",
        "Tempo online real vs planejado (%)",
      ]) {
        const rl = linha(lb);
        const v = rl ? String(rl[1] ?? "").trim() : "";
        if (v) metasIndicadores[lb] = v;
      }
      if (Object.keys(metasIndicadores).length) {
        // valor_texto resume as metas p/ consumidores que montam fatos a partir de
        // valor/valor_texto (evita "operacao_metas: " vazio no contexto do LLM).
        const metasTexto = Object.entries(metasIndicadores).map(([k, v]) => `${k}: ${v}`).join(" · ");
        out.push({ metrica: "operacao_metas", valor_texto: metasTexto, metadata: { ...meta, metas: metasIndicadores } });
      }

      // ---- série diária de verdade (Fase 5) ----
      // serie(label) já calcula o vetor por-dia alinhado a diaCols; aqui persistimos
      // esse grão em radar_series (1 linha/métrica/dia). Os nomes ESPELHAM os agregados
      // de radar_metricas → a soma da série bate com o agregado (semanal/mensal client-side).
      // Só Operação tem grão; só com período datável (anti-P1: não inventa o dia).
      const series: SeriePonto[] = [];
      if (periodo.ini && periodo.fim && diaCols.length) {
        const diasISO = diasDaSerie(diaCols.map(c => String(headerRow[c] ?? "").trim()), periodo);
        // Valor cru por dia (sem r2): a soma client-side da série reproduz EXATAMENTE
        // soma(...) e o fmtBRL no front exibe igual ao r2(soma) do KPI agregado — sem
        // drift de centavos por acumular arredondamentos. As 5 contagens são inteiras.
        const pushSerie = (metrica: string, valores: number[]) => {
          for (let i = 0; i < valores.length; i++) {
            const dia = diasISO[i];
            if (!dia) continue; // sem data confiável p/ essa coluna → não persiste
            series.push({ metrica, dia, valor: valores[i] });
          }
        };
        pushSerie("operacao_pedidos_totais", pedidos);
        pushSerie("operacao_atrasados_5min", atrasadosSerie);
        pushSerie("operacao_cancelamentos_super_qtd", serie("Pedidos cancelados com impacto no Super"));
        pushSerie("operacao_avaliacoes_qtd", avalSerie);
        pushSerie("operacao_chamados", serie("Pedidos com chamados"));
        pushSerie("operacao_valor_cancelado", serie("Valor total do cancelamento com entrega (R$)"));
      }

      return { tipo: "operacao", periodo, metricas: out, series, resumo: { dias: diaCols.length, periodo_label: periodoLabel, nivel: nivelTxt } };
    }
  }

  // ---- SUPER / layout livre — registra abas e segue ----
  return { tipo: "desconhecido", periodo, metricas: [], resumo: { abas } };
}

async function extrairDePrint(buf: ArrayBuffer, mime: string): Promise<{ metricas: Metrica[]; custoUsd: number | null }> {
  const client = getAnthropic();
  const b64 = Buffer.from(buf).toString("base64");
  const MODEL = "claude-sonnet-4-6";
  const resp = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system: 'Voce extrai METRICAS de prints de relatorios do portal iFood. Responda APENAS JSON: {"metricas":[{"metrica":"nome_snake_case","valor":numero ou null,"valor_texto":"se nao numerico"}]}. Extraia todos os numeros visíveis com nomes descritivos.',
    messages: [{ role: "user", content: [
      { type: "image", source: { type: "base64", media_type: mime as any, data: b64 } },
      { type: "text", text: "Extraia as métricas deste print." },
    ]}],
  });
  const texto = resp.content.filter(b => b.type === "text").map(b => (b as any).text).join("");
  const json = JSON.parse(texto.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim());
  const custoUsd = calcularCustoUsd(MODEL, resp.usage);
  return { metricas: json.metricas ?? [], custoUsd };
}

export const radarProcessarFontes = schedules.task({
  id: "radar-processar-fontes",
  cron: "*/5 * * * *",
  run: async () => {
    const sb = getSupabase();
    const { data: fontes, error } = await sb
      .from("radar_fontes")
      .select("id, tenant_id, loja_id, origem, arquivo_path, arquivo_nome")
      .eq("status", "pendente")
      .limit(10);
    if (error) throw new Error(`radar fontes: ${error.message}`);
    if (!fontes?.length) return { ok: true, processadas: 0 };

    let processadas = 0, erros = 0;
    for (const f of fontes) {
      try {
        const { data: blob, error: dErr } = await sb.storage.from("radar").download(f.arquivo_path);
        if (dErr || !blob) throw new Error(`download falhou: ${dErr?.message}`);
        const buf = await blob.arrayBuffer();

        let tipo = "print";
        let periodo: { ini: string | null; fim: string | null } = { ini: null, fim: null };
        let metricas: Metrica[] = [];
        let series: SeriePonto[] = [];
        let resumo: Record<string, unknown> = {};
        let custoUsd: number | null = null;

        if (f.origem === "planilha") {
          const wb = XLSX.read(buf, { type: "array" });
          const r = detectarEExtrair(wb);
          tipo = r.tipo; periodo = r.periodo; metricas = r.metricas; series = r.series ?? []; resumo = r.resumo;
        } else {
          const mime = f.arquivo_nome?.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
          const r = await extrairDePrint(buf, mime);
          metricas = r.metricas; custoUsd = r.custoUsd; resumo = { extraidas: r.metricas.length };
        }

        if (metricas.length) {
          // grão temporal (Fase 0): conciliação é mensal (1 competência por arquivo);
          // os demais relatórios e prints chegam agregados por período. A série diária
          // de verdade (Operação/Cancelamentos/Logística) vai p/ radar_series (Fase 5).
          const granularidade = tipo === "conciliacao" ? "mes" : "periodo";
          const dataRef = periodo.fim ?? new Date().toISOString().slice(0, 10); // coalesce(periodo.fim, hoje≈created_at)
          const linhas = metricas.map(m => ({
            tenant_id: f.tenant_id,
            loja_id: f.loja_id ?? null,
            fonte_id: f.id,
            metrica: m.metrica,
            valor: m.valor ?? null,
            valor_texto: m.valor_texto ?? null,
            periodo_inicio: periodo.ini,
            periodo_fim: periodo.fim,
            granularidade,
            data_ref: dataRef,
            metadata: m.metadata ?? null,
          }));
          // idempotência: reprocessar/reenviar a mesma fonte não duplica métricas
          const { error: delErr } = await sb.from("radar_metricas").delete().eq("fonte_id", f.id);
          if (delErr) throw new Error(`limpa metricas anteriores: ${delErr.message}`);
          const { error: insErr } = await sb.from("radar_metricas").insert(linhas);
          if (insErr) throw new Error(`insert metricas: ${insErr.message}`);
        }

        // série diária de verdade (Fase 5) — espelha a idempotência de radar_metricas.
        // DELETE incondicional: se um reprocesso deixar de ter série, o resíduo some.
        const { error: delSErr } = await sb.from("radar_series").delete().eq("fonte_id", f.id);
        if (delSErr) throw new Error(`limpa série anterior: ${delSErr.message}`);
        if (series.length) {
          const linhasSerie = series.map(s => ({
            tenant_id: f.tenant_id,
            loja_id: f.loja_id ?? null,
            fonte_id: f.id,
            metrica: s.metrica,
            dia: s.dia,
            valor: s.valor,
          }));
          const { error: insSErr } = await sb.from("radar_series").insert(linhasSerie);
          if (insSErr) throw new Error(`insert série: ${insSErr.message}`);
        }

        await sb.from("radar_fontes").update({
          status: "processado", tipo_relatorio: tipo,
          periodo_inicio: periodo.ini, periodo_fim: periodo.fim,
          resumo, custo_usd: custoUsd, processado_em: new Date().toISOString(),
        }).eq("id", f.id);

        await notify({
          tenantId: f.tenant_id, kind: "system", agent: "radar",
          title: `Relatório processado: ${tipo} (${metricas.length} métricas)`,
          body: f.arquivo_nome ?? f.arquivo_path,
          metadata: { fonte_id: f.id },
        });
        processadas++;
        logger.info("fonte processada", { id: f.id, tipo, metricas: metricas.length });
      } catch (err) {
        erros++;
        await sb.from("radar_fontes").update({ status: "erro", erro_detalhe: (err as Error).message.slice(0, 500) }).eq("id", f.id);
        await notify({
          tenantId: f.tenant_id, kind: "agent_failed", agent: "radar",
          title: `Falha ao processar fonte: ${f.arquivo_nome ?? f.arquivo_path ?? f.id}`,
          body: (err as Error).message.slice(0, 500),
          metadata: { fonte_id: f.id },
        });
        logger.error("fonte com erro", { id: f.id, erro: (err as Error).message });
      }
    }
    return { ok: true, processadas, erros };
  },
});
