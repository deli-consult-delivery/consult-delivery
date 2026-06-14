// erp_financeiro — lançamentos (contas) e boletos do VendaERP. Somente leitura.
'use strict';

const { z } = require('zod');
const { contar } = require('../_util');

module.exports = {
  name: 'erp_financeiro',
  title: 'Financeiro (VendaERP)',
  description:
    'Consulta o financeiro do VendaERP. recurso="lancamentos" (default): lista/abre lançamentos ' +
    '(use codigo p/ um específico, ou pageSize/skip p/ listar). recurso="boletos": pesquisa boletos ' +
    '(codigo ou cliente). Somente leitura — não emite nem baixa nada.',
  inputShape: {
    recurso: z.enum(['lancamentos', 'boletos']).optional().describe('O que consultar (default lancamentos)'),
    codigo: z.string().optional().describe('Código do lançamento/boleto'),
    cliente: z.string().optional().describe('Cliente (só boletos)'),
    pageSize: z.number().int().positive().optional().describe('Tamanho da página (lançamentos, default 20)'),
    skip: z.number().int().nonnegative().optional().describe('Itens a pular (lançamentos)'),
  },
  async handler(args, { erp }) {
    const recurso = args.recurso || 'lancamentos';
    let data;
    if (recurso === 'boletos') {
      data = await erp.boletos({ codigo: args.codigo, cliente: args.cliente });
    } else {
      data = await erp.lancamentos({ codigo: args.codigo, pageSize: args.pageSize, skip: args.skip });
    }
    return {
      summary: `${recurso}: ${contar(data)} registro(s)`,
      tenantIds: [],
      data,
    };
  },
};
