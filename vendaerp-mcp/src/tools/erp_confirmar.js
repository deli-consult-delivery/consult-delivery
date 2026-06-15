// erp_confirmar — executa uma proposta de escrita previamente criada por uma
// tool erp_propor_*. GENÉRICA: não conhece o domínio; só despacha o endpoint e o
// payload guardados na proposta. É o 2º passo do padrão de confirmação.
'use strict';

const { z } = require('zod');

module.exports = {
  name: 'erp_confirmar',
  title: 'Confirmar e executar proposta (VendaERP)',
  description:
    'Executa de fato uma operação de escrita no VendaERP que foi PROPOSTA antes por uma tool erp_propor_*. ' +
    'CHAME esta tool SOMENTE depois que o usuário responder "sim" (ou equivalente) à confirmação no Telegram, ' +
    'passando o proposal_id retornado pela tool erp_propor_*. NUNCA chame sem um "sim" explícito do usuário. ' +
    'Recusa propostas inexistentes, expiradas (TTL 10 min) ou já processadas — uso único.',
  inputShape: {
    proposal_id: z.string().min(1).describe('proposal_id devolvido pela tool erp_propor_* correspondente'),
  },
  async handler(args, { erp, proposals }) {
    const id = args.proposal_id;
    const { state, row } = await proposals.classify(id);

    if (state === 'not_found') {
      return { summary: 'Não encontrei essa proposta (proposal_id inválido).', tenantIds: [],
        data: { ok: false, motivo: 'not_found' } };
    }
    if (state === 'already') {
      return { summary: `Essa proposta já foi processada (status: ${row.status}). Não executei de novo.`,
        tenantIds: [], data: { ok: false, motivo: 'already', status: row.status } };
    }
    if (state === 'expired') {
      await proposals.markExpired(id);
      return { summary: 'Essa proposta expirou (TTL 10 min). Proponha a operação de novo.',
        tenantIds: [], data: { ok: false, motivo: 'expired' } };
    }

    // pending: tenta ganhar a corrida (uso único atômico).
    const claimed = await proposals.claim(id);
    if (!claimed) {
      return { summary: 'Essa proposta já está sendo processada ou já foi usada. Não executei de novo.',
        tenantIds: [], data: { ok: false, motivo: 'claim_perdido' } };
    }

    // executa no Bridge (que injeta a credencial e fala com o ERP).
    try {
      const resultado = await erp.post(claimed.endpoint, claimed.payload);
      await proposals.markExecuted(id, resultado);
      return { summary: `✅ Confirmado e gravado no ERP: ${claimed.resumo}`,
        tenantIds: [], data: { ok: true, proposal_id: id, resultado } };
    } catch (e) {
      await proposals.markFailed(id, e.message);
      return {
        summary: `Não consegui confirmar a gravação (${e.message}). Verifique no ERP antes de tentar de novo.`,
        tenantIds: [], data: { ok: false, motivo: 'erp_falhou', erro: e.message },
      };
    }
  },
};
