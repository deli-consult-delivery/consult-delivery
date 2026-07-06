// bridge-server/test/ifood-aprovar-routes.test.js — smoke offline do dispatcher
// genérico de POST /ifood/aprovar/:draftId (routes/ifood.js). Cobre a
// generalização de OPERACOES_ESCRITA (argKeys) que passou a suportar
// ifood.responder_review (review_id + texto) além de pausar/reabrir item
// (item_id) — sem quebrar o caminho existente. Mocka sbFetch/supabaseInsert/
// lib/ifood — zero rede real, zero Supabase real.
//
// Rodar:  node bridge-server/test/ifood-aprovar-routes.test.js
'use strict';

const assert = require('node:assert');
const express = require('express');
const http = require('node:http');

const factory = require('../routes/ifood');

function internalAuth(req, _res, next) {
  next();
}

function buildApp({ sbFetch, ifood, supabaseInsert = async () => {}, requireJwtOrInternal = internalAuth, assertTenantMember, supabaseSelect }) {
  const app = express();
  app.use(express.json());
  app.use('/api', factory({ requireJwtOrInternal, ifood, supabaseSelect, assertTenantMember, sbFetch, supabaseInsert }));
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

function sbFetchStub(routes) {
  return async (path) => {
    for (const r of routes) {
      if (r.test(path)) return r.value;
    }
    throw new Error(`sbFetch stub: nenhuma rota casou com ${path}`);
  };
}

const DRAFT_REVIEW_PENDENTE = {
  id: 'draft-1',
  content: 'Responder avaliação review-1 no iFood',
  status: 'pending',
  autonomy_level: 'amarelo',
  metadata: {
    operacao: 'ifood.responder_review',
    merchant_id: 'merchant-1',
    review_id: 'review-1',
    texto: 'Obrigado pelo feedback!',
    tenant_id: 'tenant-1',
  },
};

const DRAFT_ITEM_PENDENTE = {
  id: 'draft-2',
  content: 'Pausar Pizza no iFood',
  status: 'pending',
  autonomy_level: 'amarelo',
  metadata: { operacao: 'ifood.pausar_item', merchant_id: 'merchant-1', item_id: 'item-1', tenant_id: 'tenant-1' },
};

(async () => {
  let passed = 0;

  // 1) responder_review: chama ifood.responderReview(merchantId, reviewId, texto, tenantId) e marca 'sent'
  {
    let patchBody = null;
    const sbFetch = sbFetchStub([
      { test: (p) => p.startsWith('agent_drafts?id=eq.draft-1'), value: [DRAFT_REVIEW_PENDENTE] },
    ]);
    const sbFetchComPatch = async (path, opts) => {
      if (opts?.method === 'PATCH') { patchBody = opts.body; return null; }
      return sbFetch(path, opts);
    };
    let chamadaArgs = null;
    const ifood = {
      responderReview: async (...args) => { chamadaArgs = args; return { createdAt: '2026-07-06T00:00:00Z', reviewId: 'review-1', text: 'Obrigado pelo feedback!' }; },
    };
    const app = buildApp({ sbFetch: sbFetchComPatch, ifood });
    const server = http.createServer(app).listen(0);
    await new Promise((r) => server.once('listening', r));
    const r = await post(server, '/api/ifood/aprovar/draft-1', { tenant_id: 'tenant-1' });
    assert.strictEqual(r.status, 200);
    assert.deepStrictEqual(chamadaArgs, ['merchant-1', 'review-1', 'Obrigado pelo feedback!', 'tenant-1']);
    assert.strictEqual(patchBody.status, 'sent');
    assert.strictEqual(r.body.data.resultado.reviewId, 'review-1');
    server.close();
    passed++;
  }

  // 2) responder_review: iFood devolve 409 (status ≠ NOT_REPLIED) → repassa 409 claro, marca draft 'failed'
  {
    let patchBody = null;
    const sbFetch = async (path, opts) => {
      if (opts?.method === 'PATCH') { patchBody = opts.body; return null; }
      if (path.startsWith('agent_drafts?id=eq.draft-1')) return [DRAFT_REVIEW_PENDENTE];
      throw new Error(`sem stub para ${path}`);
    };
    const IfoodApiError = class extends Error {
      constructor(msg, status, body) { super(msg); this.name = 'IfoodApiError'; this.status = status; this.body = body; }
    };
    const ifood = {
      responderReview: async () => { throw new IfoodApiError('iFood retornou 409', 409, { code: 'REVIEW_ALREADY_REPLIED', message: 'já respondida' }); },
    };
    const app = buildApp({ sbFetch, ifood });
    const server = http.createServer(app).listen(0);
    await new Promise((r) => server.once('listening', r));
    const r = await post(server, '/api/ifood/aprovar/draft-1', { tenant_id: 'tenant-1' });
    assert.strictEqual(r.status, 409);
    assert.strictEqual(r.body.details.code, 'REVIEW_ALREADY_REPLIED');
    assert.strictEqual(patchBody.status, 'failed');
    server.close();
    passed++;
  }

  // 3) regressão: pausar_item (argKeys=['item_id']) continua funcionando como antes
  {
    let chamadaArgs = null;
    const sbFetch = async (path, opts) => {
      if (opts?.method === 'PATCH') return null;
      if (path.startsWith('agent_drafts?id=eq.draft-2')) return [DRAFT_ITEM_PENDENTE];
      throw new Error(`sem stub para ${path}`);
    };
    const ifood = { pausarItem: async (...args) => { chamadaArgs = args; return { status: 'UNAVAILABLE' }; } };
    const app = buildApp({ sbFetch, ifood });
    const server = http.createServer(app).listen(0);
    await new Promise((r) => server.once('listening', r));
    const r = await post(server, '/api/ifood/aprovar/draft-2', { tenant_id: 'tenant-1' });
    assert.strictEqual(r.status, 200);
    assert.deepStrictEqual(chamadaArgs, ['merchant-1', 'item-1', 'tenant-1']);
    server.close();
    passed++;
  }

  // 4) metadata incompleto (texto ausente) → 400 claro, nunca chama a API do iFood
  {
    let ifoodChamado = false;
    const draftSemTexto = {
      ...DRAFT_REVIEW_PENDENTE,
      metadata: { operacao: 'ifood.responder_review', merchant_id: 'merchant-1', review_id: 'review-1', tenant_id: 'tenant-1' },
    };
    const sbFetch = async (path) => {
      if (path.startsWith('agent_drafts?id=eq.draft-1')) return [draftSemTexto];
      throw new Error(`sem stub para ${path}`);
    };
    const ifood = { responderReview: async () => { ifoodChamado = true; return {}; } };
    const app = buildApp({ sbFetch, ifood });
    const server = http.createServer(app).listen(0);
    await new Promise((r) => server.once('listening', r));
    const r = await post(server, '/api/ifood/aprovar/draft-1', { tenant_id: 'tenant-1' });
    assert.strictEqual(r.status, 400);
    assert.strictEqual(ifoodChamado, false);
    server.close();
    passed++;
  }

  process.stdout.write(`\nifood-aprovar-routes: todos os ${passed} cenários passaram.\n`);
})();
