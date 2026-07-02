// Probe: /orders (estrutura, filtro de período, pedidos/cancelamentos) + /reviews (nota média).
const { chromium } = require('playwright-core');
(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  try {
    const page = browser.contexts()[0].pages()[0];

    // ===== /orders =====
    await page.goto('https://portal.ifood.com.br/orders', { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(()=>{});
    await page.waitForTimeout(6000);
    const orders = await page.evaluate(() => {
      const out = {};
      out.testids = [...new Set([...document.querySelectorAll('[data-testid]')].map(e => e.getAttribute('data-testid')))].filter(t => /order|period|filter|date|status|cancel|tab|chip/i.test(t)).slice(0, 40);
      // botões/chips de período visíveis
      out.botoes_periodo = [...document.querySelectorAll('button,[role="tab"],[role="button"]')].filter(e => e.offsetParent && /hoje|ontem|dias|semana|mês|período|per[íi]odo/i.test(e.innerText||'')).map(e => ({ testid: e.getAttribute('data-testid'), txt: (e.innerText||'').trim().slice(0,30) })).slice(0,15);
      // status/labels de cancelado
      out.tem_cancelado = /cancelad/i.test(document.body.innerText);
      out.body_amostra = document.body.innerText.replace(/\n{2,}/g,'\n').slice(0, 800);
      return out;
    });
    console.log('===== ORDERS =====');
    console.log(JSON.stringify(orders, null, 2));

    // ===== /reviews =====
    await page.goto('https://portal.ifood.com.br/reviews/search', { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(()=>{});
    await page.waitForTimeout(6000);
    const reviews = await page.evaluate(() => {
      const out = {};
      // nota média: procurar número tipo 4,7 ou 4.7 perto de "avaliação"/estrelas
      out.candidatos_nota = [...document.querySelectorAll('*')].filter(e => e.children.length===0).map(e => (e.innerText||'').trim()).filter(t => /^\d[\.,]\d{1,2}$/.test(t)).slice(0,10);
      out.testids = [...new Set([...document.querySelectorAll('[data-testid]')].map(e => e.getAttribute('data-testid')))].filter(t => /review|rating|star|nota|score|avali/i.test(t)).slice(0,30);
      out.body_amostra = document.body.innerText.replace(/\n{2,}/g,'\n').slice(0, 700);
      return out;
    });
    console.log('===== REVIEWS =====');
    console.log(JSON.stringify(reviews, null, 2));
  } catch (e) {
    console.error('PROBE_ERRO:', e.message);
  } finally {
    await browser.close().catch(() => {});
  }
})();
