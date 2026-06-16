// erp_propor_nfe — PROPÕE emitir uma NFE no VendaERP.
// 1º passo do padrão de confirmação: NÃO executa; grava uma proposta pendente e
// devolve {proposal_id, resumo}. O agente mostra o resumo e, após "sim", chama
// erp_confirmar(proposal_id).
'use strict';

const { z } = require('zod');

module.exports = {
  name: 'erp_propor_nfe',
  title: 'Propor: emitir NFE (VendaERP)',
  description:
    'PROPÕE emitir uma NFE (nota fiscal eletrônica) no VendaERP a partir de uma venda. ' +
    'Esta tool NÃO executa nada — ela cria uma proposta PENDENTE e devolve um proposal_id e um resumo. ' +
    'Mostre o resumo ao usuário no formato "Vou emitir a NFE — <resumo>. Confirma? (sim/não)" e ' +
    'só chame erp_confirmar com o proposal_id retornado APÓS um "sim" explícito do usuário. ' +
    'Nunca chame erp_confirmar sem confirmação.',
  inputShape: {
    CodigoVenda: z.union([z.string(), z.number()]).describe('Código da venda a faturar'),
  },
  async handler(args, { cfg, proposals }) {
    const resumo = `Emitir NFE da venda ${args.CodigoVenda}`;

    const out = await proposals.create({
      tipo: 'nfe',
      endpoint: '/nfe',
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
