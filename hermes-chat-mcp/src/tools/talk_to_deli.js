// talk_to_deli — conversa com a DELI (COO digital) como se fosse o chat do Console.
'use strict';

module.exports = {
  name: 'talk_to_deli',
  title: 'Conversar com a DELI',
  description:
    'Envia uma mensagem para a DELI (COO digital da Consult Delivery) e devolve a resposta dela. ' +
    'Dispara o mesmo endpoint do chat no Console (deli-conversa) e aguarda a resposta assíncrona ' +
    'via Supabase Realtime. Pode demorar alguns segundos.',
  inputShape: { mensagem: require('zod').string().min(1, 'mensagem não pode ser vazia') },
  async handler(args, { chatClient }) {
    const { content, createdAt } = await chatClient.talkTo('deli', args.mensagem);
    return { summary: `resposta recebida (${createdAt})`, data: { resposta: content, created_at: createdAt } };
  },
};
