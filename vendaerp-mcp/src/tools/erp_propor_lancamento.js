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
    vencimento: z.string().optional().describe('Data de vencimento (YYYY-MM-DD)'),
    ehDespesa: z.boolean().optional().describe('true = despesa, false = receita (padrão: receita)'),
  },
  async handler(args, { cfg, proposals }) {
    const resumo = `Criar lançamento de R$ ${args.valor}` +
      (args.descricao ? ` (${args.descricao})` : '') +
      (args.cliente ? ` para ${args.cliente}` : '') +
      (args.vencimento ? ` venc. ${args.vencimento}` : '');

    // Mapeia os campos amigáveis → schema `Lancamento` do ERP (vencimento→
    // dataVencimento; ehDespesa default false = receita). O Bridge é pass-through.
    const payload = { valor: args.valor, ehDespesa: args.ehDespesa ?? false };
    if (args.descricao != null) payload.descricao = args.descricao;
    if (args.cliente != null) payload.cliente = args.cliente;
    if (args.vencimento != null) payload.dataVencimento = args.vencimento;

    const out = await proposals.create({
      tipo: 'lancamento',
      endpoint: '/lancamento',
      payload,
      resumo,
    });

    return {
      summary: `Proposta criada (pendente de confirmação): ${resumo}`,
      tenantIds: [cfg.auditTenantId],
      data: { proposal_id: out.proposal_id, resumo: out.resumo, expires_at: out.expires_at },
    };
  },
};
