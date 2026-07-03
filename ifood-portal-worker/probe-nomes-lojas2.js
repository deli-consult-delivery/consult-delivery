// Rodada 2 read-only: retry de termos que não acharam nada ou acharam errado na rodada 1.
// Mesma mecânica de probe-nomes-lojas.js — nunca clica em nenhuma opção, nunca troca de loja.
const { chromium } = require('playwright-core');

const TERMOS = ['Varanda', 'Uraka Burger', 'Uraka', 'Villas Caldo', 'Villas Caldo -'];

(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  try {
    const ctx = browser.contexts()[0];
    const paginas = ctx.pages();
    const page = paginas.find((p) => !p.url().startsWith('https://portal.ifood.com.br/login')) || paginas[0];

    const nomeAntes = await page.$eval('[data-testid="restaurant-profile-name"]', (el) => el.textContent).catch(() => null);
    console.error('LOJA_ATIVA_ANTES=', nomeAntes);

    await page.locator('[data-testid="status-indicator-v2"]').first().click();
    await page.waitForSelector('[data-testid="dialog-content"]', { timeout: 20000 });
    const trocar = page.locator('[data-testid="dialog-content"] button', { hasText: 'Trocar loja' }).first();
    await trocar.click();
    await page.waitForSelector('[data-testid="choose-restaurant-modal-list"]', { timeout: 20000 });

    const busca = page.locator('input[placeholder="Busque pelo nome ou ID"]');
    const resultados = {};
    for (const termo of TERMOS) {
      await busca.click();
      await busca.fill('');
      await busca.pressSequentially(termo, { delay: 80 });
      await page.waitForTimeout(2800);
      const opcoes = await page.locator('[data-testid="choose-restaurant-modal-list"] li[role="option"]').allInnerTexts();
      resultados[termo] = opcoes.map((t) => t.split('\n')[0]);
      console.error(`TERMO="${termo}" => ${JSON.stringify(resultados[termo])}`);
    }

    await page.keyboard.press('Escape');
    await page.waitForTimeout(1500);

    const nomeDepois = await page.$eval('[data-testid="restaurant-profile-name"]', (el) => el.textContent).catch(() => null);
    console.log(JSON.stringify({ nomeAntes, nomeDepois, resultados }, null, 2));
  } catch (e) {
    console.error('PROBE_ERRO:', e.message);
  } finally {
    await browser.close().catch(() => {});
  }
})();
