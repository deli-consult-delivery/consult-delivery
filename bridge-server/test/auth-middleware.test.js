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
    const calls = [];
    const assertTenantMember = makeAssertTenantMember(async (path) => { calls.push(path); return []; });
    const req = { user: { id: 'user-de-outro-tenant' } };
    const res = fakeRes();
    const ok = await assertTenantMember(req, res, 'tenant-alvo');
    assert.strictEqual(ok, false);
    assert.strictEqual(res.statusCode, 403);
    // 1ª chamada = checagem de membership direta no tenant solicitado
    assert.ok(calls.length >= 1, 'deve chamar sbFetch ao menos uma vez');
    assert.match(calls[0], /tenant_id=eq\.tenant-alvo/);
    assert.match(calls[0], /user_id=eq\.user-de-outro-tenant/);
  });
  await check('assertTenantMember: usuário É membro do tenant → true, sem resposta de erro', async () => {
    const assertTenantMember = makeAssertTenantMember(async () => [{ tenant_id: 'tenant-alvo' }]);
    const req = { user: { id: 'user-1' } };
    const res = fakeRes();
    const ok = await assertTenantMember(req, res, 'tenant-alvo');
    assert.strictEqual(ok, true);
    assert.strictEqual(res.statusCode, null);
  });

  // ── assertTenantMember — MEMBERSHIP HIERÁRQUICA (parent_tenant_id) ────────
  // Regressão do bug do card Notas iFood 403: usuário-agência membro só do
  // tenant-pai deve acessar rotas gated de um store filho (cd-homolog/cd-demo).
  // Cenário: membership direta vazia → sobe parent_tenant_id → acha no ancestral.
  await check('assertTenantMember: usuário membro do ANCESTRAL (parent) → true (membership hierárquica)', async () => {
    const calls = [];
    const sbStub = async (path) => {
      calls.push(path);
      // 1ª chamada: membership direta no filho → vazia
      if (/tenant_members\?tenant_id=eq\.tenant-filho/.test(path)) return [];
      // 2ª chamada: busca parent_tenant_id do filho → retorna o pai
      if (/tenants\?id=eq\.tenant-filho/.test(path)) return [{ parent_tenant_id: 'tenant-pai' }];
      // 3ª chamada: membership no ancestral (pai) → ACHA
      if (/tenant_members\?tenant_id=eq\.tenant-pai/.test(path)) return [{ tenant_id: 'tenant-pai' }];
      return [];
    };
    const assertTenantMember = makeAssertTenantMember(sbStub);
    const req = { user: { id: 'user-agencia' } };
    const res = fakeRes();
    const ok = await assertTenantMember(req, res, 'tenant-filho');
    assert.strictEqual(ok, true);
    assert.strictEqual(res.statusCode, null);
    // sanity: subiu a árvove (chamou tenants? e o membership do pai)
    assert.ok(calls.some(c => /tenants\?id=eq\.tenant-filho/.test(c)), 'deve buscar parent_tenant_id do filho');
    assert.ok(calls.some(c => /tenant_members\?tenant_id=eq\.tenant-pai/.test(c)), 'deve checar membership no ancestral');
  });

  await check('assertTenantMember: usuário NÃO é membro direto nem de ancestral → 403 (fail-closed hierárquico)', async () => {
    const sbStub = async (path) => {
      // membership direta e ancestral sempre vazias
      if (/tenant_members\?/.test(path)) return [];
      // árvore: filho → pai → null (raiz)
      if (/tenants\?id=eq\.tenant-filho/.test(path)) return [{ parent_tenant_id: 'tenant-pai' }];
      if (/tenants\?id=eq\.tenant-pai/.test(path)) return [{ parent_tenant_id: null }];
      return [];
    };
    const assertTenantMember = makeAssertTenantMember(sbStub);
    const req = { user: { id: 'user-estranho' } };
    const res = fakeRes();
    const ok = await assertTenantMember(req, res, 'tenant-filho');
    assert.strictEqual(ok, false);
    assert.strictEqual(res.statusCode, 403);
  });

  await check('assertTenantMember: erro ao subir árvove (sbFetch reject no tenants?) → 403, NUNCA abre (fail-closed)', async () => {
    const sbStub = async (path) => {
      if (/tenant_members\?tenant_id=eq\.tenant-filho/.test(path)) return []; // sem membership direta
      if (/tenants\?id=eq\.tenant-filho/.test(path)) throw new Error('Supabase 500');
      return [];
    };
    const assertTenantMember = makeAssertTenantMember(sbStub);
    const req = { user: { id: 'user-1' } };
    const res = fakeRes();
    const ok = await assertTenantMember(req, res, 'tenant-filho');
    assert.strictEqual(ok, false);
    assert.strictEqual(res.statusCode, 403);
  });

  await check('assertTenantMember: ciclo de parent (A→B→A) → para sem 403 (proteção anti-loop)', async () => {
    const sbStub = async (path) => {
      if (/tenant_members\?/.test(path)) return []; // nunca é membro
      // ciclo: a→b, b→a
      if (/tenants\?id=eq\.a/.test(path)) return [{ parent_tenant_id: 'b' }];
      if (/tenants\?id=eq\.b/.test(path)) return [{ parent_tenant_id: 'a' }];
      return [];
    };
    const assertTenantMember = makeAssertTenantMember(sbStub);
    const req = { user: { id: 'user-1' } };
    const res = fakeRes();
    const ok = await assertTenantMember(req, res, 'a');
    assert.strictEqual(ok, false);
    assert.strictEqual(res.statusCode, 403);
  });

  process.stdout.write(`\nauth-middleware: ${passed} cenários passaram.\n`);
})();
