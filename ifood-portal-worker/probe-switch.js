// Probe 3 (interativo, supervisionado): busca "Café Container" no modal, seleciona a loja
// piloto e mapeia o header pós-seleção para achar o SWITCHER de troca de loja.
const { chromium } = require('playwright-core');
const ALVO = 'Café Container - Lanches e Salgados';
(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  try {
    const page = browser.contexts()[0].pages()[0];
    console.log('URL_antes=', page.url());

    const temModal = await page.locator('[data-testid="choose-restaurant-modal-list"]').count();
    if (!temModal) { console.log('MODAL_NAO_ABERTO — abortando (rodar probe do switcher direto)'); return; }

    // 1. Buscar
    const busca = page.locator('input[placeholder="Busque pelo nome ou ID"]');
    await busca.fill('Café Container');
    await page.waitForTimeout(1500);

    const opcoes = await page.locator('[data-testid="choose-restaurant-modal-list"] li[role="option"]').allInnerTexts();
    console.log('OPCOES_FILTRADAS=', JSON.stringify(opcoes.map(t => t.split('\n')[0])));

    // 2. Clicar na loja alvo (nome EXATO na primeira linha)
    const alvoLi = page.locator('[data-testid="choose-restaurant-modal-list"] li[role="option"]')
      .filter({ hasText: ALVO }).first();
    if (!(await alvoLi.count())) { console.log('ALVO_NAO_ENCONTRADO'); return; }
    await alvoLi.click();
    await page.waitForTimeout(5000);

    console.log('URL_depois=', page.url());

    // 3. Mapear header/topbar: onde está o nome da loja ativa e o que é clicável
    const info = await page.evaluate((alvo) => {
      const out = { alvo_encontrado_em: [] };
      const todos = [...document.querySelectorAll('body *')].filter(e => e.children.length === 0 || e.childElementCount <= 2);
      for (const e of todos) {
        const t = (e.innerText || '').trim();
        if (t && t.length < 120 && t.includes('Café Container')) {
          // sobe até 3 níveis procurando algo clicável
          let clicavel = null, p = e;
          for (let i = 0; i < 4 && p; i++, p = p.parentElement) {
            if (!p.getAttribute) break;
            if (p.tagName === 'BUTTON' || p.getAttribute('role') === 'button' || p.tagName === 'A') {
              clicavel = { tag: p.tagName, testid: p.getAttribute('data-testid'), aria: p.getAttribute('aria-label'), class: (p.className || '').toString().slice(0, 60) };
              break;
            }
          }
          out.alvo_encontrado_em.push({
            tag: e.tagName, testid: e.getAttribute('data-testid'), aria: e.getAttribute('aria-label'),
            class: (e.className || '').toString().slice(0, 60), texto: t.slice(0, 60), ancestral_clicavel: clicavel
          });
        }
      }
      out.alvo_encontrado_em = out.alvo_encontrado_em.slice(0, 8);
      out.testids_pagina = [...new Set([...document.querySelectorAll('[data-testid]')].map(e => e.getAttribute('data-testid')))].slice(0, 60);
      return out;
    }, ALVO);
    console.log(JSON.stringify(info, null, 2));
  } catch (e) {
    console.error('PROBE_ERRO:', e.message);
  } finally {
    await browser.close().catch(() => {});
  }
})();
