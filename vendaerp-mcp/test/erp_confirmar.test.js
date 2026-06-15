// erp_confirmar.test.js — recusa propostas inválidas; executa só a pending válida.
'use strict';

const assert = require('node:assert');
const tool = require('../src/tools/erp_confirmar');

let failures = 0;
function check(label, fn) {
  try { fn(); process.stdout.write(`  ok  ${label}\n`); }
  catch (e) { failures++; process.stdout.write(`  FAIL ${label}: ${e.message}\n`); }
}

const cfg = { auditTenantId: 'tenant-cd', principal: 'ceo_agent' };

// proposals falso parametrizável por estado.
// markResult: o que markExecuted/markFailed/markExpired devolvem (linha ou null).
function fakeProposals({ classifyState, claimResult, markResult = { id: 'p1' } }) {
  return {
    log: [],
    async classify() { return { state: classifyState, row: { id: 'p1', resumo: 'Criar X' } }; },
    async claim() { return claimResult; },
    async markExecuted(id, r) { this.log.push(['executed', id, r]); return markResult; },
    async markFailed(id, e) { this.log.push(['failed', id, e]); return markResult; },
    async markExpired(id) { this.log.push(['expired', id]); return markResult; },
  };
}

// captura process.stderr.write durante fn; devolve o texto acumulado.
async function captureStderr(fn) {
  const orig = process.stderr.write.bind(process.stderr);
  let buf = '';
  process.stderr.write = (chunk) => { buf += String(chunk); return true; };
  try { await fn(); } finally { process.stderr.write = orig; }
  return buf;
}

(async () => {
  // not_found
  {
    const proposals = fakeProposals({ classifyState: 'not_found' });
    const erp = { post: async () => { throw new Error('NÃO DEVIA CHAMAR'); } };
    const res = await tool.handler({ proposal_id: 'x' }, { erp, cfg, proposals });
    check('not_found não executa', () => assert.match(res.summary, /não encontrei|não existe/i));
    check('not_found ainda vincula tenantIds à auditoria', () => assert.deepStrictEqual(res.tenantIds, ['tenant-cd']));
  }

  // expired
  {
    const proposals = fakeProposals({ classifyState: 'expired' });
    const erp = { post: async () => { throw new Error('NÃO DEVIA CHAMAR'); } };
    const res = await tool.handler({ proposal_id: 'p1' }, { erp, cfg, proposals });
    check('expirada marca expired e não executa', () => {
      assert.ok(proposals.log.some((l) => l[0] === 'expired'));
      assert.match(res.summary, /expir/i);
    });
  }

  // already executed
  {
    const proposals = fakeProposals({ classifyState: 'already' });
    const erp = { post: async () => { throw new Error('NÃO DEVIA CHAMAR'); } };
    const res = await tool.handler({ proposal_id: 'p1' }, { erp, cfg, proposals });
    check('já processada não re-executa', () => assert.match(res.summary, /já/i));
  }

  // pending, claim perdido (corrida) => não executa
  {
    const proposals = fakeProposals({ classifyState: 'pending', claimResult: null });
    const erp = { post: async () => { throw new Error('NÃO DEVIA CHAMAR'); } };
    const res = await tool.handler({ proposal_id: 'p1' }, { erp, cfg, proposals });
    check('claim perdido não executa', () => assert.match(res.summary, /já|process/i));
  }

  // pending, claim ok => executa e marca executed
  {
    const proposals = fakeProposals({
      classifyState: 'pending',
      claimResult: { id: 'p1', endpoint: '/oportunidade', payload: { a: 1 }, resumo: 'Criar X' },
    });
    let posted = null;
    const erp = { post: async (path, body) => { posted = { path, body }; return { Codigo: 99 }; } };
    const res = await tool.handler({ proposal_id: 'p1' }, { erp, cfg, proposals });
    check('executa o endpoint guardado com o payload', () => {
      assert.strictEqual(posted.path, '/oportunidade');
      assert.deepStrictEqual(posted.body, { a: 1 });
    });
    check('marca executed com o resultado', () => {
      const ev = proposals.log.find((l) => l[0] === 'executed');
      assert.ok(ev, 'executed registrado');
      assert.deepStrictEqual(ev[2], { Codigo: 99 });
    });
    check('summary confirma sucesso', () => assert.match(res.summary, /confirmad|grav|sucesso|✅/i));
    check('sucesso vincula tenantIds à auditoria de escrita', () => assert.deepStrictEqual(res.tenantIds, ['tenant-cd']));
  }

  // pending, claim ok mas Bridge falha => marca failed, não estoura
  {
    const proposals = fakeProposals({
      classifyState: 'pending',
      claimResult: { id: 'p1', endpoint: '/oportunidade', payload: { a: 1 }, resumo: 'Criar X' },
    });
    const erp = { post: async () => { const e = new Error('ERP 500'); e.status = 500; throw e; } };
    const res = await tool.handler({ proposal_id: 'p1' }, { erp, cfg, proposals });
    check('falha do Bridge marca failed', () => assert.ok(proposals.log.some((l) => l[0] === 'failed')));
    check('summary avisa para verificar no ERP', () => assert.match(res.summary, /verifi|não confirm|falh/i));
  }

  // marcação executed que afeta 0 linhas (null) => aviso em stderr, sem lançar
  {
    const proposals = fakeProposals({
      classifyState: 'pending',
      claimResult: { id: 'p1', endpoint: '/oportunidade', payload: { a: 1 }, resumo: 'Criar X' },
      markResult: null,
    });
    const erp = { post: async () => ({ Codigo: 99 }) };
    let res;
    const err = await captureStderr(async () => {
      res = await tool.handler({ proposal_id: 'p1' }, { erp, cfg, proposals });
    });
    check('markExecuted null avisa em stderr (não lança)', () => {
      assert.match(err, /anomalia.*markExecuted/i);
      assert.match(res.summary, /confirmad|grav|sucesso|✅/i);
    });
  }

  // marcação failed que afeta 0 linhas (null) => aviso em stderr, sem lançar
  {
    const proposals = fakeProposals({
      classifyState: 'pending',
      claimResult: { id: 'p1', endpoint: '/oportunidade', payload: { a: 1 }, resumo: 'Criar X' },
      markResult: null,
    });
    const erp = { post: async () => { throw new Error('ERP 500'); } };
    let res;
    const err = await captureStderr(async () => {
      res = await tool.handler({ proposal_id: 'p1' }, { erp, cfg, proposals });
    });
    check('markFailed null avisa em stderr (não lança)', () => {
      assert.match(err, /anomalia.*markFailed/i);
      assert.match(res.summary, /verifi|não confirm|falh/i);
    });
  }

  // marcação expired que afeta 0 linhas (null) => aviso em stderr, sem lançar
  {
    const proposals = fakeProposals({ classifyState: 'expired', markResult: null });
    const erp = { post: async () => { throw new Error('NÃO DEVIA CHAMAR'); } };
    let res;
    const err = await captureStderr(async () => {
      res = await tool.handler({ proposal_id: 'p1' }, { erp, cfg, proposals });
    });
    check('markExpired null avisa em stderr (não lança)', () => {
      assert.match(err, /anomalia.*markExpired/i);
      assert.match(res.summary, /expir/i);
    });
  }

  if (failures > 0) { process.stdout.write(`\n${failures} falha(s).\n`); process.exit(1); }
  process.stdout.write('\nTodas as asserções passaram.\n');
})();
