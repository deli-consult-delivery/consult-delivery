// bridge-server/test/ifood-api-routes.test.js — smoke offline de routes/ifood-api.js.
// Mocka sbFetch e o client lib/ifood — zero rede real, zero Supabase real.
//
// Rodar:  node bridge-server/test/ifood-api-routes.test.js
'use strict';

const assert = require('node:assert');
const express = require('express');
const http = require('node:http');

const factory = require('../routes/ifood-api');

const LOJA_API = { id: 'loja-1', tenant_id: 'tenant-1', fonte_dados: 'api' };
const LOJA_PORTAL = { id: 'loja-2', tenant_id: 'tenant-2', fonte_dados: 'portal' };

// requireJwtOrInternal fake: chamada interna (sem req.user), como as tasks do Trigger.dev.
function internalAuth(req, _res, next) {
  next();
}

function buildApp({ sbFetch, ifood, requireJwtOrInternal = internalAuth, assertTenantMember }) {
  const app = express();
  app.use(express.json());
  app.use('/api', factory({ requireJwtOrInternal, ifood, sbFetch, assertTenantMember }));
  return app;
}

function get(server, path) {
  return new Promise((resolve) => {
    const { port } = server.address();
    http.get({ host: '127.0.0.1', port, path }, (res) => {
      let buf = '';
      res.on('data', (c) => (buf += c));
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(buf || '{}') }));
    });
  });
}

function post(server, path, payload) {
  return new Promise((resolve) => {
    const { port } = server.address();
    const body = JSON.stringify(payload || {});
    const req = http.request(
      { host: '127.0.0.1', port, path, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } },
      (res) => {
        let buf = '';
        res.on('data', (c) => (buf += c));
        res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(buf || '{}') }));
      }
    );
    req.write(body);
    req.end();
  });
}

function sbFetchStub(routes) {
  // routes: array de { test: (path)=>bool, value }
  return async (path) => {
    for (const r of routes) {
      if (r.test(path)) return r.value;
    }
    throw new Error(`sbFetch stub: nenhuma rota casou com ${path}`);
  };
}

(async () => {
  let passed = 0;

  // 1) loja não encontrada → 404
  {
    const sbFetch = sbFetchStub([{ test: (p) => p.startsWith('lojas?'), value: [] }]);
    const app = buildApp({ sbFetch, ifood: {} });
    const server = http.createServer(app).listen(0);
    await new Promise((r) => server.once('listening', r));
    const r = await get(server, '/api/ifood-api/merchant-status/loja-x');
    assert.strictEqual(r.status, 404);
    server.close();
    passed++;
  }

  // 2) flag em 'portal' sem ?dryrun=1 → 409, NUNCA chama o client iFood
  {
    let ifoodChamado = false;
    const sbFetch = sbFetchStub([{ test: (p) => p.startsWith('lojas?'), value: [LOJA_PORTAL] }]);
    const ifood = { getStatusLoja: async () => { ifoodChamado = true; return {}; } };
    const app = buildApp({ sbFetch, ifood });
    const server = http.createServer(app).listen(0);
    await new Promise((r) => server.once('listening', r));
    const r = await get(server, '/api/ifood-api/merchant-status/loja-2');
    assert.strictEqual(r.status, 409);
    assert.strictEqual(ifoodChamado, false);
    server.close();
    passed++;
  }

  // 3) flag em 'portal' COM ?dryrun=1 → segue e resolve merchant normalmente
  {
    const sbFetch = sbFetchStub([
      { test: (p) => p.startsWith('lojas?'), value: [LOJA_PORTAL] },
      { test: (p) => p.startsWith('ifood_merchants?'), value: [{ merchant_id: 'merch-2' }] },
    ]);
    const ifood = { getStatusLoja: async (merchantId) => ({ available: true, merchantId }) };
    const app = buildApp({ sbFetch, ifood });
    const server = http.createServer(app).listen(0);
    await new Promise((r) => server.once('listening', r));
    const r = await get(server, '/api/ifood-api/merchant-status/loja-2?dryrun=1');
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.data.status.merchantId, 'merch-2');
    server.close();
    passed++;
  }

  // 4) loja sem ifood_merchants vinculado → 404 claro
  {
    const sbFetch = sbFetchStub([
      { test: (p) => p.startsWith('lojas?'), value: [LOJA_API] },
      { test: (p) => p.startsWith('ifood_merchants?'), value: [] },
    ]);
    const app = buildApp({ sbFetch, ifood: {} });
    const server = http.createServer(app).listen(0);
    await new Promise((r) => server.once('listening', r));
    const r = await get(server, '/api/ifood-api/merchant-status/loja-1');
    assert.strictEqual(r.status, 404);
    server.close();
    passed++;
  }

  // 5) sem credencial (IfoodApiError status 0 "Credencial...") → 503 limpo, nunca crash
  {
    const IfoodApiError = class extends Error {
      constructor(msg, status) { super(msg); this.name = 'IfoodApiError'; this.status = status; }
    };
    const sbFetch = sbFetchStub([
      { test: (p) => p.startsWith('lojas?'), value: [LOJA_API] },
      { test: (p) => p.startsWith('ifood_merchants?'), value: [{ merchant_id: 'merch-1' }] },
    ]);
    const ifood = {
      getStatusLoja: async () => {
        throw new IfoodApiError('Credencial iFood ausente. Configure IFOOD_CLIENT_ID e IFOOD_CLIENT_SECRET.', 0);
      },
    };
    const app = buildApp({ sbFetch, ifood });
    const server = http.createServer(app).listen(0);
    await new Promise((r) => server.once('listening', r));
    const r = await get(server, '/api/ifood-api/merchant-status/loja-1');
    assert.strictEqual(r.status, 503);
    assert.strictEqual(r.body.ok, false);
    server.close();
    passed++;
  }

  // 6) reviews: monta diff via dupla-checagem contra `avaliacoes`
  {
    const sbFetch = sbFetchStub([
      { test: (p) => p.startsWith('lojas?'), value: [LOJA_API] },
      { test: (p) => p.startsWith('ifood_merchants?'), value: [{ merchant_id: 'merch-1' }] },
      {
        test: (p) => p.startsWith('avaliacoes?'),
        value: [{ id: 'a1', nota: 5, comentario: 'Show de bola', nome_cliente: 'Fred' }],
      },
    ]);
    const ifood = {
      listarReviews: async () => [
        { id: 'r1', score: 5, comment: 'Show de bola', customer: { name: 'Fred' } },
        { id: 'r2', score: 1, comment: 'Pedido errado', customer: { name: 'Gil' } },
      ],
    };
    const app = buildApp({ sbFetch, ifood });
    const server = http.createServer(app).listen(0);
    await new Promise((r) => server.once('listening', r));
    const r = await get(server, '/api/ifood-api/reviews/loja-1');
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.data.diff.faltantes.length, 1);
    assert.strictEqual(r.body.data.diff.faltantes[0].comentario, 'Pedido errado');
    assert.strictEqual(r.body.data.diff.excedentes.length, 0);
    server.close();
    passed++;
  }

  // 7) usuário (req.user presente) sem membership do tenant → 403, rota nunca prossegue
  {
    const sbFetch = sbFetchStub([{ test: (p) => p.startsWith('lojas?'), value: [LOJA_API] }]);
    const assertTenantMember = async (_req, res) => {
      res.status(403).json({ ok: false, error: 'Acesso negado' });
      return false;
    };
    const requireJwtOrInternal = (req, _res, next) => { req.user = { id: 'u1' }; next(); };
    const app = buildApp({ sbFetch, ifood: {}, requireJwtOrInternal, assertTenantMember });
    const server = http.createServer(app).listen(0);
    await new Promise((r) => server.once('listening', r));
    const r = await get(server, '/api/ifood-api/merchant-status/loja-1');
    assert.strictEqual(r.status, 403);
    server.close();
    passed++;
  }

  // 8) summary: resolve merchant e devolve o resumo do client iFood
  {
    const sbFetch = sbFetchStub([
      { test: (p) => p.startsWith('lojas?'), value: [LOJA_API] },
      { test: (p) => p.startsWith('ifood_merchants?'), value: [{ merchant_id: 'merch-1' }] },
    ]);
    const ifood = {
      getSummaryReviews: async (merchantId) => ({
        merchantId, totalReviewsCount: 12, validReviewsCount: 10, score: 4.6,
      }),
    };
    const app = buildApp({ sbFetch, ifood });
    const server = http.createServer(app).listen(0);
    await new Promise((r) => server.once('listening', r));
    const r = await get(server, '/api/ifood-api/summary/loja-1');
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.data.summary.totalReviewsCount, 12);
    assert.strictEqual(r.body.data.summary.validReviewsCount, 10);
    assert.strictEqual(r.body.data.summary.score, 4.6);
    server.close();
    passed++;
  }

  // 9) summary: flag em 'portal' sem ?dryrun=1 → 409, nunca chama o client
  {
    let ifoodChamado = false;
    const sbFetch = sbFetchStub([{ test: (p) => p.startsWith('lojas?'), value: [LOJA_PORTAL] }]);
    const ifood = { getSummaryReviews: async () => { ifoodChamado = true; return {}; } };
    const app = buildApp({ sbFetch, ifood });
    const server = http.createServer(app).listen(0);
    await new Promise((r) => server.once('listening', r));
    const r = await get(server, '/api/ifood-api/summary/loja-2');
    assert.strictEqual(r.status, 409);
    assert.strictEqual(ifoodChamado, false);
    server.close();
    passed++;
  }

  // 10) reviews: ?size=51 → 400 com code/message, NUNCA chama o client iFood
  {
    let ifoodChamado = false;
    const sbFetch = sbFetchStub([
      { test: (p) => p.startsWith('lojas?'), value: [LOJA_API] },
      { test: (p) => p.startsWith('ifood_merchants?'), value: [{ merchant_id: 'merch-1' }] },
    ]);
    const ifood = { listarReviews: async () => { ifoodChamado = true; return []; } };
    const app = buildApp({ sbFetch, ifood });
    const server = http.createServer(app).listen(0);
    await new Promise((r) => server.once('listening', r));
    const r = await get(server, '/api/ifood-api/reviews/loja-1?size=51');
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.body.code, 'PAGE_SIZE_INVALIDO');
    assert.ok(r.body.message);
    assert.strictEqual(ifoodChamado, false);
    server.close();
    passed++;
  }

  // 11) draft de resposta: texto < 10 chars → 400 TEXTO_INVALIDO, sem criar draft
  {
    let draftCriado = false;
    const sbFetch = sbFetchStub([
      { test: (p) => p.startsWith('lojas?'), value: [LOJA_API] },
      { test: (p) => { if (p === 'agent_drafts') draftCriado = true; return false; }, value: null },
    ]);
    const app = buildApp({ sbFetch, ifood: {} });
    const server = http.createServer(app).listen(0);
    await new Promise((r) => server.once('listening', r));
    const r = await post(server, '/api/ifood-api/reviews/loja-1/review-1/draft', { texto: 'curto' });
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.body.code, 'TEXTO_INVALIDO');
    assert.strictEqual(draftCriado, false);
    server.close();
    passed++;
  }

  // 12) draft de resposta: reviewId malformado (underscore fora do padrão) → 400, antes de resolver a loja
  {
    const sbFetch = sbFetchStub([]); // não deveria nem chamar sbFetch
    const app = buildApp({ sbFetch, ifood: {} });
    const server = http.createServer(app).listen(0);
    await new Promise((r) => server.once('listening', r));
    const r = await post(server, '/api/ifood-api/reviews/loja-1/review_1/draft', { texto: 'Obrigado pelo feedback, valorizamos muito!' });
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.body.code, 'REVIEW_ID_INVALIDO');
    server.close();
    passed++;
  }

  // 13) draft de resposta: texto válido (10–300) + loja em fonte_dados='api' → 200, cria draft pending
  {
    const inserts = [];
    const sbFetch = sbFetchStub([
      { test: (p) => p.startsWith('lojas?'), value: [LOJA_API] },
      { test: (p) => p.startsWith('ifood_merchants?'), value: [{ merchant_id: 'merch-1' }] },
      {
        test: (p) => { const m = p === 'agent_drafts'; if (m) inserts.push('draft'); return m; },
        value: [{ id: 'draft-123' }],
      },
      { test: (p) => p === 'internal_notifications', value: null },
    ]);
    const app = buildApp({ sbFetch, ifood: {} });
    const server = http.createServer(app).listen(0);
    await new Promise((r) => server.once('listening', r));
    const r = await post(server, '/api/ifood-api/reviews/loja-1/review-1/draft', { texto: 'Obrigado pelo feedback, valorizamos muito!' });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.data.draft_id, 'draft-123');
    assert.strictEqual(r.body.data.review_id, 'review-1');
    assert.strictEqual(inserts.length, 1, 'deveria ter inserido exatamente 1 draft');
    server.close();
    passed++;
  }

  // 14) draft de resposta: loja em fonte_dados='portal' sem ?dryrun=1 → 409, NUNCA cria draft
  {
    let draftCriado = false;
    const sbFetch = sbFetchStub([
      { test: (p) => p.startsWith('lojas?'), value: [LOJA_PORTAL] },
      { test: (p) => { if (p === 'agent_drafts') draftCriado = true; return false; }, value: null },
    ]);
    const app = buildApp({ sbFetch, ifood: {} });
    const server = http.createServer(app).listen(0);
    await new Promise((r) => server.once('listening', r));
    const r = await post(server, '/api/ifood-api/reviews/loja-2/review-1/draft', { texto: 'Obrigado pelo feedback, valorizamos muito!' });
    assert.strictEqual(r.status, 409);
    assert.strictEqual(draftCriado, false);
    server.close();
    passed++;
  }

  // 15) draft de resposta: ?dryrun=1 é rejeitado (400) mesmo para loja em fonte_dados='api' —
  // ao contrário das rotas GET, esta rota tem efeito colateral real (cria draft aprovável)
  {
    const sbFetch = sbFetchStub([]); // não deveria nem consultar a loja
    const app = buildApp({ sbFetch, ifood: {} });
    const server = http.createServer(app).listen(0);
    await new Promise((r) => server.once('listening', r));
    const r = await post(server, '/api/ifood-api/reviews/loja-2/review-1/draft?dryrun=1', { texto: 'Obrigado pelo feedback, valorizamos muito!' });
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.body.code, 'DRYRUN_NAO_SUPORTADO');
    server.close();
    passed++;
  }

  // 16) GET merchant-interruptions: lê pausas ativas da loja
  {
    const sbFetch = sbFetchStub([
      { test: (p) => p.startsWith('lojas?'), value: [LOJA_API] },
      { test: (p) => p.startsWith('ifood_merchants?'), value: [{ merchant_id: 'merch-1' }] },
    ]);
    const ifood = { listarInterrupcoes: async (merchantId) => [{ id: 'int-1', merchantId }] };
    const app = buildApp({ sbFetch, ifood });
    const server = http.createServer(app).listen(0);
    await new Promise((r) => server.once('listening', r));
    const r = await get(server, '/api/ifood-api/merchant-interruptions/loja-1');
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.data.interrupcoes[0].id, 'int-1');
    server.close();
    passed++;
  }

  // 17) GET merchant-opening-hours: lê turnos de funcionamento
  {
    const sbFetch = sbFetchStub([
      { test: (p) => p.startsWith('lojas?'), value: [LOJA_API] },
      { test: (p) => p.startsWith('ifood_merchants?'), value: [{ merchant_id: 'merch-1' }] },
    ]);
    const ifood = { listarHorarios: async () => ({ shifts: [{ dayOfWeek: 'MONDAY', start: '08:00', duration: 600 }] }) };
    const app = buildApp({ sbFetch, ifood });
    const server = http.createServer(app).listen(0);
    await new Promise((r) => server.once('listening', r));
    const r = await get(server, '/api/ifood-api/merchant-opening-hours/loja-1');
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.data.horarios.shifts[0].dayOfWeek, 'MONDAY');
    server.close();
    passed++;
  }

  // 18) 429 com Retry-After → status 429 e retryAfterSeconds exposto no JSON
  //     (mecanismo canônico: IfoodApiError.retryAfterMs, setado por ifoodFetch em 429)
  {
    const sbFetch = sbFetchStub([
      { test: (p) => p.startsWith('lojas?'), value: [LOJA_API] },
      { test: (p) => p.startsWith('ifood_merchants?'), value: [{ merchant_id: 'merch-1' }] },
    ]);
    const IfoodApiError = class extends Error {
      constructor(msg, status, body) { super(msg); this.name = 'IfoodApiError'; this.status = status; this.body = body; }
    };
    const ifood = {
      listarInterrupcoes: async () => {
        const err = new IfoodApiError('rate limited', 429, { message: 'rate limited' });
        err.retryAfterMs = 3000;
        throw err;
      },
    };
    const app = buildApp({ sbFetch, ifood });
    const server = http.createServer(app).listen(0);
    await new Promise((r) => server.once('listening', r));
    const r = await get(server, '/api/ifood-api/merchant-interruptions/loja-1');
    assert.strictEqual(r.status, 429);
    assert.strictEqual(r.body.retryAfterSeconds, 3);
    server.close();
    passed++;
  }

  process.stdout.write(`\nifood-api-routes: todos os ${passed} cenários passaram.\n`);
})();
