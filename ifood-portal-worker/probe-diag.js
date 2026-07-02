// Diagnóstico: roda a lógica do worker (textContent) e imprime o mapa cru + variação innerText.
const { chromium } = require('playwright-core');
(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  try {
    const page = browser.contexts()[0].pages()[0];
    await page.goto('https://portal.ifood.com.br/revenue', { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(()=>{});
    await page.waitForFunction(() => /R\$\s?\d/.test(document.body.innerText), { timeout: 25000 }).catch(()=>{});
    await page.waitForTimeout(6000);

    const diag = await page.evaluate(() => {
      const REGEX = /R\$\s?-?[\d.]+,\d{2}/;
      const spans = [...document.querySelectorAll('span[class*="_variant-heading-2"]')];
      const info = { n_spans: spans.length, mapa_textContent: {}, mapa_innerText: {}, amostra: [] };
      for (const span of spans) {
        const tTc = (span.textContent || '').trim();
        const tIt = (span.innerText || '').trim();
        info.amostra.push({ textContent: tTc, innerText: tIt, casaTc: REGEX.test(tTc), casaIt: REGEX.test(tIt) });
        // lógica worker (textContent)
        if (REGEX.test(tTc)) {
          let label = null, node = span;
          for (let n = 0; n < 3 && !label; n++) { node = node.parentElement; if (!node) break;
            const c = [...node.children].map(x => (x.textContent||'').trim()).find(t => t && t.length < 40 && !REGEX.test(t));
            if (c) label = c; }
          if (label && !(label in info.mapa_textContent)) info.mapa_textContent[label] = tTc;
        }
        // lógica probe (innerText)
        if (REGEX.test(tIt)) {
          let label = null, node = span;
          for (let n = 0; n < 3 && !label; n++) { node = node.parentElement; if (!node) break;
            const c = [...node.children].map(x => (x.innerText||'').trim()).find(t => t && t.length < 40 && !REGEX.test(t));
            if (c) label = c; }
          if (label && !(label in info.mapa_innerText)) info.mapa_innerText[label] = tIt;
        }
      }
      info.amostra = info.amostra.slice(0, 6);
      return info;
    });
    console.log(JSON.stringify(diag, null, 2));
    await page.goto('https://portal.ifood.com.br/reviews/search', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(()=>{});
  } catch (e) {
    console.error('PROBE_ERRO:', e.message);
  } finally {
    await browser.close().catch(() => {});
  }
})();
