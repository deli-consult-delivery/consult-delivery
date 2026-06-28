// Smoke offline da rota POST /loop/despachar — sem banco, sem rede externa.
// Stuba sbFetch/supabaseInsert e o middleware de auth; exercita validação,
// resolução de loja, checagem de tenant_agents e o happy path.
'use strict';

const assert = require('node:assert');
const express = require('express');
const http = require('node:http');

const TENANT = '9079bd4d-4df7-4023-90fb-d79c8ba7e900';
const LOJA = '8434cea4-b9c8-41ea-b366-57e8398aad0b';

// Stubs configuráveis por cenário.
let stubs;
const factory = require('../routes/loop-despachar');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(
    '/loop',
    factory({
      requireInternalToken: (_req, _res, next) => next(),
      sbFetch: (path) => stubs.sbFetch(path),
      supabaseInsert: (table, row) => stubs.supabaseInsert(table, row),
    })
  );
  return app;
}

function post(server, body) {
  return new Promise((resolve) => {
    const data = JSON.stringify(body);
    const { port } = server.address();
    const req = http.request(
      { host: '127.0.0.1', port, path: '/loop/despachar', method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } },
      (res) => {
        let buf = '';
        res.on('data', (c) => (buf += c));
        res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(buf || '{}') }));
      }
    );
    req.end(data);
  });
}

(async () => {
  const server = http.createServer(buildApp()).listen(0);
  await new Promise((r) => server.once('listening', r));
  let passed = 0;

  // 1) uuid inválido → 400
  stubs = {};
  let r = await post(server, { tenant_id: 'x', loja_id: LOJA, especialista: 'cora', descricao: 'cobrar cliente atrasado' });
  assert.strictEqual(r.status, 400); passed++;

  // 2) descricao curta → 400
  r = await post(server, { tenant_id: TENANT, loja_id: LOJA, especialista: 'cora', descricao: 'oi' });
  assert.strictEqual(r.status, 400); passed++;

  // 3) loja não encontrada → 404
  stubs = { sbFetch: () => [] };
  r = await post(server, { tenant_id: TENANT, loja_id: LOJA, especialista: 'cora', descricao: 'cobrar cliente atrasado' });
  assert.strictEqual(r.status, 404); passed++;

  // 4) especialista não habilitado → 409
  stubs = {
    sbFetch: (p) => (p.startsWith('lojas') ? [{ id: LOJA, nome: 'Loja X', client_id: 'cust-1' }] : []),
  };
  r = await post(server, { tenant_id: TENANT, loja_id: LOJA, especialista: 'fantasma', descricao: 'fazer algo qualquer' });
  assert.strictEqual(r.status, 409); passed++;

  // 5) happy path → 200 + task_id
  stubs = {
    sbFetch: (p) => (p.startsWith('lojas')
      ? [{ id: LOJA, nome: 'Loja X', client_id: 'cust-1' }]
      : [{ agent_id: 'cora' }]),
    supabaseInsert: (_t, row) => ({ id: 'task-123', target_system: row.target_system }),
  };
  r = await post(server, { tenant_id: TENANT, loja_id: LOJA, especialista: 'cora', descricao: 'cobrar cliente atrasado', target_system: 'asaas' });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.task_id, 'task-123');
  assert.strictEqual(r.body.especialista, 'cora');
  assert.strictEqual(r.body.customer_id, 'cust-1');
  assert.strictEqual(r.body.target_system, 'asaas');
  passed++;

  server.close();
  console.log(`loop-despachar smoke: ${passed}/5 OK`);
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
