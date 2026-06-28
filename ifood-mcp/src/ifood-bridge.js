// ifood-bridge.js — cliente fino do Bridge para os endpoints de leitura do iFood.
//
// O Hermes NUNCA fala direto com a API do iFood. Ele chama o Bridge:
//   GET {BRIDGE_URL}/api/ifood/<recurso>   (header x-internal-token)
// e o Bridge resolve tenant/merchant e injeta a credencial (client_credentials).
// SÓ LEITURA: nenhum método de escrita aqui (escrita = fase futura, via rota Bridge).
'use strict';

class BridgeError extends Error {
  constructor(message, status, details) {
    super(message);
    this.name = 'BridgeError';
    this.status = status;
    this.details = details ?? null;
  }
}

function montarMensagemErro(json, statusHttp) {
  const base = (json && (json.error || json.message)) || `Bridge retornou ${statusHttp}`;
  const det = json && typeof json.details === 'string' ? json.details.trim() : '';
  return det ? `${base} — ${det}` : base;
}

/** Querystring omitindo undefined/null/''. */
function qs(params) {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params || {})) {
    if (v !== undefined && v !== null && String(v).trim() !== '') usp.append(k, String(v));
  }
  const s = usp.toString();
  return s ? `?${s}` : '';
}

function makeIfoodBridge({ bridgeUrl, internalToken, timeoutMs = 25000 }) {
  const base = bridgeUrl.replace(/\/$/, '');

  /** GET genérico em /api/ifood/<path>; devolve o corpo (data ou envelope). */
  async function get(path, params) {
    const url = `${base}/api/ifood${path}${qs(params)}`;
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
    if (!res.ok || (json && json.ok === false)) {
      const status = (json && json.status) || res.status;
      throw new BridgeError(montarMensagemErro(json, res.status), status, json && json.details);
    }
    return json && Object.prototype.hasOwnProperty.call(json, 'data') ? json.data : json;
  }

  return {
    status: (params) => get('/ifood/status', params),
    catalogo: (params) => get('/ifood/catalogo', params),
    cardapio: (params) => get('/ifood/cardapio', params),
    reviews: (params) => get('/ifood/reviews', params),
    vendas: (params) => get('/ifood/vendas', params),
  };
}

module.exports = { makeIfoodBridge, BridgeError };
