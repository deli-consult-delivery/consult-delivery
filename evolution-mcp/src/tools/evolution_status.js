// evolution_status — a conexão WhatsApp (Evolution) está ativa? Somente leitura.
'use strict';

const { z } = require('zod');

module.exports = {
  name: 'evolution_status',
  title: 'Status do WhatsApp (Evolution)',
  description:
    'Consulta se a(s) instância(s) WhatsApp do tenant estão conectadas (via Bridge). ' +
    'Útil ANTES de propor um envio. Não envia nada — envio a cliente é draft + aprovação.',
  inputShape: {
    tenant_id: z.string().uuid().optional().describe('Tenant alvo (sem ele, retorna todas as instâncias)'),
  },
  async handler(args, { evolution }) {
    const data = await evolution.status({ tenant_id: args.tenant_id });
    return {
      summary: `whatsapp ${data?.connected ? 'conectado' : 'desconectado'} (${data?.count ?? 0} instância(s))`,
      tenantIds: args.tenant_id ? [args.tenant_id] : [],
      data,
    };
  },
};
