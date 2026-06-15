// proposals.test.js — ciclo de vida da proposta com um sb falso (sem rede).
'use strict';

const assert = require('node:assert');
const { makeProposals } = require('../src/proposals');

let failures = 0;
function check(label, fn) {
  try { fn(); process.stdout.write(`  ok  ${label}\n`); }
  catch (e) { failures++; process.stdout.write(`  FAIL ${label}: ${e.message}\n`); }
}

// sb falso: guarda 1 linha e simula a transição atômica do PostgREST.
function fakeSb(initialRow) {
  let row = initialRow ? { ...initialRow } : null;
  return {
    inserted: null,
    async sbInsert(table, r) { this.inserted = { table, r }; row = { id: 'p-new', ...r }; return row; },
    async sbSelectOne(table, filters) {
      if (!row) return null;
      return Object.entries(filters).every(([k, v]) => String(row[k]) === String(v)) ? { ...row } : null;
    },
    async sbUpdate(table, filters, patch) {
      // transição atômica: só aplica se TODOS os filtros baterem
      if (!row) return null;
      const match = Object.entries(filters).every(([k, v]) => String(row[k]) === String(v));
      if (!match) return null;
      row = { ...row, ...patch };
      return { ...row };
    },
  };
}

const cfg = { auditTenantId: 'tenant-cd', principal: 'ceo_agent' };

(async () => {
  // create
  {
    const sb = fakeSb(null);
    const p = makeProposals({ sb, cfg });
    const out = await p.create({ tipo: 'oportunidade', endpoint: '/oportunidade', payload: { a: 1 }, resumo: 'Criar X' });
    check('create devolve proposal_id + resumo', () => {
      assert.ok(out.proposal_id, 'proposal_id');
      assert.strictEqual(out.resumo, 'Criar X');
    });
    check('create grava status pending + tenant + token', () => {
      assert.strictEqual(sb.inserted.r.status, 'pending');
      assert.strictEqual(sb.inserted.r.tenant_id, 'tenant-cd');
      assert.ok(sb.inserted.r.token, 'token gerado');
      assert.strictEqual(sb.inserted.r.created_by, 'ceo_agent');
    });
  }

  // classify: não encontrada
  {
    const p = makeProposals({ sb: fakeSb(null), cfg });
    const c = await p.classify('nope');
    check('classify inexistente => not_found', () => assert.strictEqual(c.state, 'not_found'));
  }

  // classify: expirada
  {
    const past = new Date(Date.now() - 60_000).toISOString();
    const sb = fakeSb({ id: 'p1', status: 'pending', expires_at: past, endpoint: '/x', payload: {}, tipo: 'estoque' });
    const c = await makeProposals({ sb, cfg }).classify('p1');
    check('classify expirada => expired', () => assert.strictEqual(c.state, 'expired'));
  }

  // classify: já executada
  {
    const future = new Date(Date.now() + 60_000).toISOString();
    const sb = fakeSb({ id: 'p1', status: 'executed', expires_at: future });
    const c = await makeProposals({ sb, cfg }).classify('p1');
    check('classify executed => already', () => assert.strictEqual(c.state, 'already'));
  }

  // claim atômico: pending => confirmed
  {
    const future = new Date(Date.now() + 60_000).toISOString();
    const sb = fakeSb({ id: 'p1', status: 'pending', expires_at: future, endpoint: '/oportunidade', payload: { a: 1 } });
    const p = makeProposals({ sb, cfg });
    const claimed = await p.claim('p1');
    check('claim devolve a proposta com endpoint/payload', () => {
      assert.strictEqual(claimed.endpoint, '/oportunidade');
      assert.deepStrictEqual(claimed.payload, { a: 1 });
    });
    const again = await p.claim('p1'); // segunda tentativa: já confirmed
    check('claim é uso único (2ª vez => null)', () => assert.strictEqual(again, null));
  }

  if (failures > 0) { process.stdout.write(`\n${failures} falha(s).\n`); process.exit(1); }
  process.stdout.write('\nTodas as asserções passaram.\n');
})();
