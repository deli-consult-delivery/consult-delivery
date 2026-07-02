// Probe: descartar o overlay _dialog-background _status-open e capturar URLs das abas via clique.
const { chromium } = require('playwright-core');
(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  try {
    const page = browser.contexts()[0].pages()[0];
    console.log('URL_inicial=', page.url());

    // Diagnóstico do overlay
    const antes = await page.evaluate(() => {
      const root = document.getElementById('ifdl-modal-root');
      const bgs = root ? [...root.querySelectorAll('[class*="dialog-background"]')] : [];
      return bgs.map(b => ({ cls: (b.className||'').slice(0,60), visivel: b.offsetParent !== null, bloqueia: getComputedStyle(b).pointerEvents !== 'none' }));
    });
    console.log('OVERLAYS_ANTES=', JSON.stringify(antes));

    // Estratégia de dismiss: (1) botão fechar visível; (2) Escape; (3) clicar no próprio background
    const fechou = await page.evaluate(() => {
      const btns = [...document.querySelectorAll('button')].filter(b => b.offsetParent !== null && /fechar|close/i.test(b.getAttribute('aria-label')||''));
      if (btns.length) { btns[0].click(); return 'botao-fechar:' + btns[0].getAttribute('aria-label'); }
      return 'sem-botao-fechar';
    });
    console.log('DISMISS_1=', fechou);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(1500);

    const depois = await page.evaluate(() => {
      const root = document.getElementById('ifdl-modal-root');
      const bgs = root ? [...root.querySelectorAll('[class*="dialog-background"]')].filter(b => b.offsetParent !== null) : [];
      return { overlays_visiveis: bgs.length };
    });
    console.log('OVERLAYS_DEPOIS=', JSON.stringify(depois));

    // Capturar URLs das abas clicando (se overlay saiu)
    const abas = { home: 'sidebar-single-item-home', orders: 'sidebar-single-item-orders-v2', financial: 'sidebar-single-item-financial' };
    const urls = {};
    for (const [nome, tid] of Object.entries(abas)) {
      try {
        await page.click(`[data-testid="${tid}"]`, { timeout: 8000 });
        await page.waitForTimeout(2500);
        urls[nome] = page.url();
      } catch (e) {
        urls[nome] = 'CLICK_FALHOU: ' + e.message.split('\n')[0];
      }
    }
    console.log('URLS_ABAS=', JSON.stringify(urls, null, 2));

    // voltar p/ reviews
    await page.goto('https://portal.ifood.com.br/reviews/search', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(()=>{});
    console.log('OK');
  } catch (e) {
    console.error('PROBE_ERRO:', e.message);
  } finally {
    await browser.close().catch(() => {});
  }
})();
