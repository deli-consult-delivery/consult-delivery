// Supabase Edge Function — Evolution API Webhook Receiver
// TASK-201 — Chat Unificado
//
// Deploy: supabase functions deploy evolution-webhook

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('ok', { status: 200 });
  }

  try {
    const body = await req.json();
    console.log('[WEBHOOK] payload:', JSON.stringify(body));
    const { event, instance, data } = body;

    const eventNorm = (event || '').toLowerCase().replace(/[._]/g, '');
    if (eventNorm !== 'messagesupsert') {
      return new Response('ignored', { status: 200 });
    }

    const msgData = Array.isArray(data) ? data[0] : data;

    if (!msgData?.key) {
      return new Response('no_key', { status: 200 });
    }

    if (msgData.key.fromMe) {
      return new Response('fromMe', { status: 200 });
    }

    const chatId   = msgData.key.remoteJid;
    const isGroup  = chatId.endsWith('@g.us');
    const msgId    = msgData.key.id;
    const pushName = msgData.pushName || 'Desconhecido';

    const isPtt      = !!msgData.message?.pttMessage;
    const isAudio    = isPtt || !!msgData.message?.audioMessage;
    const isImage    = !!msgData.message?.imageMessage;
    const isVideo    = !!msgData.message?.videoMessage;
    const isDocument = !!msgData.message?.documentMessage;
    const isMedia    = isAudio || isImage || isVideo || isDocument;

    const mediaMsg = msgData.message?.pttMessage
      || msgData.message?.audioMessage
      || msgData.message?.imageMessage
      || msgData.message?.videoMessage
      || msgData.message?.documentMessage;

    let detectedMediaType: string | null = null;
    if (isAudio)    detectedMediaType = 'audio';
    else if (isImage)    detectedMediaType = 'image';
    else if (isVideo)    detectedMediaType = 'video';
    else if (isDocument) detectedMediaType = 'document';

    const messageText = isAudio    ? '🎵 Áudio'
      : isImage    ? (msgData.message?.imageMessage?.caption    || '🖼 Imagem')
      : isVideo    ? (msgData.message?.videoMessage?.caption    || '🎬 Vídeo')
      : isDocument ? (msgData.message?.documentMessage?.title   || '📄 Documento')
      : msgData.message?.conversation ||
        msgData.message?.extendedTextMessage?.text ||
        '';

    // 1. Buscar instância — inclui evolution_url e api_key para download de mídia
    const { data: instanceData, error: instErr } = await supabase
      .from('evolution_instances')
      .select('id, evolution_url, api_key')
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

    // 3. Salvar mensagem IMEDIATAMENTE — nunca bloquear por causa do áudio
    const msgTimestamp = msgData.messageTimestamp
      ? new Date(Number(msgData.messageTimestamp) * 1000).toISOString()
      : new Date().toISOString();

    const { data: savedMsg, error: msgErr } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversationId,
        whatsapp_msg_id: msgId,
        direction:       'inbound',
        sender_name:     pushName,
        content:         messageText,
        media_type:      detectedMediaType,
        media_url:       null,
        created_at:      msgTimestamp,
      })
      .select('id')
      .single();

    if (msgErr) {
      console.error('Failed to save message:', msgErr.message);
      return new Response('msg_error', { status: 500 });
    }

    // 4. SEPARADO: tenta buscar base64 de qualquer mídia com timeout de 10s
    //    Falha aqui NUNCA afeta a mensagem — ela já foi salva acima
    if (isMedia && savedMsg) {
      try {
        let messageType = '';
        if (isPtt)           messageType = 'pttMessage';
        else if (isAudio)    messageType = 'audioMessage';
        else if (isImage)    messageType = 'imageMessage';
        else if (isVideo)    messageType = 'videoMessage';
        else if (isDocument) messageType = 'documentMessage';

        const controller = new AbortController();
        const timer      = setTimeout(() => controller.abort(), 10_000);

        const mediaRes = await fetch(
          `${instanceData.evolution_url}/chat/getBase64FromMediaMessage/${instance}`,
          {
            method:  'POST',
            headers: { 'Content-Type': 'application/json', apikey: instanceData.api_key },
            body:    JSON.stringify({
              message: { key: msgData.key, messageType },
              convertToMp4: false,
            }),
            signal: controller.signal,
          },
        );
        clearTimeout(timer);

        if (mediaRes.ok) {
          const mediaJson = await mediaRes.json();
          const base64    = mediaJson.base64 || mediaJson.data;
          if (base64) {
            const defaultMime = isImage ? 'image/jpeg' : isVideo ? 'video/mp4'
              : isDocument ? 'application/octet-stream' : 'audio/ogg';
            const mimeRaw  = mediaMsg?.mimetype || defaultMime;
            const mime     = mimeRaw.split(';')[0].trim();
            const mediaUrl = `data:${mime};base64,${base64}`;
            await supabase
              .from('messages')
              .update({ media_url: mediaUrl })
              .eq('id', savedMsg.id);
            console.log('[WEBHOOK] media ok, type:', detectedMediaType, 'mime:', mime, 'b64 len:', base64.length);
          } else {
            console.warn('[WEBHOOK] getBase64 sem campo base64:', JSON.stringify(mediaJson));
          }
        } else {
          console.warn('[WEBHOOK] getBase64 status:', mediaRes.status);
        }
      } catch (mediaErr) {
        // timeout ou erro de rede — mensagem já está salva, tudo bem
        console.warn('[WEBHOOK] media fetch falhou, mensagem salva sem mídia:', mediaErr);
      }
    }

    return new Response('ok', { status: 200 });

  } catch (err) {
    console.error('Webhook error:', err);
    return new Response('error', { status: 500 });
  }
});
