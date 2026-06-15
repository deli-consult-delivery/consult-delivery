// erp_propor_boleto — PROPÕE gerar um boleto/cobrança no VendaERP.
// 1º passo do padrão de confirmação: NÃO executa; grava uma proposta pendente e
// devolve {proposal_id, resumo}. O agente mostra o resumo e, após "sim", chama
// erp_confirmar(proposal_id).
'use strict';

const { z } = require('zod');

module.exports = {
  name: 'erp_propor_boleto',
  title: 'Propor: gerar boleto/cobrança (VendaERP)',
  description:
    'PROPÕE gerar um boleto/cobrança no VendaERP. ' +
    'Esta tool NÃO executa nada — ela cria uma proposta PENDENTE e devolve um proposal_id e um resumo. ' +
    'Mostre o resumo ao usuário no formato "Vou gerar o boleto — <resumo>. Confirma? (sim/não)" e ' +
    'só chame erp_confirmar com o proposal_id retornado APÓS um "sim" explícito do usuário. ' +
    'Nunca chame erp_confirmar sem confirmação.',
  inputShape: {
    lancamento: z.string().min(1).describe('Código do lançamento a cobrar'),
    cliente: z.string().optional().describe('Cliente associado'),
    valor: z.number().optional().describe('Valor da cobrança'),
  },
  async handler(args, { cfg, proposals }) {
    const resumo = `Gerar boleto do lançamento ${args.lancamento}` +
      (args.cliente ? ` para ${args.cliente}` : '') +
      (args.valor != null ? ` (R$ ${args.valor})` : '');

    const out = await proposals.create({
      tipo: 'boleto',
      endpoint: '/boleto',
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
