// cd_audit — últimas N entradas de auditoria (design §3.1).
'use strict';

const { z } = require('zod');
const { clampLimit, eq, qs, distinctTenants } = require('../pgrest');

const COLS = 'id,tenant_id,user_id,agent_name,action,resource,metadata,created_at';

module.exports = {
  name: 'cd_audit',
  title: 'Auditoria recente',
  description:
    'Últimas entradas do audit_log (quem fez o quê, em qual tenant, quando). ' +
    'Filtros opcionais por tenant e por agente/principal.',
  inputShape: {
    tenant_id: z.string().uuid().optional().describe('Filtra por tenant'),
    agent_name: z.string().optional().describe('Filtra por agente/principal (ex.: ceo_agent)'),
    limit: z.number().int().positive().optional().describe('Máx. de entradas (default 20)'),
  },
  async handler(args, { sb, cfg }) {
    const limit = clampLimit(cfg, args.limit);
    const query = qs(
      `select=${COLS}`,
      args.tenant_id ? eq('tenant_id', args.tenant_id) : null,
      args.agent_name ? eq('agent_name', args.agent_name) : null,
      'order=created_at.desc',
      `limit=${limit}`
    );
    const rows = await sb.sbGet('audit_log', query);
    return {
      summary: `${rows.length} entrada(s) de auditoria`,
      tenantIds: distinctTenants(rows),
      data: { count: rows.length, entries: rows },
    };
  },
};
