// evolution-bridge.js — cliente fino do Bridge para o status do WhatsApp (Evolution).
//
// O Hermes NUNCA fala direto com a Evolution. Chama o Bridge:
//   GET {BRIDGE_URL}/api/evolution/status   (header x-internal-token)
// SÓ LEITURA de status — envio a cliente é draft + aprovação, fora deste MCP.
'use strict';

class BridgeError extends Error {
  constructor(message, status) { super(message); this.name = 'BridgeError'; this.status = status; }
}

function qs(params) {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params || {})) {
    if (v !== undefined && v !== null && String(v).trim() !== '') usp.append(k, String(v));
  }
  const s = usp.toString();
  return s ? `?${s}` : '';
}

function makeEvolutionBridge({ bridgeUrl, internalToken, timeoutMs = 25000 }) {
  const base = bridgeUrl.replace(/\/$/, '');

  async function get(path, params) {
    const url = `${base}/api/evolution${path}${qs(params)}`;
    let res;
    try {
      res = await fetch(url, {
        method: 'GET',
        headers: { 'x-internal-token': internalToken, accept: 'application/json' },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (e) {
      throw new BridgeError(`Bridge inacessível em ${path}: ${e.message}`, 503);
    }
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      const msg = (json && (json.error || json.message)) || `Bridge retornou ${res.status}`;
      throw new BridgeError(msg, res.status);
    }
    return json;
  }

  return { status: (params) => get('/status', params) };
}

module.exports = { makeEvolutionBridge, BridgeError };
