// Supabase Edge Function — Busca foto de perfil da Evolution API
// e salva no Supabase Storage, retornando URL pública permanente.
// Busca diretamente da Evolution no momento da chamada, evitando URLs expiradas.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const EVO_URL = Deno.env.get('EVOLUTION_URL') || '';
const EVO_KEY = Deno.env.get('EVOLUTION_KEY') || '';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...corsHeaders } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: corsHeaders });

  // Verify caller JWT
  const authHeader = req.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '');
  if (!token) return json({ error: 'Unauthorized' }, 401);

  const { data: { user: caller }, error: authErr } =
    await supabaseAdmin.auth.getUser(token);
  if (authErr || !caller) return json({ error: 'Unauthorized' }, 401);

  let body: { instanceName?: string; phone?: string; conversationId?: string };
  try { body = await req.json(); }
  catch { return json({ error: 'Invalid JSON' }, 400); }

  const { instanceName, phone, conversationId } = body;
  if (!instanceName || !phone || !conversationId) {
    return json({ error: 'instanceName, phone and conversationId are required' }, 400);
  }

  try {
    // 1. Busca perfil da Evolution API diretamente (URL ainda válida)
    const profileRes = await fetch(`${EVO_URL}/chat/fetchProfile/${instanceName}/${phone}`, {
      headers: {
        'Content-Type': 'application/json',
        'apikey': EVO_KEY,
      },
    });
    if (!profileRes.ok) throw new Error(`Evolution fetchProfile failed: ${profileRes.status}`);

    const profileData = await profileRes.json();
    const photoUrl = profileData?.picture || profileData?.profilePictureUrl || profileData?.imgUrl
      || profileData?.profilePic || profileData?.profilePicUrl || profileData?.image || null;

    if (!photoUrl) {
      return json({ error: 'No profile picture available' }, 404);
    }

    // 2. Baixa imagem imediatamente (URL ainda fresca)
    const imgRes = await fetch(photoUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!imgRes.ok) throw new Error(`Failed to download image: ${imgRes.status}`);

    const contentType = imgRes.headers.get('content-type') || 'image/jpeg';
    const arrayBuffer = await imgRes.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);

    // 3. Gera nome do arquivo
    const safePhone = phone.replace(/\D/g, '');
    const ext = contentType.includes('png') ? 'png' : 'jpg';
    const filename = `${safePhone}.${ext}`;
    const bucketPath = `profile-pics/${filename}`;

    // 4. Upload para Supabase Storage
    const { error: uploadErr } = await supabaseAdmin.storage
      .from('public')
      .upload(bucketPath, bytes, {
        contentType,
        upsert: true,
      });

    if (uploadErr) throw uploadErr;

    // 5. Obtém URL pública
    const { data: { publicUrl } } = supabaseAdmin.storage
      .from('public')
      .getPublicUrl(bucketPath);

    // 6. Atualiza conversa no banco
    await supabaseAdmin
      .from('conversations')
      .update({ push_photo_url: publicUrl })
      .eq('id', conversationId);

    return json({ publicUrl });
  } catch (err) {
    console.error('[persist-profile-pic] error:', err);
    return json({ error: err instanceof Error ? err.message : 'Failed to persist profile picture' }, 500);
  }
});
