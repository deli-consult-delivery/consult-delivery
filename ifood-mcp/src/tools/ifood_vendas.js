// ifood_vendas — vendas por período no iFood. Somente leitura.
'use strict';

const { z } = require('zod');
const { contar } = require('../_util');

module.exports = {
  name: 'ifood_vendas',
  title: 'Vendas do iFood (por período)',
  description:
    'Lista as vendas/pedidos da loja no iFood num período (dataInicio/dataFim em YYYY-MM-DD). ' +
    'Somente leitura.',
  inputShape: {
    tenant_id: z.string().uuid().optional().describe('Tenant alvo (o Bridge resolve o merchant)'),
    merchantId: z.string().optional().describe('merchantId iFood (tem que ser do tenant)'),
    dataInicio: z.string().optional().describe('Início do período (YYYY-MM-DD)'),
    dataFim: z.string().optional().describe('Fim do período (YYYY-MM-DD)'),
  },
  async handler(args, { ifood }) {
    const data = await ifood.vendas({
      tenant_id: args.tenant_id, merchantId: args.merchantId,
      dataInicio: args.dataInicio, dataFim: args.dataFim,
    });
    return { summary: `vendas iFood: ${contar(data)} registro(s)`, tenantIds: args.tenant_id ? [args.tenant_id] : [], data };
  },
};
