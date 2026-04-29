// Supabase Edge Function — Evolution API Webhook Receiver
// TASK-201 — Chat Unificado
//
// Deploy: supabase functions deploy evolution-webhook
// URL:    https://<project>.supabase.co/functions/v1/evolution-webhook

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

Deno.serve(async (req) => {
  // Aceita somente POST
  if (req.method !== 'POST') {
    return new Response('ok', { status: 200 });
  }

  try {
    const body = await req.json();
    console.log('[WEBHOOK] payload:', JSON.stringify(body));
    const { event, instance, data } = body;

    // Evolution API envia "messages.upsert" (minúsculo, notação ponto)
    // Normaliza para aceitar ambos os formatos
    const eventNorm = (event || '').toLowerCase().replace(/[._]/g, '');
    if (eventNorm !== 'messagesupsert') {
      return new Response('ignored', { status: 200 });
    }

    // data pode chegar como array (Evolution API v2) ou objeto
    const msgData = Array.isArray(data) ? data[0] : data;

    if (!msgData?.key) {
      return new Response('no_key', { status: 200 });
    }

    // Ignora mensagens enviadas pelo próprio número
    if (msgData.key.fromMe) {
      return new Response('fromMe', { status: 200 });
    }

    const chatId   = msgData.key.remoteJid;             // ex: 5511999@s.whatsapp.net ou grupo@g.us
    const isGroup  = chatId.endsWith('@g.us');
    const msgId    = msgData.key.id;
    const pushName = msgData.pushName || 'Desconhecido';

    const messageText =
      msgData.message?.conversation ||
      msgData.message?.extendedTextMessage?.text ||
      msgData.message?.imageMessage?.caption ||
      msgData.message?.videoMessage?.caption ||
      msgData.message?.documentMessage?.title ||
      '';

    // 1. Buscar instância no banco (sem tenant_id)
    const { data: instanceData, error: instErr } = await supabase
      .from('evolution_instances')
      .select('id')
      .eq('instance_name', instance)
      .single();

    if (instErr || !instanceData) {
      console.warn('Instance not found:', instance, instErr?.message);
      return new Response('instance_not_found', { status: 404 });
    }

    // 2. Buscar ou criar conversa
    let conversationId: string;

    const { data: existingConv } = await supabase
      .from('conversations')
      .select('id')
      .eq('whatsapp_chat_id', chatId)
      .eq('instance_id', instanceData.id)
      .maybeSingle();

    const validPushName = pushName && pushName !== 'Desconhecido' ? pushName : null;

    if (existingConv) {
      conversationId = existingConv.id;
      // Atualiza updated_at e push_name (se disponível) para manter ordenação por mais recente
      const upd: Record<string, string | null> = { updated_at: new Date().toISOString() };
      if (!isGroup && validPushName) upd.push_name = validPushName;
      await supabase.from('conversations').update(upd).eq('id', conversationId);
    } else {
      const { data: newConv, error: convErr } = await supabase
        .from('conversations')
        .insert({
          instance_id:      instanceData.id,
          whatsapp_chat_id: chatId,
          is_group:         isGroup,
          group_name:       isGroup ? (validPushName || chatId) : null,
          push_name:        isGroup ? null : validPushName,
        })
        .select('id')
        .single();

      if (convErr || !newConv) {
        console.error('Failed to create conversation:', convErr?.message);
        return new Response('conv_error', { status: 500 });
      }
      conversationId = newConv.id;
    }

    // 3. Salvar mensagem com schema correto
    const msgTimestamp = msgData.messageTimestamp
      ? new Date(Number(msgData.messageTimestamp) * 1000).toISOString()
      : new Date().toISOString();

    const { error: msgErr } = await supabase.from('messages').insert({
      conversation_id: conversationId,
      whatsapp_msg_id: msgId,
      direction:       'inbound',
      sender_name:     pushName,
      content:         messageText,
      created_at:      msgTimestamp,
    });

    if (msgErr) {
      console.error('Failed to save message:', msgErr.message);
      return new Response('msg_error', { status: 500 });
    }

    return new Response('ok', { status: 200 });
  } catch (err) {
    console.error('Webhook error:', err);
    return new Response('error', { status: 500 });
  }
});
