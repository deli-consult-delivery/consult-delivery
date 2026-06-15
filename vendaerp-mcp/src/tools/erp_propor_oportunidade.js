// erp_propor_oportunidade — PROPÕE criar uma oportunidade (CRM) no VendaERP.
// 1º passo do padrão de confirmação: NÃO executa; grava uma proposta pendente e
// devolve {proposal_id, resumo}. O agente mostra o resumo e, após "sim", chama
// erp_confirmar(proposal_id).
'use strict';

const { z } = require('zod');

module.exports = {
  name: 'erp_propor_oportunidade',
  title: 'Propor: criar oportunidade (VendaERP)',
  description:
    'PROPÕE criar uma oportunidade (funil de vendas) no VendaERP. ' +
    'Esta tool NÃO executa nada — ela cria uma proposta PENDENTE e devolve um proposal_id e um resumo. ' +
    'Mostre o resumo ao usuário no formato "Vou criar a oportunidade — <resumo>. Confirma? (sim/não)" e ' +
    'só chame erp_confirmar com o proposal_id retornado APÓS um "sim" explícito do usuário. ' +
    'Nunca chame erp_confirmar sem confirmação.',
  inputShape: {
    titulo: z.string().min(1).describe('Título/descrição da oportunidade'),
    cliente: z.string().optional().describe('Cliente associado'),
    empresa: z.string().optional().describe('Empresa'),
    valor: z.number().optional().describe('Valor estimado'),
  },
  async handler(args, { proposals }) {
    const resumo = `Criar oportunidade "${args.titulo}"` +
      (args.cliente ? ` para ${args.cliente}` : '') +
      (args.valor != null ? ` (R$ ${args.valor})` : '');

    const out = await proposals.create({
      tipo: 'oportunidade',
      endpoint: '/oportunidade',
      payload: args,
      resumo,
    });

    return {
      summary: `Proposta criada (pendente de confirmação): ${resumo}`,
      tenantIds: [],
      data: { proposal_id: out.proposal_id, resumo: out.resumo, expires_at: out.expires_at },
    };
  },
};
