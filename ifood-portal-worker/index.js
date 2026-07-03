// ifood-portal-worker — opera o Portal do Parceiro iFood (loja piloto Café Container) dirigindo
// o Chromium ao vivo via CDP (Playwright). FASE 1 do épico "Consultor de iFood".
//
// SEGURANÇA (inviolável nesta fase):
//   - listarAvaliacoesPendentes() é 100% LEITURA.
//   - preencherResposta() preenche o campo de resposta mas NUNCA submete/envia/publica.
//     Não existe NENHUM código que clique em "Responder"/"Enviar"/"Publicar". O envio é fluxo
//     supervisionado (semáforo amarelo) de uma fase posterior — fora deste arquivo.
//
// Sem throw no topo do módulo: a config é lida em getter lazy; o browser conecta só na chamada.
'use strict';

const { chromium } = require('playwright-core');
const { z } = require('zod');

// ── Config (lazy, sem throw no topo) ──────────────────────────────────────────
// O CDP do ifood-browser escuta SÓ em 127.0.0.1:9222 (o Chromium ignora
// --remote-debugging-address=0.0.0.0 por segurança). Por isso o worker roda
// compartilhando o network namespace do container (docker run --network container:ifood-browser)
// e fala com http://127.0.0.1:9222. Ver README.
function getConfig() {
  return {
    cdpUrl: (process.env.IFOOD_CDP_URL || 'http://127.0.0.1:9222').trim(),
    loja: (process.env.IFOOD_LOJA || 'Café Container').trim(),
    navTimeoutMs: parseInt(process.env.IFOOD_NAV_TIMEOUT_MS || '45000', 10),
  };
}

const REVIEWS_URL = 'https://portal.ifood.com.br/reviews/search';
const TEXTAREA_TESTID = 'review-details-drawer-comment-textarea'; // descoberto via probe read-only

// ── garantirLoja — multi-loja (Fase Gestor F0) ────────────────────────────────
// Fluxo do switcher CONFIRMADO ao vivo via probe supervisionado em 2026-07-02
// (probe-switch13.js): status-indicator-v2 → dialog "Status da loja" → botão
// "Trocar loja" → modal choose-restaurant-modal-list → busca (pressSequentially,
// NUNCA fill — fill não dispara o filtro) → li[role="option"] por match exato.
const NOME_LOJA_ATIVA_SEL = '[data-testid="restaurant-profile-name"]';
const STATUS_INDICATOR_SEL = '[data-testid="status-indicator-v2"]';
const DIALOG_CONTENT_SEL = '[data-testid="dialog-content"]';
const MODAL_LOJAS_SEL = '[data-testid="choose-restaurant-modal-list"]';
const BUSCA_LOJA_SEL = 'input[placeholder="Busque pelo nome ou ID"]';

// ── Schema de saída (boundary validado) ───────────────────────────────────────
const AvaliacaoSchema = z.object({
  id: z.string().min(1), // nº do pedido (coluna "Pedido") — identificador estável visível na lista
  nota: z.number().int().min(1).max(5),
  comentario: z.string().min(1),
  autor: z.string().nullable(), // iFood não expõe o nome do cliente nesta lista → null
  data: z.string().min(1), // data da avaliação (DD/MM/YYYY), como no portal
  status: z.string().min(1), // status bruto (ex.: "2 dias para responder")
  prazo: z.string().nullable(), // prazo extraído do status, se houver (ex.: "2 dias")
});
const ListaSchema = z.array(AvaliacaoSchema);

// ── Helpers de navegação (leitura) ────────────────────────────────────────────
async function settle(page, ms = 2500) {
  await page
    .waitForFunction(() => !/Carregando\.\.\./.test(document.body.innerText), { timeout: 25000 })
    .catch(() => {});
  await page.waitForTimeout(ms);
}

function clickLeafByText(page, reSource) {
  return page.evaluate((src) => {
    const rx = new RegExp(src, 'i');
    const el = [...document.body.querySelectorAll('*')].find(
      (e) => e.children.length === 0 && e.offsetParent !== null && rx.test((e.innerText || '').trim())
    );
    if (!el) return false;
    (el.closest('button,a,[role="button"],[role="tab"],li,div[role]') || el).click();
    return true;
  }, reSource);
}

function normalizarNomeLoja(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase();
}

// Lê o nome da loja ativa exibido no header. Retorna null se o elemento não estiver
// presente (ex.: 1º load pós-login, antes de qualquer loja ser escolhida).
async function lerNomeLojaAtiva(page) {
  const texto = await page.$eval(NOME_LOJA_ATIVA_SEL, (el) => el.textContent).catch(() => null);
  return texto ? texto.trim() : null;
}

// Passo (c) do fluxo: modal "Escolher loja" já aberto → busca por nome (pressSequentially,
// NUNCA fill — probe provou que fill não dispara o filtro) e clica o li[role="option"] cuja
// PRIMEIRA LINHA do texto bate EXATAMENTE com o nome alvo (normalizado).
async function buscarEEscolherLojaNoModal(page, nomeLoja, alvo) {
  await page.waitForSelector(MODAL_LOJAS_SEL, { timeout: 20000 }).catch(() => {
    throw new Error(`garantirLoja: modal "${MODAL_LOJAS_SEL}" não apareceu para buscar a loja.`);
  });

  const busca = page.locator(BUSCA_LOJA_SEL);
  await busca.click();
  await busca.fill(''); // limpa texto residual de execução anterior (fill não dispara filtro, só serve p/ limpar)
  await busca.pressSequentially(nomeLoja, { delay: 100 });
  await page.waitForTimeout(3000); // debounce da busca

  const opcoes = page.locator(`${MODAL_LOJAS_SEL} li[role="option"]`);
  const total = await opcoes.count();
  let alvoIdx = -1;
  for (let i = 0; i < total; i++) {
    const texto = (await opcoes.nth(i).innerText()).trim();
    const primeiraLinha = normalizarNomeLoja(texto.split('\n')[0]);
    if (primeiraLinha === alvo) {
      alvoIdx = i;
      break;
    }
  }
  if (alvoIdx === -1) {
    throw new Error(
      `garantirLoja: loja "${nomeLoja}" não encontrada (match exato) entre ${total} resultado(s) do modal de busca.`
    );
  }
  await opcoes.nth(alvoIdx).click();
  await page.waitForTimeout(4000);
}

/**
 * Garante que a sessão do portal está na loja `nomeLoja` antes de qualquer ação.
 * Fluxo CONFIRMADO ao vivo (probe supervisionado 2026-07-02):
 *   (0) já na loja certa (lê NOME_LOJA_ATIVA_SEL) → no-op;
 *   (a) modal "Escolher loja" já aberto (1º load pós-login) → vai direto à busca (c);
 *   (b) senão: clica STATUS_INDICATOR_SEL → dialog "Status da loja" → botão "Trocar loja" → abre o modal;
 *   (c) busca pelo nome e clica o li[role="option"] de match exato.
 *
 * PÓS-CONDIÇÃO OBRIGATÓRIA: após qualquer troca, relê o nome da loja ativa na UI e compara
 * (normalizado) com `nomeLoja`. Divergiu → throw. NUNCA prossegue em loja errada.
 * Cada passo lança erro claro se o seletor esperado não aparecer — nunca segue às cegas.
 */
async function garantirLoja(page, nomeLoja) {
  const alvo = normalizarNomeLoja(nomeLoja);
  if (!alvo) throw new Error('garantirLoja: nomeLoja é obrigatório.');

  const nomeAtual = await lerNomeLojaAtiva(page);
  if (nomeAtual !== null && normalizarNomeLoja(nomeAtual) === alvo) {
    return; // já na loja certa — no-op
  }

  const modalJaAberto = await page.$(MODAL_LOJAS_SEL).catch(() => null);
  if (!modalJaAberto) {
    // (b) abre o dialog "Status da loja" → botão "Trocar loja"
    await page.waitForSelector(STATUS_INDICATOR_SEL, { timeout: 20000 }).catch(() => {
      throw new Error(`garantirLoja: header "${STATUS_INDICATOR_SEL}" não encontrado.`);
    });
    await page.click(STATUS_INDICATOR_SEL);
    await page.waitForSelector(DIALOG_CONTENT_SEL, { timeout: 20000 }).catch(() => {
      throw new Error('garantirLoja: dialog "Status da loja" não abriu após clicar no header.');
    });

    const btnTrocar = page.locator(`${DIALOG_CONTENT_SEL} button`, { hasText: 'Trocar loja' });
    if ((await btnTrocar.count()) === 0) {
      throw new Error('garantirLoja: botão "Trocar loja" não encontrado dentro do dialog "Status da loja".');
    }
    await btnTrocar.first().click();
  }

  // (c) busca + seleção no modal
  await buscarEEscolherLojaNoModal(page, nomeLoja, alvo);

  // PÓS-CONDIÇÃO: relê a loja ativa e confirma o match — nunca segue em loja errada.
  const nomeFinal = await lerNomeLojaAtiva(page);
  if (nomeFinal === null) {
    throw new Error(
      `garantirLoja: pós-troca, "${NOME_LOJA_ATIVA_SEL}" não foi encontrado — não há como confirmar a loja ativa. Abortado por segurança.`
    );
  }
  if (normalizarNomeLoja(nomeFinal) !== alvo) {
    throw new Error(
      `garantirLoja: pós-troca, a UI mostra a loja "${nomeFinal}", esperado "${nomeLoja}". ` +
        'Abortado por segurança (nunca agir em loja errada).'
    );
  }
}

// Garante que a aba principal está em /reviews/search no contexto da loja piloto. SOMENTE leitura
// (selecionar "Portal do Parceiro" é navegação, não escrita).
async function abrirListaDeAvaliacoes(page, cfg) {
  await garantirLoja(page, cfg.loja);
  await settle(page, 1500);

  // /chains: escolher "Portal do Parceiro" (loja única) → /home
  if (/\/chains/.test(page.url())) {
    const ok = await clickLeafByText(page, 'Portal do Parceiro');
    if (!ok) throw new Error('Não encontrei a opção "Portal do Parceiro" em /chains (layout mudou?).');
    await settle(page, 6000);
  }

  // Navega direto para a busca de avaliações
  if (!/\/reviews\/search/.test(page.url())) {
    await page.goto(REVIEWS_URL, { waitUntil: 'domcontentloaded', timeout: cfg.navTimeoutMs });
    await settle(page, 4000);
  }

  // Espera a tabela
  await page
    .waitForSelector('[data-testid="table"], table', { timeout: 30000 })
    .catch(() => {
      throw new Error('Tabela de avaliações não carregou em ' + REVIEWS_URL + ' (sessão deslogada ou layout mudou?).');
    });
  await settle(page, 1500);
}

async function withPortal(fn) {
  const cfg = getConfig();
  const browser = await chromium.connectOverCDP(cfg.cdpUrl);
  try {
    const ctx = browser.contexts()[0];
    if (!ctx) throw new Error('Nenhum contexto no browser CDP — o ifood-browser está logado?');
    const paginas = ctx.pages();
    if (!paginas.length) throw new Error('Nenhuma aba aberta no ifood-browser.');
    // Sobra de aba de login antiga (nunca fechada) engana pages()[0] — prioriza a 1ª aba
    // autenticada; se todas forem /login, cai no fallback antigo (pages()[0]).
    const page = paginas.find((p) => !p.url().startsWith('https://portal.ifood.com.br/login')) || paginas[0];
    return await fn(page, cfg);
  } finally {
    // connectOverCDP: close() só desconecta; não fecha o browser do Wandson.
    await browser.close().catch(() => {});
  }
}

// ── API ───────────────────────────────────────────────────────────────────────

/**
 * Lê do Portal as avaliações QUE TÊM COMENTÁRIO e AINDA NÃO FORAM RESPONDIDAS (status com
 * "para responder"). 100% leitura. Retorna [] se não houver pendentes; lança erro claro se a
 * tabela não estiver disponível.
 *
 * ponytail: lê só a 1ª página da tabela (ordenada por data desc). Pendentes têm prazo curto e são
 * sempre recentes → ficam no topo. Se um dia precisar varrer tudo: aplicar o filtro "Possui
 * comentários=Sim" + "Status=não respondida" e paginar.
 */
async function listarAvaliacoesPendentes() {
  return withPortal(async (page, cfg) => {
    await abrirListaDeAvaliacoes(page, cfg);

    const linhas = await page.evaluate(() => {
      const table = document.querySelector('[data-testid="table"], table');
      if (!table) return null;
      const headers = [...table.querySelectorAll('thead th, [role="columnheader"]')].map((h) =>
        (h.innerText || '').trim().toLowerCase()
      );
      const idx = (re) => headers.findIndex((h) => re.test(h));
      const col = {
        pedido: idx(/pedido/),
        dataAval: idx(/data da avalia/),
        nota: idx(/nota/),
        coment: idx(/coment/),
        status: idx(/status/),
      };
      const rows = [...table.querySelectorAll('tbody tr, [role="row"]')].filter(
        (r) => r.querySelectorAll('td,[role="cell"]').length
      );
      return rows.map((r) => {
        const cells = [...r.querySelectorAll('td,[role="cell"]')].map((c) => (c.innerText || '').trim());
        return {
          pedido: cells[col.pedido] || '',
          dataAval: cells[col.dataAval] || '',
          nota: cells[col.nota] || '',
          coment: cells[col.coment] || '',
          status: cells[col.status] || '',
        };
      });
    });

    if (linhas === null) throw new Error('Tabela de avaliações não encontrada no DOM.');

    const pendentes = linhas
      .filter((l) => l.coment && l.coment !== '-' && /para responder/i.test(l.status))
      .map((l) => {
        const prazoMatch = l.status.match(/(\d+\s*d(?:ia|ias|))/i);
        return {
          id: l.pedido,
          nota: parseInt(l.nota, 10),
          comentario: l.coment,
          autor: null,
          data: l.dataAval,
          status: l.status.replace(/\s+/g, ' ').trim(),
          prazo: prazoMatch ? prazoMatch[1].trim() : null,
        };
      })
      .filter((a) => Number.isInteger(a.nota)); // descarta linha com nota ilegível (sem "chutar")

    return ListaSchema.parse(pendentes); // valida o boundary de saída
  });
}

/**
 * Localiza a avaliação pelo nº do pedido, abre o drawer de detalhe e DIGITA `texto` no campo de
 * resposta. NÃO SUBMETE — não há código que clique em Responder/Enviar/Publicar. Retorna o estado
 * (preenchido=true, enviado=false) e o reviewId/orderId (UUIDs) que o portal expõe na URL do drawer.
 *
 * ⚠️ FASE 1: NÃO executar contra o portal real (teste supervisionado depois). Por isso exige a
 * flag explícita { permitirPreenchimento: true } — sem ela, a função recusa e não toca em nada.
 */
async function preencherResposta(orderId, texto, opts = {}) {
  const pedido = String(orderId || '').trim();
  const resposta = String(texto || '').trim();
  if (!pedido) throw new Error('preencherResposta: orderId (nº do pedido) é obrigatório.');
  if (!resposta) throw new Error('preencherResposta: texto da resposta é obrigatório.');
  if (opts.permitirPreenchimento !== true) {
    throw new Error(
      'preencherResposta: bloqueado por segurança. Passe { permitirPreenchimento: true } ' +
        'para preencher (mesmo assim NUNCA envia). FASE 1 = não rodar contra o portal real.'
    );
  }

  return withPortal(async (page, cfg) => {
    await abrirListaDeAvaliacoes(page, cfg);

    // Abre o drawer da linha do pedido alvo (clicar a célula do comentário = navegação/leitura).
    const aberto = await page.evaluate((alvo) => {
      const table = document.querySelector('[data-testid="table"], table');
      if (!table) return 'no-table';
      const row = [...table.querySelectorAll('tbody tr,[role="row"]')].find((r) => {
        const c = r.querySelector('td,[role="cell"]');
        return c && (c.innerText || '').trim() === alvo;
      });
      if (!row) return 'no-row';
      // índice da coluna "Comentário" pelo header (não fixo) — robusto a reordenação de colunas
      const headers = [...table.querySelectorAll('thead th,[role="columnheader"]')].map((h) =>
        (h.innerText || '').trim().toLowerCase()
      );
      const comentIdx = headers.findIndex((h) => /coment/.test(h));
      const cells = [...row.querySelectorAll('td,[role="cell"]')];
      (cells[comentIdx] || row).click(); // coluna Comentário → abre o drawer de detalhe
      return 'ok';
    }, pedido);

    if (aberto === 'no-table') throw new Error('Tabela não encontrada ao preencher resposta.');
    if (aberto === 'no-row') throw new Error(`Pedido ${pedido} não está na lista visível.`);

    // Espera o textarea do drawer e preenche (NÃO envia).
    const sel = `textarea[data-testid="${TEXTAREA_TESTID}"]`;
    await page.waitForSelector(sel, { timeout: 15000 }).catch(() => {
      throw new Error('Campo de resposta (textarea do drawer) não apareceu — layout mudou?');
    });
    await page.fill(sel, resposta); // preenche o campo; submissão NUNCA é feita aqui

    // Lê os IDs reais que o portal expõe na URL do drawer (mais estáveis que o nº do pedido).
    const url = page.url();
    const reviewId = (url.match(/selectedReviewId=([0-9a-f-]+)/i) || [])[1] || null;
    const realOrderId = (url.match(/selectedOrderId=([0-9a-f-]+)/i) || [])[1] || null;

    return { ok: true, pedido, reviewId, orderId: realOrderId, preenchido: true, enviado: false };
  });
}

/**
 * PUBLICA a resposta: clica o botão "Enviar resposta" do drawer JÁ ABERTO E PREENCHIDO (chamar
 * preencherResposta antes). É o ÚNICO ponto que envia algo ao cliente → semáforo AMARELO: só roda
 * sob aprovação explícita do Wandson para aquele texto específico. Exige { permitirEnvio: true }.
 *
 * VÍNCULO DE CONSENTIMENTO (anti-TOCTOU): o envio é amarrado ao texto aprovado. `textoEsperado` é
 * obrigatório e DEVE ser idêntico ao que está no campo agora — se divergir (drawer trocou, texto
 * editado, review diferente), ABORTA sem enviar. Opcional `opts.reviewId` cruza o selectedReviewId
 * da URL do drawer. O botão é casado por texto EXATO (não regex parcial) e o envio aborta se houver
 * 0, >1 ou botão desabilitado.
 *
 * Retorna { ok, enviado:true, reviewId, textoEnviado }. NÃO recarrega nem confirma o status — o
 * chamador deve recarregar /reviews/search e checar que virou "Resposta enviada" (ver skill passo 6).
 */
async function enviarResposta(textoEsperado, opts = {}) {
  const esperado = String(textoEsperado || '').trim();
  if (!esperado)
    throw new Error(
      'enviarResposta: textoEsperado (o texto exatamente aprovado) é obrigatório — ele vincula o ' +
        'envio ao consentimento. Sem ele não há como garantir que se publica o texto certo.'
    );
  if (opts.permitirEnvio !== true) {
    throw new Error(
      'enviarResposta: bloqueado por segurança. Passe { permitirEnvio: true } SOMENTE após o ' +
        'Wandson aprovar o texto no viewer (semáforo amarelo). Nunca envie sem "ok" explícito.'
    );
  }
  return withPortal(async (page) => {
    // 1) Há um drawer de avaliação aberto? (selectedReviewId na URL)
    const reviewIdAtual = (page.url().match(/selectedReviewId=([0-9a-f-]+)/i) || [])[1] || null;
    if (!reviewIdAtual)
      throw new Error(
        'enviarResposta: nenhum drawer de avaliação aberto (selectedReviewId ausente). ' +
          'Rode preencherResposta antes. Abortado.'
      );
    // 2) O review aberto é o aprovado? (se o chamador passou reviewId)
    if (opts.reviewId && opts.reviewId !== reviewIdAtual)
      throw new Error(
        `enviarResposta: review aberto (${reviewIdAtual}) ≠ aprovado (${opts.reviewId}). ` +
          'Consentimento não vinculado — abortado.'
      );
    // 3) O texto no campo é EXATAMENTE o aprovado? (consent binding / anti-TOCTOU)
    const sel = `textarea[data-testid="${TEXTAREA_TESTID}"]`;
    const valor = await page.$eval(sel, (t) => t.value).catch(() => null);
    if (valor === null)
      throw new Error('enviarResposta: campo de resposta não encontrado (drawer fechou?). Abortado.');
    if (valor.trim() !== esperado)
      throw new Error(
        'enviarResposta: o texto no campo difere do aprovado (alteração entre aprovar e enviar?). ' +
          'NÃO enviado — abortado por segurança.'
      );

    // 4) Botão por texto EXATO; aborta se 0, ambíguo (>1) ou desabilitado.
    const r = await page.evaluate(() => {
      const ta = document.querySelector('textarea[data-testid="review-details-drawer-comment-textarea"]');
      const scope = (ta && ta.closest('[role="dialog"],aside,section,form,div[class*="drawer"]')) || document.body;
      const btns = [...scope.querySelectorAll('button,[role="button"]')].filter(
        (e) => (e.innerText || '').trim().toLowerCase() === 'enviar resposta'
      );
      if (btns.length === 0) return 'no-btn';
      if (btns.length > 1) return 'ambiguous';
      const b = btns[0];
      if (b.disabled || b.getAttribute('aria-disabled') === 'true') return 'disabled';
      b.click();
      return 'clicked';
    });
    if (r === 'no-btn') throw new Error('Botão "Enviar resposta" não encontrado no drawer. Abortado.');
    if (r === 'ambiguous')
      throw new Error('Mais de um botão "Enviar resposta" no drawer — abortado por segurança.');
    if (r === 'disabled') throw new Error('Botão "Enviar resposta" desabilitado — abortado.');

    await page.waitForTimeout(6000); // deixa a submissão completar e o drawer fechar
    return { ok: true, enviado: true, reviewId: reviewIdAtual, textoEnviado: esperado };
  });
}

module.exports = {
  listarAvaliacoesPendentes,
  preencherResposta,
  enviarResposta,
  garantirLoja,
  AvaliacaoSchema,
  ListaSchema,
};
