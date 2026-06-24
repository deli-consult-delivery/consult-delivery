// cd_despachar_especialista — despacha um agente especialista para atender uma demanda
// de um cliente. Cria uma tarefa (client_tasks) com loop_state='open' para que o
// especialista possa ser acionado pelo pipeline AI-First.
'use strict';

const { z } = require('zod');

module.exports = {
  name: 'cd_despachar_especialista',
  title: 'Despachar especialista para demanda de cliente',
  description:
    'Cria uma tarefa aberta (client_tasks, loop_state=open) despachando um agente ' +
    'especialista para atender uma demanda de cliente. Retorna o id da tarefa criada. ' +
    'Uso: DELI (via Hermes/Telegram) aciona quando Wandson pede para despachar um agente.',
  inputShape: {
    tenant_id: z.string().uuid().describe('Tenant alvo (obrigatório)'),
    loja_id: z.string().uuid().describe('UUID da loja/cliente alvo (tabela lojas)'),
    especialista: z
      .enum(['breno', 'cora', 'lara', 'vera', 'sofia', 'max'])
      .describe('Slug do agente especialista a despachar'),
    descricao: z
      .string()
      .min(10)
      .describe('Descrição da demanda — o que precisa ser feito (mínimo 10 caracteres)'),
    target_system: z
      .enum(['vendaerp', 'asaas', 'nenhum'])
      .optional()
      .describe('Sistema alvo onde o especialista vai atuar (default: nenhum)'),
  },
  async handler(args, { sb, cfg }) {
    // 1. Resolver customer_id a partir da loja (FK: lojas.client_id → customers.id)
    const lojas = await sb.sbGet(
      'lojas',
      `id=eq.${args.loja_id}&select=id,nome,client_id&limit=1`
    );
    if (!lojas || lojas.length === 0) {
      throw new Error(`loja ${args.loja_id} não encontrada`);
    }
    const loja = lojas[0];
    if (!loja.client_id) {
      throw new Error(
        `loja ${args.loja_id} (${loja.nome ?? 'sem nome'}) não tem customer vinculado (client_id=null). ` +
          'Vincule a loja a um customer antes de despachar especialista.'
      );
    }

    // 2. Inserir tarefa em client_tasks
    const row = {
      tenant_id:     args.tenant_id,
      customer_id:   loja.client_id,
      phase_id:      'acompanhamento',  // fase padrão para demandas avulsas
      title:         `[${args.especialista.toUpperCase()}] ${args.descricao.slice(0, 80)}`,
      description:   args.descricao,
      status:        'todo',
      priority:      'normal',
      agent_id:      args.especialista,
      loop_state:    'open',
      target_system: args.target_system ?? 'nenhum',
      created_at:    new Date().toISOString(),
    };

    const created = await sb.sbInsert('client_tasks', row);

    return {
      summary:
        `especialista=${args.especialista} despachado para loja=${args.loja_id} ` +
        `(customer=${loja.client_id}) task_id=${created.id}`,
      tenantIds: [args.tenant_id],
      data: {
        task_id:     created.id,
        especialista: args.especialista,
        descricao:   args.descricao,
        loja_id:     args.loja_id,
        loja_nome:   loja.nome ?? null,
        customer_id: loja.client_id,
        target_system: created.target_system ?? 'nenhum',
        status:      'despachado',
      },
    };
  },
};
