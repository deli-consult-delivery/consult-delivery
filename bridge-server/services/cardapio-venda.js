'use strict';

const cardapio = require('../lib/cardapio-web');
const vendaerp = require('../lib/vendaerp');

class ReconciliationRequiredError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ReconciliationRequiredError';
  }
}

const STATUS_VENDA = {
  waiting_confirmation: 'Aguardando confirmação',
  pending_payment: 'Pagamento pendente',
  pending_online_payment: 'Pagamento online pendente',
  scheduled_confirmed: 'Agendado confirmado',
  confirmed: 'Em preparação',
  ready: 'Pronto',
  released: 'Saiu para entrega',
  waiting_to_catch: 'Aguardando retirada',
  delivered: 'Entregue',
  canceling: 'Cancelamento solicitado',
  canceled: 'Cancelado',
  closed: 'Finalizado',
};

function moneyToCents(value, label = 'Valor monetário') {
  if ((typeof value !== 'number' && typeof value !== 'string') || String(value).trim() === '') {
    throw new Error(`${label} inválido`);
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) throw new Error(`${label} inválido`);
  const raw = String(value).trim();
  const match = /^(-)?(\d+)(?:\.(\d+))?$/.exec(raw);
  if (!match) throw new Error(`${label} deve usar notação decimal`);
  const fraction = match[3] || '';
  let magnitude = BigInt(match[2]) * 100n + BigInt((fraction + '00').slice(0, 2));
  if ((fraction[2] || '0') >= '5') magnitude += 1n;
  const signed = match[1] ? -magnitude : magnitude;
  if (signed > BigInt(Number.MAX_SAFE_INTEGER) || signed < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new Error(`${label} fora do limite seguro`);
  }
  return Number(signed);
}

function nonNegativeCents(value, label) {
  const cents = moneyToCents(value, label);
  if (cents < 0) throw new Error(`${label} não pode ser negativo`);
  return cents;
}

function centsToMoney(cents) {
  if (!Number.isSafeInteger(cents)) throw new Error('Centavos fora do limite seguro');
  return cents / 100;
}

function addCents(values, label) {
  const total = values.reduce((sum, value) => sum + value, 0);
  if (!Number.isSafeInteger(total)) throw new Error(`${label} fora do limite seguro`);
  return total;
}

function childrenOf(item) {
  const direct = Array.isArray(item.items) ? item.items : [];
  const combo = Array.isArray(item.combo_steps)
    ? item.combo_steps.map((step) => step?.item).filter(Boolean)
    : [];
  return [...direct, ...combo];
}

function flattenItems(items, multiplier = 1, output = []) {
  for (const item of items || []) {
    const quantity = Number(item.quantity) * multiplier;
    const children = childrenOf(item);
    if (item.external_code) {
      output.push(vendaItem(item.external_code, item.name, quantity, item.unit_price));
    } else if (!children.length) {
      throw new Error(`Produto "${item.name || item.item_id}" sem código PDV no Cardápio Web`);
    }
    for (const option of item.options || []) {
      if (!option.external_code) {
        throw new Error(`Complemento "${option.name || option.option_id}" sem código PDV no Cardápio Web`);
      }
      output.push(vendaItem(
        option.external_code,
        option.name,
        quantity * Number(option.quantity),
        option.unit_price
      ));
    }
    flattenItems(children, quantity, output);
  }
  return output;
}

function vendaItem(codigo, descricao, quantidade, valorUnitario) {
  if (!Number.isFinite(quantidade) || !Number.isInteger(quantidade) || quantidade <= 0) {
    throw new Error(`Quantidade inválida para ${codigo}`);
  }
  const unitCents = nonNegativeCents(valorUnitario, `Valor unitário de ${codigo}`);
  const totalCents = unitCents * quantidade;
  if (!Number.isSafeInteger(totalCents)) throw new Error(`Total de ${codigo} fora do limite seguro`);
  return {
    codigo: String(codigo),
    unidade: 'UN',
    descricao: String(descricao || codigo),
    quantidade,
    valorUnitario: centsToMoney(unitCents),
    valorFrete: 0,
    descontoUnitario: 0,
    valorTotal: centsToMoney(totalCents),
    pesoKG: 0,
    comprimento: 0,
    altura: 0,
    largura: 0,
    freteGratis: false,
    valorUnitarioFrete: 0,
    prazoEntregaFrete: 0,
    comissaoVendedor: 0,
    seguro: 0,
  };
}

function codigoPedidoCliente(order) {
  return `CW-${order.merchant_id}-${order.id}`;
}

function shouldCreateOrder(order) {
  return order.order_type !== 'closed_table' || order.status === 'closed';
}

function buildVendaPayload(order, installation, clienteOverride) {
  const codigo = codigoPedidoCliente(order);
  const fiscal = String(order.fiscal_document || '').replace(/\D/g, '');
  const cliente = clienteOverride || (fiscal
    ? (order.customer?.name || installation.venda_cliente_generico)
    : installation.venda_cliente_generico);
  const data = new Date(order.created_at).toISOString();
  const items = flattenItems(order.items);
  if (!items.length) throw new Error('Pedido sem itens faturáveis');
  const totals = validateOrderTotal(order, items);
  const vendaCompositionCents = addCents(
    [totals.lineSubtotalCents, totals.deliveryFeeCents, totals.otherExpensesCents],
    'Composição Venda ERP'
  );
  if (vendaCompositionCents !== totals.orderTotalCents) {
    throw new Error(
      `Composição Venda ERP não fecha: esperado ${centsToMoney(totals.orderTotalCents)}, ` +
      `mapeado ${centsToMoney(vendaCompositionCents)}`
    );
  }
  const payments = buildPayments(order, installation, totals.orderTotalCents, codigo);

  return {
    codigoPedidoCliente: codigo,
    deposito: installation.venda_deposito,
    empresa: installation.venda_empresa,
    cliente,
    planoDeConta: installation.venda_plano_conta,
    formaPagamento: payments[0].formaPagamento,
    numeroParcelas: 1,
    valorFrete: centsToMoney(totals.deliveryFeeCents),
    outrasDespesas: centsToMoney(totals.otherExpensesCents),
    valorFinal: centsToMoney(totals.orderTotalCents),
    descricao: `${codigo} | ${order.sales_channel} | ${STATUS_VENDA[order.status] || order.status}`,
    status: STATUS_VENDA[order.status] || order.status,
    data,
    dataFaturamento: data,
    finalizado: true,
    lancado: true,
    items,
    pagamentos: payments,
  };
}

function validateOrderTotal(order, mappedItems = flattenItems(order.items)) {
  const itemTotalCents = addCents((order.items || []).map((item) =>
    nonNegativeCents(item.total_price, `Total do item "${item.name || item.item_id}"`)
  ), 'Subtotal Cardápio Web');
  const lineSubtotalCents = addCents(mappedItems.map((item) =>
    nonNegativeCents(item.valorTotal, `Total mapeado de ${item.codigo}`)
  ), 'Subtotal mapeado');
  if (lineSubtotalCents !== itemTotalCents) {
    throw new Error(
      `Subtotal mapeado não fecha com os itens do Cardápio Web: ` +
      `esperado ${centsToMoney(itemTotalCents)}, mapeado ${centsToMoney(lineSubtotalCents)}`
    );
  }

  const deliveryFeeCents = nonNegativeCents(order.delivery_fee || 0, 'Taxa de entrega');
  const serviceFeeCents = nonNegativeCents(order.service_fee || 0, 'Taxa de serviço');
  const additionalFeeCents = nonNegativeCents(order.additional_fee || 0, 'Taxa adicional');
  const paymentFeesCents = addCents((order.payments || []).map((payment) =>
    nonNegativeCents(payment.payment_fee || 0, 'Taxa de pagamento')
  ), 'Taxas de pagamento');
  const discountsCents = addCents((order.discounts || []).map((discount) =>
    nonNegativeCents(discount.total || 0, 'Desconto')
  ), 'Descontos');
  const orderTotalCents = nonNegativeCents(order.total, 'Total do pedido');
  const expectedCents = addCents(
    [
      itemTotalCents,
      deliveryFeeCents,
      serviceFeeCents,
      additionalFeeCents,
      paymentFeesCents,
      -discountsCents,
    ],
    'Total do pedido'
  );
  if (expectedCents !== orderTotalCents) {
    throw new Error(
      `Total do pedido não fecha: esperado ${centsToMoney(expectedCents)}, ` +
      `recebido ${centsToMoney(orderTotalCents)}`
    );
  }
  const otherExpensesCents = addCents(
    [serviceFeeCents, additionalFeeCents, paymentFeesCents, -discountsCents],
    'Outras despesas'
  );
  if (otherExpensesCents < 0) {
    throw new Error('Desconto líquido não pode ser representado com segurança no Venda ERP');
  }
  return {
    itemTotalCents,
    lineSubtotalCents,
    deliveryFeeCents,
    otherExpensesCents,
    orderTotalCents,
  };
}

function buildPayments(order, installation, valorFinalCents, codigo) {
  const mapping = installation.venda_payment_mapping || {};
  const mapped = (order.payments || [])
    .map((payment) => ({
      method: payment.payment_method || 'unknown',
      totalCents: nonNegativeCents(payment.total, 'Total do pagamento'),
    }))
    .filter((payment) => payment.totalCents > 0);
  const sumCents = addCents(mapped.map((payment) => payment.totalCents), 'Total dos pagamentos');
  const source = sumCents === valorFinalCents && mapped.length
    ? mapped
    : [{ method: 'fallback', totalCents: valorFinalCents }];
  return source.map((payment) => ({
    formaPagamento: mapping[payment.method] || installation.venda_forma_pagamento,
    descricaoPagamento: `${codigo} | ${payment.method}`,
    valorPagamento: centsToMoney(payment.totalCents),
    condicaoPagamento: 0,
    parcelas: 1,
    periodoParcelas: 0,
    adiantamento: 0,
    quitar: true,
  }));
}

function vendaCode(body) {
  return body?.Pedido?.Codigo ?? body?.pedido?.codigo ?? body?.Codigo ?? body?.codigo ?? null;
}

function vendaClientCode(row) {
  return row?.CodigoPedidoCliente ?? row?.codigoPedidoCliente ?? null;
}

function vendaStatus(row) {
  return row?.Status ?? row?.status ?? null;
}

async function findVendaOrder(order, tenantId, erp = vendaerp) {
  const wanted = codigoPedidoCliente(order);
  const created = new Date(order.created_at);
  const dataInicial = new Date(created.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const dataFinal = new Date(created.getTime() + 24 * 60 * 60 * 1000).toISOString();
  for (let skip = 0; skip < 1000; skip += 100) {
    const rows = await erp.pesquisarPedidos({ dataInicial, dataFinal, pageSize: 100, skip }, tenantId);
    const list = Array.isArray(rows) ? rows : [];
    const found = list.find((row) => vendaClientCode(row) === wanted);
    if (found || list.length < 100) return found || null;
  }
  return null;
}

async function getAccessToken(installation, db, cw = cardapio, forceRefresh = false) {
  if (!forceRefresh && new Date(installation.token_expires_at).getTime() > Date.now() + 120_000) {
    return cw.decryptSecret(installation.access_token_ciphertext);
  }
  let tokens;
  try {
    tokens = await cw.refreshToken(cw.decryptSecret(installation.refresh_token_ciphertext));
  } catch (err) {
    if (err.status === 401) {
      await db(`cardapio_web_installations?id=eq.${encodeURIComponent(installation.id)}`, {
        method: 'PATCH',
        body: { status: 'revoked', enabled: false, updated_at: new Date().toISOString() },
      });
    }
    throw err;
  }
  const update = {
    access_token_ciphertext: cw.encryptSecret(tokens.access_token),
    refresh_token_ciphertext: tokens.refresh_token
      ? cw.encryptSecret(tokens.refresh_token)
      : installation.refresh_token_ciphertext,
    token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
    scope: tokens.scope ?? installation.scope,
    status: 'active',
    updated_at: new Date().toISOString(),
  };
  await db(`cardapio_web_installations?id=eq.${encodeURIComponent(installation.id)}`, {
    method: 'PATCH',
    body: update,
  });
  Object.assign(installation, update);
  return tokens.access_token;
}

async function getOrCreateCorrelation(order, installation, db) {
  const query = `cardapio_web_orders?tenant_id=eq.${encodeURIComponent(installation.tenant_id)}` +
    `&merchant_id=eq.${order.merchant_id}&order_id=eq.${order.id}&limit=1`;
  const existing = await db(query);
  if (existing?.[0]) return existing[0];
  try {
    const inserted = await db('cardapio_web_orders', {
      method: 'POST',
      body: {
        tenant_id: installation.tenant_id,
        installation_id: installation.id,
        merchant_id: order.merchant_id,
        order_id: order.id,
        codigo_pedido_cliente: codigoPedidoCliente(order),
        cw_status: order.status,
      },
    });
    return inserted[0];
  } catch (err) {
    if (!String(err.message).includes('Supabase 409')) throw err;
    const raced = await db(query);
    if (!raced?.[0]) throw err;
    return raced[0];
  }
}

async function saveCorrelation(row, patch, db) {
  const result = await db(`cardapio_web_orders?id=eq.${encodeURIComponent(row.id)}`, {
    method: 'PATCH',
    body: { ...patch, updated_at: new Date().toISOString() },
  });
  return result?.[0] || { ...row, ...patch };
}

async function createVendaOrder(order, installation, correlation, db, erp = vendaerp) {
  const alreadyThere = await findVendaOrder(order, installation.tenant_id, erp);
  if (alreadyThere) {
    return saveCorrelation(correlation, {
      venda_order_code: vendaCode(alreadyThere),
      venda_order: alreadyThere,
      cw_status: order.status,
      last_error: null,
    }, db);
  }

  const customer = await lookupVendaCustomer(order, installation, erp);
  const validatedPayload = buildVendaPayload(
    order,
    installation,
    customer.name || installation.venda_cliente_generico
  );
  if (correlation.write_started_at) {
    throw new ReconciliationRequiredError(
      `${correlation.codigo_pedido_cliente}: escrita anterior sem confirmação; POST não repetido`
    );
  }
  const claimed = await db(
    `cardapio_web_orders?id=eq.${encodeURIComponent(correlation.id)}&write_started_at=is.null`,
    { method: 'PATCH', body: { write_started_at: new Date().toISOString() } }
  );
  if (!claimed?.length) {
    throw new ReconciliationRequiredError(
      `${correlation.codigo_pedido_cliente}: escrita concorrente; POST não repetido`
    );
  }

  try {
    const cliente = customer.name || (
      customer.fiscal
        ? await createVendaCustomer(order, installation, customer.fiscal, erp)
        : installation.venda_cliente_generico
    );
    const result = await erp.salvarEFaturarPedido(
      { ...validatedPayload, cliente },
      installation.tenant_id
    );
    return saveCorrelation(correlation, {
      venda_order_code: vendaCode(result),
      venda_order: result.Pedido ?? result.pedido,
      cw_status: order.status,
      last_error: null,
    }, db);
  } catch (err) {
    if (err.status === 0 || err.status >= 500) {
      let reconciled;
      try {
        reconciled = await findVendaOrder(order, installation.tenant_id, erp);
      } catch {
        throw new ReconciliationRequiredError(
          `${correlation.codigo_pedido_cliente}: resultado ambíguo e reconciliação indisponível`
        );
      }
      if (reconciled) {
        return saveCorrelation(correlation, {
          venda_order_code: vendaCode(reconciled),
          venda_order: reconciled,
          cw_status: order.status,
          last_error: null,
        }, db);
      }
      throw new ReconciliationRequiredError(
        `${correlation.codigo_pedido_cliente}: resultado ambíguo; POST não repetido`
      );
    }
    if (err instanceof ReconciliationRequiredError) throw err;
    await saveCorrelation(correlation, {
      write_started_at: null,
      last_error: err.message,
    }, db);
    throw err;
  }
}

async function ensureVendaCustomer(order, installation, erp = vendaerp) {
  const customer = await lookupVendaCustomer(order, installation, erp);
  if (customer.name) return customer.name;
  if (!customer.fiscal) return installation.venda_cliente_generico;
  return createVendaCustomer(order, installation, customer.fiscal, erp);
}

async function lookupVendaCustomer(order, installation, erp = vendaerp) {
  const fiscal = String(order.fiscal_document || '').replace(/\D/g, '');
  if (!fiscal) return { fiscal: null, name: null };
  if (fiscal.length !== 11 && fiscal.length !== 14) {
    throw new Error('CPF/CNPJ do pedido possui tamanho inválido');
  }
  const rows = await erp.pesquisarPessoas({ cpfcnpj: fiscal }, installation.tenant_id);
  const person = Array.isArray(rows) ? rows[0] : null;
  const name = person
    ? (person.NomeFantasia ?? person.nomeFantasia ?? person.RazaoSocial ?? person.razaoSocial)
    : null;
  return { fiscal, name };
}

async function createVendaCustomer(order, installation, fiscal, erp = vendaerp) {
  const find = async () => (await lookupVendaCustomer(order, installation, erp)).name;
  const name = order.customer?.name || `Cliente CW ${fiscal.slice(-4)}`;
  const address = order.delivery_address || {};
  const payload = {
    pessoaFisica: fiscal.length === 11,
    nomeFantasia: name,
    razaoSocial: name,
    cnpJ_CPF: fiscal,
    cliente: true,
    celular: order.customer?.phone || null,
    logradouro: address.street || null,
    logradouroNumero: address.number || null,
    complemento: address.complement || null,
    bairro: address.neighborhood || null,
    cidade: address.city || null,
    cep: address.postal_code || null,
    uf: address.state || null,
  };
  try {
    await erp.salvarPessoa(payload, installation.tenant_id);
    return name;
  } catch (err) {
    if (err.status === 0 || err.status >= 500) {
      let reconciled;
      try {
        reconciled = await find();
      } catch {
        throw new ReconciliationRequiredError(
          'Cadastro do cliente com resultado ambíguo e reconciliação indisponível'
        );
      }
      if (reconciled) return reconciled;
      throw new ReconciliationRequiredError('Cadastro do cliente com resultado ambíguo; POST não repetido');
    }
    throw err;
  }
}

async function updateVendaStatus(order, installation, correlation, db, erp = vendaerp) {
  const mapped = STATUS_VENDA[order.status] || order.status;
  const current = correlation.venda_order ||
    await findVendaOrder(order, installation.tenant_id, erp);
  if (!current) throw new ReconciliationRequiredError('Pedido Venda ERP não localizado para atualizar status');
  const payload = {
    ...current,
    Codigo: correlation.venda_order_code || vendaCode(current),
    Status: mapped,
    Descricao: `${codigoPedidoCliente(order)} | ${order.sales_channel} | ${mapped}`,
  };
  try {
    const result = await erp.atualizarPedido(payload, installation.tenant_id);
    return saveCorrelation(correlation, {
      venda_order: typeof result === 'object' ? result : payload,
      cw_status: order.status,
      last_error: null,
    }, db);
  } catch (err) {
    if (err.status === 0 || err.status >= 500) {
      let reconciled;
      try {
        reconciled = await findVendaOrder(order, installation.tenant_id, erp);
      } catch {
        throw new ReconciliationRequiredError(
          'Atualização de status com resultado ambíguo e reconciliação indisponível'
        );
      }
      if (reconciled && vendaStatus(reconciled) === mapped) {
        return saveCorrelation(correlation, {
          venda_order: reconciled,
          cw_status: order.status,
          last_error: null,
        }, db);
      }
      throw new ReconciliationRequiredError('Atualização de status com resultado ambíguo; PUT não repetido');
    }
    throw err;
  }
}

async function cancelVendaOrder(order, installation, correlation, db, erp = vendaerp) {
  if (correlation?.cw_status === 'canceled') return correlation;
  if (!correlation?.venda_order_code) {
    const existing = await findVendaOrder(order, installation.tenant_id, erp);
    if (!existing) {
      if (correlation?.write_started_at) {
        throw new ReconciliationRequiredError(
          'Cancelamento aguarda reconciliação da criação ambígua; DELETE não executado'
        );
      }
      return saveCorrelation(correlation, {
        cw_status: 'canceled',
        last_error: null,
      }, db);
    }
    correlation = await saveCorrelation(correlation, {
      venda_order_code: vendaCode(existing),
      venda_order: existing,
      last_error: null,
    }, db);
  }
  try {
    await erp.excluirPedido(correlation.venda_order_code, installation.tenant_id);
  } catch (err) {
    if (err.status !== 0 && err.status < 500) throw err;
    let stillThere;
    try {
      stillThere = await findVendaOrder(order, installation.tenant_id, erp);
    } catch {
      throw new ReconciliationRequiredError(
        'Cancelamento com resultado ambíguo e reconciliação indisponível'
      );
    }
    if (stillThere) {
      throw new ReconciliationRequiredError('Cancelamento com resultado ambíguo; DELETE não repetido');
    }
  }
  return saveCorrelation(correlation, {
    cw_status: 'canceled',
    last_error: null,
  }, db);
}

async function processEvent(event, installation, db, { cw = cardapio, erp = vendaerp } = {}) {
  if (process.env.CARDAPIO_WEB_VENDA_WRITE_ENABLED !== 'true') {
    throw new Error('Escrita Cardápio Web → Venda ERP desativada');
  }
  if (
    String(installation.tenant_id) !== String(process.env.CARDAPIO_WEB_BOOTSTRAP_TENANT_ID) ||
    Number(installation.merchant_id) !== Number(process.env.CARDAPIO_WEB_BOOTSTRAP_MERCHANT_ID) ||
    installation.venda_empresa !== process.env.CARDAPIO_WEB_BOOTSTRAP_VENDA_EMPRESA
  ) {
    throw new Error('Instalação fora da allowlist Venda ERP desta V1');
  }
  if (
    String(installation.tenant_id) !== String(event.tenant_id) ||
    Number(installation.merchant_id) !== Number(event.merchant_id)
  ) {
    throw new Error('Evento não pertence à instalação informada');
  }
  let accessToken = await getAccessToken(installation, db, cw);
  let order;
  try {
    order = await cw.fetchOrder(event.order_id, accessToken);
  } catch (err) {
    if (err.status !== 401) throw err;
    accessToken = await getAccessToken(installation, db, cw, true);
    order = await cw.fetchOrder(event.order_id, accessToken);
  }
  if (
    Number(order.merchant_id) !== Number(event.merchant_id) ||
    Number(order.id) !== Number(event.order_id)
  ) {
    throw new Error('Pedido retornado não confere com o webhook');
  }

  let correlation = await getOrCreateCorrelation(order, installation, db);
  if (order.status === 'canceled') {
    await cancelVendaOrder(order, installation, correlation, db, erp);
    return 'done';
  }
  if (!shouldCreateOrder(order)) return 'ignored';
  if (!correlation.venda_order_code) {
    correlation = await createVendaOrder(order, installation, correlation, db, erp);
  }
  if (correlation.cw_status !== order.status) {
    await updateVendaStatus(order, installation, correlation, db, erp);
  }
  return 'done';
}

module.exports = {
  ReconciliationRequiredError,
  STATUS_VENDA,
  flattenItems,
  codigoPedidoCliente,
  shouldCreateOrder,
  buildVendaPayload,
  validateOrderTotal,
  ensureVendaCustomer,
  findVendaOrder,
  createVendaOrder,
  processEvent,
};
