// Probe profundo /revenue: espera lazy-load e extrai cada elemento-folha com "R$" + testid/class/label.
const { chromium } = require('playwright-core');
(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  try {
    const page = browser.contexts()[0].pages()[0];
    await page.goto('https://portal.ifood.com.br/revenue', { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(()=>{});
    // esperar aparecer algum valor R$ (lazy-load pode demorar)
    await page.waitForFunction(() => /R\$\s?\d/.test(document.body.innerText), { timeout: 25000 }).catch(() => {});
    await page.waitForTimeout(6000);
    console.log('URL=', page.url());

    const valores = await page.evaluate(() => {
      const out = [];
      const rx = /R\$\s?-?\d/;
      for (const el of document.querySelectorAll('body *')) {
        if (el.children.length !== 0) continue; // só folhas
        const t = (el.innerText || el.textContent || '').trim();
        if (!t || !rx.test(t) || t.length > 40) continue;
        // rótulo: procura texto de um irmão/ancestral próximo
        let label = null, p = el.parentElement;
        for (let i = 0; i < 3 && p; i++, p = p.parentElement) {
          const irmaos = [...p.children].map(c => (c.innerText||'').trim()).filter(x => x && !rx.test(x) && x.length < 40);
          if (irmaos.length) { label = irmaos[0]; break; }
        }
        out.push({ valor: t, label, tag: el.tagName, testid: el.getAttribute('data-testid'), cls: (el.className||'').toString().slice(0,45) });
      }
      return out.slice(0, 40);
    });
    console.log('VALORES_RS=', JSON.stringify(valores, null, 2));

    // também: período/mês selecionado e seletor de período
    const periodo = await page.evaluate(() => {
      const rx = /(janeiro|fevereiro|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\s+de\s+\d{4}/i;
      const el = [...document.querySelectorAll('button,[role="button"],select')].find(e => rx.test(e.innerText||''));
      return el ? { tag: el.tagName, testid: el.getAttribute('data-testid'), texto: (el.innerText||'').trim().slice(0,40) } : null;
    });
    console.log('SELETOR_PERIODO=', JSON.stringify(periodo));
    await page.goto('https://portal.ifood.com.br/reviews/search', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(()=>{});
  } catch (e) {
    console.error('PROBE_ERRO:', e.message);
  } finally {
    await browser.close().catch(() => {});
  }
})();
