// bridge-server/test/auth-middleware.test.js — testes UNITÁRIOS de
// lib/auth-middleware.js (mesmo código real usado por index.js, extraído
// pra ficar testável offline). Mocka global.fetch e req/res — zero rede real.
// Foco: fail-closed do token interno, JWT válido/inválido, e o gate de
// tenant (assertTenantMember) — regressão se alguém remover o isolamento.
//
// Rodar:  node bridge-server/test/auth-middleware.test.js
'use strict';

const assert = require('node:assert');
const {
  safeTokenEqual,
  requireInternalToken,
  requireJwt,
  requireJwtOrInternal,
  makeAssertTenantMember,
} = require('../lib/auth-middleware');

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

function fakeRes() {
  const res = { statusCode: null, body: null };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  return res;
}

const ORIGINAL_FETCH = global.fetch;
function restoreFetch() { global.fetch = ORIGINAL_FETCH; }

(async () => {
  // ── safeTokenEqual ───────────────────────────────────────────────────────
  await check('safeTokenEqual: strings iguais → true', () => {
    assert.strictEqual(safeTokenEqual('abc123', 'abc123'), true);
  });
  await check('safeTokenEqual: strings diferentes (mesmo tamanho) → false', () => {
    assert.strictEqual(safeTokenEqual('abc123', 'abc124'), false);
  });
  await check('safeTokenEqual: tamanhos diferentes → false, nunca lança', () => {
    assert.strictEqual(safeTokenEqual('abc', 'abcdef'), false);
  });
  await check('safeTokenEqual: não-string (undefined/null) → false, nunca lança', () => {
    assert.strictEqual(safeTokenEqual(undefined, 'abc'), false);
    assert.strictEqual(safeTokenEqual(null, 'abc'), false);
  });

  // ── requireInternalToken — FAIL-CLOSED ───────────────────────────────────
  await check('requireInternalToken: sem INTERNAL_BRIDGE_TOKEN configurado → 503, next() NUNCA chamado', () => {
    delete process.env.INTERNAL_BRIDGE_TOKEN;
    const req = { headers: { 'x-internal-token': 'qualquer' } };
    const res = fakeRes();
    let nextChamado = false;
    requireInternalToken(req, res, () => { nextChamado = true; });
    assert.strictEqual(res.statusCode, 503);
    assert.strictEqual(nextChamado, false);
  });
  await check('requireInternalToken: token errado → 401, next() nunca chamado', () => {
    process.env.INTERNAL_BRIDGE_TOKEN = 'token-correto';
    const req = { headers: { 'x-internal-token': 'token-errado' } };
    const res = fakeRes();
    let nextChamado = false;
    requireInternalToken(req, res, () => { nextChamado = true; });
    assert.strictEqual(res.statusCode, 401);
    assert.strictEqual(nextChamado, false);
    delete process.env.INTERNAL_BRIDGE_TOKEN;
  });
  await check('requireInternalToken: token correto → next() chamado, sem resposta de erro', () => {
    process.env.INTERNAL_BRIDGE_TOKEN = 'token-correto';
    const req = { headers: { 'x-internal-token': 'token-correto' } };
    const res = fakeRes();
    let nextChamado = false;
    requireInternalToken(req, res, () => { nextChamado = true; });
    assert.strictEqual(nextChamado, true);
    assert.strictEqual(res.statusCode, null);
    delete process.env.INTERNAL_BRIDGE_TOKEN;
  });

  // ── requireJwt ────────────────────────────────────────────────────────────
  await check('requireJwt: sem Authorization → 401 missing token, zero fetch', async () => {
    process.env.SUPABASE_ANON_KEY = 'anon-key';
    let fetchChamado = false;
    global.fetch = async () => { fetchChamado = true; };
    const req = { headers: {} };
    const res = fakeRes();
    await requireJwt(req, res, () => {});
    assert.strictEqual(res.statusCode, 401);
    assert.strictEqual(fetchChamado, false);
    restoreFetch();
    delete process.env.SUPABASE_ANON_KEY;
  });
  await check('requireJwt: token inválido (Supabase responde não-ok) → 401, next() nunca chamado', async () => {
    process.env.SUPABASE_ANON_KEY = 'anon-key';
    process.env.SUPABASE_URL = 'https://x.supabase.co';
    global.fetch = async () => ({ ok: false, status: 401 });
    const req = { headers: { authorization: 'Bearer token-invalido' } };
    const res = fakeRes();
    let nextChamado = false;
    await requireJwt(req, res, () => { nextChamado = true; });
    assert.strictEqual(res.statusCode, 401);
    assert.strictEqual(nextChamado, false);
    restoreFetch();
    delete process.env.SUPABASE_ANON_KEY;
    delete process.env.SUPABASE_URL;
  });
  await check('requireJwt: token válido → popula req.user, next() chamado', async () => {
    process.env.SUPABASE_ANON_KEY = 'anon-key';
    process.env.SUPABASE_URL = 'https://x.supabase.co';
    global.fetch = async () => ({ ok: true, json: async () => ({ id: 'user-1', email: 'a@b.com' }) });
    const req = { headers: { authorization: 'Bearer token-valido' } };
    const res = fakeRes();
    let nextChamado = false;
    await requireJwt(req, res, () => { nextChamado = true; });
    assert.strictEqual(nextChamado, true);
    assert.strictEqual(req.user.id, 'user-1');
    restoreFetch();
    delete process.env.SUPABASE_ANON_KEY;
    delete process.env.SUPABASE_URL;
  });

  // ── requireJwtOrInternal ──────────────────────────────────────────────────
  await check('requireJwtOrInternal: com x-internal-token e SEM INTERNAL_BRIDGE_TOKEN configurado → 503 (fail-closed)', async () => {
    delete process.env.INTERNAL_BRIDGE_TOKEN;
    const req = { headers: { 'x-internal-token': 'algo' } };
    const res = fakeRes();
    let nextChamado = false;
    await requireJwtOrInternal(req, res, () => { nextChamado = true; });
    assert.strictEqual(res.statusCode, 503);
    assert.strictEqual(nextChamado, false);
  });
  await check('requireJwtOrInternal: x-internal-token correto → next(), NUNCA cai pro fluxo JWT (zero fetch)', async () => {
    process.env.INTERNAL_BRIDGE_TOKEN = 'token-interno';
    let fetchChamado = false;
    global.fetch = async () => { fetchChamado = true; };
    const req = { headers: { 'x-internal-token': 'token-interno' } };
    const res = fakeRes();
    let nextChamado = false;
    await requireJwtOrInternal(req, res, () => { nextChamado = true; });
    assert.strictEqual(nextChamado, true);
    assert.strictEqual(fetchChamado, false);
    restoreFetch();
    delete process.env.INTERNAL_BRIDGE_TOKEN;
  });
  await check('requireJwtOrInternal: sem x-internal-token → cai pro requireJwt (sem Authorization → 401)', async () => {
    const req = { headers: {} };
    const res = fakeRes();
    await requireJwtOrInternal(req, res, () => {});
    assert.strictEqual(res.statusCode, 401);
  });

  // ── assertTenantMember — REGRESSÃO do gate de isolamento por tenant ───────
  await check('assertTenantMember: sem req.user → 401, retorna false, NUNCA chama sbFetch', async () => {
    let sbFetchChamado = false;
    const assertTenantMember = makeAssertTenantMember(async () => { sbFetchChamado = true; return []; });
    const req = {};
    const res = fakeRes();
    const ok = await assertTenantMember(req, res, 'tenant-1');
    assert.strictEqual(ok, false);
    assert.strictEqual(res.statusCode, 401);
    assert.strictEqual(sbFetchChamado, false);
  });
  await check('assertTenantMember: usuário NÃO é membro do tenant → 403, retorna false (REGRESSÃO se o gate sumir)', async () => {
    let queryRecebida = null;
    const assertTenantMember = makeAssertTenantMember(async (path) => { queryRecebida = path; return []; });
    const req = { user: { id: 'user-de-outro-tenant' } };
    const res = fakeRes();
    const ok = await assertTenantMember(req, res, 'tenant-alvo');
    assert.strictEqual(ok, false);
    assert.strictEqual(res.statusCode, 403);
    assert.match(queryRecebida, /tenant_id=eq\.tenant-alvo/);
    assert.match(queryRecebida, /user_id=eq\.user-de-outro-tenant/);
  });
  await check('assertTenantMember: usuário É membro do tenant → true, sem resposta de erro', async () => {
    const assertTenantMember = makeAssertTenantMember(async () => [{ tenant_id: 'tenant-alvo' }]);
    const req = { user: { id: 'user-1' } };
    const res = fakeRes();
    const ok = await assertTenantMember(req, res, 'tenant-alvo');
    assert.strictEqual(ok, true);
    assert.strictEqual(res.statusCode, null);
  });

  process.stdout.write(`\nauth-middleware: ${passed} cenários passaram.\n`);
})();
