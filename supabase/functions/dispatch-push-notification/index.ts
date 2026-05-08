import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
// @ts-ignore — web-push exposes CJS; esm.sh wraps it for Deno
import webpush from 'npm:web-push@3';

const VAPID_PUBLIC  = Deno.env.get('VAPID_PUBLIC_KEY')!;
const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY')!;
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:contato@consultdelivery.com.br';

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      },
    });
  }

  try {
    const { tenant_id, target_user_ids, title, body, tag, route } = await req.json() as {
      tenant_id: string;
      target_user_ids: string[];
      title: string;
      body: string;
      tag?: string;
      route?: string;
    };

    if (!tenant_id || !target_user_ids?.length) {
      return new Response(
        JSON.stringify({ error: 'tenant_id and target_user_ids required' }),
        { status: 400 },
      );
    }

    // Respect per-user push preferences
    const { data: prefs } = await supabaseAdmin
      .from('notification_preferences')
      .select('user_id, push_enabled')
      .in('user_id', target_user_ids);

    const disabledUsers = new Set(
      (prefs ?? []).filter(p => !p.push_enabled).map(p => p.user_id),
    );
    const eligible = target_user_ids.filter(uid => !disabledUsers.has(uid));

    if (!eligible.length) {
      return new Response(JSON.stringify({ sent: 0, skipped: target_user_ids.length }));
    }

    const { data: subs } = await supabaseAdmin
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth_key, user_id')
      .in('user_id', eligible)
      .eq('tenant_id', tenant_id);

    if (!subs?.length) {
      return new Response(JSON.stringify({ sent: 0, skipped: 0 }));
    }

    const pushPayload = JSON.stringify({
      title,
      body,
      tag:   tag   ?? 'cd-notif',
      route: route ?? 'chat',
    });

    const results = await Promise.allSettled(
      subs.map(sub =>
        webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } },
          pushPayload,
        ),
      ),
    );

    // Clean up stale subscriptions (push service returns 410 Gone)
    const stale: string[] = [];
    results.forEach((r, i) => {
      if (r.status === 'rejected') {
        const statusCode = (r.reason as { statusCode?: number })?.statusCode;
        if (statusCode === 410) stale.push(subs[i].endpoint);
      }
    });
    if (stale.length) {
      await supabaseAdmin.from('push_subscriptions').delete().in('endpoint', stale);
    }

    const sent = results.filter(r => r.status === 'fulfilled').length;
    return new Response(JSON.stringify({ sent, total: subs.length }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('dispatch-push-notification error:', err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
