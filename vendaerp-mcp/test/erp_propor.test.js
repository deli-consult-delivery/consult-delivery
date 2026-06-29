// erp_propor.test.js — a tool de proposta grava pending e NÃO executa.
'use strict';

const assert = require('node:assert');
const tool = require('../src/tools/erp_propor_oportunidade');

let failures = 0;
function check(label, fn) {
  try { fn(); process.stdout.write(`  ok  ${label}\n`); }
  catch (e) { failures++; process.stdout.write(`  FAIL ${label}: ${e.message}\n`); }
}

// proposals falso que captura o create.
function fakeProposals() {
  return {
    created: null,
    async create(p) { this.created = p; return { proposal_id: 'p-1', resumo: p.resumo, expires_at: 'T+10' }; },
  };
}

const cfg = { auditTenantId: 'tenant-cd', principal: 'ceo_agent' };

(async () => {
  const proposals = fakeProposals();
  const erp = { post: async () => { throw new Error('PROPOR NÃO EXECUTA'); } };
  const res = await tool.handler({ titulo: 'Lead Padaria', cliente: 'Padaria X' }, { erp, cfg, proposals });

  check('devolve proposal_id', () => assert.strictEqual(res.data.proposal_id, 'p-1'));
  check('tenantIds vincula a chamada ao tenant da auditoria', () => assert.deepStrictEqual(res.tenantIds, ['tenant-cd']));
  check('NÃO executa (não chama erp.post)', () => assert.ok(res.data.proposal_id));
  check('grava tipo oportunidade + endpoint /oportunidade', () => {
    assert.strictEqual(proposals.created.tipo, 'oportunidade');
    assert.strictEqual(proposals.created.endpoint, '/oportunidade');
  });
  check('resumo é legível e cita o título', () => assert.match(proposals.created.resumo, /Lead Padaria/));
  check('payload mapeia titulo→Descricao (PascalCase do ERP)', () => assert.strictEqual(proposals.created.payload.Descricao, 'Lead Padaria'));

  check('inputShape exige titulo', () => {
    const z = require('zod');
    const shape = z.object(tool.inputShape);
    assert.throws(() => shape.parse({}), /titulo/i);
  });

  const z = require('zod');

  // --- lancamento ---
  {
    const t = require('../src/tools/erp_propor_lancamento');
    const p = fakeProposals();
    const res2 = await t.handler({ valor: 150, descricao: 'Mensalidade', cliente: 'Padaria X', vencimento: '2026-07-15' }, { erp, cfg, proposals: p });
    check('lancamento: devolve proposal_id', () => assert.strictEqual(res2.data.proposal_id, 'p-1'));
    check('lancamento: tipo+endpoint corretos', () => {
      assert.strictEqual(p.created.tipo, 'lancamento');
      assert.strictEqual(p.created.endpoint, '/lancamento');
    });
    check('lancamento: resumo legível cita o valor', () => assert.match(p.created.resumo, /150/));
    check('lancamento: payload PascalCase carrega Valor', () => assert.strictEqual(p.created.payload.Valor, 150));
    check('lancamento: payload PascalCase mapeia descricao→Descricao', () => assert.strictEqual(p.created.payload.Descricao, 'Mensalidade'));
    // Regressão do bug 417: o ERP .NET exigia DataVencimento (PascalCase), não dataVencimento.
    check('lancamento: payload PascalCase mapeia vencimento→DataVencimento', () => assert.strictEqual(p.created.payload.DataVencimento, '2026-07-15'));
    check('lancamento: NÃO emite a chave camelCase dataVencimento', () => assert.strictEqual(p.created.payload.dataVencimento, undefined));
    check('lancamento: tenantIds=[auditTenantId]', () => assert.deepStrictEqual(res2.tenantIds, ['tenant-cd']));
    check('lancamento: inputShape exige valor', () => assert.throws(() => z.object(t.inputShape).parse({}), /valor/i));
  }

  // --- boleto ---
  {
    const t = require('../src/tools/erp_propor_boleto');
    const p = fakeProposals();
    const res2 = await t.handler({ lancamento: 99, cliente: 'Padaria X', valor: 150 }, { erp, cfg, proposals: p });
    check('boleto: devolve proposal_id', () => assert.strictEqual(res2.data.proposal_id, 'p-1'));
    check('boleto: tipo+endpoint corretos', () => {
      assert.strictEqual(p.created.tipo, 'boleto');
      assert.strictEqual(p.created.endpoint, '/boleto');
    });
    check('boleto: resumo legível cita o lançamento', () => assert.match(p.created.resumo, /99/));
    check('boleto: payload PascalCase mapeia lancamento→CodigoLancamento (Number)', () => assert.strictEqual(p.created.payload.CodigoLancamento, 99));
    check('boleto: payload PascalCase tem FormaPagamento padrão 0', () => assert.strictEqual(p.created.payload.FormaPagamento, 0));
    check('boleto: tenantIds=[auditTenantId]', () => assert.deepStrictEqual(res2.tenantIds, ['tenant-cd']));
    check('boleto: inputShape exige lancamento', () => assert.throws(() => z.object(t.inputShape).parse({}), /lancamento/i));
  }

  // --- nfe ---
  {
    const t = require('../src/tools/erp_propor_nfe');
    const p = fakeProposals();
    const res2 = await t.handler({ CodigoVenda: 4321 }, { erp, cfg, proposals: p });
    check('nfe: devolve proposal_id', () => assert.strictEqual(res2.data.proposal_id, 'p-1'));
    check('nfe: tipo+endpoint corretos', () => {
      assert.strictEqual(p.created.tipo, 'nfe');
      assert.strictEqual(p.created.endpoint, '/nfe');
    });
    check('nfe: resumo legível cita a venda', () => assert.match(p.created.resumo, /4321/));
    check('nfe: payload carrega CodigoVenda', () => assert.strictEqual(p.created.payload.CodigoVenda, 4321));
    check('nfe: tenantIds=[auditTenantId]', () => assert.deepStrictEqual(res2.tenantIds, ['tenant-cd']));
    check('nfe: inputShape exige CodigoVenda', () => assert.throws(() => z.object(t.inputShape).parse({}), /CodigoVenda/i));
  }

  // --- estoque ---
  {
    const t = require('../src/tools/erp_propor_estoque');
    const p = fakeProposals();
    const res2 = await t.handler({ produto: 'Coca 2L', deposito: 'Central', quantidade: -3 }, { erp, cfg, proposals: p });
    check('estoque: devolve proposal_id', () => assert.strictEqual(res2.data.proposal_id, 'p-1'));
    check('estoque: tipo+endpoint corretos', () => {
      assert.strictEqual(p.created.tipo, 'estoque');
      assert.strictEqual(p.created.endpoint, '/estoque-ajuste');
    });
    check('estoque: resumo legível cita o produto', () => assert.match(p.created.resumo, /Coca 2L/));
    check('estoque: payload PascalCase mapeia produto→ProdutoCodigo', () => assert.strictEqual(p.created.payload.ProdutoCodigo, 'Coca 2L'));
    check('estoque: payload PascalCase mapeia deposito→DepositoNome', () => assert.strictEqual(p.created.payload.DepositoNome, 'Central'));
    check('estoque: quantidade negativa vira saída (EhEntrada=false, qtd absoluta)', () => {
      assert.strictEqual(p.created.payload.EhEntrada, false);
      assert.strictEqual(p.created.payload.Quantidade, 3);
    });
    check('estoque: tenantIds=[auditTenantId]', () => assert.deepStrictEqual(res2.tenantIds, ['tenant-cd']));
    check('estoque: inputShape exige produto', () => assert.throws(() => z.object(t.inputShape).parse({}), /produto/i));
  }

  if (failures > 0) { process.stdout.write(`\n${failures} falha(s).\n`); process.exit(1); }
  process.stdout.write('\nTodas as asserções passaram.\n');
})();
