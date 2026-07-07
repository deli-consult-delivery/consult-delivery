'use strict';

// ════════════════════════════════════════════════════════════════════════════
// Push notification (web push) para todos os membros de um tenant.
//
// Chama a edge function dispatch-push-notification (já deployada, cuida de
// buscar as push_subscriptions e respeitar notification_preferences.push_enabled).
// ════════════════════════════════════════════════════════════════════════════

/**
 * @param {object} opts
 * @param {Function} opts.sbFetch  helper sbFetch do bridge
 * @param {string} opts.tenantId
 * @param {string} opts.title
 * @param {string} opts.body
 * @param {string} [opts.route]    rota do Console a abrir ao clicar
 */
async function pushNotifyTenant({ sbFetch, tenantId, title, body, route }) {
  const SUPABASE_URL         = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const BRIDGE_SECRET        = process.env.BRIDGE_SECRET || '';
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return;

  try {
    const members = await sbFetch(`tenant_members?tenant_id=eq.${encodeURIComponent(tenantId)}&select=user_id`);
    const targetUserIds = (members || []).map(m => m.user_id);
    if (!targetUserIds.length) return;

    await fetch(`${SUPABASE_URL}/functions/v1/dispatch-push-notification`, {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        ...(BRIDGE_SECRET ? { 'x-bridge-secret': BRIDGE_SECRET } : {}),
      },
      body:    JSON.stringify({ tenant_id: tenantId, target_user_ids: targetUserIds, title, body, route }),
    });
  } catch (err) {
    console.error('[push-notify] falha ao disparar push:', err.message);
  }
}

module.exports = { pushNotifyTenant };
