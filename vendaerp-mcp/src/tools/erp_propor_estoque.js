// erp_propor_estoque — PROPÕE um ajuste de estoque no VendaERP.
// 1º passo do padrão de confirmação: NÃO executa; grava uma proposta pendente e
// devolve {proposal_id, resumo}. O agente mostra o resumo e, após "sim", chama
// erp_confirmar(proposal_id).
'use strict';

const { z } = require('zod');

module.exports = {
  name: 'erp_propor_estoque',
  title: 'Propor: ajuste de estoque (VendaERP)',
  description:
    'PROPÕE um ajuste de estoque no VendaERP. ' +
    'Esta tool NÃO executa nada — ela cria uma proposta PENDENTE e devolve um proposal_id e um resumo. ' +
    'Mostre o resumo ao usuário no formato "Vou ajustar o estoque — <resumo>. Confirma? (sim/não)" e ' +
    'só chame erp_confirmar com o proposal_id retornado APÓS um "sim" explícito do usuário. ' +
    'Nunca chame erp_confirmar sem confirmação.',
  inputShape: {
    produto: z.string().min(1).describe('Código/nome do produto'),
    quantidade: z.number().describe('Quantidade a ajustar (positiva entra, negativa sai)'),
    deposito: z.string().optional().describe('Depósito'),
  },
  async handler(args, { cfg, proposals }) {
    const resumo = `Ajustar estoque de "${args.produto}"` +
      (args.quantidade != null ? ` em ${args.quantidade}` : '') +
      (args.deposito ? ` no depósito ${args.deposito}` : '');

    // Mapeia → schema `EstoqueMovimentacao` do ERP (produto→produtoCodigo,
    // deposito→depositoNome). O sinal da quantidade vira ehEntrada (>=0 entra,
    // <0 sai) e o ERP recebe sempre o valor absoluto. Bridge é pass-through.
    const payload = {
      produtoCodigo: args.produto,
      quantidade: Math.abs(args.quantidade),
      ehEntrada: args.quantidade >= 0,
    };
    if (args.deposito != null) payload.depositoNome = args.deposito;

    const out = await proposals.create({
      tipo: 'estoque',
      endpoint: '/estoque-ajuste',
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
