// bridge-server/test/ifood-reviews-size.test.js — smoke offline de
// GET /ifood/reviews (routes/ifood.js): confere que ?size=51 é rejeitado com
// 400 PAGE_SIZE_INVALIDO ANTES de qualquer chamada a ifood.listarReviews
// (mesma checagem que /ifood-api/reviews/:lojaId já tinha — ver
// test/ifood-api-routes.test.js caso 10). Mocka supabaseSelect/ifood — zero
// rede real.
//
// Rodar:  node bridge-server/test/ifood-reviews-size.test.js
'use strict';

const assert = require('node:assert');
const express = require('express');
const http = require('node:http');

const factory = require('../routes/ifood');

function internalAuth(req, _res, next) { next(); }

function buildApp({ ifood, supabaseSelect }) {
  const app = express();
  app.use(express.json());
  app.use('/api', factory({
    requireJwtOrInternal: internalAuth,
    ifood,
    supabaseSelect,
    assertTenantMember: async () => true,
    sbFetch: async () => { throw new Error('sbFetch não deveria ser chamado neste teste'); },
    supabaseInsert: async () => {},
  }));
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

async function main() {
  let listarReviewsCalled = false;
  const ifoodStub = {
    IfoodApiError: class IfoodApiError extends Error { constructor(m, s) { super(m); this.status = s; } },
    async listarReviews() { listarReviewsCalled = true; return { reviews: [] }; },
  };
  const supabaseSelect = async () => ({ merchant_id: 'a1b2c3d4-e5f6-0000-0000-000000000000' });

  const app = buildApp({ ifood: ifoodStub, supabaseSelect });
  const server = app.listen(0);

  const r = await get(server, '/api/ifood/reviews?tenant_id=t1&size=51');
  assert.strictEqual(r.status, 400, `esperava 400, veio ${r.status}: ${JSON.stringify(r.body)}`);
  assert.strictEqual(r.body.code, 'PAGE_SIZE_INVALIDO');
  assert.strictEqual(listarReviewsCalled, false, 'não deveria ter chamado ifood.listarReviews com size inválido');
  console.log('✓ GET /ifood/reviews?size=51 → 400 PAGE_SIZE_INVALIDO, listarReviews nunca chamada');

  const r2 = await get(server, '/api/ifood/reviews?tenant_id=t1&size=20');
  assert.strictEqual(r2.status, 200, `esperava 200, veio ${r2.status}: ${JSON.stringify(r2.body)}`);
  assert.strictEqual(listarReviewsCalled, true, 'size válido deveria chamar listarReviews normalmente');
  console.log('✓ GET /ifood/reviews?size=20 → 200, segue funcionando normal');

  server.close();
  console.log('\nTodos os testes offline passaram.');
}

main().catch((err) => { console.error('FALHOU:', err.message); process.exit(1); });
