// Smoke offline das rotas POST /api/gestor/aprovar/:id e /rejeitar/:id — sem Supabase real,
// sem docker, sem Evolution real. Stuba sbFetch/supabaseInsert/fetchFn (chamada interna ao
// portal-worker) e o global fetch (Evolution API).
'use strict';

const assert = require('node:assert');
const express = require('express');
const http = require('node:http');

const TENANT = '9079bd4d-4df7-4023-90fb-d79c8ba7e900';
const LOJA = '8434cea4-b9c8-41ea-b366-57e8398aad0b';
const DRAFT_WHATSAPP = 'draft-wa-1';
const DRAFT_PORTAL = 'draft-portal-1';

const factory = require('../routes/gestor-aprovacao');

// Stubs configuráveis por cenário.
let stubs;

function buildApp() {
  const app = express();
  app.use(express.json());
  // simula requireJwt: popula req.user a partir do header x-test-user (ou 'dev' se ausente)
  app.use((req, _res, next) => {
    req.user = { id: req.headers['x-test-user'] || 'dev' };
    next();
  });
  app.use(
    '/api',
    factory({
      sbFetch: (path, opts) => stubs.sbFetch(path, opts),
      supabaseInsert: (table, row) => stubs.supabaseInsert?.(table, row),
      fetchFn: (url, opts) => stubs.fetchFn?.(url, opts),
    })
  );
  return app;
}

function post(server, path, body, headers = {}) {
  return new Promise((resolve) => {
    const data = JSON.stringify(body);
    const { port } = server.address();
    const req = http.request(
      { host: '127.0.0.1', port, path, method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data), ...headers } },
      (res) => {
        let buf = '';
        res.on('data', (c) => (buf += c));
        res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(buf || '{}') }));
      }
    );
    req.end(data);
  });
}

function fakeJsonResponse(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) };
}

(async () => {
  const server = http.createServer(buildApp()).listen(0);
  await new Promise((r) => server.once('listening', r));
  let passed = 0;

  // 1) tenant_id ausente → 400
  stubs = {};
  let r = await post(server, '/api/gestor/aprovar/x', {});
  assert.strictEqual(r.status, 400); passed++;

  // 2) usuário não é membro do tenant → 403
  stubs = { sbFetch: () => [] };
  r = await post(server, `/api/gestor/aprovar/${DRAFT_WHATSAPP}`, { tenant_id: TENANT }, { 'x-test-user': 'intruso' });
  assert.strictEqual(r.status, 403); passed++;

  // 3) draft não encontrado/não pending/não gestor → 409
  stubs = { sbFetch: (p) => (p.startsWith('tenant_members') ? [{ role: 'admin' }] : []) };
  r = await post(server, `/api/gestor/aprovar/${DRAFT_WHATSAPP}`, { tenant_id: TENANT });
  assert.strictEqual(r.status, 409); passed++;

  // 4) whatsapp sem destino (sem whatsapp_chat_id/target_id) → 400
  stubs = {
    sbFetch: (p) => {
      if (p.startsWith('tenant_members')) return [{ role: 'admin' }];
      if (p.startsWith('agent_drafts')) return [{ id: DRAFT_WHATSAPP, content: 'oi', channel: 'whatsapp', target_id: null, loja_id: LOJA, metadata: {} }];
      return [];
    },
  };
  r = await post(server, `/api/gestor/aprovar/${DRAFT_WHATSAPP}`, { tenant_id: TENANT });
  assert.strictEqual(r.status, 400);
  assert.strictEqual(r.body.code, 'MISSING_DESTINATION'); passed++;

  // 5) whatsapp happy path → 200, envia via Evolution (global fetch), marca sent + client_timeline
  {
    const patched = [];
    const inserted = [];
    stubs = {
      sbFetch: (p, opts) => {
        if (p.startsWith('tenant_members')) return [{ role: 'admin' }];
        if (p.startsWith('agent_drafts') && opts?.method === 'PATCH') { patched.push({ p, opts }); return null; }
        if (p.startsWith('agent_drafts')) return [{ id: DRAFT_WHATSAPP, content: 'relatório semanal', channel: 'whatsapp', target_id: '5511999999999', loja_id: LOJA, metadata: {} }];
        if (p.startsWith('evolution_instances')) return [{ evolution_url: 'http://evo.local', api_key: 'k', instance_name: 'inst1', status: 'connected' }];
        return [];
      },
      supabaseInsert: async (table, row) => { inserted.push({ table, row }); },
    };
    const originalFetch = global.fetch;
    global.fetch = async (url) => {
      assert.ok(String(url).includes('/message/sendText/inst1'));
      return fakeJsonResponse(200, { key: { id: 'msg-1' } });
    };
    try {
      r = await post(server, `/api/gestor/aprovar/${DRAFT_WHATSAPP}`, { tenant_id: TENANT });
    } finally {
      global.fetch = originalFetch;
    }
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.ok, true);
    assert.strictEqual(r.body.canal, 'whatsapp');
    assert.strictEqual(patched.length, 1);
    assert.strictEqual(patched[0].opts.body.status, 'sent');
    assert.strictEqual(inserted.length, 1);
    assert.strictEqual(inserted[0].table, 'client_timeline');
    assert.strictEqual(inserted[0].row.event_type, 'draft_enviado');
    passed++;
  }

  // 6) portal_ifood sem metadata.pedido → 400
  stubs = {
    sbFetch: (p) => {
      if (p.startsWith('tenant_members')) return [{ role: 'admin' }];
      if (p.startsWith('agent_drafts')) return [{ id: DRAFT_PORTAL, content: 'obrigado!', channel: 'portal_ifood', loja_id: LOJA, metadata: {} }];
      return [];
    },
  };
  r = await post(server, `/api/gestor/aprovar/${DRAFT_PORTAL}`, { tenant_id: TENANT });
  assert.strictEqual(r.status, 400);
  assert.strictEqual(r.body.code, 'MISSING_METADATA'); passed++;

  // 7) portal_ifood happy path → 200, chama preencher+enviar com TEXTO_APROVADO, marca sent
  {
    const patched = [];
    const chamadasPortal = [];
    stubs = {
      sbFetch: (p, opts) => {
        if (p.startsWith('tenant_members')) return [{ role: 'admin' }];
        if (p.startsWith('agent_drafts') && opts?.method === 'PATCH') { patched.push({ p, opts }); return null; }
        if (p.startsWith('agent_drafts')) return [{ id: DRAFT_PORTAL, content: 'obrigado pela avaliação!', channel: 'portal_ifood', loja_id: LOJA, metadata: { pedido: '12345' } }];
        if (p.startsWith('lojas')) return [{ ifood_portal_nome: 'Café Container - Lanches e Salgados' }];
        return [];
      },
      supabaseInsert: async () => {},
      fetchFn: async (url, opts) => {
        const body = JSON.parse(opts.body);
        chamadasPortal.push(body);
        if (body.runner === 'preencher') {
          return fakeJsonResponse(200, { ok: true, exitCode: 0, stdout: 'RESULTADO=' + JSON.stringify({ ok: true, pedido: '12345', reviewId: 'rev-1', orderId: 'ord-1', preenchido: true, enviado: false }), stderr: '' });
        }
        return fakeJsonResponse(200, { ok: true, exitCode: 0, stdout: 'RESULTADO=' + JSON.stringify({ ok: true, enviado: true, reviewId: 'rev-1', textoEnviado: body.env.TEXTO_APROVADO }), stderr: '' });
      },
    };
    r = await post(server, `/api/gestor/aprovar/${DRAFT_PORTAL}`, { tenant_id: TENANT });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.ok, true);
    assert.strictEqual(r.body.canal, 'portal_ifood');
    assert.strictEqual(chamadasPortal.length, 2);
    assert.strictEqual(chamadasPortal[0].runner, 'preencher');
    assert.strictEqual(chamadasPortal[0].loja, 'Café Container - Lanches e Salgados');
    assert.strictEqual(chamadasPortal[0].env.PEDIDO, '12345');
    assert.strictEqual(chamadasPortal[0].env.TEXTO_APROVADO, 'obrigado pela avaliação!');
    assert.strictEqual(chamadasPortal[1].runner, 'enviar');
    assert.strictEqual(chamadasPortal[1].env.CONFIRMAR_ENVIO, '1');
    assert.strictEqual(chamadasPortal[1].env.REVIEW_ID, 'rev-1');
    assert.strictEqual(chamadasPortal[1].env.TEXTO_APROVADO, 'obrigado pela avaliação!');
    assert.strictEqual(patched.length, 1);
    assert.strictEqual(patched[0].opts.body.status, 'sent');
    passed++;
  }

  // 8) portal_ifood: enviar falha (exitCode != 0) → 502, draft continua pending (sem PATCH)
  {
    const patched = [];
    stubs = {
      sbFetch: (p, opts) => {
        if (p.startsWith('tenant_members')) return [{ role: 'admin' }];
        if (p.startsWith('agent_drafts') && opts?.method === 'PATCH') { patched.push({ p, opts }); return null; }
        if (p.startsWith('agent_drafts')) return [{ id: DRAFT_PORTAL, content: 'texto', channel: 'portal_ifood', loja_id: LOJA, metadata: { pedido: '999' } }];
        if (p.startsWith('lojas')) return [{ ifood_portal_nome: 'Loja X' }];
        return [];
      },
      fetchFn: async (_url, opts) => {
        const body = JSON.parse(opts.body);
        if (body.runner === 'preencher') return fakeJsonResponse(200, { ok: true, exitCode: 0, stdout: 'RESULTADO={}', stderr: '' });
        return fakeJsonResponse(200, { ok: false, exitCode: 1, stdout: '', stderr: 'ERRO: texto diverge do aprovado' });
      },
    };
    r = await post(server, `/api/gestor/aprovar/${DRAFT_PORTAL}`, { tenant_id: TENANT });
    assert.strictEqual(r.status, 502);
    assert.strictEqual(patched.length, 0); // draft NÃO foi marcado sent
    passed++;
  }

  // 9) channel não suportado → 400
  stubs = {
    sbFetch: (p) => {
      if (p.startsWith('tenant_members')) return [{ role: 'admin' }];
      if (p.startsWith('agent_drafts')) return [{ id: 'draft-x', content: 'x', channel: 'email', loja_id: LOJA, metadata: {} }];
      return [];
    },
  };
  r = await post(server, `/api/gestor/aprovar/draft-x`, { tenant_id: TENANT });
  assert.strictEqual(r.status, 400); passed++;

  // 10) rejeitar — happy path → 200, PATCH status=rejected
  {
    const patched = [];
    stubs = {
      sbFetch: (p, opts) => {
        if (p.startsWith('tenant_members')) return [{ role: 'admin' }];
        if (p.startsWith('agent_drafts') && opts?.method === 'PATCH') { patched.push({ p, opts }); return null; }
        if (p.startsWith('agent_drafts')) return [{ id: DRAFT_WHATSAPP }];
        return [];
      },
    };
    r = await post(server, `/api/gestor/rejeitar/${DRAFT_WHATSAPP}`, { tenant_id: TENANT });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(patched.length, 1);
    assert.strictEqual(patched[0].opts.body.status, 'rejected');
    passed++;
  }

  server.close();
  console.log(`gestor-aprovacao smoke: ${passed}/10 OK`);
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
