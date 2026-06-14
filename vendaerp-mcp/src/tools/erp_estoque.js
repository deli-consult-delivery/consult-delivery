// erp_estoque — quantidades em estoque e depósitos do VendaERP. Somente leitura.
'use strict';

const { z } = require('zod');
const { contar } = require('../_util');

module.exports = {
  name: 'erp_estoque',
  title: 'Estoque (VendaERP)',
  description:
    'Consulta estoque no VendaERP. recurso="quantidades" (default): saldos por produto ' +
    '(filtro opcional por depósito). recurso="depositos": lista os depósitos. Somente leitura.',
  inputShape: {
    recurso: z.enum(['quantidades', 'depositos']).optional().describe('O que consultar (default quantidades)'),
    deposito: z.string().optional().describe('Código/identificador do depósito (filtra quantidades)'),
  },
  async handler(args, { erp }) {
    const recurso = args.recurso || 'quantidades';
    const data = recurso === 'depositos'
      ? await erp.depositos()
      : await erp.estoque({ deposito: args.deposito });
    return {
      summary: `${recurso}: ${contar(data)} registro(s)`,
      tenantIds: [],
      data,
    };
  },
};
