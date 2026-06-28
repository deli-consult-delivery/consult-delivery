// ifood_cardapio — cardápio agregado (catálogos→categorias→itens com disponibilidade). Leitura.
'use strict';

const { z } = require('zod');
const { contar } = require('../_util');

module.exports = {
  name: 'ifood_cardapio',
  title: 'Cardápio agregado do iFood',
  description:
    'Retorna o cardápio agregado da loja no iFood (catálogos → categorias → itens com a ' +
    'disponibilidade efetiva). Somente leitura — não edita itens nem preços.',
  inputShape: {
    tenant_id: z.string().uuid().optional().describe('Tenant alvo (o Bridge resolve o merchant)'),
    merchantId: z.string().optional().describe('merchantId iFood (tem que ser do tenant)'),
  },
  async handler(args, { ifood }) {
    const data = await ifood.cardapio({ tenant_id: args.tenant_id, merchantId: args.merchantId });
    return { summary: `cardápio iFood: ${contar(data)} grupo(s)`, tenantIds: args.tenant_id ? [args.tenant_id] : [], data };
  },
};
