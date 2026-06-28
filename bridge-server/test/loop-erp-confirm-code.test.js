// Smoke offline da rota POST /loop/erp-confirm-code — sem Telegram, sem banco.
'use strict';

const assert = require('node:assert');
const express = require('express');
const http = require('node:http');

let inserted;
const factory = require('../routes/loop-erp-confirm-code');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/loop', factory({
    requireInternalToken: (_req, _res, next) => next(),
    supabaseInsert: async (table, row) => { inserted = { table, row }; return { id: 'n1' }; },
  }));
  return app;
}

function post(server, body) {
  return new Promise((resolve) => {
    const data = JSON.stringify(body);
    const { port } = server.address();
    const req = http.request(
      { host: '127.0.0.1', port, path: '/loop/erp-confirm-code', method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } },
      (res) => { let b = ''; res.on('data', c => b += c); res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(b || '{}') })); }
    );
    req.end(data);
  });
}

(async () => {
  delete process.env.TELEGRAM_BOT_TOKEN; // garante caminho só-sino
  const server = http.createServer(buildApp()).listen(0);
  await new Promise(r => server.once('listening', r));
  let passed = 0;

  // 1) proposal_id ausente → 400
  inserted = null;
  let r = await post(server, { codigo: 'ABC234' });
  assert.strictEqual(r.status, 400); passed++;

  // 2) codigo curto → 400
  r = await post(server, { proposal_id: 'p1', codigo: 'ab' });
  assert.strictEqual(r.status, 400); passed++;

  // 3) happy path → 200, entregue via sino, código presente no corpo da notificação
  inserted = null;
  r = await post(server, { proposal_id: 'p1', codigo: 'ABC234', resumo: 'Gerar boleto' });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.delivered, true);
  assert.ok(r.body.channels.includes('sino'));
  assert.strictEqual(inserted.table, 'internal_notifications');
  assert.match(inserted.row.body, /ABC234/);
  assert.strictEqual(inserted.row.kind, 'erp_confirm_code');
  passed++;

  server.close();
  console.log(`erp-confirm-code smoke: ${passed}/3 OK`);
})().catch(e => { console.error('FAIL', e); process.exit(1); });
