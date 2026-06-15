// ─────────────────────────────────────────────────────────────────────────────
// vendaerp-bridge.js — cliente fino do Bridge para os endpoints do VendaERP.
//
// O Hermes NUNCA fala direto com o ERP. Ele chama o Bridge:
//   GET {BRIDGE_URL}/api/vendaerp/<dominio>   (header x-internal-token)
// e o Bridge injeta a credencial real (3 headers) via bridge-server/lib/vendaerp.js.
//
// Fase 1 = só GET (leitura). Não há método de escrita aqui de propósito: a mutação
// simplesmente não existe, então o Hermes não consegue chamá-la (enforcement
// estrutural). Escrita + confirmação no Telegram = Fase 2.
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

class BridgeError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'BridgeError';
    this.status = status;
  }
}

/** Monta querystring omitindo undefined/null/''. */
function qs(params) {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params || {})) {
    if (v !== undefined && v !== null && String(v).trim() !== '') usp.append(k, String(v));
  }
  const s = usp.toString();
  return s ? `?${s}` : '';
}

function makeErpBridge({ bridgeUrl, internalToken, timeoutMs = 25000 }) {
  const base = bridgeUrl.replace(/\/$/, '');

  /** GET genérico em /api/vendaerp/<path>; devolve o `data` do envelope {ok,data}. */
  async function get(path, params) {
    const url = `${base}/api/vendaerp${path}${qs(params)}`;
    let res;
    try {
      res = await fetch(url, {
        method: 'GET',
        headers: { 'x-internal-token': internalToken, accept: 'application/json' },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (e) {
      // rede/timeout — o Bridge não respondeu
      throw new BridgeError(`Bridge inacessível em ${path}: ${e.message}`, 503);
    }

    const json = await res.json().catch(() => null);
    if (!res.ok || (json && json.ok === false)) {
      const msg = (json && (json.error || json.message)) || `Bridge retornou ${res.status}`;
      const status = (json && json.status) || res.status;
      throw new BridgeError(msg, status);
    }
    return json && Object.prototype.hasOwnProperty.call(json, 'data') ? json.data : json;
  }

  /** POST genérico em /api/vendaerp/<path>; devolve o `data` do envelope {ok,data}. */
  async function post(path, body) {
    const url = `${base}/api/vendaerp${path}`;
    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: {
          'x-internal-token': internalToken,
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify(body ?? {}),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (e) {
      throw new BridgeError(`Bridge inacessível em POST ${path}: ${e.message}`, 503);
    }
    const json = await res.json().catch(() => null);
    if (!res.ok || (json && json.ok === false)) {
      const msg = (json && (json.error || json.message)) || `Bridge retornou ${res.status}`;
      const status = (json && json.status) || res.status;
      throw new BridgeError(msg, status);
    }
    return json && Object.prototype.hasOwnProperty.call(json, 'data') ? json.data : json;
  }

  return {
    // ── Saúde / credencial ────────────────────────────────────────────────────
    status: () => get('/status'),
    // ── Escrita genérica (Fase 2) — endpoint vem da proposta ───────────────────
    post,
    // ── Contratos ───────────────────────────────────────────────────────────────
    contratos: (params) => get('/contratos', params),
    // ── Financeiro ───────────────────────────────────────────────────────────────
    lancamentos: (params) => get('/lancamentos', params),
    boletos: (params) => get('/boletos', params),
    // ── Estoque ─────────────────────────────────────────────────────────────────
    estoque: (params) => get('/estoque', params),
    depositos: () => get('/depositos'),
    // ── Fiscal ───────────────────────────────────────────────────────────────────
    fiscal: (params) => get('/fiscal', params),
    // ── CRM ─────────────────────────────────────────────────────────────────────
    oportunidades: (params) => get('/oportunidades', params),
    // ── Auxiliares ───────────────────────────────────────────────────────────────
    empresas: () => get('/empresas'),
    formasPagamento: () => get('/formas-pagamento'),
  };
}

module.exports = { makeErpBridge, BridgeError };
