// Probe read-only do modal "Escolher loja": inputs, botões, estrutura dos itens. NÃO clica.
const { chromium } = require('playwright-core');
(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  try {
    const page = browser.contexts()[0].pages()[0];
    console.log('URL=', page.url());
    const info = await page.evaluate(() => {
      const out = {};
      // Inputs em toda a página (busca do modal, se houver)
      out.inputs = [...document.querySelectorAll('input, [role="searchbox"], [contenteditable="true"]')].map(i => ({
        tag: i.tagName, type: i.type || null, placeholder: i.placeholder || null,
        aria: i.getAttribute('aria-label'), testid: i.getAttribute('data-testid'),
        id: i.id || null, name: i.name || null, visivel: !!(i.offsetParent)
      }));
      // Botões visíveis (texto curto)
      out.botoes = [...document.querySelectorAll('button')].filter(b => b.offsetParent).map(b => ({
        texto: (b.innerText || '').trim().slice(0, 40), testid: b.getAttribute('data-testid'),
        aria: b.getAttribute('aria-label'), disabled: b.disabled
      })).slice(0, 25);
      // Estrutura do modal/lista
      const lista = document.querySelector('[data-testid="choose-restaurant-modal-list"]');
      if (lista) {
        out.lista_tag = lista.tagName;
        out.lista_children = [...lista.children].slice(0, 3).map(c => ({
          tag: c.tagName, class: (c.className || '').toString().slice(0, 80),
          role: c.getAttribute('role'), testid: c.getAttribute('data-testid'),
          texto: (c.innerText || '').slice(0, 80), clicavel: c.tagName === 'BUTTON' || c.tagName === 'A' || !!c.onclick || c.getAttribute('role') === 'button'
        }));
        // ancestral modal (procura dialog)
        let p = lista, dlg = null;
        while (p && p !== document.body) { if (p.getAttribute && (p.getAttribute('role') === 'dialog' || p.tagName === 'DIALOG')) { dlg = p; break; } p = p.parentElement; }
        out.dialog = dlg ? { tag: dlg.tagName, testid: dlg.getAttribute('data-testid'), aria: dlg.getAttribute('aria-label') } : null;
        // dentro do dialog (ou da lista), procura input de busca
        const escopo = dlg || lista.parentElement || lista;
        out.busca_no_modal = [...escopo.querySelectorAll('input')].map(i => ({ placeholder: i.placeholder, testid: i.getAttribute('data-testid'), visivel: !!(i.offsetParent) }));
      } else {
        out.lista = 'MODAL NAO ENCONTRADO';
      }
      // Header: elemento que mostra a loja ativa (candidato a switcher)
      out.header_candidatos = [...document.querySelectorAll('header [role="button"], header button, [data-testid*="restaurant"], [data-testid*="store"], [data-testid*="merchant"]')].filter(e => e.offsetParent).map(e => ({
        tag: e.tagName, testid: e.getAttribute('data-testid'), aria: e.getAttribute('aria-label'), texto: (e.innerText || '').trim().slice(0, 50)
      })).slice(0, 10);
      return out;
    });
    console.log(JSON.stringify(info, null, 2));
  } catch (e) {
    console.error('PROBE_ERRO:', e.message);
  } finally {
    await browser.close().catch(() => {});
  }
})();
