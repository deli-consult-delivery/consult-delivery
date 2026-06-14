// erp_contratos — contratos do VendaERP (listagem ou pesquisa). Somente leitura.
'use strict';

const { z } = require('zod');
const { contar } = require('../_util');

module.exports = {
  name: 'erp_contratos',
  title: 'Contratos (VendaERP)',
  description:
    'Lista ou pesquisa contratos no VendaERP. Sem filtro → lista paginada (pageSize/skip). ' +
    'Com código, cliente ou situação → pesquisa. Somente leitura.',
  inputShape: {
    codigo: z.string().optional().describe('Código do contrato (pesquisa exata)'),
    cliente: z.string().optional().describe('Nome/identificador do cliente (pesquisa)'),
    situacao: z.string().optional().describe('Situação do contrato (pesquisa)'),
    pageSize: z.number().int().positive().optional().describe('Tamanho da página (default 20)'),
    skip: z.number().int().nonnegative().optional().describe('Itens a pular (paginação)'),
  },
  async handler(args, { erp }) {
    const data = await erp.contratos(args);
    return {
      summary: `${contar(data)} contrato(s)`,
      tenantIds: [],
      data,
    };
  },
};
