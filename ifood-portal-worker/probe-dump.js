// Dump por URL (bypassa overlay): /home, /orders, /revenue. Texto bruto p/ mapear métricas.
const { chromium } = require('playwright-core');
const ABAS = {
  home: 'https://portal.ifood.com.br/home',
  orders: 'https://portal.ifood.com.br/orders',
  revenue: 'https://portal.ifood.com.br/revenue',
};
(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  try {
    const page = browser.contexts()[0].pages()[0];
    const lojaAtiva = await page.$eval('[data-testid="restaurant-profile-name"]', el => el.textContent.trim()).catch(() => null);
    console.log('LOJA_ATIVA=', lojaAtiva);

    for (const [nome, url] of Object.entries(ABAS)) {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(e => console.log(nome, 'goto erro', e.message.split('\n')[0]));
      // esperar sumir "Carregando"
      await page.waitForFunction(() => !/Carregando/i.test(document.body.innerText), { timeout: 20000 }).catch(() => {});
      await page.waitForTimeout(4000);
      const texto = await page.evaluate(() => document.body.innerText.replace(/\n{2,}/g, '\n').slice(0, 2500));
      console.log(`\n========== ${nome.toUpperCase()} (${page.url()}) ==========`);
      console.log(texto);
    }
    await page.goto('https://portal.ifood.com.br/reviews/search', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(()=>{});
    console.log('\n=== FIM ===');
  } catch (e) {
    console.error('PROBE_ERRO:', e.message);
  } finally {
    await browser.close().catch(() => {});
  }
})();
