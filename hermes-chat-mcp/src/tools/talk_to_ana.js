// talk_to_ana — conversa com a Ana (assistente pessoal do Wandson).
//
// Mesma mecânica de talk_to_deli, mas contra o endpoint 'ana-conversa'. NÃO TESTADO
// EM PRODUÇÃO ainda (2026-07-31): depende de credenciais pessoais da Ana, que ainda
// não existem (ver hermes/profiles/ana/SOUL.md + docs/ai-first/ana-sistemas-pessoais-acesso.md).
// O endpoint 'ana-conversa/run' em si também não existe até a Ana ter uma task Trigger.dev
// própria — bloqueio documentado em CON-6, não resolvido nesta sessão.
'use strict';

module.exports = {
  name: 'talk_to_ana',
  title: 'Conversar com a Ana',
  description:
    'Envia uma mensagem para a Ana (assistente pessoal do Wandson, escopo estritamente pessoal — ' +
    'nunca dado de cliente/tenant) e devolve a resposta dela. Mesma mecânica de talk_to_deli ' +
    '(dispara ana-conversa, aguarda via Realtime). Pendência conhecida: o endpoint ana-conversa ' +
    'e as credenciais dos sistemas pessoais da Ana ainda não existem — só é testável depois disso.',
  inputShape: { mensagem: require('zod').string().min(1, 'mensagem não pode ser vazia') },
  async handler(args, { chatClient }) {
    const { content, createdAt } = await chatClient.talkTo('ana', args.mensagem);
    return { summary: `resposta recebida (${createdAt})`, data: { resposta: content, created_at: createdAt } };
  },
};
