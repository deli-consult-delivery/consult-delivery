// erp_fiscal — consulta de NFE do VendaERP (por código ou por período). Leitura.
'use strict';

const { z } = require('zod');
const { contar } = require('../_util');

module.exports = {
  name: 'erp_fiscal',
  title: 'Fiscal / NFE (VendaERP)',
  description:
    'Consulta notas fiscais no VendaERP. Com codigoNfe → abre uma NFE específica. ' +
    'Sem código → lista NFEs por período (dataInicial/dataFinal, formato do ERP). ' +
    'Somente leitura — NÃO emite nem cancela nota.',
  inputShape: {
    codigoNfe: z.string().optional().describe('Código de uma NFE específica'),
    dataInicial: z.string().optional().describe('Início do período (consulta por período)'),
    dataFinal: z.string().optional().describe('Fim do período (consulta por período)'),
  },
  async handler(args, { erp }) {
    const data = await erp.fiscal(args);
    return {
      summary: args.codigoNfe ? `NFE ${args.codigoNfe}` : `${contar(data)} NFE(s) no período`,
      tenantIds: [],
      data,
    };
  },
};
