// cd_inadimplencia — visão agregada de cobrança (design §3.1).
// Fonte primária = Supabase (cora_cobrancas), NÃO Evolution (QA Pattern P3).
'use strict';

const { z } = require('zod');
const { clampLimit, eq, inList, qs, distinctTenants } = require('../pgrest');

const COLS =
  'id,tenant_id,customer_name,valor_atual,valor_original,data_vencimento,status,created_at';
const ABERTOS = ['aberto', 'negociando', 'escalonado'];

module.exports = {
  name: 'cd_inadimplencia',
  title: 'Inadimplência (agregado)',
  description:
    'Visão agregada de cobranças em aberto (cora_cobrancas): total em aberto, ' +
    'quantidade e detalhe. Fonte primária Supabase. Filtro opcional por tenant.',
  inputShape: {
    tenant_id: z.string().uuid().optional().describe('Filtra por tenant'),
    limit: z.number().int().positive().optional().describe('Máx. de cobranças listadas (default 20)'),
  },
  async handler(args, { sb, cfg }) {
    const limit = clampLimit(cfg, args.limit);
    const query = qs(
      `select=${COLS}`,
      inList('status', ABERTOS),
      args.tenant_id ? eq('tenant_id', args.tenant_id) : null,
      'order=data_vencimento.asc',
      `limit=${limit}`
    );
    const rows = await sb.sbGet('cora_cobrancas', query);
    const totalAberto = rows.reduce((acc, r) => acc + (Number(r.valor_atual) || 0), 0);
    return {
      summary: `${rows.length} cobrança(s) em aberto; total R$ ${totalAberto.toFixed(2)}`,
      tenantIds: distinctTenants(rows),
      data: {
        count: rows.length,
        valor_aberto_total: totalAberto,
        status_considerados: ABERTOS,
        cobrancas: rows,
      },
    };
  },
};
