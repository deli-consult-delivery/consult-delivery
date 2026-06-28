// cd_despachar_especialista — despacha um agente especialista para atender uma demanda
// de um cliente. Cria uma tarefa (client_tasks) com loop_state='open' para que o
// especialista possa ser acionado pelo pipeline AI-First.
'use strict';

const { z } = require('zod');

module.exports = {
  write: true,
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
      .string()
      .regex(/^[a-z0-9_-]+$/, 'slug inválido')
      .describe('Slug do agente especialista (validado contra tenant_agents habilitados)'),
    descricao: z
      .string()
      .min(10)
      .describe('Descrição da demanda — o que precisa ser feito (mínimo 10 caracteres)'),
    target_system: z
      .enum(['vendaerp', 'asaas', 'nenhum'])
      .optional()
      .describe('Sistema alvo onde o especialista vai atuar (default: nenhum)'),
  },
  // Thin RPC: a REGRA de despacho vive no Bridge (POST /loop/despachar) — uma só
  // implementação que o Hermes (via esta tool) e o Trigger.dev compartilham. Aqui
  // só validamos (inputShape Zod), chamamos o Bridge com o token interno e traduzimos
  // a resposta. Sem decisão de domínio duplicada.
  async handler(args, { cfg }) {
    if (!cfg.internalBridgeToken) {
      throw new Error(
        'INTERNAL_BRIDGE_TOKEN não configurado no env do admin-mcp — o despacho usa a rota ' +
          'protegida do Bridge (/loop/despachar). Configure via Infisical antes de despachar.'
      );
    }

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10000);
    let resp;
    let body;
    try {
      resp = await fetch(`${cfg.bridgeUrl}/loop/despachar`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-token': cfg.internalBridgeToken,
        },
        body: JSON.stringify({
          tenant_id: args.tenant_id,
          loja_id: args.loja_id,
          especialista: args.especialista,
          descricao: args.descricao,
          target_system: args.target_system ?? 'nenhum',
        }),
        signal: ctrl.signal,
      });
      body = await resp.json().catch(() => ({}));
    } catch (e) {
      throw new Error(
        e.name === 'AbortError'
          ? 'timeout ao chamar o Bridge (/loop/despachar)'
          : `falha ao chamar o Bridge (/loop/despachar): ${e.message}`
      );
    } finally {
      clearTimeout(timer);
    }

    if (!resp.ok) {
      throw new Error(`despacho recusado pelo Bridge (${resp.status}): ${body.error ?? 'erro desconhecido'}`);
    }

    return {
      summary:
        `especialista=${body.especialista} despachado para loja=${body.loja_id} ` +
        `(customer=${body.customer_id}) task_id=${body.task_id}`,
      tenantIds: [args.tenant_id],
      data: body,
    };
  },
};
