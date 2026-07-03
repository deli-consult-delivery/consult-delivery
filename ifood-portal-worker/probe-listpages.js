// Probe read-only: NÃO navega, NÃO clica. Lista todas as páginas de todos os contexts
// visíveis via CDP — usado para diagnosticar qual aba o worker está enxergando como page[0].
const { chromium } = require('playwright-core');
(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  try {
    const contexts = browser.contexts();
    const out = [];
    for (let ci = 0; ci < contexts.length; ci++) {
      const pages = contexts[ci].pages();
      for (let pi = 0; pi < pages.length; pi++) {
        const page = pages[pi];
        const title = await page.title().catch(() => null);
        out.push({ contextIndex: ci, pageIndex: pi, url: page.url(), title });
      }
    }
    console.log(JSON.stringify(out, null, 2));
  } catch (e) {
    console.error('PROBE_ERRO:', e.message);
  } finally {
    await browser.close().catch(() => {});
  }
})();
