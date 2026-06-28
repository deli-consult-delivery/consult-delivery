// ifood_catalogo — lista catálogos do merchant (ou itens vendáveis de um groupId). Leitura.
'use strict';

const { z } = require('zod');
const { contar } = require('../_util');

module.exports = {
  name: 'ifood_catalogo',
  title: 'Catálogos do iFood',
  description:
    'Lista os catálogos da loja no iFood. Com groupId, lista os itens vendáveis desse grupo. ' +
    'Somente leitura — não altera o catálogo.',
  inputShape: {
    tenant_id: z.string().uuid().optional().describe('Tenant alvo (o Bridge resolve o merchant)'),
    merchantId: z.string().optional().describe('merchantId iFood (tem que ser do tenant)'),
    groupId: z.string().optional().describe('Se informado, lista itens vendáveis desse grupo'),
  },
  async handler(args, { ifood }) {
    const data = await ifood.catalogo({ tenant_id: args.tenant_id, merchantId: args.merchantId, groupId: args.groupId });
    return { summary: `catálogo iFood: ${contar(data)} item(ns)`, tenantIds: args.tenant_id ? [args.tenant_id] : [], data };
  },
};
