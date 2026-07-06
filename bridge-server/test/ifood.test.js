// bridge-server/test/ifood.test.js — testes UNITÁRIOS de lib/ifood.js (auth, cache,
// retry, paths). Mocka global.fetch: ZERO chamadas de rede reais em qualquer cenário.
// Reseta o module cache entre cenários pra isolar tokenCache/tokenInFlight (estado
// de módulo) — cada check() roda com um require('../lib/ifood') fresco.
//
// Rodar:  node bridge-server/test/ifood.test.js
'use strict';

const assert = require('node:assert');

let failures = 0;
let passes = 0;

async function check(label, fn) {
  try {
    await fn();
    passes++;
    process.stdout.write(`  ok  ${label}\n`);
  } catch (e) {
    failures++;
    process.stdout.write(`  FAIL ${label}: ${e.message}\n`);
  }
}

const IFOOD_MODULE_PATH = require.resolve('../lib/ifood');
function freshIfood() {
  delete require.cache[IFOOD_MODULE_PATH];
  return require('../lib/ifood');
}

function jsonResponse(status, body, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: `status-${status}`,
    text: async () => JSON.stringify(body),
    headers: { get: (name) => headers[name.toLowerCase()] ?? null },
  };
}

function setCreds() {
  process.env.IFOOD_CLIENT_ID = 'client-teste';
  process.env.IFOOD_CLIENT_SECRET = 'secret-teste';
  process.env.IFOOD_BASE_URL = 'https://sandbox.ifood.test';
}
function clearCreds() {
  delete process.env.IFOOD_CLIENT_ID;
  delete process.env.IFOOD_CLIENT_SECRET;
  delete process.env.IFOOD_BASE_URL;
}

const ORIGINAL_FETCH = global.fetch;
function mockFetch(calls, impl) {
  global.fetch = async (url, opts) => {
    calls.push({ url, opts });
    return impl(url, opts, calls);
  };
}
function restoreFetch() {
  global.fetch = ORIGINAL_FETCH;
}

(async () => {
  // ── Config / credencial ausente ────────────────────────────────────────────
  await check('getAccessToken sem credenciais → IfoodApiError status 0, zero fetch', async () => {
    clearCreds();
    const calls = [];
    mockFetch(calls, () => { throw new Error('não deveria chamar fetch sem credencial'); });
    const ifood = freshIfood();
    await assert.rejects(
      () => ifood.getAccessToken(),
      (err) => err.name === 'IfoodApiError' && err.status === 0
    );
    assert.strictEqual(calls.length, 0);
    restoreFetch();
  });

  // ── Token: grant client_credentials + headers + cache ──────────────────────
  await check('getAccessToken: grant client_credentials, headers e cache reusado', async () => {
    setCreds();
    const calls = [];
    mockFetch(calls, () => jsonResponse(200, { accessToken: 'tok-abc', expiresIn: 21600, type: 'bearer' }));
    const ifood = freshIfood();

    const token1 = await ifood.getAccessToken();
    assert.strictEqual(token1, 'tok-abc');
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].url, 'https://sandbox.ifood.test/authentication/v1.0/oauth/token');
    assert.strictEqual(calls[0].opts.method, 'POST');
    assert.strictEqual(calls[0].opts.headers['Content-Type'], 'application/x-www-form-urlencoded');
    const bodyParams = new URLSearchParams(calls[0].opts.body);
    assert.strictEqual(bodyParams.get('grantType'), 'client_credentials');
    assert.strictEqual(bodyParams.get('clientId'), 'client-teste');
    assert.strictEqual(bodyParams.get('clientSecret'), 'secret-teste');

    const token2 = await ifood.getAccessToken();
    assert.strictEqual(token2, 'tok-abc');
    assert.strictEqual(calls.length, 1, 'segunda chamada deveria reusar o cache, sem novo fetch');
    restoreFetch();
    clearCreds();
  });

  // ── Token: renovação dentro da margem de 5min (RENEW_SKEW_MS) ──────────────
  await check('getAccessToken: expiresIn menor que a margem de 5min → renova a cada chamada', async () => {
    setCreds();
    const calls = [];
    let n = 0;
    mockFetch(calls, () => {
      n++;
      return jsonResponse(200, { accessToken: `tok-${n}`, expiresIn: 60 }); // 60s < skew de 5min
    });
    const ifood = freshIfood();
    const t1 = await ifood.getAccessToken();
    const t2 = await ifood.getAccessToken();
    assert.strictEqual(t1, 'tok-1');
    assert.strictEqual(t2, 'tok-2');
    assert.strictEqual(calls.length, 2, 'cada chamada deveria pedir token novo (dentro da margem de renovação)');
    restoreFetch();
    clearCreds();
  });

  // ── Retry: 429 → retenta e sucede ───────────────────────────────────────────
  await check('withRetry: 429 seguido de 200 → retenta e sucede (GET)', async () => {
    setCreds();
    const calls = [];
    mockFetch(calls, (url) => {
      if (url.endsWith('/authentication/v1.0/oauth/token')) {
        return jsonResponse(200, { accessToken: 'tok-retry', expiresIn: 21600 });
      }
      const merchantCalls = calls.filter((c) => c.url.includes('/merchant/v1.0/merchants')).length;
      if (merchantCalls === 1) return jsonResponse(429, { message: 'rate limited' });
      return jsonResponse(200, [{ id: 'm1', name: 'Loja Teste' }]);
    });
    const ifood = freshIfood();
    const merchants = await ifood.listarMerchants();
    assert.deepStrictEqual(merchants, [{ id: 'm1', name: 'Loja Teste' }]);
    const merchantCalls = calls.filter((c) => c.url.includes('/merchant/v1.0/merchants'));
    assert.strictEqual(merchantCalls.length, 2, 'deveria ter retentado 1x após o 429');
    restoreFetch();
    clearCreds();
  });

  // ── Retry: 404 não é retentável (só 429/5xx) ────────────────────────────────
  await check('withRetry: 404 não retenta (só 429/5xx)', async () => {
    setCreds();
    const calls = [];
    mockFetch(calls, (url) => {
      if (url.endsWith('/authentication/v1.0/oauth/token')) {
        return jsonResponse(200, { accessToken: 'tok-404', expiresIn: 21600 });
      }
      return jsonResponse(404, { message: 'not found' });
    });
    const ifood = freshIfood();
    await assert.rejects(() => ifood.getStatusLoja('merchant-abc-123'), (err) => err.status === 404);
    const statusCalls = calls.filter((c) => c.url.includes('/status'));
    assert.strictEqual(statusCalls.length, 1, '404 não é retentável — só 1 tentativa');
    restoreFetch();
    clearCreds();
  });

  // ── Paths — Merchant / Review (GET) ─────────────────────────────────────────
  await check('getStatusLoja / listarReviews: path e Authorization corretos', async () => {
    setCreds();
    const calls = [];
    mockFetch(calls, (url) => {
      if (url.endsWith('/authentication/v1.0/oauth/token')) {
        return jsonResponse(200, { accessToken: 'tok-paths', expiresIn: 21600 });
      }
      if (url.includes('/merchant/v1.0/merchants/merchant-1/status')) {
        return jsonResponse(200, { available: true });
      }
      if (url.includes('/review/v2.0/merchants/merchant-1/reviews')) {
        return jsonResponse(200, [{ id: 'rev-1' }]);
      }
      return jsonResponse(404, {});
    });
    const ifood = freshIfood();

    const status = await ifood.getStatusLoja('merchant-1');
    assert.deepStrictEqual(status, { available: true });
    const reviews = await ifood.listarReviews('merchant-1');
    assert.deepStrictEqual(reviews, [{ id: 'rev-1' }]);

    const statusCall = calls.find((c) => c.url.includes('/status'));
    const reviewsCall = calls.find((c) => c.url.includes('/reviews') && !c.url.includes('/answers'));
    assert.strictEqual(statusCall.opts.headers.Authorization, 'Bearer tok-paths');
    assert.strictEqual(reviewsCall.opts.headers.Authorization, 'Bearer tok-paths');
    restoreFetch();
    clearCreds();
  });

  // ── getSummaryReviews — path correto + cache curto em memória ───────────────
  await check('getSummaryReviews: path correto e reusa cache dentro do TTL', async () => {
    setCreds();
    const calls = [];
    mockFetch(calls, (url) => {
      if (url.endsWith('/authentication/v1.0/oauth/token')) {
        return jsonResponse(200, { accessToken: 'tok-summary', expiresIn: 21600 });
      }
      if (url.includes('/review/v2.0/merchants/merchant-1/summary')) {
        return jsonResponse(200, { totalReviewsCount: 5, validReviewsCount: 4, score: 4.2 });
      }
      return jsonResponse(404, {});
    });
    const ifood = freshIfood();

    const s1 = await ifood.getSummaryReviews('merchant-1');
    assert.deepStrictEqual(s1, { totalReviewsCount: 5, validReviewsCount: 4, score: 4.2 });
    const s2 = await ifood.getSummaryReviews('merchant-1');
    assert.deepStrictEqual(s2, s1);

    const summaryCalls = calls.filter((c) => c.url.includes('/summary'));
    assert.strictEqual(summaryCalls.length, 1, 'segunda chamada deveria reusar o cache em memória (TTL 60s)');
    assert.strictEqual(summaryCalls[0].opts.headers.Authorization, 'Bearer tok-summary');
    restoreFetch();
    clearCreds();
  });

  // ── getSummaryReviews — merchant sem reviews (404 "Summary not found") ──────
  await check('getSummaryReviews: 404 do iFood → sucesso com null, cacheado (sem 2ª chamada)', async () => {
    setCreds();
    const calls = [];
    mockFetch(calls, (url) => {
      if (url.endsWith('/authentication/v1.0/oauth/token')) {
        return jsonResponse(200, { accessToken: 'tok-404-summary', expiresIn: 21600 });
      }
      if (url.includes('/review/v2.0/merchants/merchant-vazio/summary')) {
        return jsonResponse(404, { errorType: 'Not Found', errorMessage: 'Summary not found' });
      }
      return jsonResponse(404, {});
    });
    const ifood = freshIfood();

    const s1 = await ifood.getSummaryReviews('merchant-vazio');
    assert.strictEqual(s1, null, '404 "Summary not found" deve virar sucesso com null, não lançar');
    const s2 = await ifood.getSummaryReviews('merchant-vazio');
    assert.strictEqual(s2, null);

    const summaryCalls = calls.filter((c) => c.url.includes('/summary'));
    assert.strictEqual(summaryCalls.length, 1, 'o null também deveria ser cacheado (sem 2ª chamada à API)');
    restoreFetch();
    clearCreds();
  });

  // ── getSummaryReviews — outros 4xx/5xx continuam propagando erro normalmente ─
  await check('getSummaryReviews: 403 (não é o caso "sem reviews") continua lançando IfoodApiError', async () => {
    setCreds();
    const calls = [];
    mockFetch(calls, (url) => {
      if (url.endsWith('/authentication/v1.0/oauth/token')) {
        return jsonResponse(200, { accessToken: 'tok-403-summary', expiresIn: 21600 });
      }
      return jsonResponse(403, { message: 'sem acesso a este merchant' });
    });
    const ifood = freshIfood();
    await assert.rejects(() => ifood.getSummaryReviews('merchant-proibido'), (err) => err.status === 403);
    restoreFetch();
    clearCreds();
  });

  // ── getSummaryReviews — 404 "genérico" (merchantId errado etc.) NÃO vira null ─
  await check('getSummaryReviews: 404 sem "Summary not found" no corpo continua propagando erro', async () => {
    setCreds();
    const calls = [];
    mockFetch(calls, (url) => {
      if (url.endsWith('/authentication/v1.0/oauth/token')) {
        return jsonResponse(200, { accessToken: 'tok-404-generico', expiresIn: 21600 });
      }
      return jsonResponse(404, { errorType: 'Not Found', errorMessage: 'Merchant not found' });
    });
    const ifood = freshIfood();
    await assert.rejects(
      () => ifood.getSummaryReviews('merchant-inexistente'),
      (err) => err.status === 404,
      '404 com mensagem diferente de "Summary not found" não deveria virar sucesso silencioso'
    );
    restoreFetch();
    clearCreds();
  });

  // ── listarReviews — filtro por data (dataInicio/dataFim → dateFrom/dateTo) ──
  await check('listarReviews: dataInicio/dataFim viram dateFrom/dateTo (ISO date-time, offset BRT -03:00) na querystring', async () => {
    setCreds();
    const calls = [];
    mockFetch(calls, (url) => {
      if (url.endsWith('/authentication/v1.0/oauth/token')) {
        return jsonResponse(200, { accessToken: 'tok-datafiltro', expiresIn: 21600 });
      }
      return jsonResponse(200, { reviews: [] });
    });
    const ifood = freshIfood();
    await ifood.listarReviews('merchant-1', { dataInicio: '2026-07-01', dataFim: '2026-07-06' });
    const reviewsCall = calls.find((c) => c.url.includes('/reviews'));
    const parsedUrl = new URL(reviewsCall.url);
    assert.strictEqual(parsedUrl.searchParams.get('dateFrom'), '2026-07-01T00:00:00-03:00');
    assert.strictEqual(parsedUrl.searchParams.get('dateTo'), '2026-07-06T23:59:59-03:00');
    restoreFetch();
    clearCreds();
  });

  await check('listarReviews: sem dataInicio/dataFim → dateFrom/dateTo ausentes na URL', async () => {
    setCreds();
    const calls = [];
    mockFetch(calls, (url) => {
      if (url.endsWith('/authentication/v1.0/oauth/token')) {
        return jsonResponse(200, { accessToken: 'tok-semfiltro', expiresIn: 21600 });
      }
      return jsonResponse(200, { reviews: [] });
    });
    const ifood = freshIfood();
    await ifood.listarReviews('merchant-1');
    const reviewsCall = calls.find((c) => c.url.includes('/reviews'));
    assert.ok(!reviewsCall.url.includes('dateFrom'), 'sem filtro, dateFrom não deveria aparecer na URL');
    assert.ok(!reviewsCall.url.includes('dateTo'), 'sem filtro, dateTo não deveria aparecer na URL');
    restoreFetch();
    clearCreds();
  });

  // ── getReviewDetalhe — path correto + 404 propagado ─────────────────────────
  await check('getReviewDetalhe: path correto, devolve todos os campos V2', async () => {
    setCreds();
    const calls = [];
    mockFetch(calls, (url) => {
      if (url.endsWith('/authentication/v1.0/oauth/token')) {
        return jsonResponse(200, { accessToken: 'tok-detalhe', expiresIn: 21600 });
      }
      return jsonResponse(200, {
        id: 'review-1', score: 5, comment: 'Ótimo!',
        replies: [{ from: 'MERCHANT', text: 'Obrigado!' }],
      });
    });
    const ifood = freshIfood();
    const res = await ifood.getReviewDetalhe('merchant-1', 'review-1');
    assert.strictEqual(res.id, 'review-1');
    assert.strictEqual(res.replies[0].from, 'MERCHANT');
    const call = calls.find((c) => c.url.includes('/reviews/review-1'));
    assert.strictEqual(call.url, 'https://sandbox.ifood.test/review/v2.0/merchants/merchant-1/reviews/review-1');
    restoreFetch();
    clearCreds();
  });

  await check('getReviewDetalhe: reviewId inexistente → 404 propagado como IfoodApiError', async () => {
    setCreds();
    const calls = [];
    mockFetch(calls, (url) => {
      if (url.endsWith('/authentication/v1.0/oauth/token')) {
        return jsonResponse(200, { accessToken: 'tok-404review', expiresIn: 21600 });
      }
      return jsonResponse(404, { message: 'review not found' });
    });
    const ifood = freshIfood();
    await assert.rejects(() => ifood.getReviewDetalhe('merchant-1', 'review-inexistente'), (err) => err.status === 404);
    const reviewCalls = calls.filter((c) => c.url.includes('/reviews/review-inexistente'));
    assert.strictEqual(reviewCalls.length, 1, '404 não é retentável — só 1 tentativa');
    restoreFetch();
    clearCreds();
  });

  await check('getReviewDetalhe: merchantId/reviewId inválido → rejeita antes de tocar a rede', async () => {
    setCreds();
    const calls = [];
    mockFetch(calls, () => { throw new Error('não deveria chamar fetch com id inválido'); });
    const ifood = freshIfood();
    await assert.rejects(
      () => ifood.getReviewDetalhe('../etc/passwd', 'review-1'),
      (err) => err.status === 0
    );
    assert.strictEqual(calls.length, 0);
    restoreFetch();
    clearCreds();
  });

  // ── listarVendas — período default (7 dias) quando dataInicio/dataFim faltam ──
  await check('listarVendas: sem período → default de 7 dias (beginSalesDate/endSalesDate)', async () => {
    setCreds();
    const calls = [];
    mockFetch(calls, (url) => {
      if (url.endsWith('/authentication/v1.0/oauth/token')) {
        return jsonResponse(200, { accessToken: 'tok-vendas', expiresIn: 21600 });
      }
      return jsonResponse(200, { sales: [] });
    });
    const ifood = freshIfood();
    const res = await ifood.listarVendas('merchant-1');
    assert.deepStrictEqual(res, { sales: [] });

    const salesCall = calls.find((c) => c.url.includes('/financial/v3.0/merchants/merchant-1/sales'));
    assert.ok(salesCall, 'deveria ter chamado o endpoint de sales');
    const parsedUrl = new URL(salesCall.url);
    const begin = parsedUrl.searchParams.get('beginSalesDate');
    const end = parsedUrl.searchParams.get('endSalesDate');
    assert.match(begin, /^\d{4}-\d{2}-\d{2}$/, 'beginSalesDate deve estar em yyyy-MM-dd');
    assert.match(end, /^\d{4}-\d{2}-\d{2}$/, 'endSalesDate deve estar em yyyy-MM-dd');
    const diffDias = (new Date(end) - new Date(begin)) / (24 * 60 * 60 * 1000);
    assert.strictEqual(diffDias, 7, 'default deve cobrir uma janela de 7 dias');
    restoreFetch();
    clearCreds();
  });

  await check('listarVendas: dataInicio/dataFim explícitos → usados sem alteração', async () => {
    setCreds();
    const calls = [];
    mockFetch(calls, (url) => {
      if (url.endsWith('/authentication/v1.0/oauth/token')) {
        return jsonResponse(200, { accessToken: 'tok-vendas-2', expiresIn: 21600 });
      }
      return jsonResponse(200, { sales: [{ id: 'sale-1' }] });
    });
    const ifood = freshIfood();
    const res = await ifood.listarVendas('merchant-1', { dataInicio: '2026-06-01', dataFim: '2026-06-15' });
    assert.deepStrictEqual(res, { sales: [{ id: 'sale-1' }] });

    const salesCall = calls.find((c) => c.url.includes('/sales'));
    const parsedUrl = new URL(salesCall.url);
    assert.strictEqual(parsedUrl.searchParams.get('beginSalesDate'), '2026-06-01');
    assert.strictEqual(parsedUrl.searchParams.get('endSalesDate'), '2026-06-15');
    restoreFetch();
    clearCreds();
  });

  // ── responderReview — POST correto, body {text}, sem retry ──────────────────
  await check('responderReview: monta POST correto com body {text}', async () => {
    setCreds();
    const calls = [];
    mockFetch(calls, (url) => {
      if (url.endsWith('/authentication/v1.0/oauth/token')) {
        return jsonResponse(200, { accessToken: 'tok-review', expiresIn: 21600 });
      }
      return jsonResponse(200, { id: 'rev-1', text: 'Obrigado!' });
    });
    const ifood = freshIfood();
    const res = await ifood.responderReview('merchant-1', 'review-1', 'Obrigado pelo feedback!');
    assert.deepStrictEqual(res, { id: 'rev-1', text: 'Obrigado!' });

    const reviewCall = calls.find((c) => c.url.includes('/reviews/review-1/answers'));
    assert.ok(reviewCall, 'deveria ter chamado o endpoint de resposta');
    assert.strictEqual(reviewCall.url, 'https://sandbox.ifood.test/review/v2.0/merchants/merchant-1/reviews/review-1/answers');
    assert.strictEqual(reviewCall.opts.method, 'POST');
    assert.strictEqual(reviewCall.opts.headers.Authorization, 'Bearer tok-review');
    assert.strictEqual(JSON.parse(reviewCall.opts.body).text, 'Obrigado pelo feedback!');
    restoreFetch();
    clearCreds();
  });

  await check('responderReview: texto vazio → IfoodApiError status 0, zero chamada ao endpoint', async () => {
    setCreds();
    const calls = [];
    mockFetch(calls, () => jsonResponse(200, { accessToken: 'tok-x', expiresIn: 21600 }));
    const ifood = freshIfood();
    await assert.rejects(() => ifood.responderReview('merchant-1', 'review-1', '   '), (err) => err.status === 0);
    assert.strictEqual(calls.filter((c) => c.url.includes('/answers')).length, 0);
    restoreFetch();
    clearCreds();
  });

  await check('responderReview: merchantId/reviewId inválido → rejeita antes de tocar a rede', async () => {
    setCreds();
    const calls = [];
    mockFetch(calls, () => { throw new Error('não deveria chamar fetch com id inválido'); });
    const ifood = freshIfood();
    await assert.rejects(
      () => ifood.responderReview('../etc/passwd', 'review-1', 'texto'),
      (err) => err.status === 0
    );
    assert.strictEqual(calls.length, 0);
    restoreFetch();
    clearCreds();
  });

  // ── listarReviews — paginação (?page=&size=) ────────────────────────────────
  await check('listarReviews: page/size viram querystring (pageSize no request ao iFood); omitidos não aparecem na URL', async () => {
    setCreds();
    const calls = [];
    mockFetch(calls, (url) => {
      if (url.endsWith('/authentication/v1.0/oauth/token')) {
        return jsonResponse(200, { accessToken: 'tok-page', expiresIn: 21600 });
      }
      return jsonResponse(200, { reviews: [], page: 2, size: 10, total: 0, pageCount: 0 });
    });
    const ifood = freshIfood();
    await ifood.listarReviews('merchant-1', { page: 2, size: 10 });
    const reviewsCall = calls.find((c) => c.url.includes('/reviews'));
    const parsedUrl = new URL(reviewsCall.url);
    assert.strictEqual(parsedUrl.searchParams.get('page'), '2');
    assert.strictEqual(parsedUrl.searchParams.get('pageSize'), '10');
    assert.strictEqual(parsedUrl.searchParams.get('size'), null, 'o iFood usa pageSize, não size, no request');

    await ifood.listarReviews('merchant-1');
    const semParamsCall = calls.filter((c) => c.url.includes('/reviews')).at(-1);
    assert.ok(!semParamsCall.url.includes('page='), 'sem page/size, a URL não deveria ter esses params');
    restoreFetch();
    clearCreds();
  });

  // ── Merchant v1.0 — Interrupções (pausas) ───────────────────────────────────
  await check('criarInterrupcao: POST correto, body {start,end} → 201 {id,start,end}', async () => {
    setCreds();
    const calls = [];
    mockFetch(calls, (url) => {
      if (url.endsWith('/authentication/v1.0/oauth/token')) {
        return jsonResponse(200, { accessToken: 'tok-int', expiresIn: 21600 });
      }
      return jsonResponse(201, { id: 'int-1', start: '2026-07-10T10:00:00Z', end: '2026-07-10T12:00:00Z' });
    });
    const ifood = freshIfood();
    const res = await ifood.criarInterrupcao('merchant-1', { start: '2026-07-10T10:00:00Z', end: '2026-07-10T12:00:00Z' });
    assert.deepStrictEqual(res, { id: 'int-1', start: '2026-07-10T10:00:00Z', end: '2026-07-10T12:00:00Z' });
    const call = calls.find((c) => c.url.includes('/interruptions'));
    assert.strictEqual(call.url, 'https://sandbox.ifood.test/merchant/v1.0/merchants/merchant-1/interruptions');
    assert.strictEqual(call.opts.method, 'POST');
    assert.deepStrictEqual(JSON.parse(call.opts.body), { start: '2026-07-10T10:00:00Z', end: '2026-07-10T12:00:00Z' });
    restoreFetch();
    clearCreds();
  });

  // ── Retry-After (429) — respeita o header no lugar do backoff fixo ──────────
  await check('withRetry: 429 com Retry-After curto → espera o valor do header, não o backoff fixo', async () => {
    setCreds();
    const calls = [];
    let statusCallCount = 0;
    mockFetch(calls, (url) => {
      if (url.endsWith('/authentication/v1.0/oauth/token')) {
        return jsonResponse(200, { accessToken: 'tok-ra', expiresIn: 21600 });
      }
      statusCallCount++;
      if (statusCallCount === 1) {
        return {
          ok: false,
          status: 429,
          statusText: 'status-429',
          headers: { get: (h) => (h.toLowerCase() === 'retry-after' ? '0' : null) },
          text: async () => JSON.stringify({ message: 'rate limited' }),
        };
      }
      return jsonResponse(200, { available: true });
    });
    const ifood = freshIfood();
    const t0 = Date.now();
    const res = await ifood.getStatusLoja('merchant-ra');
    const elapsed = Date.now() - t0;
    assert.deepStrictEqual(res, { available: true });
    assert.strictEqual(statusCallCount, 2, 'deveria ter retentado 1x após o 429');
    // Retry-After: 0 → deveria pular o backoff fixo de 1000ms do 2º attempt.
    assert.ok(elapsed < 900, `esperava respeitar Retry-After:0 (rápido), levou ${elapsed}ms`);
    restoreFetch();
    clearCreds();
  });

  await check('criarInterrupcao: sem start/end → IfoodApiError status 0, zero chamada', async () => {
    setCreds();
    const calls = [];
    mockFetch(calls, () => jsonResponse(200, { accessToken: 'tok-x', expiresIn: 21600 }));
    const ifood = freshIfood();
    await assert.rejects(() => ifood.criarInterrupcao('merchant-1', {}), (err) => err.status === 0);
    assert.strictEqual(calls.filter((c) => c.url.includes('/interruptions')).length, 0);
    restoreFetch();
    clearCreds();
  });

  await check('removerInterrupcao: DELETE correto → 204 sem corpo', async () => {
    setCreds();
    const calls = [];
    mockFetch(calls, (url) => {
      if (url.endsWith('/authentication/v1.0/oauth/token')) {
        return jsonResponse(200, { accessToken: 'tok-del', expiresIn: 21600 });
      }
      return { ok: true, status: 204, statusText: 'No Content', text: async () => '', headers: { get: () => null } };
    });
    const ifood = freshIfood();
    const res = await ifood.removerInterrupcao('merchant-1', 'int-1');
    assert.strictEqual(res, null);
    const call = calls.find((c) => c.url.includes('/interruptions/int-1'));
    assert.strictEqual(call.opts.method, 'DELETE');
    restoreFetch();
    clearCreds();
  });

  await check('removerInterrupcao: 409 InterruptionOverlap propaga status e body.code', async () => {
    setCreds();
    const calls = [];
    mockFetch(calls, (url) => {
      if (url.endsWith('/authentication/v1.0/oauth/token')) {
        return jsonResponse(200, { accessToken: 'tok-409', expiresIn: 21600 });
      }
      return jsonResponse(409, { code: 'InterruptionOverlap', message: 'Interrupção conflita com outra existente' });
    });
    const ifood = freshIfood();
    await assert.rejects(
      () => ifood.removerInterrupcao('merchant-1', 'int-1'),
      (err) => err.status === 409 && err.body.code === 'InterruptionOverlap'
    );
    restoreFetch();
    clearCreds();
  });

  // ── Merchant v1.0 — Horários de funcionamento ───────────────────────────────
  await check('listarHorarios / atualizarHorarios: paths e método corretos', async () => {
    setCreds();
    const calls = [];
    mockFetch(calls, (url) => {
      if (url.endsWith('/authentication/v1.0/oauth/token')) {
        return jsonResponse(200, { accessToken: 'tok-hrs', expiresIn: 21600 });
      }
      if (url.includes('/opening-hours')) {
        return jsonResponse(200, { shifts: [{ dayOfWeek: 'MONDAY', start: '08:00', duration: 600 }] });
      }
      return jsonResponse(404, {});
    });
    const ifood = freshIfood();
    const lidos = await ifood.listarHorarios('merchant-1');
    assert.deepStrictEqual(lidos, { shifts: [{ dayOfWeek: 'MONDAY', start: '08:00', duration: 600 }] });

    const atualizados = await ifood.atualizarHorarios('merchant-1', [{ dayOfWeek: 'TUESDAY', start: '09:00', duration: 480 }]);
    assert.deepStrictEqual(atualizados, { shifts: [{ dayOfWeek: 'MONDAY', start: '08:00', duration: 600 }] });

    const putCall = calls.find((c) => c.opts.method === 'PUT');
    assert.strictEqual(putCall.url, 'https://sandbox.ifood.test/merchant/v1.0/merchants/merchant-1/opening-hours');
    assert.deepStrictEqual(JSON.parse(putCall.opts.body), { shifts: [{ dayOfWeek: 'TUESDAY', start: '09:00', duration: 480 }] });
    restoreFetch();
    clearCreds();
  });

  await check('atualizarHorarios: shifts vazio/ausente → IfoodApiError status 0, zero chamada PUT', async () => {
    setCreds();
    const calls = [];
    mockFetch(calls, () => jsonResponse(200, { accessToken: 'tok-x', expiresIn: 21600 }));
    const ifood = freshIfood();
    await assert.rejects(() => ifood.atualizarHorarios('merchant-1', []), (err) => err.status === 0);
    assert.strictEqual(calls.filter((c) => c.opts.method === 'PUT').length, 0);
    restoreFetch();
    clearCreds();
  });

  // ── 429 com Retry-After — GET respeita o header, não o backoff fixo ─────────
  await check('withRetry: 429 com Retry-After → aguarda o valor do header antes de retentar', async () => {
    setCreds();
    const calls = [];
    const timestamps = [];
    mockFetch(calls, (url) => {
      timestamps.push(Date.now());
      if (url.endsWith('/authentication/v1.0/oauth/token')) {
        return jsonResponse(200, { accessToken: 'tok-ra', expiresIn: 21600 });
      }
      const n = calls.filter((c) => c.url.includes('/interruptions')).length;
      if (n === 1) return jsonResponse(429, { message: 'rate limited' }, { 'retry-after': '1' });
      return jsonResponse(200, []);
    });
    const ifood = freshIfood();
    const inicio = Date.now();
    const res = await ifood.listarInterrupcoes('merchant-1');
    assert.deepStrictEqual(res, []);
    const decorrido = Date.now() - inicio;
    assert.ok(decorrido >= 950, `deveria ter esperado ~1000ms (Retry-After), esperou ${decorrido}ms`);
    restoreFetch();
    clearCreds();
  });

  // Nota: o cap de 30s (Math.min(err.retryAfterMs, 30_000) em withRetry) não tem
  // teste dedicado — validar via timer real levaria ~30s no suite. Cobertura do
  // mecanismo de respeitar o header (valores curtos) já está nos testes acima.

  restoreFetch();
  if (failures > 0) {
    process.stdout.write(`\n${failures} falha(s) de ${passes + failures}.\n`);
    process.exit(1);
  }
  process.stdout.write(`\nifood: todas as ${passes} asserções passaram (zero chamadas de rede reais).\n`);
})();
