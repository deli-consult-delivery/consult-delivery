// ifood_status — a loja está aberta/fechada agora no iFood? Somente leitura.
'use strict';

const { z } = require('zod');

module.exports = {
  name: 'ifood_status',
  title: 'Status da loja no iFood',
  description:
    'Consulta se a loja está aberta/fechada agora no iFood. O Bridge resolve o merchant ' +
    'pelo tenant (ou use merchantId/tenant_id). Não retorna segredos. Somente leitura.',
  inputShape: {
    tenant_id: z.string().uuid().optional().describe('Tenant alvo (o Bridge resolve o merchant)'),
    merchantId: z.string().optional().describe('merchantId iFood, se já souber (tem que ser do tenant)'),
  },
  async handler(args, { ifood }) {
    const data = await ifood.status({ tenant_id: args.tenant_id, merchantId: args.merchantId });
    return { summary: 'status da loja iFood obtido', tenantIds: args.tenant_id ? [args.tenant_id] : [], data };
  },
};
