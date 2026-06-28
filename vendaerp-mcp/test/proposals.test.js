// proposals.test.js — ciclo de vida da proposta com um sb falso (sem rede).
'use strict';

const assert = require('node:assert');
const { makeProposals, hashCode } = require('../src/proposals');

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

const cfg = { auditTenantId: 'tenant-cd', principal: 'ceo_agent', bridgeUrl: 'http://127.0.0.1:1', internalToken: 't' };

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

  // claim atômico condicionado ao CÓDIGO out-of-band: pending + código certo => confirmed
  {
    const future = new Date(Date.now() + 60_000).toISOString();
    const sb = fakeSb({ id: 'p1', status: 'pending', expires_at: future, endpoint: '/oportunidade',
      payload: { a: 1 }, confirm_code_hash: hashCode('ABC234'), confirm_attempts: 0 });
    const p = makeProposals({ sb, cfg });
    const errado = await p.claim('p1', 'WRONG9');
    check('claim com código ERRADO => null (não confirma)', () => assert.strictEqual(errado, null));
    const claimed = await p.claim('p1', 'abc234'); // case-insensitive
    check('claim com código certo devolve a proposta', () => {
      assert.ok(claimed, 'devolveu a linha');
      assert.strictEqual(claimed.endpoint, '/oportunidade');
    });
    const again = await p.claim('p1', 'ABC234'); // já confirmed
    check('claim é uso único (2ª vez => null)', () => assert.strictEqual(again, null));
  }

  // create gera + guarda o hash do código (e NÃO devolve o código ao agente)
  {
    const sb = fakeSb(null);
    const p = makeProposals({ sb, cfg });
    const out = await p.create({ tipo: 'boleto', endpoint: '/boleto', payload: {}, resumo: 'X' });
    check('create guarda confirm_code_hash e não vaza o código', () => {
      assert.ok(sb.inserted.r.confirm_code_hash, 'hash gravado');
      assert.strictEqual(out.confirm_code, undefined, 'código não retornado ao agente');
    });
  }

  // bumpAttempts incrementa o contador
  {
    const sb = fakeSb({ id: 'p1', status: 'pending', confirm_attempts: 2 });
    const p = makeProposals({ sb, cfg });
    const r = await p.bumpAttempts('p1', 2);
    check('bumpAttempts incrementa (2 => 3)', () => assert.strictEqual(r.confirm_attempts, 3));
  }

  // markExecuted só transiciona o vencedor do claim (status=confirmed)
  {
    const sb = fakeSb({ id: 'p1', status: 'confirmed', endpoint: '/x', payload: {} });
    const p = makeProposals({ sb, cfg });
    const r = await p.markExecuted('p1', { Codigo: 1 });
    check('markExecuted transiciona quando confirmed', () => {
      assert.ok(r, 'devolveu a linha');
      assert.strictEqual(r.status, 'executed');
    });
  }
  {
    const sb = fakeSb({ id: 'p1', status: 'pending', endpoint: '/x', payload: {} });
    const p = makeProposals({ sb, cfg });
    const r = await p.markExecuted('p1', { Codigo: 1 });
    check('markExecuted NÃO sobrescreve pending (=> null)', () => assert.strictEqual(r, null));
  }
  {
    const sb = fakeSb({ id: 'p1', status: 'executed', endpoint: '/x', payload: {} });
    const p = makeProposals({ sb, cfg });
    const r = await p.markExecuted('p1', { Codigo: 2 });
    check('markExecuted NÃO sobrescreve já executed (=> null)', () => assert.strictEqual(r, null));
  }

  // markFailed só transiciona o vencedor do claim (status=confirmed)
  {
    const sb = fakeSb({ id: 'p1', status: 'confirmed', endpoint: '/x', payload: {} });
    const p = makeProposals({ sb, cfg });
    const r = await p.markFailed('p1', 'ERP 500');
    check('markFailed transiciona quando confirmed', () => {
      assert.ok(r, 'devolveu a linha');
      assert.strictEqual(r.status, 'failed');
    });
  }
  {
    const sb = fakeSb({ id: 'p1', status: 'pending', endpoint: '/x', payload: {} });
    const p = makeProposals({ sb, cfg });
    const r = await p.markFailed('p1', 'ERP 500');
    check('markFailed NÃO sobrescreve pending (=> null)', () => assert.strictEqual(r, null));
  }

  // markExpired só transiciona pending (mantém o filtro existente)
  {
    const sb = fakeSb({ id: 'p1', status: 'confirmed', endpoint: '/x', payload: {} });
    const p = makeProposals({ sb, cfg });
    const r = await p.markExpired('p1');
    check('markExpired NÃO sobrescreve confirmed (=> null)', () => assert.strictEqual(r, null));
  }

  if (failures > 0) { process.stdout.write(`\n${failures} falha(s).\n`); process.exit(1); }
  process.stdout.write('\nTodas as asserções passaram.\n');
})();
