// bridge-server/test/cora-aprovacao.test.js — smoke offline de POST
// /api/cora/aprovar/:draft_id (envio de cobrança a cliente via WhatsApp/Evolution).
// Sem Supabase real, sem Evolution real — stuba sbFetch/supabaseInsert e o
// global fetch (Evolution API).
//
// Foco: a guarda "fatura ainda ativa no Asaas" (1.5), adicionada porque a régua
// roda 1x/dia mas o cliente pode pagar a qualquer hora depois disso — sem essa
// checagem no momento do envio, aprovar um draft velho cobraria alguém que já
// pagou. Regras duras verificadas:
//   - cobrança já paga (status=received) → 409 CHARGE_NOT_ELIGIBLE, Evolution
//     NUNCA chamado, draft é rejeitado automaticamente
//   - cobrança marcada "não cobrar" (ignorar_cobranca=true) → mesmo bloqueio
//   - cobrança ainda elegível (pending/overdue, não ignorada) → segue o fluxo
//   - draft sem cobranca_v2_id (fora do fluxo V2/Asaas) → guarda é pulada,
//     comportamento anterior preservado
//
// Rodar:  node bridge-server/test/cora-aprovacao.test.js
'use strict';

const assert = require('node:assert');
const express = require('express');
const http = require('node:http');

const TENANT = '9079bd4d-4df7-4023-90fb-d79c8ba7e900';
const DRAFT_ID = 'draft-cora-1';
const COBRANCA_ID = 'cobranca-v2-1';

const factory = require('../routes/cora-aprovacao');

let stubs;

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { id: req.headers['x-test-user'] || 'dev' };
    next();
  });
  app.use('/api', factory({
    sbFetch: (path, opts) => stubs.sbFetch(path, opts),
    supabaseInsert: (table, row) => stubs.supabaseInsert?.(table, row),
  }));
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

const DRAFT_BASE = {
  id: DRAFT_ID,
  content: 'Olá! Passando pra lembrar da fatura em aberto.',
  status: 'pending',
  metadata: { customer_phone: '94991857408', cobranca_v2_id: COBRANCA_ID },
};

const ORIGINAL_FETCH = global.fetch;
function restoreFetch() { global.fetch = ORIGINAL_FETCH; }

// ?test_phone diferente do número real: isTestSend=true, pula horário legal e
// dedup diário — isola o teste do relógio real da máquina que roda o CI.
const TEST_QS = '?test_phone=5511988887777';

(async () => {
  const server = http.createServer(buildApp()).listen(0);
  await new Promise((r) => server.once('listening', r));
  let passed = 0;

  // 1) cobrança já paga (received) → 409 CHARGE_NOT_ELIGIBLE, Evolution nunca
  //    chamado, draft é rejeitado automaticamente (verifica o PATCH real).
  {
    let fetchChamado = false;
    let patchRejeicao = null;
    global.fetch = async () => { fetchChamado = true; return { ok: true, json: async () => ({}) }; };
    stubs = {
      sbFetch: (p, opts) => {
        if (p.startsWith('tenant_members')) return [{ role: 'admin' }];
        if (p.startsWith('cobrancas')) return [{ status: 'received', ignorar_cobranca: false }];
        if (p.startsWith('agent_drafts') && opts?.method === 'PATCH') { patchRejeicao = opts.body; return {}; }
        if (p.startsWith('agent_drafts')) return [DRAFT_BASE];
        return [];
      },
    };
    const r = await post(server, `/api/cora/aprovar/${DRAFT_ID}${TEST_QS}`, { tenant_id: TENANT });
    assert.strictEqual(r.status, 409, JSON.stringify(r.body));
    assert.strictEqual(r.body.code, 'CHARGE_NOT_ELIGIBLE');
    assert.strictEqual(fetchChamado, false, 'Evolution não deveria ser chamado pra fatura já paga');
    assert.ok(patchRejeicao, 'draft deveria ter sido rejeitado automaticamente');
    assert.strictEqual(patchRejeicao.status, 'rejected');
    restoreFetch();
    passed++;
  }

  // 2) cobrança marcada "não cobrar" (ignorar_cobranca=true) → mesmo bloqueio,
  //    mesmo que o status ainda esteja pending.
  {
    let fetchChamado = false;
    global.fetch = async () => { fetchChamado = true; return { ok: true, json: async () => ({}) }; };
    stubs = {
      sbFetch: (p, opts) => {
        if (p.startsWith('tenant_members')) return [{ role: 'admin' }];
        if (p.startsWith('cobrancas')) return [{ status: 'pending', ignorar_cobranca: true }];
        if (p.startsWith('agent_drafts') && opts?.method === 'PATCH') return {};
        if (p.startsWith('agent_drafts')) return [DRAFT_BASE];
        return [];
      },
    };
    const r = await post(server, `/api/cora/aprovar/${DRAFT_ID}${TEST_QS}`, { tenant_id: TENANT });
    assert.strictEqual(r.status, 409);
    assert.strictEqual(r.body.code, 'CHARGE_NOT_ELIGIBLE');
    assert.strictEqual(fetchChamado, false, 'Evolution não deveria ser chamado pra fatura marcada "não cobrar"');
    restoreFetch();
    passed++;
  }

  // 3) cobrança ainda existe mas sumiu da tabela local (reconciliada como órfã
  //    e removida, ou nunca sincronizada) → cobRows vazio → também bloqueia.
  {
    let fetchChamado = false;
    global.fetch = async () => { fetchChamado = true; return { ok: true, json: async () => ({}) }; };
    stubs = {
      sbFetch: (p, opts) => {
        if (p.startsWith('tenant_members')) return [{ role: 'admin' }];
        if (p.startsWith('cobrancas')) return []; // não encontrada
        if (p.startsWith('agent_drafts') && opts?.method === 'PATCH') return {};
        if (p.startsWith('agent_drafts')) return [DRAFT_BASE];
        return [];
      },
    };
    const r = await post(server, `/api/cora/aprovar/${DRAFT_ID}${TEST_QS}`, { tenant_id: TENANT });
    assert.strictEqual(r.status, 409);
    assert.strictEqual(fetchChamado, false, 'Evolution não deveria ser chamado pra cobrança que não existe mais localmente');
    restoreFetch();
    passed++;
  }

  // 4) cobrança ainda elegível (overdue, não ignorada) → segue o fluxo, chega
  //    no envio: 200, Evolution chamado, draft vira 'sent'.
  {
    const evolutionCalls = [];
    const patches = [];
    global.fetch = async (url, opts) => { evolutionCalls.push({ url, opts }); return { ok: true, json: async () => ({}) }; };
    stubs = {
      sbFetch: (p, opts) => {
        if (p.startsWith('tenant_members')) return [{ role: 'admin' }];
        if (p.startsWith('cobrancas')) return [{ status: 'overdue', ignorar_cobranca: false }];
        if (p.startsWith('evolution_instances')) return [{ evolution_url: 'https://evo.local', api_key: 'k1', instance_name: 'inst1' }];
        if (p.startsWith('agent_drafts') && opts?.method === 'PATCH') { patches.push(opts.body); return {}; }
        if (p.startsWith('agent_drafts')) return [DRAFT_BASE];
        return [];
      },
      supabaseInsert: async () => ({}),
    };
    const r = await post(server, `/api/cora/aprovar/${DRAFT_ID}${TEST_QS}`, { tenant_id: TENANT });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual(evolutionCalls.length, 1);
    const sentPatch = patches.find((b) => b.status === 'sent');
    assert.ok(sentPatch, 'draft deveria ter sido marcado como sent');
    restoreFetch();
    passed++;
  }

  // 5) draft sem cobranca_v2_id no metadata (fora do fluxo V2/Asaas) → guarda
  //    1.5 é pulada, comportamento anterior preservado (chega no envio).
  {
    const evolutionCalls = [];
    global.fetch = async (url, opts) => { evolutionCalls.push({ url, opts }); return { ok: true, json: async () => ({}) }; };
    let cobrancasConsultada = false;
    stubs = {
      sbFetch: (p, opts) => {
        if (p.startsWith('tenant_members')) return [{ role: 'admin' }];
        if (p.startsWith('cobrancas')) { cobrancasConsultada = true; return []; }
        if (p.startsWith('evolution_instances')) return [{ evolution_url: 'https://evo.local', api_key: 'k1', instance_name: 'inst1' }];
        if (p.startsWith('agent_drafts') && opts?.method === 'PATCH') return {};
        if (p.startsWith('agent_drafts')) return [{ ...DRAFT_BASE, metadata: { customer_phone: '94991857408' } }];
        return [];
      },
      supabaseInsert: async () => ({}),
    };
    const r = await post(server, `/api/cora/aprovar/${DRAFT_ID}${TEST_QS}`, { tenant_id: TENANT });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual(evolutionCalls.length, 1);
    assert.strictEqual(cobrancasConsultada, false, 'sem cobranca_v2_id, a tabela cobrancas nem deveria ser consultada');
    restoreFetch();
    passed++;
  }

  server.close();
  console.log(`cora-aprovacao smoke: ${passed}/5 OK`);
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
