'use strict';

// ════════════════════════════════════════════════════════════════════════════
// Push notification (web push) para todos os membros de um tenant.
//
// Chama a edge function dispatch-push-notification (já deployada, cuida de
// buscar as push_subscriptions e respeitar notification_preferences.push_enabled).
//
// CANDIDATO (substitui bridge-server/lib/push-notify.js, sha256 do original 9eeade6a…da78):
//  - status não-2xx da Edge (401 segredo divergente, 4xx, 5xx) é FALHA registrada, nunca silenciosa;
//  - uma única tentativa (sem retry), com prazo (timeout) para não pendurar a rota pública que a chamou;
//  - log só com categoria e status HTTP: nunca corpo da resposta, segredo, título/corpo do push nem ids de tenant/usuário;
//  - devolve { ok, status?, reason? } (os chamadores atuais ignoram o retorno; nada muda para eles).
// ════════════════════════════════════════════════════════════════════════════

const DEFAULT_TIMEOUT_MS = 10_000;

function logFailure(reason, status) {
  console.error(`[push-notify] falha ao disparar push: ${reason}${status ? ` (status ${status})` : ''}`);
}

/**
 * @param {object} opts
 * @param {Function} opts.sbFetch  helper sbFetch do bridge
 * @param {string} opts.tenantId
 * @param {string} opts.title
 * @param {string} opts.body
 * @param {string} [opts.route]    rota do Console a abrir ao clicar
 * @param {number} [opts.timeoutMs] prazo da chamada à Edge (padrão 10 s)
 * @returns {Promise<{ok: boolean, status?: number, reason?: string, skipped?: string}>}
 */
async function pushNotifyTenant({ sbFetch, tenantId, title, body, route, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  const SUPABASE_URL         = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const BRIDGE_SECRET        = process.env.BRIDGE_SECRET || '';
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) { logFailure('NO_CONFIG'); return { ok: false, reason: 'NO_CONFIG' }; }

  try {
    const members = await sbFetch(`tenant_members?tenant_id=eq.${encodeURIComponent(tenantId)}&select=user_id`);
    const targetUserIds = (members || []).map(m => m.user_id);
    if (!targetUserIds.length) return { ok: true, skipped: 'NO_MEMBERS' };

    const response = await fetch(`${SUPABASE_URL}/functions/v1/dispatch-push-notification`, {
      method:  'POST',
      redirect: 'error',
      signal:  AbortSignal.timeout(timeoutMs),
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        ...(BRIDGE_SECRET ? { 'x-bridge-secret': BRIDGE_SECRET } : {}),
      },
      body:    JSON.stringify({ tenant_id: tenantId, target_user_ids: targetUserIds, title, body, route }),
    });
    await response.body?.cancel().catch(() => {});   // corpo nunca lido nem logado; só libera a conexão
    if (response.status >= 200 && response.status < 300) return { ok: true, status: response.status };
    // 401 = segredo Bridge/Edge divergente; 503 = segredo interno ausente na Edge; demais = erro da Edge. Sem retry.
    const reason = response.status === 401 ? 'EDGE_UNAUTHORIZED' : response.status === 503 ? 'EDGE_UNAVAILABLE' : response.status >= 500 ? 'EDGE_5XX' : 'EDGE_4XX';
    logFailure(reason, response.status);
    return { ok: false, status: response.status, reason };
  } catch (err) {
    // Só o tipo do erro: a mensagem pode carregar URL, id de tenant ou dado do request.
    const timedOut = err && (err.name === 'TimeoutError' || err.name === 'AbortError');
    const reason = timedOut ? 'TIMEOUT' : 'NETWORK_ERROR';
    logFailure(reason);
    return { ok: false, reason };
  }
}

module.exports = { pushNotifyTenant };
