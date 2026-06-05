import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const LABELS: Record<string, string> = {
  suporte: 'Darei o suporte agora',
  amanha:  'Tratarei amanhã',
  ignorar: 'Ignorado',
};

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

  const label = LABELS[acao!] ?? acao;
  return new Response(
    `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Confirmado</title></head>
<body style="font-family:sans-serif;text-align:center;padding:2rem;background:#0d0d0d;color:#fff;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1rem">
  <div style="font-size:3rem">✅</div>
  <h2 style="margin:0;color:#fff">Confirmado</h2>
  <p style="color:rgba(255,255,255,0.7);margin:0">${label}</p>
  <a href="https://app.consultdelivery.com.br" style="margin-top:1rem;padding:10px 24px;background:#B70C00;color:#fff;text-decoration:none;border-radius:8px;font-weight:600">
    Abrir Consult Delivery
  </a>
</body></html>`,
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  );
});
