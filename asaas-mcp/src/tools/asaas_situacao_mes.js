// asaas_situacao_mes — situação das cobranças por mês (recebidas/confirmadas/aguardando/vencidas).
'use strict';

const { z } = require('zod');

module.exports = {
  name: 'asaas_situacao_mes',
  title: 'Situação das cobranças (mês)',
  description:
    'Resumo das cobranças Asaas de um mês por status: recebidas, confirmadas, aguardando e ' +
    'vencidas (total, líquido, clientes, qtd). Somente leitura.',
  inputShape: {
    mes: z.string().regex(/^\d{4}-\d{2}$/).optional().describe('Mês no formato YYYY-MM (default: mês atual no Bridge)'),
  },
  async handler(args, { asaas }) {
    const data = await asaas.situacaoMes({ mes: args.mes });
    return { summary: `situação Asaas ${data?.mes ?? args.mes ?? 'mês atual'}`, tenantIds: [], data };
  },
};
