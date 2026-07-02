// Runner v2: extrai o financeiro real de /revenue (Portal do Parceiro iFood) e emite JSON no
// stdout. NÃO faz upsert em loja_metricas — quem persiste é trigger/gestor/coleta-diaria.ts (F2),
// que resolve loja_id por ifood_portal_nome. Campos não coletados = null, NUNCA 0 (P1 anti-padrão).
//
// Seletores confirmados via probe ao vivo (Café Container, 2026-07-02): navegar por page.goto
// (NÃO clicar sidebar — overlay `_dialog-background _status-open` intercepta cliques).
'use strict';

const { chromium } = require('playwright-core');
const { z } = require('zod');
const { garantirLoja } = require('./index');

function getConfig() {
  return {
    cdpUrl: (process.env.IFOOD_CDP_URL || 'http://127.0.0.1:9222').trim(),
    loja: (process.env.IFOOD_LOJA || 'Café Container').trim(),
    navTimeoutMs: parseInt(process.env.IFOOD_NAV_TIMEOUT_MS || '45000', 10),
  };
}

const REVENUE_URL = 'https://portal.ifood.com.br/revenue';

const LABELS = {
  valor_vendas: 'Valor das vendas',
  taxas_comissoes: 'Taxas e comissões',
  servicos_promocoes: 'Serviços e promoções',
  total_faturamento: 'Total faturamento',
};

// Parser de moeda BR: "R$ 1.129,50" → 1129.5 | "-R$ 275,05" → -275.05 | "R$ 0,00" → 0
// Retorna null se não bater com o formato esperado (nunca inventa 0).
function parseMoedaBR(texto) {
  if (typeof texto !== 'string') return null;
  const m = texto.match(/(-)?R\$\s?(-)?([\d.]+,\d{2})/);
  if (!m) return null;
  const negativo = Boolean(m[1] || m[2]);
  const numero = parseFloat(m[3].replace(/\./g, '').replace(',', '.'));
  if (Number.isNaN(numero)) return null;
  return negativo ? -numero : numero;
}

// Casa o rótulo exato (texto de um nó-folha) e retorna o próximo valor "R$ ..." dentro do
// mesmo bloco (irmão ou descendente próximo) — robusto a mudança de classe CSS.
function extrairValorPorLabel(page, label) {
  return page.evaluate((alvo) => {
    const nodes = [...document.body.querySelectorAll('*')].filter(
      (e) => e.children.length === 0 && (e.innerText || '').trim() === alvo
    );
    for (const node of nodes) {
      const bloco = node.closest('div,li,section') || node.parentElement;
      if (!bloco) continue;
      const texto = bloco.innerText || '';
      const m = texto.match(/-?R\$\s?-?[\d.]+,\d{2}/);
      if (m) return m[0];
    }
    return null;
  }, label);
}

async function extrairMesReferencia(page) {
  return page.evaluate(() => {
    const m = document.body.innerText.match(/[A-ZÇÃa-zçã]+\s+de\s+\d{4}/);
    return m ? m[0] : null;
  });
}

const MetricasRevenueSchema = z.object({
  loja: z.string(),
  mes_referencia: z.string().nullable(),
  valor_vendas: z.number().nullable(),
  taxas_comissoes: z.number().nullable(),
  servicos_promocoes: z.number().nullable(),
  total_faturamento: z.number().nullable(),
  // TODO(probe): pedidos/cancelamentos exigem filtro de período em /orders; nota média exige
  // varrer /reviews. Não implementado nesta versão — sempre null.
  pedidos: z.null(),
  cancelamentos: z.null(),
  avaliacao: z.null(),
});

async function coletarRevenue(page, cfg) {
  await page.goto(REVENUE_URL, { waitUntil: 'domcontentloaded', timeout: cfg.navTimeoutMs });
  await page
    .waitForFunction(() => /R\$\s?\d/.test(document.body.innerText), { timeout: 25000 })
    .catch(() => {
      throw new Error('coletarRevenue: valores em R$ não apareceram em ' + REVENUE_URL + ' (lazy-load falhou ou layout mudou?).');
    });
  await page.waitForTimeout(6000);

  const mes_referencia = await extrairMesReferencia(page);
  const valores = {};
  for (const [campo, label] of Object.entries(LABELS)) {
    const bruto = await extrairValorPorLabel(page, label);
    valores[campo] = parseMoedaBR(bruto);
  }

  return { mes_referencia, ...valores };
}

async function main() {
  const cfg = getConfig();
  let browser;
  try {
    browser = await chromium.connectOverCDP(cfg.cdpUrl);
    const ctx = browser.contexts()[0];
    if (!ctx) throw new Error('Nenhum contexto no browser CDP — o ifood-browser está logado?');
    const page = ctx.pages()[0];
    if (!page) throw new Error('Nenhuma aba aberta no ifood-browser.');

    await garantirLoja(page, cfg.loja);

    const revenue = await coletarRevenue(page, cfg);

    const saida = MetricasRevenueSchema.parse({
      loja: cfg.loja,
      mes_referencia: revenue.mes_referencia,
      valor_vendas: revenue.valor_vendas,
      taxas_comissoes: revenue.taxas_comissoes,
      servicos_promocoes: revenue.servicos_promocoes,
      total_faturamento: revenue.total_faturamento,
      pedidos: null,
      cancelamentos: null,
      avaliacao: null,
    });

    console.log(JSON.stringify(saida, null, 2));
  } catch (e) {
    console.error('ERRO: ' + e.message);
    process.exit(1);
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

// ── self-check do parser de moeda BR ──────────────────────────────────────────
function selfCheck() {
  const casos = [
    ['R$ 1.129,50', 1129.5],
    ['-R$ 275,05', -275.05],
    ['R$ 0,00', 0],
    ['texto sem valor', null],
  ];
  for (const [entrada, esperado] of casos) {
    const obtido = parseMoedaBR(entrada);
    console.assert(obtido === esperado, `parseMoedaBR("${entrada}") = ${obtido}, esperado ${esperado}`);
  }
  console.log('self-check parseMoedaBR: OK');
}

if (require.main === module) {
  if (process.argv.includes('--self-check')) {
    selfCheck();
  } else {
    main();
  }
}

module.exports = { parseMoedaBR, extrairValorPorLabel, selfCheck };
