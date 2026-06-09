// cd_drafts_pendentes — drafts aguardando aprovação (design §3.1).
// Usa a coluna `origin` (migration 20260609_001) p/ separar propostas do Hermes.
'use strict';

const { z } = require('zod');
const { clampLimit, eq, qs, distinctTenants } = require('../pgrest');

const COLS =
  'id,tenant_id,agent_name,origin,channel,subject,content,status,autonomy_level,' +
  'loja_id,reasoning,created_at,expires_at';

module.exports = {
  name: 'cd_drafts_pendentes',
  title: 'Drafts pendentes',
  description:
    'Drafts (propostas de mensagem/ação) aguardando aprovação. ' +
    'Filtro por origem (agent | deli | hermes | user_manual) — use origin=hermes ' +
    'para ver só o que o próprio copiloto propôs. Nenhum draft é enviado sem aprovação.',
  inputShape: {
    tenant_id: z.string().uuid().optional().describe('Filtra por tenant'),
    origin: z
      .enum(['agent', 'deli', 'hermes', 'user_manual'])
      .optional()
      .describe('Filtra pela origem do draft'),
    limit: z.number().int().positive().optional().describe('Máx. de drafts (default 20)'),
  },
  async handler(args, { sb, cfg }) {
    const limit = clampLimit(cfg, args.limit);
    const query = qs(
      `select=${COLS}`,
      eq('status', 'pending'),
      args.tenant_id ? eq('tenant_id', args.tenant_id) : null,
      args.origin ? eq('origin', args.origin) : null,
      'order=created_at.desc',
      `limit=${limit}`
    );
    const rows = await sb.sbGet('agent_drafts', query);
    const doHermes = rows.filter((r) => r.origin === 'hermes').length;
    return {
      summary: `${rows.length} draft(s) pendente(s); ${doHermes} do Hermes`,
      tenantIds: distinctTenants(rows),
      data: { count: rows.length, drafts: rows },
    };
  },
};
