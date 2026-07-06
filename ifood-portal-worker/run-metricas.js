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

// Monta um mapa {label: valorBruto} numa única passada: acha os spans
// `_variant-heading-2` que contêm um valor R$ (os resumos do /revenue), depois sobe até 3
// níveis de parentElement procurando, em cada nível, o primeiro filho cujo texto NÃO é R$ e
// tem <40 chars — esse é o rótulo. Comprovado ao vivo (probe-revenue.js, 2026-07-02): o valor
// NÃO fica no mesmo bloco do rótulo (a extração por closest() falhava), o rótulo é um
// irmão/ancestral próximo do span de valor. IMPORTANTE: usar innerText, não textContent — o
// portal renderiza texto oculto/decorativo em nós que textContent inclui e innerText ignora
// (diagnóstico ao vivo: textContent → mapa vazio, innerText → os 5 rótulos corretos).
function extrairMapaLabelValor(page) {
  return page.evaluate(() => {
    const REGEX_VALOR = /R\$\s?-?[\d.]+,\d{2}/;
    const spans = [...document.querySelectorAll('span[class*="_variant-heading-2"]')];
    const mapa = {};
    for (const span of spans) {
      const texto = (span.innerText || '').trim();
      if (!REGEX_VALOR.test(texto)) continue;

      let label = null;
      let node = span;
      for (let nivel = 0; nivel < 3 && !label; nivel++) {
        node = node.parentElement;
        if (!node) break;
        const candidato = [...node.children]
          .map((c) => (c.innerText || '').trim())
          .find((t) => t && t.length < 40 && !REGEX_VALOR.test(t));
        if (candidato) label = candidato;
      }
      if (label && !(label in mapa)) mapa[label] = texto;
    }
    return mapa;
  });
}

async function extrairMesReferencia(page) {
  return page.evaluate(() => {
    const m = document.body.innerText.match(/[A-ZÇÃa-zçã]+\s+de\s+\d{4}/);
    return m ? m[0] : null;
  });
}

const ORDERS_URL = 'https://portal.ifood.com.br/orders';
const PERFORMANCE_URL = 'https://portal.ifood.com.br/reviews/performance';

const MetricasRevenueSchema = z.object({
  loja: z.string(),
  mes_referencia: z.string().nullable(),
  valor_vendas: z.number().nullable(),
  taxas_comissoes: z.number().nullable(),
  servicos_promocoes: z.number().nullable(),
  total_faturamento: z.number().nullable(),
  // pedidos/cancelamentos = contagem do grupo "Ontem" em /orders (dia anterior fechado, mesma
  // semântica do financeiro); avaliacao = nota "Sobre a loja" em /reviews/performance.
  // Probe ao vivo 2026-07-03 (Café Container): 21 pedidos / 0 cancelamentos / nota 5.
  pedidos: z.number().int().nullable(),
  cancelamentos: z.number().int().nullable(),
  avaliacao: z.number().nullable(),
});

// Lê o grupo "Ontem" (dia anterior) na lista de /orders, já filtrada por aba de situação.
// Não acha o grupo mas a página carregou normalmente (orders-filter-v2 presente) → 0 é real
// (dia sem pedidos/cancelamentos, não falha de extração). Página não carregou → null.
async function extrairPedidosGrupoOntem(page) {
  const carregou = await page.evaluate(() => Boolean(document.querySelector('[data-testid="orders-filter-v2"]')));
  if (!carregou) return null;
  return page.evaluate(() => {
    const linhas = document.body.innerText.split('\n');
    for (let i = 0; i < linhas.length; i++) {
      if (linhas[i].trim() === 'Ontem') {
        const m = (linhas[i + 1] || '').match(/(\d+)\s*pedidos?/);
        return m ? parseInt(m[1], 10) : 0;
      }
    }
    return 0;
  });
}

async function coletarPedidosCancelamentos(page, cfg) {
  await page.goto(ORDERS_URL, { waitUntil: 'domcontentloaded', timeout: cfg.navTimeoutMs });
  await page
    .waitForFunction(() => /Digite o número do pedido/.test(document.body.innerText), { timeout: 25000 })
    .catch(() => {});
  await page.waitForTimeout(5000);

  const pedidos = await extrairPedidosGrupoOntem(page);

  const abaCancelados = page.locator('button,[role="tab"]', { hasText: 'Cancelados' });
  let cancelamentos = null;
  if ((await abaCancelados.count()) > 0) {
    await abaCancelados.first().click();
    await page.waitForTimeout(5000);
    cancelamentos = await extrairPedidosGrupoOntem(page);
  }

  return { pedidos, cancelamentos };
}

// Nota "Sobre a loja" em /reviews/performance: 2 blocos `[data-testid="summary"]` (loja/entrega,
// SVG sem texto) — escolhe pelo texto do ancestral ("Sobre a loja" vs "Sobre a entrega") e lê o
// <h1> irmão do summary-star-rating. Confirmado ao vivo 2026-07-03 (Café Container: "5").
async function coletarAvaliacao(page, cfg) {
  await page.goto(PERFORMANCE_URL, { waitUntil: 'domcontentloaded', timeout: cfg.navTimeoutMs });
  await page
    .waitForFunction(() => document.querySelectorAll('[data-testid="summary"]').length >= 1, { timeout: 25000 })
    .catch(() => {});
  await page.waitForTimeout(3000);

  return page.evaluate(() => {
    const summaries = [...document.querySelectorAll('[data-testid="summary"]')];
    for (const s of summaries) {
      let ancestral = s;
      let contexto = null;
      for (let i = 0; i < 8 && ancestral; i++) {
        const m = (ancestral.innerText || '').match(/Sobre a (loja|entrega)/);
        if (m) {
          contexto = m[1];
          break;
        }
        ancestral = ancestral.parentElement;
      }
      if (contexto === 'loja') {
        const h1 = s.querySelector('h1');
        const texto = h1 ? h1.innerText.trim() : null;
        const numero = texto ? parseFloat(texto.replace(',', '.')) : null;
        return Number.isNaN(numero) ? null : numero;
      }
    }
    return null;
  });
}

async function coletarRevenue(page, cfg) {
  await page.goto(REVENUE_URL, { waitUntil: 'domcontentloaded', timeout: cfg.navTimeoutMs });
  await page
    .waitForFunction(() => /R\$\s?\d/.test(document.body.innerText), { timeout: 25000 })
    .catch(() => {
      throw new Error('coletarRevenue: valores em R$ não apareceram em ' + REVENUE_URL + ' (lazy-load falhou ou layout mudou?).');
    });
  await page.waitForTimeout(6000);

  const mes_referencia = await extrairMesReferencia(page);
  const mapa = await extrairMapaLabelValor(page);
  const valores = {};
  for (const [campo, label] of Object.entries(LABELS)) {
    valores[campo] = parseMoedaBR(mapa[label] ?? null);
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
    const paginas = ctx.pages();
    if (!paginas.length) throw new Error('Nenhuma aba aberta no ifood-browser.');
    // Mesma lógica de withPortal() (index.js) — aba de login antiga nunca fechada engana
    // pages()[0]; prioriza a 1ª aba autenticada, fallback pra pages()[0] se todas forem login.
    const page = paginas.find((p) => !p.url().startsWith('https://portal.ifood.com.br/login')) || paginas[0];

    await garantirLoja(page, cfg.loja);

    const revenue = await coletarRevenue(page, cfg);
    const { pedidos, cancelamentos } = await coletarPedidosCancelamentos(page, cfg);
    const avaliacao = await coletarAvaliacao(page, cfg);

    const saida = MetricasRevenueSchema.parse({
      loja: cfg.loja,
      mes_referencia: revenue.mes_referencia,
      valor_vendas: revenue.valor_vendas,
      taxas_comissoes: revenue.taxas_comissoes,
      servicos_promocoes: revenue.servicos_promocoes,
      total_faturamento: revenue.total_faturamento,
      pedidos,
      cancelamentos,
      avaliacao,
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

module.exports = { parseMoedaBR, extrairMapaLabelValor, selfCheck, extrairPedidosGrupoOntem, coletarPedidosCancelamentos, coletarAvaliacao };
