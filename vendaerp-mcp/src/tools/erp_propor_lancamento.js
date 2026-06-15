// erp_propor_lancamento — PROPÕE criar um lançamento financeiro no VendaERP.
// 1º passo do padrão de confirmação: NÃO executa; grava uma proposta pendente e
// devolve {proposal_id, resumo}. O agente mostra o resumo e, após "sim", chama
// erp_confirmar(proposal_id).
'use strict';

const { z } = require('zod');

module.exports = {
  name: 'erp_propor_lancamento',
  title: 'Propor: criar lançamento financeiro (VendaERP)',
  description:
    'PROPÕE criar um lançamento financeiro (receita/despesa) no VendaERP. ' +
    'Esta tool NÃO executa nada — ela cria uma proposta PENDENTE e devolve um proposal_id e um resumo. ' +
    'Mostre o resumo ao usuário no formato "Vou criar o lançamento — <resumo>. Confirma? (sim/não)" e ' +
    'só chame erp_confirmar com o proposal_id retornado APÓS um "sim" explícito do usuário. ' +
    'Nunca chame erp_confirmar sem confirmação.',
  inputShape: {
    valor: z.number().describe('Valor do lançamento'),
    descricao: z.string().optional().describe('Descrição/histórico do lançamento'),
    cliente: z.string().optional().describe('Cliente/fornecedor associado'),
    vencimento: z.string().optional().describe('Data de vencimento'),
  },
  async handler(args, { cfg, proposals }) {
    const resumo = `Criar lançamento de R$ ${args.valor}` +
      (args.descricao ? ` (${args.descricao})` : '') +
      (args.cliente ? ` para ${args.cliente}` : '') +
      (args.vencimento ? ` venc. ${args.vencimento}` : '');

    const out = await proposals.create({
      tipo: 'lancamento',
      endpoint: '/lancamento',
      payload: args,
      resumo,
    });

    return {
      summary: `Proposta criada (pendente de confirmação): ${resumo}`,
      tenantIds: [cfg.auditTenantId],
      data: { proposal_id: out.proposal_id, resumo: out.resumo, expires_at: out.expires_at },
    };
  },
};
