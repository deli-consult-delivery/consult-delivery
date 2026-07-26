'use strict';

const assert = require('node:assert');
const crypto = require('node:crypto');

process.env.CARDAPIO_WEB_CLIENT_ID = 'client-test';
process.env.CARDAPIO_WEB_TOKEN_ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64');
process.env.VENDAERP_TOKEN = 'tok';
process.env.VENDAERP_USER = 'usr';
process.env.VENDAERP_APP = 'app';
process.env.CARDAPIO_WEB_VENDA_WRITE_ENABLED = 'true';
process.env.CARDAPIO_WEB_BOOTSTRAP_TENANT_ID = '22222222-2222-4222-8222-222222222222';
process.env.CARDAPIO_WEB_BOOTSTRAP_MERCHANT_ID = '3268';
process.env.CARDAPIO_WEB_BOOTSTRAP_VENDA_EMPRESA = 'Empresa';

const cardapio = require('../lib/cardapio-web');
const vendaerp = require('../lib/vendaerp');
const {
  ReconciliationRequiredError,
  buildVendaPayload,
  createVendaOrder,
  ensureVendaCustomer,
  processEvent,
  shouldCreateOrder,
} = require('../services/cardapio-venda');

let failures = 0;
async function check(label, fn) {
  try {
    await fn();
    process.stdout.write(`  ok  ${label}\n`);
  } catch (err) {
    failures++;
    process.stdout.write(`  FAIL ${label}: ${err.message}\n`);
  }
}

function order(overrides = {}) {
  return {
    id: 237456,
    merchant_id: 3268,
    status: 'waiting_confirmation',
    order_type: 'delivery',
    sales_channel: 'ifood',
    fiscal_document: null,
    total: 35.9,
    created_at: '2026-07-23T12:00:00-03:00',
    customer: { name: 'Cliente' },
    items: [{
      item_id: 1,
      external_code: 'PROD-1',
      name: 'Produto',
      quantity: 2,
      unit_price: 10,
      total_price: 26,
      options: [{
        option_id: 2,
        external_code: 'COMP-1',
        name: 'Complemento',
        quantity: 1,
        unit_price: 3,
      }],
      items: [],
    }],
    delivery_fee: 5,
    service_fee: 2,
    additional_fee: 1,
    discounts: [],
    payments: [{ total: 35.9, payment_method: 'ifood', payment_fee: 1.9 }],
    ...overrides,
  };
}

const installation = {
  id: '11111111-1111-4111-8111-111111111111',
  tenant_id: '22222222-2222-4222-8222-222222222222',
  venda_empresa: 'Empresa',
  venda_deposito: 'PADRÃO',
  venda_cliente_generico: 'Consumidor Final',
  venda_plano_conta: 'VENDA DE MERCADORIAS',
  venda_forma_pagamento: 'À vista - Dinheiro',
  venda_payment_mapping: { ifood: 'Cobrança Manual' },
};

(async () => {
  await check('AES-GCM cifra e decifra token sem gravar texto puro', () => {
    const encrypted = cardapio.encryptSecret('segredo');
    assert.ok(!encrypted.includes('segredo'));
    assert.strictEqual(cardapio.decryptSecret(encrypted), 'segredo');
  });

  await check('PKCE usa verifier e challenge URL-safe', () => {
    const pkce = cardapio.createPkce();
    assert.match(pkce.verifier, /^[A-Za-z0-9_-]{43,128}$/);
    assert.strictEqual(
      pkce.challenge,
      crypto.createHash('sha256').update(pkce.verifier).digest('base64url')
    );
  });

  await check('webhook rejeita shape fora do contrato', () => {
    const invalid = cardapio.WebhookEventSchema.safeParse({
      event_id: '',
      event_type: 'OUTRO',
      merchant_id: 0,
    });
    assert.strictEqual(invalid.success, false);
  });

  await check('payload financeiro preserva total e usa Consumidor Final sem documento', () => {
    const payload = buildVendaPayload(order(), installation);
    assert.strictEqual(payload.codigoPedidoCliente, 'CW-3268-237456');
    assert.strictEqual(payload.cliente, 'Consumidor Final');
    assert.strictEqual(payload.valorFinal, 35.9);
    assert.strictEqual(payload.valorFrete, 5);
    assert.strictEqual(payload.outrasDespesas, 4.9);
    assert.strictEqual(payload.pagamentos[0].valorPagamento, 35.9);
    assert.strictEqual(payload.pagamentos[0].formaPagamento, 'Cobrança Manual');
    assert.deepStrictEqual(payload.items.map((item) => item.codigo), ['PROD-1', 'COMP-1']);
    assert.deepStrictEqual(payload.items.map((item) => item.quantidade), [2, 2]);
  });

  for (const channel of ['catalog', 'ifood', 'food99', 'keeta', 'aiqfome']) {
    await check(`canal ${channel} não é filtrado`, () => {
      assert.match(buildVendaPayload(order({ sales_channel: channel }), installation).descricao, new RegExp(channel));
    });
  }

  await check('produto sem código PDV falha antes de tocar o Venda ERP', () => {
    assert.throws(
      () => buildVendaPayload(order({ items: [{ item_id: 9, name: 'Sem código', quantity: 1, unit_price: 10 }] }), installation),
      /sem código PDV/
    );
  });

  await check('total divergente falha antes de tocar o Venda ERP', () => {
    assert.throws(
      () => buildVendaPayload(order({ total: 99 }), installation),
      /Total do pedido não fecha/
    );
  });

  await check('grupo/combo com subtotal mapeado divergente falha antes de qualquer write', async () => {
    let claims = 0;
    let personWrites = 0;
    let orderWrites = 0;
    const mismatch = order({
      total: 20,
      delivery_fee: 0,
      service_fee: 0,
      additional_fee: 0,
      discounts: [],
      payments: [{ total: 20, payment_method: 'ifood', payment_fee: 0 }],
      items: [{
        item_id: 10,
        name: 'Grupo combo',
        quantity: 1,
        total_price: 20,
        options: [],
        items: [{
          item_id: 11,
          external_code: 'COMBO-ITEM',
          name: 'Item do combo',
          quantity: 1,
          unit_price: 15,
          total_price: 15,
          options: [],
          items: [],
        }],
      }],
    });
    const erp = {
      pesquisarPedidos: async () => [],
      salvarPessoa: async () => { personWrites++; },
      salvarEFaturarPedido: async () => { orderWrites++; },
    };
    const db = async (_path, opts) => {
      if (opts?.method === 'PATCH') claims++;
      return [];
    };
    await assert.rejects(
      createVendaOrder(mismatch, installation, {
        id: 'corr',
        codigo_pedido_cliente: 'CW-3268-237456',
        write_started_at: null,
      }, db, erp),
      /Subtotal mapeado não fecha/
    );
    assert.strictEqual(claims, 0);
    assert.strictEqual(personWrites, 0);
    assert.strictEqual(orderWrites, 0);
  });

  await check('arredondamento monetário half-up transforma 10.075 em 10.08', () => {
    const payload = buildVendaPayload(order({
      total: 10.075,
      delivery_fee: 0,
      service_fee: 0,
      additional_fee: 0,
      discounts: [],
      payments: [{ total: 10.075, payment_method: 'ifood', payment_fee: 0 }],
      items: [{
        item_id: 12,
        external_code: 'ROUND-1',
        name: 'Arredondamento',
        quantity: 1,
        unit_price: 10.075,
        total_price: 10.075,
        options: [],
        items: [],
      }],
    }), installation);
    assert.strictEqual(payload.items[0].valorUnitario, 10.08);
    assert.strictEqual(payload.items[0].valorTotal, 10.08);
    assert.strictEqual(payload.valorFinal, 10.08);
    assert.strictEqual(payload.pagamentos[0].valorPagamento, 10.08);
  });

  await check('OrderSchema rejeita Infinity e NaN em monetários', () => {
    assert.strictEqual(cardapio.OrderSchema.safeParse(order({ total: Infinity })).success, false);
    assert.strictEqual(cardapio.OrderSchema.safeParse(order({ total: Number.NaN })).success, false);
    const withInfiniteItem = order();
    withInfiniteItem.items[0].unit_price = Infinity;
    assert.strictEqual(cardapio.OrderSchema.safeParse(withInfiniteItem).success, false);
  });

  await check('OrderSchema rejeita coerção de null e boolean em dinheiro e quantidade', () => {
    for (const invalid of [null, true, [], {}, '']) {
      const malformedMoney = order({ total: invalid });
      assert.strictEqual(cardapio.OrderSchema.safeParse(malformedMoney).success, false);

      const malformedQuantity = order();
      malformedQuantity.items[0].quantity = invalid;
      assert.strictEqual(cardapio.OrderSchema.safeParse(malformedQuantity).success, false);
    }

    const decimalStrings = order({ total: '16.00' });
    decimalStrings.items[0].unit_price = '16.00';
    decimalStrings.items[0].total_price = '16.00';
    decimalStrings.payments[0].total = '16.00';
    assert.strictEqual(cardapio.OrderSchema.safeParse(decimalStrings).success, true);
  });

  await check('desconto líquido sem campo seguro falha fechado', () => {
    assert.throws(
      () => buildVendaPayload(order({
        total: 16,
        delivery_fee: 0,
        service_fee: 0,
        additional_fee: 0,
        discounts: [{ total: 10 }],
        payments: [{ total: 16, payment_method: 'ifood', payment_fee: 0 }],
      }), installation),
      /Desconto líquido/
    );
  });

  await check('CPF/CNPJ existente usa o cliente do Venda sem sobrescrever cadastro', async () => {
    let writes = 0;
    const name = await ensureVendaCustomer(
      order({ fiscal_document: '12345678901' }),
      installation,
      {
        pesquisarPessoas: async () => [{ NomeFantasia: 'Cliente Venda' }],
        salvarPessoa: async () => { writes++; },
      }
    );
    assert.strictEqual(name, 'Cliente Venda');
    assert.strictEqual(writes, 0);
  });

  await check('mesa/comanda só entra quando fechada', () => {
    assert.strictEqual(shouldCreateOrder(order({ order_type: 'closed_table', status: 'confirmed' })), false);
    assert.strictEqual(shouldCreateOrder(order({ order_type: 'closed_table', status: 'closed' })), true);
  });

  await check('correlação existente evita segundo SalvarEFaturar', async () => {
    let writes = 0;
    const cwOrder = order();
    const existing = {
      Codigo: 99,
      CodigoPedidoCliente: 'CW-3268-237456',
      Status: 'Aguardando confirmação',
    };
    const erp = {
      pesquisarPedidos: async () => [existing],
      salvarEFaturarPedido: async () => { writes++; },
    };
    const db = async (_path, opts) => opts?.method === 'PATCH' ? [{ venda_order_code: 99 }] : [];
    await createVendaOrder(cwOrder, installation, {
      id: 'corr',
      codigo_pedido_cliente: 'CW-3268-237456',
      write_started_at: null,
    }, db, erp);
    assert.strictEqual(writes, 0);
  });

  await check('timeout ambíguo não repete POST e exige reconciliação', async () => {
    let writes = 0;
    const erp = {
      pesquisarPedidos: async () => [],
      salvarEFaturarPedido: async () => {
        writes++;
        const err = new Error('timeout');
        err.status = 0;
        throw err;
      },
    };
    const db = async (_path, opts) => opts?.method === 'PATCH' ? [{ id: 'corr' }] : [];
    await assert.rejects(
      createVendaOrder(order(), installation, {
        id: 'corr',
        codigo_pedido_cliente: 'CW-3268-237456',
        write_started_at: null,
      }, db, erp),
      ReconciliationRequiredError
    );
    assert.strictEqual(writes, 1);
  });

  await check('falha na leitura de Pessoas ocorre antes do claim e pode receber retry', async () => {
    let claims = 0;
    let personWrites = 0;
    let orderWrites = 0;
    const err = new Error('Venda ERP indisponível');
    err.name = 'VendaErpApiError';
    err.status = 503;
    const erp = {
      pesquisarPedidos: async () => [],
      pesquisarPessoas: async () => { throw err; },
      salvarPessoa: async () => { personWrites++; },
      salvarEFaturarPedido: async () => { orderWrites++; },
    };
    const db = async (_path, opts) => {
      if (opts?.method === 'PATCH') claims++;
      return [];
    };
    await assert.rejects(
      createVendaOrder(
        order({ fiscal_document: '12345678901' }),
        installation,
        {
          id: 'corr',
          codigo_pedido_cliente: 'CW-3268-237456',
          write_started_at: null,
        },
        db,
        erp
      ),
      (caught) => caught === err
    );
    assert.strictEqual(claims, 0);
    assert.strictEqual(personWrites, 0);
    assert.strictEqual(orderWrites, 0);
  });

  const realFetch = global.fetch;
  await check('OAuth confirma a identidade da loja autorizada', async () => {
    global.fetch = async (url) => {
      assert.match(String(url), /\/api\/partner\/v1\/merchant$/);
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ id: 3268, name: 'Loja' }),
      };
    };
    const merchant = await cardapio.fetchMerchant('access-token');
    assert.strictEqual(merchant.id, 3268);
  });

  await check('modo estático usa somente o token do env e nunca tenta refresh', async () => {
    const correlation = {
      id: 'corr-static',
      codigo_pedido_cliente: 'CW-3268-237456',
      venda_order_code: 3,
      write_started_at: null,
      cw_status: 'canceled',
    };
    const cw = {
      getStaticAccessToken: () => 'static-access-token',
      decryptSecret: () => { throw new Error('decrypt não deveria ser chamado'); },
      refreshToken: async () => { throw new Error('refresh não deveria ser chamado'); },
      fetchOrder: async (_orderId, token) => {
        assert.strictEqual(token, 'static-access-token');
        return order({ status: 'canceled' });
      },
    };
    const status = await processEvent({
      tenant_id: installation.tenant_id,
      merchant_id: 3268,
      order_id: 237456,
    }, {
      ...installation,
      auth_mode: 'static',
      merchant_id: 3268,
      token_expires_at: null,
      access_token_ciphertext: null,
      refresh_token_ciphertext: null,
    }, async (path) => path.startsWith('cardapio_web_orders?') ? [correlation] : [], {
      cw,
      erp: { excluirPedido: async () => {} },
    });
    assert.strictEqual(status, 'done');
  });

  await check('token estático é recusado fora do Sandbox sem aparecer no erro', () => {
    process.env.CARDAPIO_WEB_ACCESS_TOKEN = 'static-secret-test';
    process.env.CARDAPIO_WEB_ENV = 'production';
    try {
      assert.throws(
        () => cardapio.getStaticAccessToken(),
        (err) => /somente no Sandbox/.test(err.message) &&
          !err.message.includes(process.env.CARDAPIO_WEB_ACCESS_TOKEN)
      );
    } finally {
      delete process.env.CARDAPIO_WEB_ACCESS_TOKEN;
      delete process.env.CARDAPIO_WEB_ENV;
    }
  });

  await check('token estático recusa URL-base fora da allowlist do Sandbox', () => {
    process.env.CARDAPIO_WEB_ACCESS_TOKEN = 'static-secret-test';
    process.env.CARDAPIO_WEB_ENV = 'sandbox';
    process.env.CARDAPIO_WEB_BASE_URL = 'https://integracao.cardapioweb.com';
    try {
      assert.throws(
        () => cardapio.getStaticAccessToken(),
        (err) => /somente no Sandbox/.test(err.message) &&
          !err.message.includes(process.env.CARDAPIO_WEB_ACCESS_TOKEN)
      );
    } finally {
      delete process.env.CARDAPIO_WEB_ACCESS_TOKEN;
      delete process.env.CARDAPIO_WEB_ENV;
      delete process.env.CARDAPIO_WEB_BASE_URL;
    }
  });

  await check('401 no modo estático não repete request nem tenta refresh', async () => {
    let fetches = 0;
    let refreshes = 0;
    const unauthorized = new Error('unauthorized');
    unauthorized.status = 401;
    const cw = {
      getStaticAccessToken: () => 'static-access-token',
      refreshToken: async () => { refreshes++; },
      fetchOrder: async () => {
        fetches++;
        throw unauthorized;
      },
    };
    await assert.rejects(
      processEvent({
        tenant_id: installation.tenant_id,
        merchant_id: 3268,
        order_id: 237456,
      }, {
        ...installation,
        auth_mode: 'static',
        merchant_id: 3268,
      }, async () => [], { cw, erp: {} }),
      (err) => err === unauthorized
    );
    assert.strictEqual(fetches, 1);
    assert.strictEqual(refreshes, 0);
  });

  await check('OAuth continua usando token cifrado mesmo com token estático configurado', async () => {
    const correlation = {
      id: 'corr-oauth',
      codigo_pedido_cliente: 'CW-3268-237456',
      venda_order_code: 3,
      write_started_at: null,
      cw_status: 'canceled',
    };
    const cw = {
      getStaticAccessToken: () => { throw new Error('token estático não deveria ser usado'); },
      decryptSecret: (value) => {
        assert.strictEqual(value, 'oauth-ciphertext');
        return 'oauth-access-token';
      },
      fetchOrder: async (_orderId, token) => {
        assert.strictEqual(token, 'oauth-access-token');
        return order({ status: 'canceled' });
      },
    };
    const status = await processEvent({
      tenant_id: installation.tenant_id,
      merchant_id: 3268,
      order_id: 237456,
    }, {
      ...installation,
      auth_mode: 'oauth',
      merchant_id: 3268,
      token_expires_at: '2099-01-01T00:00:00Z',
      access_token_ciphertext: 'oauth-ciphertext',
    }, async (path) => path.startsWith('cardapio_web_orders?') ? [correlation] : [], {
      cw,
      erp: { excluirPedido: async () => {} },
    });
    assert.strictEqual(status, 'done');
  });

  await check('cancelamento após criação ambígua exige reconciliação e não executa DELETE', async () => {
    let deletes = 0;
    const correlation = {
      id: 'corr',
      codigo_pedido_cliente: 'CW-3268-237456',
      venda_order_code: null,
      write_started_at: '2026-07-23T12:01:00Z',
      cw_status: 'waiting_confirmation',
    };
    const db = async (path, opts) => {
      if (path.startsWith('cardapio_web_orders?')) return [correlation];
      if (opts?.method === 'PATCH') return [{ ...correlation, ...opts.body }];
      return [];
    };
    const erp = {
      pesquisarPedidos: async () => [],
      excluirPedido: async () => { deletes++; },
    };
    const cw = {
      decryptSecret: () => 'access-token',
      fetchOrder: async () => order({ status: 'canceled' }),
    };
    await assert.rejects(
      processEvent({
        tenant_id: installation.tenant_id,
        merchant_id: 3268,
        order_id: 237456,
      }, {
        ...installation,
        merchant_id: 3268,
        token_expires_at: '2099-01-01T00:00:00Z',
        access_token_ciphertext: 'ciphertext',
      }, db, { cw, erp }),
      ReconciliationRequiredError
    );
    assert.strictEqual(deletes, 0);
  });

  await check('cancelamento repetido não executa segundo DELETE', async () => {
    let deletes = 0;
    const correlation = {
      id: 'corr',
      codigo_pedido_cliente: 'CW-3268-237456',
      venda_order_code: 3,
      write_started_at: '2026-07-23T12:01:00Z',
      cw_status: 'canceled',
    };
    const db = async (path) => path.startsWith('cardapio_web_orders?') ? [correlation] : [];
    const erp = {
      pesquisarPedidos: async () => [],
      excluirPedido: async () => { deletes++; },
    };
    const cw = {
      decryptSecret: () => 'access-token',
      fetchOrder: async () => order({ status: 'canceled' }),
    };
    const status = await processEvent({
      tenant_id: installation.tenant_id,
      merchant_id: 3268,
      order_id: 237456,
    }, {
      ...installation,
      merchant_id: 3268,
      token_expires_at: '2099-01-01T00:00:00Z',
      access_token_ciphertext: 'ciphertext',
    }, db, { cw, erp });
    assert.strictEqual(status, 'done');
    assert.strictEqual(deletes, 0);
  });

  await check('pedido retornado com ID diferente do webhook é recusado', async () => {
    const cw = {
      decryptSecret: () => 'access-token',
      fetchOrder: async () => order({ id: 999999 }),
    };
    await assert.rejects(
      processEvent({
        tenant_id: installation.tenant_id,
        merchant_id: 3268,
        order_id: 237456,
      }, {
        ...installation,
        merchant_id: 3268,
        token_expires_at: '2099-01-01T00:00:00Z',
        access_token_ciphertext: 'ciphertext',
      }, async () => [], { cw, erp: {} }),
      /não confere/
    );
  });

  await check('HTTP 200 com erro de negócio do Venda ERP falha e não retenta', async () => {
    let calls = 0;
    global.fetch = async () => {
      calls++;
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        text: async () => JSON.stringify('O cliente Consumidor Final NÃO EXISTE.'),
      };
    };
    await assert.rejects(
      vendaerp.salvarEFaturarPedido({ codigoPedidoCliente: 'CW-1' }),
      (err) => err.name === 'VendaErpApiError' && err.status === 200
    );
    assert.strictEqual(calls, 1);
  });

  await check('DELETE ambíguo não retenta', async () => {
    let calls = 0;
    global.fetch = async () => {
      calls++;
      throw new Error('socket hang up');
    };
    await assert.rejects(vendaerp.excluirPedido(3), /indisponível/);
    assert.strictEqual(calls, 1);
  });
  global.fetch = realFetch;

  if (failures) {
    process.stdout.write(`\n${failures} falha(s).\n`);
    process.exit(1);
  }
  process.stdout.write('\nTodas as asserções passaram.\n');
})();
