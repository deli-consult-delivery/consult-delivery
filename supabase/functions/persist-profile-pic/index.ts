// Supabase Edge Function — Baixa foto de perfil da Evolution API
// e salva no Supabase Storage, retornando URL pública permanente.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

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

  let body: { photoUrl?: string; phone?: string; conversationId?: string };
  try { body = await req.json(); }
  catch { return json({ error: 'Invalid JSON' }, 400); }

  const { photoUrl, phone, conversationId } = body;
  if (!photoUrl || !phone || !conversationId) {
    return json({ error: 'photoUrl, phone and conversationId are required' }, 400);
  }

  try {
    // Download image from Evolution API
    const imgRes = await fetch(photoUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!imgRes.ok) throw new Error(`Failed to download image: ${imgRes.status}`);

    const contentType = imgRes.headers.get('content-type') || 'image/jpeg';
    const arrayBuffer = await imgRes.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);

    // Generate safe filename
    const safePhone = phone.replace(/\D/g, '');
    const ext = contentType.includes('png') ? 'png' : 'jpg';
    const filename = `${safePhone}.${ext}`;
    const bucketPath = `profile-pics/${filename}`;

    // Upload to Supabase Storage
    const { error: uploadErr } = await supabaseAdmin.storage
      .from('public')
      .upload(bucketPath, bytes, {
        contentType,
        upsert: true,
      });

    if (uploadErr) throw uploadErr;

    // Get public URL
    const { data: { publicUrl } } = supabaseAdmin.storage
      .from('public')
      .getPublicUrl(bucketPath);

    // Update conversation in DB
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
