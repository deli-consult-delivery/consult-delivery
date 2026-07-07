// bridge-server/test/breno-aprovacao.test.js — smoke offline de POST
// /api/breno/aprovar/:draft_id (envio de draft de ATENDIMENTO a cliente via
// WhatsApp/Evolution). Sem Supabase real, sem Evolution real — stuba sbFetch/
// supabaseInsert e o global fetch (Evolution API).
//
// Foco: invariantes de segurança do caminho mais sensível da plataforma
// (envio de mensagem a cliente). Regras duras verificadas:
//   - draft de OUTRO tenant → bloqueado, Evolution NUNCA chamado
//   - draft já processado (sent/rejected) → 404, Evolution NUNCA chamado
//     (idempotência — a query em sbFetch é verificada CONTÉM o filtro de
//     tenant_id e de status, não só que o stub "decide" retornar vazio —
//     assim uma mutação que remova o filtro real quebra este teste)
//   - autonomy_level ausente/inválido → gate do semáforo bloqueia (403),
//     Evolution NUNCA chamado (fail-closed, lib/semaforo.js)
//   - happy path → Evolution chamado com número/texto certos, draft vira 'sent'
//   - falha no envio (Evolution não-ok) → draft NÃO é marcado como sent
//
// Rodar:  node bridge-server/test/breno-aprovacao.test.js
'use strict';

const assert = require('node:assert');
const express = require('express');
const http = require('node:http');

const TENANT = '9079bd4d-4df7-4023-90fb-d79c8ba7e900';
const OUTRO_TENANT = 'e9fdaa66-cbe7-4dff-905b-afc4b10219ff';
const DRAFT_ID = 'draft-breno-1';

const factory = require('../routes/breno-aprovacao');

let stubs;

function buildApp() {
  const app = express();
  app.use(express.json());
  // simula requireJwt: popula req.user a partir do header x-test-user (ou 'dev')
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
  content: 'Olá! Seu pedido já saiu pra entrega.',
  channel: 'whatsapp',
  status: 'pending',
  autonomy_level: 'verde',
  metadata: { whatsapp_chat_id: '5511999999999@s.whatsapp.net', conversation_id: 'conv-1', instance_id: 'inst-1' },
};

const ORIGINAL_FETCH = global.fetch;
function restoreFetch() { global.fetch = ORIGINAL_FETCH; }

(async () => {
  const server = http.createServer(buildApp()).listen(0);
  await new Promise((r) => server.once('listening', r));
  let passed = 0;

  // 1) tenant_id ausente → 400, zero chamada a sbFetch
  {
    let sbFetchChamado = false;
    stubs = { sbFetch: () => { sbFetchChamado = true; return []; } };
    const r = await post(server, `/api/breno/aprovar/${DRAFT_ID}`, {});
    assert.strictEqual(r.status, 400);
    assert.strictEqual(sbFetchChamado, false);
    passed++;
  }

  // 2) usuário NÃO é membro do tenant → 403, Evolution nunca chamado
  {
    let fetchChamado = false;
    global.fetch = async () => { fetchChamado = true; return { ok: true, json: async () => ({}) }; };
    stubs = { sbFetch: () => [] }; // tenant_members vazio → não é membro
    const r = await post(server, `/api/breno/aprovar/${DRAFT_ID}`, { tenant_id: TENANT }, { 'x-test-user': 'intruso' });
    assert.strictEqual(r.status, 403);
    assert.strictEqual(fetchChamado, false);
    restoreFetch();
    passed++;
  }

  // 3) draft de OUTRO tenant (ou já processado) → 404, Evolution NUNCA chamado.
  //    A query real filtra por tenant_id E status — o stub verifica que a
  //    QUERY enviada contém os dois filtros (mutation-proof: se alguém
  //    remover um dos filtros da query real, esta asserção falha).
  {
    let fetchChamado = false;
    let queryDrafts = null;
    global.fetch = async () => { fetchChamado = true; return { ok: true, json: async () => ({}) }; };
    stubs = {
      sbFetch: (p) => {
        if (p.startsWith('tenant_members')) return [{ role: 'admin' }];
        if (p.startsWith('agent_drafts')) { queryDrafts = p; return []; } // fora do tenant OU já processado
        return [];
      },
    };
    const r = await post(server, `/api/breno/aprovar/${DRAFT_ID}`, { tenant_id: TENANT });
    assert.strictEqual(r.status, 404);
    assert.strictEqual(fetchChamado, false);
    assert.ok(queryDrafts, 'a rota deveria ter consultado agent_drafts');
    assert.match(queryDrafts, new RegExp(`tenant_id=eq\\.${TENANT}`), 'query deveria filtrar por tenant_id — sem isso, um draft de outro tenant vazaria');
    assert.match(queryDrafts, /status=in\.\(approved,pending\)/, 'query deveria filtrar por status pending/approved — sem isso, um draft já sent seria reenviado');
    restoreFetch();
    passed++;
  }

  // 4) autonomy_level ausente/inválido → gate do semáforo bloqueia (403), Evolution nunca chamado
  {
    let fetchChamado = false;
    global.fetch = async () => { fetchChamado = true; return { ok: true, json: async () => ({}) }; };
    stubs = {
      sbFetch: (p) => {
        if (p.startsWith('tenant_members')) return [{ role: 'admin' }];
        if (p.startsWith('agent_drafts')) return [{ ...DRAFT_BASE, autonomy_level: null }];
        return [];
      },
    };
    const r = await post(server, `/api/breno/aprovar/${DRAFT_ID}`, { tenant_id: TENANT });
    assert.strictEqual(r.status, 403);
    assert.strictEqual(r.body.code, 'SEMAFORO_BLOQUEOU');
    assert.strictEqual(fetchChamado, false);
    restoreFetch();
    passed++;
  }

  // 5) sem whatsapp_chat_id no metadata → 400 MISSING_DESTINATION, Evolution nunca chamado
  {
    let fetchChamado = false;
    global.fetch = async () => { fetchChamado = true; return { ok: true, json: async () => ({}) }; };
    stubs = {
      sbFetch: (p) => {
        if (p.startsWith('tenant_members')) return [{ role: 'admin' }];
        if (p.startsWith('agent_drafts')) return [{ ...DRAFT_BASE, metadata: {} }];
        return [];
      },
    };
    const r = await post(server, `/api/breno/aprovar/${DRAFT_ID}`, { tenant_id: TENANT });
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.body.code, 'MISSING_DESTINATION');
    assert.strictEqual(fetchChamado, false);
    restoreFetch();
    passed++;
  }

  // 6) happy path → 200, Evolution chamado com número/texto certos, draft vira 'sent'
  {
    const evolutionCalls = [];
    const patches = [];
    global.fetch = async (url, opts) => {
      evolutionCalls.push({ url, opts });
      return { ok: true, json: async () => ({ key: { id: 'wamid-123' } }) };
    };
    stubs = {
      sbFetch: (p, opts) => {
        if (p.startsWith('tenant_members')) return [{ role: 'admin' }];
        if (p.startsWith('agent_drafts') && (!opts || opts.method === undefined)) return [DRAFT_BASE];
        if (p.startsWith('evolution_instances')) return [{ evolution_url: 'https://evo.local', api_key: 'k1', instance_name: 'inst1' }];
        if (p.startsWith('agent_drafts') && opts?.method === 'PATCH') { patches.push({ p, opts }); return {}; }
        if (p.startsWith('conversations')) return {};
        return [];
      },
      supabaseInsert: async () => ({}),
    };
    const r = await post(server, `/api/breno/aprovar/${DRAFT_ID}`, { tenant_id: TENANT });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual(evolutionCalls.length, 1);
    assert.match(evolutionCalls[0].url, /https:\/\/evo\.local\/message\/sendText\/inst1/);
    const body = JSON.parse(evolutionCalls[0].opts.body);
    assert.strictEqual(body.number, DRAFT_BASE.metadata.whatsapp_chat_id);
    assert.strictEqual(body.text, DRAFT_BASE.content);
    const sentPatch = patches.find((x) => x.opts.body.status === 'sent');
    assert.ok(sentPatch, 'draft deveria ter sido marcado como sent');
    restoreFetch();
    passed++;
  }

  // 7) Evolution falha (não-ok) → draft NÃO é marcado como sent
  {
    let patchToSent = false;
    global.fetch = async () => ({ ok: false, status: 500, text: async () => '{}' });
    stubs = {
      sbFetch: (p, opts) => {
        if (p.startsWith('tenant_members')) return [{ role: 'admin' }];
        if (p.startsWith('agent_drafts') && opts?.method === 'PATCH') {
          if (opts.body.status === 'sent') patchToSent = true;
          return {};
        }
        if (p.startsWith('agent_drafts')) return [DRAFT_BASE];
        if (p.startsWith('evolution_instances')) return [{ evolution_url: 'https://evo.local', api_key: 'k1', instance_name: 'inst1' }];
        return [];
      },
    };
    const r = await post(server, `/api/breno/aprovar/${DRAFT_ID}`, { tenant_id: TENANT });
    assert.strictEqual(r.status, 502);
    assert.strictEqual(patchToSent, false);
    restoreFetch();
    passed++;
  }

  server.close();
  console.log(`breno-aprovacao smoke: ${passed}/7 OK`);
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
