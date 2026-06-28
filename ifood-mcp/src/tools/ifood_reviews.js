// ifood_reviews — avaliações da loja no iFood. Somente leitura.
'use strict';

const { z } = require('zod');
const { contar } = require('../_util');

module.exports = {
  name: 'ifood_reviews',
  title: 'Avaliações do iFood',
  description:
    'Lista as avaliações (reviews) da loja no iFood. Somente leitura — não responde nem ' +
    'publica nada (responder avaliação é fluxo de draft + aprovação, fora deste MCP).',
  inputShape: {
    tenant_id: z.string().uuid().optional().describe('Tenant alvo (o Bridge resolve o merchant)'),
    merchantId: z.string().optional().describe('merchantId iFood (tem que ser do tenant)'),
  },
  async handler(args, { ifood }) {
    const data = await ifood.reviews({ tenant_id: args.tenant_id, merchantId: args.merchantId });
    return { summary: `avaliações iFood: ${contar(data)}`, tenantIds: args.tenant_id ? [args.tenant_id] : [], data };
  },
};
