// erp_crm — oportunidades (funil) do VendaERP. Somente leitura.
'use strict';

const { z } = require('zod');
const { contar } = require('../_util');

module.exports = {
  name: 'erp_crm',
  title: 'CRM / Oportunidades (VendaERP)',
  description:
    'Pesquisa oportunidades (funil de vendas) no VendaERP por código, empresa ou cliente. ' +
    'Somente leitura — não cria nem move oportunidade.',
  inputShape: {
    codigo: z.string().optional().describe('Código da oportunidade'),
    empresa: z.string().optional().describe('Empresa'),
    cliente: z.string().optional().describe('Cliente'),
  },
  async handler(args, { erp }) {
    const data = await erp.oportunidades(args);
    return {
      summary: `${contar(data)} oportunidade(s)`,
      tenantIds: [],
      data,
    };
  },
};
