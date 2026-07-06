// bridge-server/test/ifood-routes-acao-aprovar.test.js — smoke offline do fluxo
// draft→aprovação de routes/ifood.js (POST /ifood/acao → POST /ifood/aprovar/:id)
// para as operações Merchant novas (pausar_loja, despausar_loja, atualizar_horarios)
// + regressão do fluxo de item (pausar_item) já existente antes desta mudança.
// Mocka sbFetch/ifood/supabaseSelect/supabaseInsert — zero rede real, zero Supabase real.
//
// Rodar:  node bridge-server/test/ifood-routes-acao-aprovar.test.js
'use strict';

const assert = require('node:assert');
const express = require('express');
const http = require('node:http');

const factory = require('../routes/ifood');

function internalAuth(req, _res, next) {
  next(); // sem req.user — como uma task Trigger.dev/Hermes (chamada interna confiável)
}

function buildSbFetchStub() {
  const drafts = new Map();
  const calls = [];
  const sbFetch = async (path, opts = {}) => {
    calls.push({ path, opts });
    const method = opts.method || 'GET';
    if (path === 'agent_drafts' && method === 'POST') {
      const id = `draft-${drafts.size + 1}`;
      const row = { id, ...opts.body };
      drafts.set(id, row);
      return [row];
    }
    // [?&]id=eq. (não .*id=eq.) — evita casar "tenant_id=eq." por backtracking guloso.
    const idMatch = path.match(/[?&]id=eq\.([^&]+)/);
    if (idMatch && method === 'GET') {
      const row = drafts.get(decodeURIComponent(idMatch[1]));
      return row ? [row] : [];
    }
    if (idMatch && method === 'PATCH') {
      const row = drafts.get(decodeURIComponent(idMatch[1]));
      if (row) Object.assign(row, opts.body);
      return row ? [row] : [];
    }
    if (path === 'internal_notifications') return null;
    throw new Error(`sbFetch stub: rota não coberta: ${method} ${path}`);
  };
  return { sbFetch, drafts, calls };
}

function buildApp({ sbFetch, ifood, supabaseSelect, assertTenantMember, supabaseInsert, requireJwtOrInternal = internalAuth }) {
  const app = express();
  app.use(express.json());
  app.use('/api', factory({ requireJwtOrInternal, ifood, supabaseSelect, assertTenantMember, sbFetch, supabaseInsert }));
  return app;
}

function request(server, method, path, body) {
  return new Promise((resolve, reject) => {
    const { port } = server.address();
    const payload = body !== undefined ? JSON.stringify(body) : null;
    const req = http.request(
      { host: '127.0.0.1', port, path, method, headers: payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {} },
      (res) => {
        let buf = '';
        res.on('data', (c) => (buf += c));
        res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(buf || '{}') }));
      }
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

const supabaseSelectStub = async () => ({ merchant_id: 'merch-1' });
const supabaseInsertStub = async () => ({});

(async () => {
  let passed = 0;

  // 1) pausar_loja: cria draft com metadata.interrupcao {start,end}
  {
    const { sbFetch, drafts } = buildSbFetchStub();
    const app = buildApp({ sbFetch, ifood: {}, supabaseSelect: supabaseSelectStub, supabaseInsert: supabaseInsertStub });
    const server = http.createServer(app).listen(0);
    await new Promise((r) => server.once('listening', r));
    const r = await request(server, 'POST', '/api/ifood/acao?tenant_id=tenant-1', {
      operacao: 'ifood.pausar_loja',
      parametros: { start: '2026-07-10T10:00:00Z', end: '2026-07-10T12:00:00Z', description: 'Sem entregador' },
    });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.ok(r.body.data.draft_id);
    const draft = drafts.get(r.body.data.draft_id);
    assert.strictEqual(draft.status, 'pending');
    assert.strictEqual(draft.autonomy_level, 'amarelo');
    assert.deepStrictEqual(draft.metadata.interrupcao, { start: '2026-07-10T10:00:00Z', end: '2026-07-10T12:00:00Z', description: 'Sem entregador' });
    server.close();
    passed++;
  }

  // 2) pausar_loja sem start/end → 400, NÃO cria draft
  {
    const { sbFetch, drafts } = buildSbFetchStub();
    const app = buildApp({ sbFetch, ifood: {}, supabaseSelect: supabaseSelectStub, supabaseInsert: supabaseInsertStub });
    const server = http.createServer(app).listen(0);
    await new Promise((r) => server.once('listening', r));
    const r = await request(server, 'POST', '/api/ifood/acao?tenant_id=tenant-1', {
      operacao: 'ifood.pausar_loja', parametros: {},
    });
    assert.strictEqual(r.status, 400);
    assert.strictEqual(drafts.size, 0);
    server.close();
    passed++;
  }

  // 3) despausar_loja: cria draft com metadata.interruption_id
  {
    const { sbFetch, drafts } = buildSbFetchStub();
    const app = buildApp({ sbFetch, ifood: {}, supabaseSelect: supabaseSelectStub, supabaseInsert: supabaseInsertStub });
    const server = http.createServer(app).listen(0);
    await new Promise((r) => server.once('listening', r));
    const r = await request(server, 'POST', '/api/ifood/acao?tenant_id=tenant-1', {
      operacao: 'ifood.despausar_loja', parametros: { interruption_id: 'int-1' },
    });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    const draft = drafts.get(r.body.data.draft_id);
    assert.strictEqual(draft.metadata.interruption_id, 'int-1');
    server.close();
    passed++;
  }

  // 4) atualizar_horarios: cria draft com metadata.shifts
  {
    const { sbFetch, drafts } = buildSbFetchStub();
    const app = buildApp({ sbFetch, ifood: {}, supabaseSelect: supabaseSelectStub, supabaseInsert: supabaseInsertStub });
    const server = http.createServer(app).listen(0);
    await new Promise((r) => server.once('listening', r));
    const shifts = [{ dayOfWeek: 'MONDAY', start: '08:00', duration: 600 }];
    const r = await request(server, 'POST', '/api/ifood/acao?tenant_id=tenant-1', {
      operacao: 'ifood.atualizar_horarios', parametros: { shifts },
    });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    const draft = drafts.get(r.body.data.draft_id);
    assert.deepStrictEqual(draft.metadata.shifts, shifts);
    server.close();
    passed++;
  }

  // 5) aprovar pausar_loja → despacha ifood.criarInterrupcao(merchantId, interrupcao, tenantId)
  {
    const { sbFetch, drafts } = buildSbFetchStub();
    let chamado = null;
    const ifood = { criarInterrupcao: async (merchantId, interrupcao, tenantId) => { chamado = { merchantId, interrupcao, tenantId }; return { id: 'int-novo' }; } };
    const app = buildApp({ sbFetch, ifood, supabaseSelect: supabaseSelectStub, supabaseInsert: supabaseInsertStub });
    const server = http.createServer(app).listen(0);
    await new Promise((r) => server.once('listening', r));

    const criar = await request(server, 'POST', '/api/ifood/acao?tenant_id=tenant-1', {
      operacao: 'ifood.pausar_loja', parametros: { start: 'S', end: 'E' },
    });
    const draftId = criar.body.data.draft_id;

    const r = await request(server, 'POST', `/api/ifood/aprovar/${draftId}`, { tenant_id: 'tenant-1' });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.deepStrictEqual(chamado, { merchantId: 'merch-1', interrupcao: { start: 'S', end: 'E', description: null }, tenantId: 'tenant-1' });
    assert.strictEqual(drafts.get(draftId).status, 'sent');
    server.close();
    passed++;
  }

  // 6) aprovar despausar_loja → despacha ifood.removerInterrupcao(merchantId, interruption_id, tenantId)
  {
    const { sbFetch, drafts } = buildSbFetchStub();
    let chamado = null;
    const ifood = { removerInterrupcao: async (merchantId, interruptionId, tenantId) => { chamado = { merchantId, interruptionId, tenantId }; return null; } };
    const app = buildApp({ sbFetch, ifood, supabaseSelect: supabaseSelectStub, supabaseInsert: supabaseInsertStub });
    const server = http.createServer(app).listen(0);
    await new Promise((r) => server.once('listening', r));

    const criar = await request(server, 'POST', '/api/ifood/acao?tenant_id=tenant-1', {
      operacao: 'ifood.despausar_loja', parametros: { interruption_id: 'int-1' },
    });
    const draftId = criar.body.data.draft_id;

    const r = await request(server, 'POST', `/api/ifood/aprovar/${draftId}`, { tenant_id: 'tenant-1' });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.deepStrictEqual(chamado, { merchantId: 'merch-1', interruptionId: 'int-1', tenantId: 'tenant-1' });
    assert.strictEqual(drafts.get(draftId).status, 'sent');
    server.close();
    passed++;
  }

  // 7) aprovar atualizar_horarios → despacha ifood.atualizarHorarios(merchantId, shifts, tenantId)
  {
    const { sbFetch, drafts } = buildSbFetchStub();
    let chamado = null;
    const shifts = [{ dayOfWeek: 'MONDAY', start: '08:00', duration: 600 }];
    const ifood = { atualizarHorarios: async (merchantId, s, tenantId) => { chamado = { merchantId, s, tenantId }; return { shifts: s }; } };
    const app = buildApp({ sbFetch, ifood, supabaseSelect: supabaseSelectStub, supabaseInsert: supabaseInsertStub });
    const server = http.createServer(app).listen(0);
    await new Promise((r) => server.once('listening', r));

    const criar = await request(server, 'POST', '/api/ifood/acao?tenant_id=tenant-1', {
      operacao: 'ifood.atualizar_horarios', parametros: { shifts },
    });
    const draftId = criar.body.data.draft_id;

    const r = await request(server, 'POST', `/api/ifood/aprovar/${draftId}`, { tenant_id: 'tenant-1' });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.deepStrictEqual(chamado, { merchantId: 'merch-1', s: shifts, tenantId: 'tenant-1' });
    server.close();
    passed++;
  }

  // 8) aprovar despausar_loja com conflito 409 InterruptionOverlap → draft 'failed' + code exposto
  {
    const { sbFetch, drafts } = buildSbFetchStub();
    const IfoodApiError = class extends Error {
      constructor(msg, status, body) { super(msg); this.name = 'IfoodApiError'; this.status = status; this.body = body; }
    };
    const ifood = {
      removerInterrupcao: async () => {
        throw new IfoodApiError('iFood API retornou 409: Conflict', 409, { code: 'InterruptionOverlap', message: 'conflito' });
      },
    };
    const app = buildApp({ sbFetch, ifood, supabaseSelect: supabaseSelectStub, supabaseInsert: supabaseInsertStub });
    const server = http.createServer(app).listen(0);
    await new Promise((r) => server.once('listening', r));

    const criar = await request(server, 'POST', '/api/ifood/acao?tenant_id=tenant-1', {
      operacao: 'ifood.despausar_loja', parametros: { interruption_id: 'int-1' },
    });
    const draftId = criar.body.data.draft_id;

    const r = await request(server, 'POST', `/api/ifood/aprovar/${draftId}`, { tenant_id: 'tenant-1' });
    assert.strictEqual(r.status, 409, JSON.stringify(r.body));
    assert.strictEqual(r.body.details.code, 'InterruptionOverlap');
    const draft = drafts.get(draftId);
    assert.strictEqual(draft.status, 'failed');
    assert.strictEqual(draft.metadata.last_error_code, 'InterruptionOverlap');
    server.close();
    passed++;
  }

  // 9) regressão — pausar_item (fluxo pré-existente) ainda cria e aprova draft normalmente
  {
    const { sbFetch, drafts } = buildSbFetchStub();
    let chamado = null;
    const ifood = {
      listarCatalogos: async () => [{ catalogId: 'cat-1' }],
      listarCategorias: async () => [{ id: 'catg-1' }],
      buscarItemPorNomeOuExternalCode: async () => ({ ok: true, item: { itemId: 'item-1', productId: 'prod-1', nome: 'Combo X' } }),
      pausarItem: async (merchantId, itemId, tenantId) => { chamado = { merchantId, itemId, tenantId }; return { status: 'UNAVAILABLE' }; },
    };
    const app = buildApp({ sbFetch, ifood, supabaseSelect: supabaseSelectStub, supabaseInsert: supabaseInsertStub });
    const server = http.createServer(app).listen(0);
    await new Promise((r) => server.once('listening', r));

    const criar = await request(server, 'POST', '/api/ifood/acao?tenant_id=tenant-1', {
      operacao: 'ifood.pausar_item', parametros: { item_nome: 'Combo X' },
    });
    assert.strictEqual(criar.status, 200, JSON.stringify(criar.body));
    const draftId = criar.body.data.draft_id;

    const r = await request(server, 'POST', `/api/ifood/aprovar/${draftId}`, { tenant_id: 'tenant-1' });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.deepStrictEqual(chamado, { merchantId: 'merch-1', itemId: 'item-1', tenantId: 'tenant-1' });
    assert.strictEqual(drafts.get(draftId).status, 'sent');
    server.close();
    passed++;
  }

  // 10) metadata corrompido (arg ausente) → 400 SEM marcar o draft como 'failed'
  //     (bug de programação, não falha do iFood — draft segue 'pending' pra investigar)
  {
    const { sbFetch, drafts } = buildSbFetchStub();
    let chamado = false;
    const ifood = { removerInterrupcao: async () => { chamado = true; return null; } };
    const app = buildApp({ sbFetch, ifood, supabaseSelect: supabaseSelectStub, supabaseInsert: supabaseInsertStub });
    const server = http.createServer(app).listen(0);
    await new Promise((r) => server.once('listening', r));

    // draft "corrompido": metadata sem interruption_id (nunca aconteceria via /acao normal)
    drafts.set('draft-corrompido', {
      id: 'draft-corrompido', tenant_id: 'tenant-1', status: 'pending', autonomy_level: 'amarelo',
      metadata: { operacao: 'ifood.despausar_loja', merchant_id: 'merch-1' },
    });

    const r = await request(server, 'POST', '/api/ifood/aprovar/draft-corrompido', { tenant_id: 'tenant-1' });
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(chamado, false, 'não deveria ter chamado a API do iFood com arg ausente');
    assert.strictEqual(drafts.get('draft-corrompido').status, 'pending', 'draft não deveria virar failed por bug de metadata');
    server.close();
    passed++;
  }

  process.stdout.write(`\nifood-routes-acao-aprovar: todos os ${passed} cenários passaram.\n`);
})();
