// Smoke offline da rota POST /loop/autorizar — sem banco, stubs.
'use strict';

const assert = require('node:assert');
const express = require('express');
const http = require('node:http');

const TENANT = '9079bd4d-4df7-4023-90fb-d79c8ba7e900';
const TASK = '8434cea4-b9c8-41ea-b366-57e8398aad0b';

let stub;
const factory = require('../routes/loop-autorizar');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/loop', factory({
    requireInternalToken: (_req, _res, next) => next(),
    sbFetch: (path, opts) => stub(path, opts),
  }));
  return app;
}

function post(server, body) {
  return new Promise((resolve) => {
    const data = JSON.stringify(body);
    const { port } = server.address();
    const req = http.request(
      { host: '127.0.0.1', port, path: '/loop/autorizar', method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } },
      (res) => { let b = ''; res.on('data', c => b += c); res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(b || '{}') })); }
    );
    req.end(data);
  });
}

(async () => {
  const server = http.createServer(buildApp()).listen(0);
  await new Promise(r => server.once('listening', r));
  let passed = 0;

  // 1) task_id inválido → 400
  stub = () => [];
  let r = await post(server, { task_id: 'x', tenant_id: TENANT, decisao: 'autorizar' });
  assert.strictEqual(r.status, 400); passed++;

  // 2) decisao inválida → 400
  r = await post(server, { task_id: TASK, tenant_id: TENANT, decisao: 'talvez' });
  assert.strictEqual(r.status, 400); passed++;

  // 3) autorizar com tarefa aguardando → 200 loop_state=open, e o PATCH foi condicional
  let patched = null;
  stub = (path, opts) => { patched = { path, opts }; return [{ id: TASK, loop_state: 'open', status: 'doing' }]; };
  r = await post(server, { task_id: TASK, tenant_id: TENANT, decisao: 'autorizar' });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.loop_state, 'open');
  assert.match(patched.path, /loop_state=eq\.aguardando_autorizacao_ceo/);
  assert.strictEqual(patched.opts.method, 'PATCH');
  assert.deepStrictEqual(patched.opts.body, { loop_state: 'open' });
  passed++;

  // 4) recusar → PATCH para done + cancelled
  stub = (_p, opts) => { patched = { opts }; return [{ id: TASK, loop_state: 'done', status: 'cancelled' }]; };
  r = await post(server, { task_id: TASK, tenant_id: TENANT, decisao: 'recusar' });
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual(patched.opts.body, { loop_state: 'done', status: 'cancelled' });
  passed++;

  // 5) tarefa não aguardando (0 linhas) → 409
  stub = () => [];
  r = await post(server, { task_id: TASK, tenant_id: TENANT, decisao: 'autorizar' });
  assert.strictEqual(r.status, 409); passed++;

  server.close();
  console.log(`loop-autorizar smoke: ${passed}/5 OK`);
})().catch(e => { console.error('FAIL', e); process.exit(1); });
