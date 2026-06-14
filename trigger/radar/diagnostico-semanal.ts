import { schedules, logger } from "@trigger.dev/sdk/v3";
import Anthropic from "@anthropic-ai/sdk";
import { getAnthropic } from "../_shared/claude";
import { getSupabase } from "../_shared/supabase";
import { logAgentRun } from "../_shared/audit";
import { notify } from "../_shared/notify";
import { notifyDeli } from "../_shared/notify-deli";
import { lerMetricas } from "../_shared/radar-metricas";

// =====================================================
// RADAR — diagnóstico semanal automático (PR12c)
// Cron: segunda 08:00. Para cada tenant COM métricas importadas,
// monta o diagnóstico (números reais do radar_metricas + casos da
// Defesa), pede à IA um resumo curto no Brand Guard e posta no
// sino (internal_notifications) + feed da DELI. Custo no logAgentRun.
// =====================================================

function val(map: Record<string, any>, k: string): number | null {
  return map[k] != null && map[k].valor != null ? Number(map[k].valor) : null;
}
function txt(map: Record<string, any>, k: string): string | null {
  return map[k] != null ? map[k].valor_texto ?? null : null;
}
const fmtBRL = (n: number) => `R$ ${(Number(n) || 0).toFixed(2)}`;

// =====================================================
// Fase 6 — demandas: rascunho automático em tarefas_loja
// A partir das MESMAS métricas e thresholds do dashboard (RadarReal.jsx),
// cada sinal de problema vira um rascunho de tarefa (status='rascunho',
// criado_por_ia=true). O Wandson aprova/rejeita no painel "Ações
// recomendadas" antes de a tarefa valer. Nada é fabricado: cada push só
// ocorre com número real e usa thresholds que JÁ existem no dashboard.
// =====================================================

type Rascunho = {
  origem: string;          // chave estável p/ idempotência (metadata.origem)
  bloco: string;           // CHECK: identidade|cardapio|operacao|avaliacoes|marketing|suporte
  prioridade: string;      // CHECK: quick_win|estrutural|material_cliente
  titulo: string;
  situacao: string;
  o_que_sera_feito: string;
  por_que_importa?: string;
  metrica?: string;        // métrica de origem (rastreabilidade)
};

// Espelha os `sinais` de RadarReal.jsx (l.332-340) — mesmos thresholds.
function montarRascunhos(map: Record<string, any>): Rascunho[] {
  const out: Rascunho[] = [];
  const taxas = val(map, "conciliacao_taxas");
  const entrada = val(map, "conciliacao_entrada") ?? val(map, "vendas_valor_total");
  const subsidios = val(map, "conciliacao_subsidios");
  const conv = val(map, "funil_conversao_pct");
  const visitas = val(map, "funil_visitas");
  const cancQtd = val(map, "cancelamentos_qtd");
  const cancTop = txt(map, "cancelamentos_motivo_top");
  const valorCancelado = val(map, "operacao_valor_cancelado");
  const opAtrasoPct = val(map, "operacao_atrasados_5min_pct");
  const opOnline = val(map, "operacao_tempo_online_pct");
  const opCancSuper = val(map, "operacao_cancelamento_super_pct");
  const opChamados = val(map, "operacao_chamados");

  // Carga total iFood — mesmo cálculo e threshold (>40%) do KPI do dashboard.
  const cargaPct = (entrada && taxas != null)
    ? Math.round(((Math.abs(taxas) + Math.abs(subsidios || 0)) / Math.abs(entrada)) * 100)
    : null;
  if (cargaPct != null && cargaPct > 40) out.push({
    origem: "carga_ifood", bloco: "operacao", prioridade: "estrutural", metrica: "conciliacao_taxas",
    titulo: `Reduzir a carga do iFood (${cargaPct}% do faturamento)`,
    situacao: `Taxas e ofertas custeadas consomem ${cargaPct}% do faturamento da loja no período.`,
    o_que_sera_feito: "Revisar o plano de comissão e o modelo de logística com a loja e renegociar onde houver espaço.",
    por_que_importa: "Acima de 40% de carga a margem da loja fica comprometida.",
  });

  if (conv != null && conv < 25) out.push({
    origem: "conversao_baixa", bloco: "marketing", prioridade: "estrutural", metrica: "funil_conversao_pct",
    titulo: `Melhorar a conversão do cardápio (${conv}%)`,
    situacao: `O cardápio converte ${conv}% das visitas${visitas != null ? ` (${visitas} visitas)` : ""} — abaixo do ideal de 25%.`,
    o_que_sera_feito: "Revisar fotos, descrições e ofertas dos itens e destacar os campeões no topo do cardápio.",
    por_que_importa: "Cada ponto de conversão vira pedido sem custo de mídia.",
  });

  if (subsidios != null && Math.abs(subsidios) > 0) out.push({
    origem: "subsidios", bloco: "marketing", prioridade: "estrutural", metrica: "conciliacao_subsidios",
    titulo: `Avaliar o retorno das ofertas custeadas (${fmtBRL(Math.abs(subsidios))})`,
    situacao: `A loja custeou ${fmtBRL(Math.abs(subsidios))} em ofertas no período.`,
    o_que_sera_feito: "Cruzar o gasto em ofertas com o aumento de pedidos e cortar o que não paga.",
    por_que_importa: "Oferta sem retorno é margem queimada.",
  });

  if (cancQtd != null && cancQtd > 0) {
    const porAtraso = /atras/i.test(cancTop || "");
    out.push({
      origem: "cancelamentos", bloco: "operacao", prioridade: porAtraso ? "quick_win" : "estrutural", metrica: "cancelamentos_qtd",
      titulo: `Tratar ${cancQtd} cancelamento(s)${cancTop ? ` — ${cancTop}` : ""}`,
      situacao: `${cancQtd} cancelamentos no período${cancTop ? `, motivo principal: ${cancTop}` : ""}${valorCancelado != null ? `, ${fmtBRL(valorCancelado)} em jogo` : ""}.`,
      o_que_sera_feito: porAtraso
        ? "Acionar a Defesa para contestar os cancelamentos por atraso e atacar a causa do atraso."
        : "Investigar a causa dos cancelamentos e abrir contestação na Defesa onde couber.",
      por_que_importa: "Cancelamento é receita perdida e pesa no nível Super.",
    });
  }

  if (opAtrasoPct != null && opAtrasoPct > 5) out.push({
    origem: "op_atrasos", bloco: "operacao", prioridade: "estrutural", metrica: "operacao_atrasados_5min_pct",
    titulo: `Reduzir atrasos na entrega (${opAtrasoPct}% acima de 5 min)`,
    situacao: `${opAtrasoPct}% dos pedidos passaram de 5 minutos de atraso.`,
    o_que_sera_feito: "Revisar o tempo de preparo e o horário de aceite de pedidos no pico.",
    por_que_importa: "Atraso derruba a avaliação e o nível Super da loja.",
  });

  if (opOnline != null && opOnline < 90) out.push({
    origem: "op_online", bloco: "operacao", prioridade: "quick_win", metrica: "operacao_tempo_online_pct",
    titulo: `Aumentar o tempo online da loja (${opOnline}%)`,
    situacao: `A loja ficou online ${opOnline}% do planejado (meta 90%).`,
    o_que_sera_feito: "Reduzir pausas e fechamentos não planejados, sobretudo no horário de pico.",
    por_que_importa: "Loja offline no pico é venda que vai para o concorrente.",
  });

  if (opCancSuper != null && opCancSuper > 1) out.push({
    origem: "op_canc_super", bloco: "operacao", prioridade: "estrutural", metrica: "operacao_cancelamento_super_pct",
    titulo: `Reduzir cancelamentos que afetam o Super (${opCancSuper}%)`,
    situacao: `Cancelamentos com impacto no nível Super em ${opCancSuper}% (meta de no máximo 1%).`,
    o_que_sera_feito: "Atacar a causa-raiz dos cancelamentos para proteger o nível Super.",
    por_que_importa: "Acima de 1% a loja perde o selo Super e o alcance.",
  });

  if (opChamados != null && opChamados > 0) out.push({
    origem: "op_chamados", bloco: "suporte", prioridade: "quick_win", metrica: "operacao_chamados",
    titulo: `Acompanhar ${opChamados} chamado(s) no suporte iFood`,
    situacao: `${opChamados} chamados abertos no suporte do iFood.`,
    o_que_sera_feito: "Acompanhar a resolução de cada chamado junto ao iFood.",
    por_que_importa: "Chamado parado trava operação e dinheiro.",
  });

  return out;
}

// Gera rascunhos por LOJA (tarefas_loja.loja_id é NOT NULL). Itera as lojas COM
// métricas do tenant e cria só as origens que ainda não têm tarefa IA aberta
// (idempotência por metadata.origem). Retorna quantos rascunhos foram criados.
const STATUS_TERMINAIS = new Set(["concluida", "cancelada", "rejeitada"]);
async function gerarRascunhosTarefas(sb: ReturnType<typeof getSupabase>, tenantId: string): Promise<number> {
  const { data: lojasRows } = await sb
    .from("radar_metricas")
    .select("loja_id")
    .eq("tenant_id", tenantId)
    .not("loja_id", "is", null)
    .limit(2000);
  const lojaIds = [...new Set((lojasRows ?? []).map(r => r.loja_id).filter(Boolean))];
  if (!lojaIds.length) return 0;

  let total = 0;
  for (const lojaId of lojaIds) {
    const map = await lerMetricas(sb, { tenantId, lojaId });
    const rascunhos = montarRascunhos(map);
    if (!rascunhos.length) continue;

    // idempotência: origem que já tem tarefa IA aberta (não-terminal) nesta loja não recria
    const { data: existentes } = await sb
      .from("tarefas_loja")
      .select("metadata, status")
      .eq("loja_id", lojaId)
      .eq("criado_por_ia", true);
    const origensAtivas = new Set(
      (existentes ?? [])
        .filter(t => !STATUS_TERMINAIS.has(t.status))
        .map(t => (t.metadata as any)?.origem)
        .filter(Boolean),
    );

    const novos = rascunhos.filter(r => !origensAtivas.has(r.origem));
    if (!novos.length) continue;

    const rows = novos.map(r => ({
      loja_id: lojaId,
      bloco: r.bloco,
      titulo: r.titulo,
      situacao: r.situacao,
      o_que_sera_feito: r.o_que_sera_feito,
      por_que_importa: r.por_que_importa ?? null,
      prioridade: r.prioridade,
      status: "rascunho",
      criado_por_ia: true,
      metadata: { origem: r.origem, fonte: "radar-diagnostico-semanal", metrica: r.metrica ?? null },
    }));

    const { data: inseridos, error } = await sb
      .from("tarefas_loja")
      .insert(rows)
      .select("id");
    if (error) {
      // 23505: o índice único parcial uq_tarefa_ia_origem_ativa barrou uma origem
      // já criada por outra execução concorrente. É o no-op idempotente esperado,
      // não um defeito — não polui o log. Qualquer outro erro vira warn.
      if (error.code !== "23505") {
        logger.warn("radar semanal: insert de rascunhos falhou", { lojaId, erro: error.message });
      }
      continue;
    }
    total += inseridos?.length ?? 0;
  }
  return total;
}

export const radarDiagnosticoSemanal = schedules.task({
  id: "radar-diagnostico-semanal",
  cron: "0 8 * * 1",
  run: async (_p, { ctx }) => {
    const sb = getSupabase();
    const t0 = Date.now();

    // tenants que têm métricas processadas
    const { data: distintos, error } = await sb
      .from("radar_metricas")
      .select("tenant_id")
      .limit(2000);
    if (error) throw new Error(`radar semanal: ${error.message}`);
    const tenants = [...new Set((distintos ?? []).map(r => r.tenant_id))];
    if (!tenants.length) return { ok: true, tenants: 0 };

    let enviados = 0;
    let custoTotal = 0;
    let rascunhosCriados = 0;

    for (const tenantId of tenants) {
      try {
        // última ocorrência de cada métrica
        const map = await lerMetricas(sb, { tenantId, select: "metrica, valor, valor_texto, created_at" });
        if (!Object.keys(map).length) continue;

        const { data: casos } = await sb
          .from("defesa_casos")
          .select("status, motivo, resultado_valor_centavos")
          .eq("tenant_id", tenantId)
          .limit(500);
        const defendido = (casos ?? []).filter(c => c.status === "ganho").reduce((s, c) => s + (Number(c.resultado_valor_centavos) || 0), 0);
        const atraso = (casos ?? []).filter(c => /atras/i.test(c.motivo || "")).length;

        const taxas = val(map, "conciliacao_taxas");
        const entrada = val(map, "conciliacao_entrada") ?? val(map, "vendas_valor_total");
        const pctTaxas = (taxas != null && entrada) ? Math.round((Math.abs(taxas) / Math.abs(entrada)) * 100) : null;
        const conv = val(map, "funil_conversao_pct");
        const cancQtd = val(map, "cancelamentos_qtd");
        const cancTop = txt(map, "cancelamentos_motivo_top");
        const pedidos = val(map, "vendas_total_pedidos");

        const fatos = [
          entrada != null ? `Faturamento: R$ ${entrada.toFixed(2)}${pedidos != null ? ` (${pedidos} pedidos)` : ""}` : null,
          taxas != null ? `Taxas iFood: R$ ${Math.abs(taxas).toFixed(2)}${pctTaxas != null ? ` (${pctTaxas}% do faturamento)` : ""}` : null,
          conv != null ? `Conversão do cardápio: ${conv}%` : null,
          cancQtd != null ? `Cancelamentos: ${cancQtd}${cancTop ? ` (motivo top: ${cancTop})` : ""}` : null,
          atraso > 0 ? `${atraso} cancelamento(s) por atraso — contestáveis pela Defesa` : null,
          defendido > 0 ? `R$ defendido pela Defesa: R$ ${(defendido / 100).toFixed(2)}` : null,
        ].filter(Boolean).join("\n");

        // resumo curto pela IA (Brand Guard); fallback = os próprios fatos
        let resumo = fatos;
        try {
          const client = getAnthropic();
          const resp = await client.messages.create({
            model: "claude-sonnet-4-6",
            max_tokens: 600,
            system: "Voce e o RADAR da Consult Delivery. A partir dos numeros, escreva um diagnostico semanal curto (ate 4 frases) para o dono da loja: o que mais pesa, o que e contestavel pela Defesa, e a acao mais importante da semana. Portugues do Brasil, profissional, direto, ZERO emoji. Use 'oferta' nunca 'promocao'.",
            messages: [{ role: "user", content: `Numeros da semana:\n${fatos}` }],
          });
          const out = resp.content.filter(b => b.type === "text").map(b => (b as Anthropic.TextBlock).text).join("").trim();
          if (out) resumo = out;
          custoTotal += (resp.usage.input_tokens / 1e6) * 3 + (resp.usage.output_tokens / 1e6) * 15;
        } catch (e) {
          logger.warn("radar semanal: IA falhou, usando fatos crus", { erro: (e as Error).message });
        }

        await notify({
          tenantId,
          kind: "system",
          agent: "radar",
          title: "Radar da semana — diagnóstico da sua loja",
          body: resumo.slice(0, 280),
          link: "radar",
          metadata: { gerado_em: new Date().toISOString() },
        });
        await notifyDeli({
          tenantId,
          content: `RADAR semanal:\n${resumo}`,
          sourceAgent: "radar",
          sourceTask: "radar-diagnostico-semanal",
          runId: ctx.run.id,
        });
        enviados++;

        // Fase 6 — demandas: rascunhos de tarefa a partir dos sinais (isolado:
        // nunca derruba a notificação acima se a geração de rascunhos falhar).
        try {
          rascunhosCriados += await gerarRascunhosTarefas(sb, tenantId);
        } catch (e) {
          logger.warn("radar semanal: geracao de rascunhos falhou", { tenantId, erro: (e as Error).message });
        }
      } catch (err) {
        logger.error("radar semanal: tenant com erro", { tenantId, erro: (err as Error).message });
      }
    }

    await logAgentRun({
      runId: ctx.run.id,
      agentSlug: "radar",
      input: { tenants: tenants.length },
      output: { enviados, rascunhosCriados },
      durationMs: Date.now() - t0,
      costUsd: custoTotal,
      status: "success",
    });

    logger.info("radar semanal concluído", { tenants: tenants.length, enviados, rascunhosCriados, custoUsd: custoTotal });
    return { ok: true, tenants: tenants.length, enviados, rascunhosCriados, custoUsd: custoTotal };
  },
});
