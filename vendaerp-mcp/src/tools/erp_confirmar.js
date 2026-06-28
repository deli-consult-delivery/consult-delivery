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
    codigo: z.string().min(4).describe(
      'Código de confirmação que o CEO recebeu por canal OUT-OF-BAND (ex.: Telegram). ' +
      'Obrigatório: sem ele a proposta não executa. O agente NÃO tem este código — só o CEO.'
    ),
  },
  async handler(args, { erp, cfg, proposals }) {
    const id = args.proposal_id;
    // Auditoria de ESCRITA: vincula a chamada ao tenant da plataforma (mesmo nos
    // early-returns) p/ não perder o rastro de tenant em audit_log.
    const tenantIds = [cfg.auditTenantId];
    const { state, row } = await proposals.classify(id);

    if (state === 'not_found') {
      return { summary: 'Não encontrei essa proposta (proposal_id inválido).', tenantIds,
        data: { ok: false, motivo: 'not_found' } };
    }
    if (state === 'already') {
      return { summary: `Essa proposta já foi processada (status: ${row.status}). Não executei de novo.`,
        tenantIds, data: { ok: false, motivo: 'already', status: row.status } };
    }
    if (state === 'expired') {
      const marked = await proposals.markExpired(id);
      if (!marked) {
        process.stderr.write(`[erp_confirmar] anomalia: markExpired não afetou linhas para proposal=${id}\n`);
      }
      return { summary: 'Essa proposta expirou (TTL 10 min). Proponha a operação de novo.',
        tenantIds, data: { ok: false, motivo: 'expired' } };
    }

    // Lock anti-brute-force: chega no limite de tentativas erradas → não confirma mais.
    if ((row.confirm_attempts ?? 0) >= proposals.MAX_ATTEMPTS) {
      return { summary: 'Proposta bloqueada por excesso de tentativas de confirmação. Proponha de novo.',
        tenantIds, data: { ok: false, motivo: 'bloqueada_tentativas' } };
    }

    // pending: claim ATÔMICO condicionado ao código out-of-band (só o CEO o tem).
    const claimed = await proposals.claim(id, args.codigo);
    if (!claimed) {
      // código errado (ou corrida/expiração): conta a tentativa e recusa, sem executar.
      await proposals.bumpAttempts(id, row.confirm_attempts).catch(() => {});
      const restantes = Math.max(0, proposals.MAX_ATTEMPTS - ((row.confirm_attempts ?? 0) + 1));
      return {
        summary: `Código de confirmação inválido — não executei. Tentativas restantes: ${restantes}.`,
        tenantIds, data: { ok: false, motivo: 'codigo_invalido', tentativas_restantes: restantes },
      };
    }

    // executa no Bridge (que injeta a credencial e fala com o ERP).
    try {
      const resultado = await erp.post(claimed.endpoint, claimed.payload);
      const marked = await proposals.markExecuted(id, resultado);
      if (!marked) {
        process.stderr.write(`[erp_confirmar] anomalia: markExecuted não afetou linhas para proposal=${id}\n`);
      }
      return { summary: `✅ Confirmado e gravado no ERP: ${claimed.resumo}`,
        tenantIds, data: { ok: true, proposal_id: id, resultado } };
    } catch (e) {
      const marked = await proposals.markFailed(id, e.message);
      if (!marked) {
        process.stderr.write(`[erp_confirmar] anomalia: markFailed não afetou linhas para proposal=${id}\n`);
      }
      return {
        summary: `Não consegui confirmar a gravação (${e.message}). Verifique no ERP antes de tentar de novo.`,
        tenantIds, data: { ok: false, motivo: 'erp_falhou', erro: e.message },
      };
    }
  },
};
