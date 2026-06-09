// cd_agent_runs — últimos runs de agentes (status/custo) (design §3.1).
'use strict';

const { z } = require('zod');
const { clampLimit, eq, qs, distinctTenants } = require('../pgrest');

const COLS =
  'id,tenant_id,agent_id,status,cost_usd,duration_ms,triggered_by,created_at,completed_at';

module.exports = {
  name: 'cd_agent_runs',
  title: 'Runs de agentes',
  description:
    'Últimos runs de agentes (DELI, LARA, VERA, etc.) com status e custo em USD. ' +
    'Filtros opcionais por tenant, agente e status.',
  inputShape: {
    tenant_id: z.string().uuid().optional().describe('Filtra por tenant'),
    agent_id: z.string().optional().describe('Filtra por agente (ex.: deli, lara)'),
    status: z.string().optional().describe('Filtra por status do run'),
    limit: z.number().int().positive().optional().describe('Máx. de runs (default 20)'),
  },
  async handler(args, { sb, cfg }) {
    const limit = clampLimit(cfg, args.limit);
    const query = qs(
      `select=${COLS}`,
      args.tenant_id ? eq('tenant_id', args.tenant_id) : null,
      args.agent_id ? eq('agent_id', args.agent_id) : null,
      args.status ? eq('status', args.status) : null,
      'order=created_at.desc',
      `limit=${limit}`
    );
    const rows = await sb.sbGet('agent_runs', query);
    const custoTotal = rows.reduce((acc, r) => acc + (Number(r.cost_usd) || 0), 0);
    return {
      summary: `${rows.length} run(s); custo somado US$ ${custoTotal.toFixed(4)}`,
      tenantIds: distinctTenants(rows),
      data: { count: rows.length, cost_usd_total: custoTotal, runs: rows },
    };
  },
};
