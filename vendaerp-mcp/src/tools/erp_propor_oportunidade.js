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
    'Nunca chame erp_confirmar sem confirmação. ' +
    'Regras do ERP: `cliente` precisa referenciar um cliente JÁ EXISTENTE e `responsavel` é obrigatório.',
  inputShape: {
    titulo: z.string().min(1).describe('Título/descrição da oportunidade'),
    cliente: z.string().optional().describe('Cliente associado (precisa já existir no ERP)'),
    empresa: z.string().optional().describe('Empresa'),
    valor: z.number().optional().describe('Valor estimado do negócio'),
    responsavel: z.string().optional().describe('Responsável pela oportunidade (obrigatório no ERP)'),
  },
  async handler(args, { cfg, proposals }) {
    const resumo = `Criar oportunidade "${args.titulo}"` +
      (args.cliente ? ` para ${args.cliente}` : '') +
      (args.valor != null ? ` (R$ ${args.valor})` : '');

    // Mapeia os campos amigáveis → schema `Oportunidade` do ERP (titulo→descricao,
    // valor→valorNegocio). O Bridge é pass-through (JSON.stringify direto), então o
    // `payload` guardado já tem que ser o corpo no formato do ERP.
    const payload = {};
    payload.descricao = args.titulo;
    if (args.cliente != null) payload.cliente = args.cliente;
    if (args.empresa != null) payload.empresa = args.empresa;
    if (args.valor != null) payload.valorNegocio = args.valor;
    if (args.responsavel != null) payload.responsavel = args.responsavel;

    const out = await proposals.create({
      tipo: 'oportunidade',
      endpoint: '/oportunidade',
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
