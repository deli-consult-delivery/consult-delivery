'use strict';
// bridge-server/notifications.js
// Helper para inserir notificações em internal_notifications via service role

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL      = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;

let _sb = null;
function sb() {
  if (!_sb) {
    _sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return _sb;
}

/**
 * Insere uma notificação interna.
 * @param {{ tenantId: string, recipientUserId?: string, kind: string, agent?: string, title: string, body?: string, link?: string, metadata?: object }} opts
 * recipientUserId = null → broadcast para todos os membros do tenant
 */
async function createNotification({ tenantId, recipientUserId = null, kind, agent = null, title, body = null, link = null, metadata = {} }) {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.warn('[notifications] SUPABASE_URL ou SERVICE_ROLE_KEY não configurados — notificação ignorada');
    return null;
  }

  const { data, error } = await sb()
    .from('internal_notifications')
    .insert({
      tenant_id:         tenantId,
      recipient_user_id: recipientUserId,
      kind,
      agent,
      title,
      body,
      link,
      metadata,
    })
    .select('id')
    .single();

  if (error) {
    console.warn('[notifications] falha ao criar notificação:', error.message);
    return null;
  }

  console.log(`[notifications] criada id=${data.id} kind=${kind} agent=${agent || '-'}`);
  return data.id;
}

module.exports = { createNotification };
