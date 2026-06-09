// cd_status — semáforo geral: bridge online? banco alcançável? (design §3.1)
// Tool de INFRA: não toca tenant específico → auditada como 'platform'.
'use strict';

async function fetchWithTimeout(url, ms) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

module.exports = {
  name: 'cd_status',
  title: 'Status da plataforma',
  description:
    'Semáforo geral da Consult Delivery: bridge server online, banco alcançável. ' +
    'Não retorna segredos. Visão de saúde para o CEO.',
  inputShape: {}, // sem argumentos
  /** @returns {Promise<{summary:string, tenantIds:string[], data:object}>} */
  async handler(_args, { sb, cfg }) {
    // 1) Bridge /health
    let bridge = { online: false, detail: null };
    try {
      const r = await fetchWithTimeout(`${cfg.bridgeUrl}/health`, 3000);
      bridge.online = r.ok;
      bridge.detail = await r.text().catch(() => null);
    } catch (e) {
      bridge.detail = e.name === 'AbortError' ? 'timeout' : e.message;
    }

    // 2) Ping no banco (qualquer SELECT trivial via service_role)
    let db = { reachable: false };
    try {
      await sb.sbGet('tenants', 'select=id&limit=1');
      db.reachable = true;
    } catch (e) {
      db.reachable = false;
      db.detail = e.message;
    }

    const semaforo = bridge.online && db.reachable ? 'verde' : 'vermelho';
    return {
      summary: `semaforo=${semaforo} bridge=${bridge.online ? 'on' : 'off'} db=${db.reachable ? 'ok' : 'down'}`,
      tenantIds: [],
      data: { semaforo, bridge, db, checked_at: new Date().toISOString() },
    };
  },
};
