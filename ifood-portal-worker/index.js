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
// Os dois seletores abaixo NUNCA foram probados no DOM real (só o piloto Café
// Container/loja única foi testado). Ficam null até um probe supervisionado com o
// Wandson — garantirLoja() prefere lançar erro pedindo probe a chutar um seletor.
const SELETOR_SWITCHER = null; // TODO probe: seletor do switcher de loja (troca fora do modal inicial)
const SELETOR_NOME_LOJA_ATIVA = null; // TODO probe: onde a UI mostra o nome da loja atualmente ativa

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

// Lê o nome da loja ativa exibido na UI. Retorna null se o seletor ainda não foi
// mapeado (probe pendente) — nunca chuta um seletor.
async function lerNomeLojaAtiva(page) {
  if (!SELETOR_NOME_LOJA_ATIVA) return null;
  const texto = await page.$eval(SELETOR_NOME_LOJA_ATIVA, (el) => el.textContent).catch(() => null);
  return texto ? texto.trim() : null;
}

// Modal "Escolher loja" (mapeado via probe supervisionado em 2026-07-02): pagina 5 de 75 lojas,
// então SEMPRE busca pelo campo `input[placeholder="Busque pelo nome ou ID"]` antes de olhar a
// lista — nunca varre páginas. Itens são `li[role="option"]` dentro de `ul[data-testid="choose-
// restaurant-modal-list"]`; casa pela PRIMEIRA LINHA do innerText (nome da loja) igual, exata, ao
// alvo. Aborta se a busca não isolar exatamente 1 item — nunca clica no item errado.
async function buscarEClicarLojaNoModal(page, modalSel, nomeLoja) {
  const busca = page.locator('input[placeholder="Busque pelo nome ou ID"]');
  await busca.fill(nomeLoja);
  await page.waitForTimeout(1500);

  const itens = page.locator(`${modalSel} li[role="option"]`);
  const textos = await itens.allInnerTexts();
  const primeirasLinhas = textos.map((t) => t.split('\n')[0].trim());
  const alvoTrim = nomeLoja.trim();
  const indices = primeirasLinhas.reduce((acc, linha, i) => {
    if (linha === alvoTrim) acc.push(i);
    return acc;
  }, []);

  if (indices.length === 0) {
    throw new Error(
      `garantirLoja: loja "${nomeLoja}" não encontrada no modal "Escolher loja" (busca não retornou item com nome exato).`
    );
  }
  if (indices.length > 1) {
    throw new Error(
      `garantirLoja: busca "${nomeLoja}" no modal "Escolher loja" retornou ${indices.length} itens com nome exato igual — ambíguo, abortado por segurança.`
    );
  }
  await itens.nth(indices[0]).click();
}

// Procura, dentro de `scopeSel`, um item clicável cujo texto contenha `alvoNormalizado` e clica.
// Retorna true se encontrou e clicou. Usado hoje só pelo switcher (caso b) — seletor ainda pendente
// de probe (SELETOR_SWITCHER).
async function clicarItemLojaNoEscopo(page, scopeSel, alvoNormalizado) {
  return page.evaluate(
    ({ scopeSel, alvoNormalizado }) => {
      const norm = (s) =>
        (s || '')
          .normalize('NFD')
          .replace(/[̀-ͯ]/g, '')
          .trim()
          .toLowerCase();
      const scope = document.querySelector(scopeSel) || document;
      const item = [...scope.querySelectorAll('button,[role="button"],li,a')].find((el) =>
        norm(el.innerText).includes(alvoNormalizado)
      );
      if (!item) return false;
      item.click();
      return true;
    },
    { scopeSel, alvoNormalizado }
  );
}

/**
 * Garante que a sessão do portal está na loja `nomeLoja` antes de qualquer ação. Casos:
 *   (a) modal "Escolher loja" aberto → busca pelo nome e clica;
 *   (b) já logado em loja diferente → abre o switcher (SELETOR_SWITCHER) e troca;
 *   (c) já na loja certa → no-op.
 *
 * PÓS-CONDIÇÃO OBRIGATÓRIA: após qualquer troca, relê o nome da loja ativa na UI e compara
 * (normalizado) com `nomeLoja`. Divergiu → throw. NUNCA prossegue em loja errada.
 *
 * Seletores de switcher/nome-ativo ainda não foram mapeados no DOM real (pendente de probe
 * supervisionado) — quando necessários e ausentes, a função lança erro em vez de adivinhar.
 */
async function garantirLoja(page, nomeLoja) {
  const alvo = normalizarNomeLoja(nomeLoja);
  if (!alvo) throw new Error('garantirLoja: nomeLoja é obrigatório.');

  const modalSel = '[data-testid="choose-restaurant-modal-list"]';
  const modalAberto = await page.$(modalSel).catch(() => null);
  let trocou = false;

  if (modalAberto) {
    // (a) modal "Escolher loja" aberto → buscar (pagina 5 de 75) e clicar no item de nome exato
    await buscarEClicarLojaNoModal(page, modalSel, nomeLoja);
    await settle(page, 4000);
    trocou = true;
  } else {
    const nomeAtual = await lerNomeLojaAtiva(page);
    if (nomeAtual === null) {
      throw new Error(
        'garantirLoja: não há modal de escolha aberto e não foi possível ler a loja ativa na UI ' +
          '(SELETOR_NOME_LOJA_ATIVA ainda não mapeado). Rode um probe supervisionado com o Wandson ' +
          'antes de operar mais de uma loja.'
      );
    }
    if (normalizarNomeLoja(nomeAtual) === alvo) {
      return; // (c) já na loja certa — no-op
    }
    // (b) já logado em loja errada → trocar via switcher
    if (!SELETOR_SWITCHER) {
      throw new Error(
        `garantirLoja: sessão está na loja "${nomeAtual}", diferente da pedida ("${nomeLoja}"), e o ` +
          'seletor do switcher (SELETOR_SWITCHER) ainda não foi mapeado. Rode um probe supervisionado ' +
          'antes de habilitar a troca automática.'
      );
    }
    const abriu = await page
      .click(SELETOR_SWITCHER)
      .then(() => true)
      .catch(() => false);
    if (!abriu) {
      throw new Error('garantirLoja: SELETOR_SWITCHER configurado mas não encontrado no DOM — rode o probe novamente.');
    }
    await settle(page, 1500);
    const clicado = await clicarItemLojaNoEscopo(page, 'body', alvo);
    if (!clicado) throw new Error(`garantirLoja: loja "${nomeLoja}" não encontrada no switcher aberto.`);
    await settle(page, 4000);
    trocou = true;
  }

  if (trocou) {
    const nomeFinal = await lerNomeLojaAtiva(page);
    if (nomeFinal === null) {
      throw new Error(
        'garantirLoja: troca de loja feita, mas não há como confirmar a loja ativa final ' +
          '(SELETOR_NOME_LOJA_ATIVA não mapeado) — abortado por segurança.'
      );
    }
    if (normalizarNomeLoja(nomeFinal) !== alvo) {
      throw new Error(
        `garantirLoja: pós-troca, a UI mostra a loja "${nomeFinal}", esperado "${nomeLoja}". ` +
          'Abortado por segurança (nunca agir em loja errada).'
      );
    }
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
    const page = ctx.pages()[0];
    if (!page) throw new Error('Nenhuma aba aberta no ifood-browser.');
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
