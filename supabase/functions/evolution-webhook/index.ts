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
    const { event, instance, data } = body;

    // Só processa mensagens recebidas
    if (event !== 'messages.upsert') {
      return new Response('ignored', { status: 200 });
    }
    if (!data?.key || data.key.fromMe) {
      return new Response('fromMe', { status: 200 });
    }

    const chatId      = data.key.remoteJid; // ex: 5511999@s.whatsapp.net ou grupo@g.us
    const isGroup     = chatId.endsWith('@g.us');
    const messageText =
      data.message?.conversation ||
      data.message?.extendedTextMessage?.text ||
      data.message?.imageMessage?.caption ||
      '';
    const pushName = data.pushName || 'Desconhecido';
    const msgId    = data.key.id;

    // 1. Buscar instância no banco
    const { data: instanceData, error: instErr } = await supabase
      .from('evolution_instances')
      .select('id, tenant_id')
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
      .select('id, unread_count')
      .eq('whatsapp_chat_id', chatId)
      .eq('instance_id', instanceData.id)
      .maybeSingle();

    if (existingConv) {
      conversationId = existingConv.id;
      await supabase
        .from('conversations')
        .update({
          unread_count:    (existingConv.unread_count || 0) + 1,
          last_message_at: new Date().toISOString(),
          preview:         messageText.slice(0, 80),
        })
        .eq('id', conversationId);
    } else {
      const { data: newConv, error: convErr } = await supabase
        .from('conversations')
        .insert({
          tenant_id:        instanceData.tenant_id,
          instance_id:      instanceData.id,
          whatsapp_chat_id: chatId,
          type:             'whatsapp',
          is_group:         isGroup,
          group_name:       isGroup ? chatId : null,
          title:            isGroup ? chatId : pushName,
          status:           'open',
          unread_count:     1,
          last_message_at:  new Date().toISOString(),
          preview:          messageText.slice(0, 80),
        })
        .select('id')
        .single();

      if (convErr || !newConv) {
        console.error('Failed to create conversation:', convErr?.message);
        return new Response('conv_error', { status: 500 });
      }
      conversationId = newConv.id;
    }

    // 3. Buscar ou criar customer (somente para chats individuais)
    if (!isGroup) {
      const phone = chatId.split('@')[0];
      const { data: existingCustomer } = await supabase
        .from('customers')
        .select('id')
        .eq('phone', phone)
        .eq('tenant_id', instanceData.tenant_id)
        .maybeSingle();

      if (!existingCustomer) {
        await supabase.from('customers').insert({
          tenant_id: instanceData.tenant_id,
          name:      pushName,
          phone,
          avatar:    pushName
            .split(' ')
            .map((w: string) => w[0])
            .join('')
            .slice(0, 2)
            .toUpperCase(),
        });
      }
    }

    // 4. Salvar mensagem
    const { error: msgErr } = await supabase.from('messages').insert({
      tenant_id:       instanceData.tenant_id,
      conversation_id: conversationId,
      direction:       'inbound',
      sender_kind:     'customer',
      body:            messageText,
      whatsapp_msg_id: msgId,
      sent_at:         new Date((data.messageTimestamp || Date.now() / 1000) * 1000).toISOString(),
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
