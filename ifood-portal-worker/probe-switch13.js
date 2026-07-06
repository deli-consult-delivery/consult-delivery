// Probe 13: CONFIRMAR fluxo do switcher: status-indicator-v2 -> botão "Trocar loja" -> modal.
// Depois seleciona de volta Café Container (deixa estado consistente).
const { chromium } = require('playwright-core');
const ALVO = 'Café Container - Lanches e Salgados';
(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  try {
    const page = browser.contexts()[0].pages()[0];
    console.log('URL=', page.url());

    // 1. abrir status
    await page.locator('[data-testid="status-indicator-v2"]').first().click({ force: true });
    await page.waitForTimeout(1800);

    // 2. clicar "Trocar loja" (por texto, dentro do dialog-content)
    const trocar = page.locator('[data-testid="dialog-content"] button', { hasText: 'Trocar loja' }).first();
    if (!(await trocar.count())) { console.log('BOTAO_TROCAR_NAO_ENCONTRADO'); return; }
    await trocar.click();
    await page.waitForTimeout(3000);

    const abriu = await page.evaluate(() => ({
      modal_lojas: !!document.querySelector('[data-testid="choose-restaurant-modal-list"]'),
      tem_busca: !!document.querySelector('input[placeholder="Busque pelo nome ou ID"]'),
      n_itens: document.querySelectorAll('[data-testid="choose-restaurant-modal-list"] li[role="option"]').length,
    }));
    console.log('APOS_TROCAR_LOJA=', JSON.stringify(abriu));
    if (!abriu.modal_lojas) { console.log('MODAL_NAO_ABRIU'); return; }
    console.log('>>> FLUXO SWITCHER CONFIRMADO: status-indicator-v2 => "Trocar loja" => modal');

    // 3. re-selecionar Café Container p/ deixar consistente
    const busca = page.locator('input[placeholder="Busque pelo nome ou ID"]');
    await busca.click();
    await busca.pressSequentially('Café Container', { delay: 100 });
    await page.waitForTimeout(3000);
    const alvo = page.locator('[data-testid="choose-restaurant-modal-list"] li[role="option"]', { hasText: ALVO }).first();
    if (await alvo.count()) {
      await alvo.click();
      await page.waitForTimeout(4000);
      const final = await page.evaluate(() => document.querySelector('[data-testid="restaurant-profile-name"]')?.innerText ?? null);
      console.log('LOJA_ATIVA_FINAL=', final);
    } else {
      console.log('nao re-selecionou (alvo nao apareceu) — fechar modal');
      await page.keyboard.press('Escape');
    }
  } catch (e) {
    console.error('PROBE_ERRO:', e.message);
  } finally {
    await browser.close().catch(() => {});
  }
})();
