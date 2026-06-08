import { schedules, logger } from "@trigger.dev/sdk/v3";
import * as XLSX from "xlsx";
import { getSupabase } from "../_shared/supabase";
import { getAnthropic } from "../_shared/claude";
import { notify } from "../_shared/notify";

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
  const m = String(p ?? "").match(/(\d{2})\/(\d{2})\/(\d{4})\s*-\s*(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return { ini: null, fim: null };
  return { ini: `${m[3]}-${m[2]}-${m[1]}`, fim: `${m[6]}-${m[5]}-${m[4]}` };
}

const num = (v: unknown): number => { const n = Number(String(v ?? "").replace(",", ".")); return Number.isFinite(n) ? n : 0; };

interface Metrica { metrica: string; valor?: number; valor_texto?: string; metadata?: Record<string, unknown> }

function detectarEExtrair(wb: XLSX.WorkBook): { tipo: string; periodo: { ini: string | null; fim: string | null }; metricas: Metrica[]; resumo: Record<string, unknown> } {
  const abas = wb.SheetNames;
  const out: Metrica[] = [];
  let periodo: { ini: string | null; fim: string | null } = { ini: null, fim: null };

  // ---- VENDAS (abas: Vendas / Horário com mais vendas / Formas de pagamento / Dias) ----
  if (abas.includes("Vendas")) {
    const rows = sheetRows(wb, "Vendas");
    const head = (rows[0] ?? []).map(String);
    const iPed = head.findIndex(h => h.startsWith("Total de vendas"));
    const iVal = head.findIndex(h => h.startsWith("Valor total de vendas"));
    if (iPed > -1) {
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
    const rows = sheetRows(wb, abas.find(a => a.toLowerCase().includes("cancelamento"))!);
    const head = (rows[0] ?? []).map(String);
    const iMotivo = head.findIndex(h => h.startsWith("Motivo"));
    const iData = head.findIndex(h => h.startsWith("Data e hora"));
    if (iMotivo > -1) {
      const dados = rows.slice(1).filter(r => r[iData]);
      const porMotivo: Record<string, number> = {};
      for (const r of dados) { const m = String(r[iMotivo] ?? "sem motivo"); porMotivo[m] = (porMotivo[m] ?? 0) + 1; }
      const datas = dados.map(r => String(r[iData]).slice(0, 10)).sort();
      periodo = { ini: datas[0] ?? null, fim: datas[datas.length - 1] ?? null };
      out.push({ metrica: "cancelamentos_qtd", valor: dados.length, metadata: { por_motivo: porMotivo } });
      const top = Object.entries(porMotivo).sort((a, b) => b[1] - a[1])[0];
      if (top) out.push({ metrica: "cancelamentos_motivo_top", valor: top[1], valor_texto: top[0] });
      return { tipo: "cancelamentos", periodo, metricas: out, resumo: { qtd: dados.length, por_motivo: porMotivo } };
    }
  }

  // ---- NEGOCIAÇÕES ----
  if (abas.some(a => a.toLowerCase().includes("negocia"))) {
    const rows = sheetRows(wb, abas.find(a => a.toLowerCase().includes("negocia"))!);
    const head = (rows[0] ?? []).map(String);
    const iVal = head.findIndex(h => h.startsWith("Valor total do cancelament"));
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
    const ix = (n: string) => head.findIndex(h => h === n);
    const visitas = num(d[ix("Visitas")]), concluidos = num(d[ix("Concluídos")]);
    out.push({ metrica: "funil_visitas", valor: visitas });
    out.push({ metrica: "funil_concluidos", valor: concluidos });
    out.push({ metrica: "funil_conversao_pct", valor: visitas ? Math.round((concluidos / visitas) * 1000) / 10 : 0 });
    const itens = sheetRows(wb, "Itens").slice(1).filter(r => r[3]);
    if (itens.length) {
      const top = itens.reduce((a, b) => (num(b[10]) > num(a[10]) ? b : a));
      out.push({ metrica: "cardapio_item_top_valor", valor: Math.round(num(top[10]) * 100) / 100, valor_texto: String(top[3]) });
      out.push({ metrica: "cardapio_itens_qtd", valor: itens.length });
    }
    return { tipo: "cardapio", periodo, metricas: out, resumo: { visitas, concluidos } };
  }

  // ---- LOGÍSTICA ----
  {
    const primeira = sheetRows(wb, abas[0]);
    const head = (primeira[0] ?? []).map(String);
    if (head.includes("SERVIÇO LOGÍSTICO")) {
      const dados = primeira.slice(1).filter(r => r[3]);
      const iData = head.indexOf("DATA E HORA DO PEDIDO");
      const datas = dados.map(r => String(r[iData]).slice(0, 10)).sort();
      periodo = { ini: datas[0] ?? null, fim: datas[datas.length - 1] ?? null };
      const porTurno: Record<string, number> = {};
      const iTurno = head.indexOf("TURNO");
      for (const r of dados) { const t = String(r[iTurno] ?? "?"); porTurno[t] = (porTurno[t] ?? 0) + 1; }
      out.push({ metrica: "logistica_pedidos", valor: dados.length, metadata: { por_turno: porTurno } });
      return { tipo: "logistica", periodo, metricas: out, resumo: { pedidos: dados.length } };
    }
    // ---- CONCILIAÇÃO ----
    if (head.includes("competencia") && head.includes("tipo_lancamento")) {
      const dados = primeira.slice(1).filter(r => r[0]);
      const iTipo = head.indexOf("tipo_lancamento");
      const iVal = head.indexOf("valor");
      const porTipo: Record<string, number> = {};
      for (const r of dados) { const t = String(r[iTipo] ?? "?"); porTipo[t] = Math.round(((porTipo[t] ?? 0) + num(r[iVal])) * 100) / 100; }
      out.push({ metrica: "conciliacao_lancamentos", valor: dados.length, metadata: { por_tipo: porTipo } });
      out.push({ metrica: "conciliacao_entrada", valor: porTipo["Entrada Financeira"] ?? 0 });
      out.push({ metrica: "conciliacao_taxas", valor: Math.round((((porTipo["Retenção"] ?? 0) + (porTipo["Cobrança"] ?? 0))) * 100) / 100 });
      out.push({ metrica: "conciliacao_subsidios", valor: porTipo["Subsídio"] ?? 0 });
      const comp = String(dados[0]?.[0] ?? "");
      if (/^\d{4}-\d{2}$/.test(comp)) periodo = { ini: `${comp}-01`, fim: `${comp}-28` };
      return { tipo: "conciliacao", periodo, metricas: out, resumo: { por_tipo: porTipo } };
    }
  }

  // ---- SUPER / layout livre — registra abas e segue ----
  return { tipo: "desconhecido", periodo, metricas: [], resumo: { abas } };
}

async function extrairDePrint(buf: ArrayBuffer, mime: string): Promise<{ metricas: Metrica[]; custoUsd: number }> {
  const client = getAnthropic();
  const b64 = Buffer.from(buf).toString("base64");
  const resp = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2048,
    system: 'Voce extrai METRICAS de prints de relatorios do portal iFood. Responda APENAS JSON: {"metricas":[{"metrica":"nome_snake_case","valor":numero ou null,"valor_texto":"se nao numerico"}]}. Extraia todos os numeros visíveis com nomes descritivos.',
    messages: [{ role: "user", content: [
      { type: "image", source: { type: "base64", media_type: mime as any, data: b64 } },
      { type: "text", text: "Extraia as métricas deste print." },
    ]}],
  });
  const texto = resp.content.filter(b => b.type === "text").map(b => (b as any).text).join("");
  const json = JSON.parse(texto.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim());
  const custoUsd = (resp.usage.input_tokens / 1e6) * 3 + (resp.usage.output_tokens / 1e6) * 15;
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
        let resumo: Record<string, unknown> = {};
        let custoUsd: number | null = null;

        if (f.origem === "planilha") {
          const wb = XLSX.read(buf, { type: "array" });
          const r = detectarEExtrair(wb);
          tipo = r.tipo; periodo = r.periodo; metricas = r.metricas; resumo = r.resumo;
        } else {
          const mime = f.arquivo_nome?.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
          const r = await extrairDePrint(buf, mime);
          metricas = r.metricas; custoUsd = r.custoUsd; resumo = { extraidas: r.metricas.length };
        }

        if (metricas.length) {
          const linhas = metricas.map(m => ({
            tenant_id: f.tenant_id,
            loja_id: f.loja_id ?? null,
            fonte_id: f.id,
            metrica: m.metrica,
            valor: m.valor ?? null,
            valor_texto: m.valor_texto ?? null,
            periodo_inicio: periodo.ini,
            periodo_fim: periodo.fim,
            metadata: m.metadata ?? null,
          }));
          const { error: insErr } = await sb.from("radar_metricas").insert(linhas);
          if (insErr) throw new Error(`insert metricas: ${insErr.message}`);
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
        logger.error("fonte com erro", { id: f.id, erro: (err as Error).message });
      }
    }
    return { ok: true, processadas, erros };
  },
});
