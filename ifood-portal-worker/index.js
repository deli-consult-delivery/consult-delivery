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

// Garante que a aba principal está em /reviews/search no contexto da loja piloto. SOMENTE leitura
// (selecionar "Portal do Parceiro" é navegação, não escrita).
async function abrirListaDeAvaliacoes(page, cfg) {
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
 * sob aprovação explícita do Wandson para aquele texto específico. Por isso exige a flag
 * { permitirEnvio: true }. Confere que o textarea tem conteúdo antes de clicar (não envia vazio).
 *
 * Retorna { enviado:true, statusApos } após confirmar pelo recarregamento que o status mudou.
 */
async function enviarResposta(opts = {}) {
  if (opts.permitirEnvio !== true) {
    throw new Error(
      'enviarResposta: bloqueado por segurança. Passe { permitirEnvio: true } SOMENTE após o ' +
        'Wandson aprovar o texto no viewer (semáforo amarelo). Nunca envie sem "ok" explícito.'
    );
  }
  return withPortal(async (page) => {
    const sel = `textarea[data-testid="${TEXTAREA_TESTID}"]`;
    const valor = await page.$eval(sel, (t) => t.value).catch(() => '');
    if (!valor.trim())
      throw new Error('enviarResposta: campo de resposta vazio (preencha antes). Abortado.');

    const pedido = (await page.$eval('[data-testid="table"] tbody tr [role="cell"], [data-testid="table"] tbody tr td', (c) => (c.innerText || '').trim()).catch(() => null));

    const clicked = await page.evaluate(() => {
      const ta = document.querySelector('textarea[data-testid="review-details-drawer-comment-textarea"]');
      const scope = (ta && ta.closest('[role="dialog"],aside,section,form,div[class*="drawer"]')) || document.body;
      const btn = [...scope.querySelectorAll('button,[role="button"]')].find((e) =>
        /enviar resposta/i.test(e.innerText || '')
      );
      if (!btn) return false;
      btn.click();
      return true;
    });
    if (!clicked) throw new Error('Botão "Enviar resposta" não encontrado no drawer.');

    await page.waitForTimeout(6000); // deixa a submissão completar e o drawer fechar
    return { ok: true, enviado: true, textoEnviado: valor.trim(), pedidoAprox: pedido };
  });
}

module.exports = { listarAvaliacoesPendentes, preencherResposta, enviarResposta, AvaliacaoSchema, ListaSchema };
