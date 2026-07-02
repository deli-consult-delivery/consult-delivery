// Runner PROBE: garante a loja alvo e dumpa o texto bruto visível das abas do portal (Início,
// Pedidos, Financeiro) para ANÁLISE posterior. NÃO extrai/inventa métrica nenhuma — ainda não
// mapeamos o DOM real de faturamento/pedidos/avaliação/cancelamentos (P1 anti-padrão: sem dado
// confiável = sem número). NÃO faz upsert em loja_metricas.
'use strict';

const { chromium } = require('playwright-core');
const { garantirLoja } = require('./index');

function getConfig() {
  return {
    cdpUrl: (process.env.IFOOD_CDP_URL || 'http://127.0.0.1:9222').trim(),
    loja: (process.env.IFOOD_LOJA || 'Café Container').trim(),
    navTimeoutMs: parseInt(process.env.IFOOD_NAV_TIMEOUT_MS || '45000', 10),
  };
}

const SIDEBAR = {
  home: 'sidebar-single-item-home',
  orders: 'sidebar-single-item-orders-v2',
  financial: 'sidebar-single-item-financial',
};

async function settle(page, ms = 2500) {
  await page
    .waitForFunction(() => !/Carregando\.\.\./.test(document.body.innerText), { timeout: 25000 })
    .catch(() => {});
  await page.waitForTimeout(ms);
}

// TODO(probe): mapear seletores reais de faturamento/pedidos/avaliacao/cancelamentos após
// análise dos dumps abaixo — por ora só dumpamos o texto bruto visível (2000 chars) de cada aba.
async function dumparAba(page, testId) {
  const sel = `[data-testid="${testId}"]`;
  const achou = await page
    .waitForSelector(sel, { timeout: 20000 })
    .then(() => true)
    .catch(() => false);
  if (!achou) return null;
  await page.click(sel);
  await settle(page, 3000);
  const texto = await page.evaluate(() => document.body.innerText.slice(0, 2000));
  return { url: page.url(), texto };
}

(async () => {
  const cfg = getConfig();
  let browser;
  try {
    browser = await chromium.connectOverCDP(cfg.cdpUrl);
    const ctx = browser.contexts()[0];
    if (!ctx) throw new Error('Nenhum contexto no browser CDP — o ifood-browser está logado?');
    const page = ctx.pages()[0];
    if (!page) throw new Error('Nenhuma aba aberta no ifood-browser.');

    await garantirLoja(page, cfg.loja);
    await settle(page, 1500);

    const dumps = {};
    const home = await dumparAba(page, SIDEBAR.home);
    if (home) dumps.home = home.texto;
    const orders = await dumparAba(page, SIDEBAR.orders);
    if (orders) dumps.orders = orders.texto;
    const financial = await dumparAba(page, SIDEBAR.financial);
    if (financial) dumps.financial = financial.texto;

    const saida = { loja: cfg.loja, url_atual: page.url(), dumps };
    console.log(JSON.stringify(saida, null, 2));
  } catch (e) {
    console.error('ERRO: ' + e.message);
    process.exit(1);
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
})();
