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

  process.stdout.write(`\nifood-api-routes: todos os ${passed} cenários passaram.\n`);
})();
