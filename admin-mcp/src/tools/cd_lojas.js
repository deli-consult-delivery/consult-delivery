// cd_lojas — lojas + métricas-chave por tenant (design §3.1).
// Visão CEO: TODOS os tenants, marcando quais são seed/teste (is_real_business).
'use strict';

const { z } = require('zod');
const { clampLimit, eq, qs, distinctTenants } = require('../pgrest');

const COLS =
  'id,tenant_id,nome,nicho,cidade,status,plataforma,ticket_medio,' +
  'is_real_business,is_active,data_entrada,created_at';

module.exports = {
  name: 'cd_lojas',
  title: 'Lojas e métricas',
  description:
    'Lista lojas de TODOS os tenants (visão CEO) com métricas-chave. ' +
    'Marca quais são negócio real vs seed/teste (is_real_business). ' +
    'Filtros opcionais por tenant e status.',
  inputShape: {
    tenant_id: z.string().uuid().optional().describe('Filtra por um tenant específico'),
    status: z.string().optional().describe('Filtra por status da loja (ex.: ativa)'),
    limit: z.number().int().positive().optional().describe('Máx. de lojas (default 20)'),
  },
  async handler(args, { sb, cfg }) {
    const limit = clampLimit(cfg, args.limit);
    const query = qs(
      `select=${COLS}`,
      args.tenant_id ? eq('tenant_id', args.tenant_id) : null,
      args.status ? eq('status', args.status) : null,
      'order=created_at.desc',
      `limit=${limit}`
    );
    const rows = await sb.sbGet('lojas', query);
    const reais = rows.filter((r) => r.is_real_business).length;
    return {
      summary: `${rows.length} loja(s); ${reais} negócio real, ${rows.length - reais} seed/teste`,
      tenantIds: distinctTenants(rows),
      data: { count: rows.length, lojas: rows },
    };
  },
};
