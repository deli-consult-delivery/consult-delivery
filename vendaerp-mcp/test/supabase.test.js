// supabase.test.js — valida a construção de URL/método de sbSelectOne e sbUpdate
// sem rede: troca o global fetch por um stub que captura a chamada.
'use strict';

const assert = require('node:assert');
const { makeSupabase } = require('../src/supabase');

let failures = 0;
function check(label, fn) {
  try { fn(); process.stdout.write(`  ok  ${label}\n`); }
  catch (e) { failures++; process.stdout.write(`  FAIL ${label}: ${e.message}\n`); }
}

const realFetch = global.fetch;
function withFetchStub(responseBody, status, run) {
  const calls = [];
  global.fetch = async (url, opts) => {
    calls.push({ url, opts });
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => responseBody,
    };
  };
  return run(calls).finally(() => { global.fetch = realFetch; });
}

const sb = makeSupabase({ supabaseUrl: 'https://x.supabase.co', supabaseServiceKey: 'svc' });

(async () => {
  await withFetchStub([{ id: 'p1', status: 'pending' }], 200, async (calls) => {
    const row = await sb.sbSelectOne('vendaerp_proposals', { id: 'p1' });
    check('sbSelectOne devolve a 1ª linha', () => assert.strictEqual(row.id, 'p1'));
    check('sbSelectOne monta select+eq+limit', () => {
      const u = calls[0].url;
      assert.ok(u.includes('/rest/v1/vendaerp_proposals'), 'tabela');
      assert.ok(u.includes('id=eq.p1'), 'filtro eq');
      assert.ok(u.includes('limit=1'), 'limit=1');
    });
  });

  await withFetchStub([{ id: 'p1', status: 'confirmed' }], 200, async (calls) => {
    const row = await sb.sbUpdate('vendaerp_proposals', { id: 'p1', status: 'pending' }, { status: 'confirmed' });
    check('sbUpdate devolve a linha atualizada', () => assert.strictEqual(row.status, 'confirmed'));
    check('sbUpdate usa PATCH com filtros eq', () => {
      assert.strictEqual(calls[0].opts.method, 'PATCH');
      assert.ok(calls[0].url.includes('id=eq.p1'), 'filtro id');
      assert.ok(calls[0].url.includes('status=eq.pending'), 'filtro status');
    });
  });

  await withFetchStub([], 200, async () => {
    const row = await sb.sbUpdate('vendaerp_proposals', { id: 'x', status: 'pending' }, { status: 'confirmed' });
    check('sbUpdate sem linha afetada devolve null', () => assert.strictEqual(row, null));
  });

  if (failures > 0) { process.stdout.write(`\n${failures} falha(s).\n`); process.exit(1); }
  process.stdout.write('\nTodas as asserções passaram.\n');
})();
