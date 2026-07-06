// bridge-server/test/auth-integration.test.js — teste de INTEGRAÇÃO: liga o
// middleware REAL (lib/auth-middleware.js, o mesmo código que index.js usa em
// produção) numa rota gated REAL (routes/ifood-api.js, /merchant-status/:lojaId)
// via servidor HTTP de verdade. Diferente de ifood-api-routes.test.js (que
// injeta um FAKE de requireJwtOrInternal/assertTenantMember pra isolar a
// lógica da rota), aqui o objetivo é o oposto: provar que o middleware REAL,
// quando plugado numa rota REAL, efetivamente bloqueia. Regressão de
// segurança — se alguém trocar `resolveLojaGated` por algo que ignora
// `assertTenantMember`, ou o middleware virar fail-open, isto quebra.
//
// Rodar:  node bridge-server/test/auth-integration.test.js
'use strict';

const assert = require('node:assert');
const express = require('express');
const http = require('node:http');
const { requireJwtOrInternal, makeAssertTenantMember } = require('../lib/auth-middleware');
const factory = require('../routes/ifood-api');

const LOJA = { id: 'loja-1', tenant_id: 'tenant-alvo', fonte_dados: 'api' };

function get(server, path, headers = {}) {
  return new Promise((resolve) => {
    const { port } = server.address();
    http.get({ host: '127.0.0.1', port, path, headers }, (res) => {
      let buf = '';
      res.on('data', (c) => (buf += c));
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(buf || '{}') }));
    });
  });
}

const ORIGINAL_FETCH = global.fetch;
function restoreFetch() { global.fetch = ORIGINAL_FETCH; }

let passed = 0;
async function check(label, fn) {
  try {
    await fn();
    passed++;
    process.stdout.write(`  ok  ${label}\n`);
  } catch (e) {
    process.stdout.write(`  FAIL ${label}: ${e.message}\n`);
    process.exitCode = 1;
  }
}

function buildApp({ sbFetch, ifood }) {
  const app = express();
  app.use(express.json());
  const assertTenantMember = makeAssertTenantMember(sbFetch);
  app.use('/api', factory({ requireJwtOrInternal, ifood, sbFetch, assertTenantMember }));
  return app;
}

(async () => {
  // sbFetch único servindo os 3 lookups da rota (lojas/ifood_merchants) +
  // do assertTenantMember (tenant_members) — só user-1 é membro do tenant-alvo.
  const sbFetchTenantAware = async (path) => {
    if (path.startsWith('lojas?')) return [LOJA];
    if (path.startsWith('ifood_merchants?')) return [{ merchant_id: 'merch-1' }];
    if (path.startsWith('tenant_members?')) {
      return path.includes('user_id=eq.user-1') ? [{ tenant_id: LOJA.tenant_id }] : [];
    }
    throw new Error(`sbFetch: rota não coberta ${path}`);
  };
  const ifood = { getStatusLoja: async (merchantId) => ({ available: true, merchantId }) };

  await check('sem NENHUM header de auth → 401 (real requireJwt: missing token)', async () => {
    delete process.env.INTERNAL_BRIDGE_TOKEN;
    const app = buildApp({ sbFetch: sbFetchTenantAware, ifood });
    const server = http.createServer(app).listen(0);
    await new Promise((r) => server.once('listening', r));
    const r = await get(server, '/api/ifood-api/merchant-status/loja-1');
    assert.strictEqual(r.status, 401);
    server.close();
  });

  await check('x-internal-token ERRADO → 401, rota nunca executa', async () => {
    process.env.INTERNAL_BRIDGE_TOKEN = 'token-interno-real';
    const app = buildApp({ sbFetch: sbFetchTenantAware, ifood });
    const server = http.createServer(app).listen(0);
    await new Promise((r) => server.once('listening', r));
    const r = await get(server, '/api/ifood-api/merchant-status/loja-1', { 'x-internal-token': 'token-errado' });
    assert.strictEqual(r.status, 401);
    server.close();
    delete process.env.INTERNAL_BRIDGE_TOKEN;
  });

  await check('x-internal-token CORRETO → 200 (chamada interna, sem checagem de tenant)', async () => {
    process.env.INTERNAL_BRIDGE_TOKEN = 'token-interno-real';
    const app = buildApp({ sbFetch: sbFetchTenantAware, ifood });
    const server = http.createServer(app).listen(0);
    await new Promise((r) => server.once('listening', r));
    const r = await get(server, '/api/ifood-api/merchant-status/loja-1', { 'x-internal-token': 'token-interno-real' });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.data.status.merchantId, 'merch-1');
    server.close();
    delete process.env.INTERNAL_BRIDGE_TOKEN;
  });

  await check('JWT válido de usuário de OUTRO tenant → 403 real (REGRESSÃO se o gate de tenant sumir)', async () => {
    process.env.SUPABASE_ANON_KEY = 'anon-key';
    global.fetch = async () => ({ ok: true, json: async () => ({ id: 'user-de-outro-tenant' }) });
    const app = buildApp({ sbFetch: sbFetchTenantAware, ifood });
    const server = http.createServer(app).listen(0);
    await new Promise((r) => server.once('listening', r));
    const r = await get(server, '/api/ifood-api/merchant-status/loja-1', { authorization: 'Bearer jwt-valido' });
    assert.strictEqual(r.status, 403);
    server.close();
    restoreFetch();
    delete process.env.SUPABASE_ANON_KEY;
  });

  await check('JWT válido de usuário MEMBRO do tenant certo → 200', async () => {
    process.env.SUPABASE_ANON_KEY = 'anon-key';
    global.fetch = async () => ({ ok: true, json: async () => ({ id: 'user-1' }) });
    const app = buildApp({ sbFetch: sbFetchTenantAware, ifood });
    const server = http.createServer(app).listen(0);
    await new Promise((r) => server.once('listening', r));
    const r = await get(server, '/api/ifood-api/merchant-status/loja-1', { authorization: 'Bearer jwt-valido' });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.data.status.merchantId, 'merch-1');
    server.close();
    restoreFetch();
    delete process.env.SUPABASE_ANON_KEY;
  });

  process.stdout.write(`\nauth-integration: ${passed} cenários passaram.\n`);
})();
