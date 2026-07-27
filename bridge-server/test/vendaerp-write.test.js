// vendaerp-write.test.js — a escrita do VendaERP NÃO pode retentar (POST não-idempotente).
// Substitui o global fetch por um stub que conta chamadas e sempre devolve 500.
'use strict';

const assert = require('node:assert');

// credencial fake p/ passar no getVendaErpConfig
process.env.VENDAERP_TOKEN = 'tok';
process.env.VENDAERP_USER = 'usr';
process.env.VENDAERP_APP = 'app';

const erp = require('../lib/vendaerp');

let failures = 0;
function check(label, fn) {
  try { fn(); process.stdout.write(`  ok  ${label}\n`); }
  catch (e) { failures++; process.stdout.write(`  FAIL ${label}: ${e.message}\n`); }
}

const realFetch = global.fetch;

(async () => {
  // 500 sempre — uma função read-only retentaria 3x; a de escrita deve falhar em 1.
  let calls = 0;
  let lastUrl = null;
  let lastOpts = null;
  global.fetch = async (url, opts) => {
    calls++;
    lastUrl = url;
    lastOpts = opts;
    return { ok: false, status: 500, statusText: 'Server Error', text: async () => '{"erro":"x"}' };
  };

  try {
    await erp.criarOportunidade({ titulo: 'X' });
    check('criarOportunidade deveria lançar em 500', () => assert.fail('não lançou'));
  } catch (e) {
    check('criarOportunidade lança VendaErpApiError', () => assert.strictEqual(e.name, 'VendaErpApiError'));
    check('criarOportunidade NÃO retenta (1 chamada só)', () => assert.strictEqual(calls, 1));
  }

  // Cada função de escrita deve falhar em 1 tentativa (POST não-idempotente).
  for (const [nome, fn, payload] of [
    ['criarLancamento', () => erp.criarLancamento({ valor: 10 }), null],
    ['gerarBoleto', () => erp.gerarBoleto({ lancamento: 'L1' }), null],
    ['emitirNfe', () => erp.emitirNfe({ CodigoVenda: 42 }), null],
    ['ajustarEstoque', () => erp.ajustarEstoque({ produto: 'P1' }), null],
    ['salvarEFaturarPedido', () => erp.salvarEFaturarPedido({ codigoPedidoCliente: 'CW-1' }), null],
    ['atualizarPedido', () => erp.atualizarPedido({ Codigo: 1, Status: 'Pronto' }), null],
    ['excluirPedido', () => erp.excluirPedido(1), null],
    ['salvarPessoa', () => erp.salvarPessoa({ cnpJ_CPF: '00000000000' }), null],
  ]) {
    calls = 0;
    try {
      await fn();
      check(`${nome} deveria lançar em 500`, () => assert.fail('não lançou'));
    } catch (e) {
      check(`${nome} lança VendaErpApiError`, () => assert.strictEqual(e.name, 'VendaErpApiError'));
      check(`${nome} NÃO retenta (1 chamada só)`, () => assert.strictEqual(calls, 1));
    }
  }

  // NFE: CodigoVenda vai na QUERY string, não no body.
  calls = 0;
  try { await erp.emitirNfe({ CodigoVenda: 4321 }); } catch { /* 500 esperado */ }
  check('emitirNfe põe CodigoVenda na query string', () => assert.match(String(lastUrl), /CodigoVenda=4321/));
  check('emitirNfe NÃO manda CodigoVenda no body', () => assert.ok(!lastOpts || lastOpts.body == null));

  global.fetch = async (url, opts) => {
    calls++;
    lastUrl = url;
    lastOpts = opts;
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => JSON.stringify({
        Pedido: {
          Codigo: 1,
          CodigoPedidoCliente: 'CW-1',
          Finalizado: true,
          Lancado: true,
        },
      }),
    };
  };
  await erp.atualizarPedido({
    Codigo: 1,
    Status: 'Pronto',
    Finalizado: true,
    Lancado: true,
  });
  check('atualizarPedido mantém o faturamento pela rota correta', () => {
    assert.match(String(lastUrl), /\/Pedidos\/SalvarEFaturar\?retornarPedido=true$/);
    assert.strictEqual(lastOpts.method, 'PUT');
    assert.strictEqual(JSON.parse(lastOpts.body).Finalizado, true);
    assert.strictEqual(JSON.parse(lastOpts.body).Lancado, true);
  });

  calls = 0;
  global.fetch = async () => {
    calls++;
    return {
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
      text: async () => '{"erro":"limite"}',
    };
  };
  await assert.rejects(
    erp.atualizarPedido({
      Codigo: 1,
      Status: 'Pronto',
      Finalizado: true,
      Lancado: true,
    }),
    (error) => error.name === 'VendaErpApiError' && error.status === 429
  );
  check('atualizarPedido não retenta 429 dentro da mesma chamada', () => {
    assert.strictEqual(calls, 1);
  });

  // Defesa em profundidade: emitirNfe sem CodigoVenda falha fechada SEM tocar o ERP.
  calls = 0;
  try {
    await erp.emitirNfe({});
    check('emitirNfe sem CodigoVenda deveria lançar', () => assert.fail('não lançou'));
  } catch (e) {
    check('emitirNfe sem CodigoVenda lança VendaErpApiError', () => assert.strictEqual(e.name, 'VendaErpApiError'));
    check('emitirNfe sem CodigoVenda NÃO toca o ERP (0 chamadas)', () => assert.strictEqual(calls, 0));
  }

  global.fetch = async () => ({
    ok: true,
    status: 200,
    statusText: 'OK',
    text: async () => JSON.stringify({ erro: 'pedido não atualizado' }),
  });
  try {
    await erp.atualizarPedido({ Codigo: 1, Status: 'Pronto' });
    check('atualizarPedido deveria rejeitar objeto sem prova de sucesso', () => assert.fail('não lançou'));
  } catch (e) {
    check('atualizarPedido rejeita objeto HTTP 200 sem prova de sucesso', () => {
      assert.strictEqual(e.name, 'VendaErpApiError');
    });
  }

  try {
    await erp.salvarPessoa({ cnpJ_CPF: '00000000000' });
    check('salvarPessoa deveria rejeitar objeto sem prova de sucesso', () => assert.fail('não lançou'));
  } catch (e) {
    check('salvarPessoa rejeita objeto HTTP 200 sem prova de sucesso', () => {
      assert.strictEqual(e.name, 'VendaErpApiError');
    });
  }

  global.fetch = realFetch;
  if (failures > 0) { process.stdout.write(`\n${failures} falha(s).\n`); process.exit(1); }
  process.stdout.write('\nTodas as asserções passaram.\n');
})();
