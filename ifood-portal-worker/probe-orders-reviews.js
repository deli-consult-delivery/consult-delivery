// Probe: /orders (estrutura, filtro de período, pedidos/cancelamentos) + /reviews (nota média).
const { chromium } = require('playwright-core');
const { garantirLoja } = require('./index');
(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  try {
    const paginas = browser.contexts()[0].pages();
    const page = paginas.find((p) => !p.url().startsWith('https://portal.ifood.com.br/login')) || paginas[0];

    await garantirLoja(page, 'Café Container - Lanches e Salgados');

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
      // linhas da orders-list (uma por pedido) + coluna de status, se houver
      const lista = document.querySelector('[data-testid="orders-list"]');
      out.orders_list_presente = Boolean(lista);
      out.orders_list_texto = lista ? lista.innerText.replace(/\n{2,}/g,'\n').slice(0, 1500) : null;
      // linhas de tabela (tr) com status para contar cancelados na página atual
      out.linhas_tabela = [...document.querySelectorAll('tr,[role="row"]')].map(r => (r.innerText||'').replace(/\n/g,' | ').trim()).filter(Boolean).slice(0, 20);
      return out;
    });
    console.log('===== ORDERS =====');
    console.log(JSON.stringify(orders, null, 2));

    // ===== /reviews =====
    await page.goto('https://portal.ifood.com.br/reviews/search', { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(()=>{});
    await page
      .waitForFunction(() => /avalia/i.test(document.body.innerText) && document.body.innerText.length > 200, { timeout: 25000 })
      .catch(() => {});
    await page.waitForTimeout(8000);
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

    // ===== Desempenho: sub-aba dentro de /reviews (React SPA, sem <a href>) — clicar no
    // elemento de texto exato "Desempenho" (leitura pura, não é sidebar/overlay) e ler a URL
    // resultante para depois trocar por page.goto() no runner real.
    const achouTab = await page.evaluate(() => {
      const alvo = [...document.querySelectorAll('button,[role="tab"],a,div,span')].find(
        (e) => (e.innerText || '').trim() === 'Desempenho' && e.offsetParent
      );
      if (!alvo) return null;
      alvo.setAttribute('data-probe-alvo', '1');
      return { tag: alvo.tagName, testid: alvo.getAttribute('data-testid'), outer: alvo.outerHTML.slice(0, 200) };
    });
    console.log('===== TAB DESEMPENHO (elemento) =====');
    console.log(JSON.stringify(achouTab, null, 2));

    if (achouTab) {
      await page.click('[data-probe-alvo="1"]').catch((e) => console.error('click falhou:', e.message));
      await page.waitForTimeout(6000);
      const desempenho = await page.evaluate(() => {
        const out = {};
        out.url = location.href;
        out.candidatos_nota = [...document.querySelectorAll('*')]
          .filter((e) => e.children.length === 0)
          .map((e) => (e.innerText || '').trim())
          .filter((t) => /^\d[.,]\d{1,2}$/.test(t))
          .slice(0, 15);
        out.testids = [...new Set([...document.querySelectorAll('[data-testid]')].map((e) => e.getAttribute('data-testid')))]
          .filter((t) => /review|rating|star|nota|score|avali|desempenho|performance/i.test(t))
          .slice(0, 30);
        out.body_amostra = document.body.innerText.replace(/\n{2,}/g, '\n').slice(0, 1200);
        return out;
      });
      console.log('===== DESEMPENHO =====');
      console.log(JSON.stringify(desempenho, null, 2));
    } else {
      console.log('===== DESEMPENHO: elemento com texto "Desempenho" não encontrado =====');
    }
  } catch (e) {
    console.error('PROBE_ERRO:', e.message);
  } finally {
    await browser.close().catch(() => {});
  }
})();
