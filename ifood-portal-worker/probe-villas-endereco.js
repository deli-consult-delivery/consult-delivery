// Probe read-only: busca "Villas Caldo" no modal "Escolher loja" e lê o texto COMPLETO
// (nome + endereço) de cada opção, sem clicar em nenhuma. Não troca de loja.
const { chromium } = require('playwright-core');
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
    await busca.click();
    await busca.fill('');
    await busca.pressSequentially('Villas Caldo', { delay: 80 });
    await page.waitForTimeout(2800);
    const opcoes = await page.locator('[data-testid="choose-restaurant-modal-list"] li[role="option"]').allInnerTexts();

    await page.keyboard.press('Escape');
    await page.waitForTimeout(1500);
    const nomeDepois = await page.$eval('[data-testid="restaurant-profile-name"]', (el) => el.textContent).catch(() => null);

    console.log(JSON.stringify({ nomeAntes, nomeDepois, opcoesCompletas: opcoes }, null, 2));
  } catch (e) {
    console.error('PROBE_ERRO:', e.message);
  } finally {
    await browser.close().catch(() => {});
  }
})();
