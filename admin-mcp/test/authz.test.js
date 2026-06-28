// authz.test.js — guard de autorização por tenant (sem rede, sb falso).
'use strict';

const assert = require('node:assert');
const { assertTenantExists, assertLojaInTenant } = require('../src/authz');
const tool = require('../src/tools/cd_propor_draft');

let failures = 0;
async function check(label, fn) {
  try { await fn(); process.stdout.write(`  ok  ${label}\n`); }
  catch (e) { failures++; process.stdout.write(`  FAIL ${label}: ${e.message}\n`); }
}

// sb falso: `rows[table]` decide o que cada sbGet devolve (por substring da qs).
function fakeSb(map) {
  return {
    inserted: null,
    async sbGet(table) { return map[table] ?? []; },
    async sbInsert(table, row) { this.inserted = { table, row }; return { id: 'd1', ...row }; },
  };
}

const cfg = { principal: 'ceo_agent' };
const T = '9079bd4d-4df7-4023-90fb-d79c8ba7e900';
const L = '8434cea4-b9c8-41ea-b366-57e8398aad0b';

(async () => {
  await check('assertTenantExists passa quando existe', async () => {
    await assertTenantExists(fakeSb({ tenants: [{ id: T }] }), T);
  });
  await check('assertTenantExists recusa tenant inexistente', async () => {
    await assert.rejects(() => assertTenantExists(fakeSb({ tenants: [] }), T), /não existe/);
  });
  await check('assertLojaInTenant passa quando loja é do tenant', async () => {
    await assertLojaInTenant(fakeSb({ lojas: [{ id: L }] }), L, T);
  });
  await check('assertLojaInTenant recusa loja de outro tenant', async () => {
    await assert.rejects(() => assertLojaInTenant(fakeSb({ lojas: [] }), L, T), /não pertence/);
  });

  // tool: tenant inexistente → não insere
  await check('cd_propor_draft recusa tenant inexistente (não insere)', async () => {
    const sb = fakeSb({ tenants: [] });
    await assert.rejects(
      () => tool.handler({ tenant_id: T, channel: 'painel', content: 'oi' }, { sb, cfg }),
      /não existe/
    );
    assert.strictEqual(sb.inserted, null, 'não deve ter inserido');
  });

  // tool: tenant ok, sem loja → insere pending
  await check('cd_propor_draft insere pending quando tenant existe', async () => {
    const sb = fakeSb({ tenants: [{ id: T }] });
    const res = await tool.handler({ tenant_id: T, channel: 'painel', content: 'oi' }, { sb, cfg });
    assert.strictEqual(sb.inserted.row.status, 'pending');
    assert.match(res.summary, /pendente/);
  });

  // tool: loja de outro tenant → não insere
  await check('cd_propor_draft recusa loja cross-tenant (não insere)', async () => {
    const sb = fakeSb({ tenants: [{ id: T }], lojas: [] });
    await assert.rejects(
      () => tool.handler({ tenant_id: T, channel: 'painel', content: 'oi', loja_id: L }, { sb, cfg }),
      /não pertence/
    );
    assert.strictEqual(sb.inserted, null);
  });

  if (failures > 0) { process.stdout.write(`\n${failures} falha(s).\n`); process.exit(1); }
  process.stdout.write('\nTodas as asserções passaram.\n');
})();
