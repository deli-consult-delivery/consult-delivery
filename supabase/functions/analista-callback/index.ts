// Supabase Edge Function — Analista iFood Callback
// Recebe resultado do bridge-server na VPS e atualiza tabela analises

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('ok', { status: 200 });
  }

  // Valida secret compartilhado com o bridge-server
  const secret = req.headers.get('x-bridge-secret');
  if (!secret || secret !== Deno.env.get('BRIDGE_SECRET')) {
    return new Response('unauthorized', { status: 401 });
  }

  try {
    const body = await req.json();
    const { job_id, status, resultado_json, mensagem_whatsapp, error_message } = body;

    if (!job_id) {
      return new Response('missing job_id', { status: 400 });
    }

    const update: Record<string, unknown> = {
      status:     status || 'error',
      updated_at: new Date().toISOString(),
    };

    if (resultado_json)    update.resultado_json    = resultado_json;
    if (mensagem_whatsapp) update.mensagem_whatsapp = mensagem_whatsapp;
    if (error_message)     update.error_message     = error_message;

    const { error } = await supabase
      .from('analises')
      .update(update)
      .eq('job_id', job_id);

    if (error) {
      console.error('[CALLBACK] update error:', error.message);
      return new Response('db_error', { status: 500 });
    }

    console.log(`[CALLBACK] job ${job_id} → ${status}`);
    return new Response('ok', { status: 200 });

  } catch (err) {
    console.error('[CALLBACK] error:', err);
    return new Response('error', { status: 500 });
  }
});
