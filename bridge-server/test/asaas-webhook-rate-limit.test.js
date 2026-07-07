// bridge-server/test/asaas-webhook-rate-limit.test.js — smoke offline do rate
// limit em routes/asaas-webhook.js (30 req/min por IP). Zero rede real,
// zero Supabase real. O rate limit é checado ANTES da validação de token,
// então nem precisamos de um ASAAS_WEBHOOK_SECRET válido pra provar o 429.
//
// Rodar:  node bridge-server/test/asaas-webhook-rate-limit.test.js
'use strict';

const assert = require('node:assert');
const express = require('express');
const http = require('node:http');

const factory = require('../routes/asaas-webhook');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api', factory({
    supabaseInsert: async () => {},
    supabaseSelect: async () => null,
    supabaseUpdate: async () => {},
    ASAAS_WEBHOOK_SECRET: 'segredo-teste',
  }));
  return app;
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

(async () => {
  let passed = 0;
  const app = buildApp();
  const server = http.createServer(app).listen(0);
  await new Promise((r) => server.once('listening', r));

  // 1) as primeiras 30 requisições passam do rate limit (podem falhar depois por
  // token inválido — 401 — o que só confirma que o rate limit não bloqueou)
  {
    let algumBloqueadoAntesDaHora = false;
    for (let i = 0; i < 30; i++) {
      const r = await post(server, '/api/asaas/webhook', { event: 'PAYMENT_CONFIRMED', payment: { id: `pay-${i}` } });
      if (r.status === 429) algumBloqueadoAntesDaHora = true;
    }
    assert.strictEqual(algumBloqueadoAntesDaHora, false, 'as primeiras 30 requisições não deveriam ser bloqueadas por rate limit');
    passed++;
  }

  // 2) a 31ª requisição no mesmo minuto → 429
  {
    const r = await post(server, '/api/asaas/webhook', { event: 'PAYMENT_CONFIRMED', payment: { id: 'pay-31' } });
    assert.strictEqual(r.status, 429);
    assert.strictEqual(r.body.error, 'limite_de_requisicoes_excedido');
    passed++;
  }

  server.close();
  process.stdout.write(`\nasaas-webhook-rate-limit: todos os ${passed} cenários passaram.\n`);
})();
