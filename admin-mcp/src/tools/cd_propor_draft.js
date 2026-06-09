// cd_propor_draft — ÚNICA tool de escrita (design §3.2).
//
// Cria um draft `pending` com origin='hermes'. O draft vai para o painel; o
// Wandson aprova e o SISTEMA envia. O Hermes NUNCA envia a cliente e NUNCA aprova
// o próprio draft — o enforcement é estrutural: este MCP não expõe nenhuma tool de
// aprovação/envio (não existe cd_aprovar_* nem cd_executar_*). A única mutação
// possível é inserir uma proposta pendente.
'use strict';

const { z } = require('zod');

module.exports = {
  name: 'cd_propor_draft',
  title: 'Propor draft (proposta)',
  description:
    'Cria uma PROPOSTA (draft pendente) de mensagem/ação, marcada origin=hermes. ' +
    'NÃO envia nada: vira draft pendente para o Wandson aprovar no painel; só então ' +
    'o sistema executa. O Hermes não aprova nem envia — só propõe.',
  inputShape: {
    tenant_id: z.string().uuid().describe('Tenant alvo da proposta (obrigatório)'),
    channel: z
      .string()
      .min(1)
      .describe('Canal da proposta (ex.: whatsapp, painel, telegram_interno)'),
    content: z.string().min(1).describe('Conteúdo/corpo da proposta'),
    subject: z.string().optional().describe('Assunto/título curto'),
    reasoning: z.string().optional().describe('Por que o copiloto está propondo isto'),
    loja_id: z.string().uuid().optional().describe('Loja relacionada, se houver'),
    target_id: z.string().optional().describe('Destinatário/alvo (ex.: telefone, id externo)'),
    autonomy_level: z
      .enum(['verde', 'amarelo', 'vermelho'])
      .optional()
      .describe('Semáforo da proposta (default amarelo: propõe, humano aprova)'),
  },
  async handler(args, { sb, cfg }) {
    const row = {
      tenant_id: args.tenant_id,
      agent_name: 'hermes',
      origin: 'hermes', // marca a proposta como vinda do copiloto (design §5)
      channel: args.channel,
      content: args.content,
      subject: args.subject || null,
      reasoning: args.reasoning || null,
      loja_id: args.loja_id || null,
      target_id: args.target_id || null,
      status: 'pending', // SEMPRE pendente — nunca approved/sent por aqui
      autonomy_level: args.autonomy_level || 'amarelo',
      metadata: { proposto_por: cfg.principal, via: 'admin-mcp' },
      created_at: new Date().toISOString(),
    };
    const created = await sb.sbInsert('agent_drafts', row);
    return {
      summary: `draft pendente criado id=${created.id} tenant=${args.tenant_id} (aguarda aprovação do Wandson)`,
      tenantIds: [args.tenant_id],
      data: {
        draft_id: created.id,
        status: created.status,
        origin: created.origin,
        aviso: 'Proposta criada como pendente. Só o Wandson aprova; o Hermes não envia nem aprova.',
      },
    };
  },
};
