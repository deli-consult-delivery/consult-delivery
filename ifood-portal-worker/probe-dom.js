// Probe read-only: NÃO navega. Só descreve o DOM atual de page[0].
const { chromium } = require('playwright-core');
(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  try {
    const ctx = browser.contexts()[0];
    const page = ctx.pages()[0];
    console.log('URL=', page.url());
    const info = await page.evaluate(() => {
      const out = {};
      out.hasTableTestid = !!document.querySelector('[data-testid="table"]');
      out.hasTable = !!document.querySelector('table');
      out.testids = [...new Set([...document.querySelectorAll('[data-testid]')].map(e => e.getAttribute('data-testid')))].slice(0, 60);
      out.bodyText = (document.body.innerText || '').slice(0, 1200);
      return out;
    });
    console.log(JSON.stringify(info, null, 2));
  } catch (e) {
    console.error('PROBE_ERRO:', e.message);
  } finally {
    await browser.close().catch(() => {});
  }
})();
