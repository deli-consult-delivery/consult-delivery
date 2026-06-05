import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (req) => {
  const url       = new URL(req.url);
  const triagemId = url.searchParams.get('triagem_id');
  const acao      = url.searchParams.get('acao');

  if (!triagemId || !['suporte', 'amanha', 'ignorar'].includes(acao ?? '')) {
    return new Response('Parâmetros inválidos', { status: 400 });
  }

  const sb = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { error } = await sb
    .from('breno_triagem')
    .update({
      confirmado:      true,
      confirmado_em:   new Date().toISOString(),
      acao_confirmada: acao,
    })
    .eq('id', triagemId)
    .eq('confirmado', false);

  if (error) {
    return new Response('Erro ao confirmar', { status: 500 });
  }

  return new Response(null, {
    status: 302,
    headers: {
      'Location': `https://app.consultdelivery.com.br?breno_confirmado=${acao}`,
    },
  });
});
