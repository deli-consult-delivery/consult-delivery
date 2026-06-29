// asaas-bridge.js — cliente fino do Bridge para os endpoints de leitura do Asaas.
//
// O Hermes NUNCA fala direto com a API do Asaas. Chama o Bridge:
//   GET {BRIDGE_URL}/api/asaas/<recurso>   (header x-internal-token)
// e o Bridge injeta a credencial (ASAAS_API_KEY vive só no Bridge). SÓ LEITURA.
'use strict';

class BridgeError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'BridgeError';
    this.status = status;
  }
}

function qs(params) {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params || {})) {
    if (v !== undefined && v !== null && String(v).trim() !== '') usp.append(k, String(v));
  }
  const s = usp.toString();
  return s ? `?${s}` : '';
}

function makeAsaasBridge({ bridgeUrl, internalToken, timeoutMs = 25000 }) {
  const base = bridgeUrl.replace(/\/$/, '');

  async function get(path, params) {
    const url = `${base}/api/asaas${path}${qs(params)}`;
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

  return {
    saldo: () => get('/asaas/saldo'),
    situacaoMes: (params) => get('/asaas/situacao-mes', params),
  };
}

module.exports = { makeAsaasBridge, BridgeError };
