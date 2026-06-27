// bridge-server/lib/ifood.js
// Cliente de LEITURA da API do iFood (merchant-api.ifood.com.br).
// Espelha o padrão de lib/vendaerp.js: config lazy, withRetry em 429/5xx,
// fetch base que injeta auth e lança erro tipado. Schemas Zod TOLERANTES
// (.passthrough) — refinar após o 1º retorno real.
//
// AUTH = Centralized / client_credentials (decisão §3 do PLANO-INTEGRACAO-IFOOD):
// 1 par clientId+clientSecret (nível CD, no Infisical/env do Bridge) → accessToken (6h).
// NÃO há refresh_token: renovar = pedir token novo com as mesmas credenciais.
// Token único da integradora, cacheado em memória + single-flight (não por loja).
//
// SEGURANÇA: clientId/clientSecret vivem SÓ no env do Bridge. Console e Hermes
// chamam /api/ifood/* e o Bridge injeta o Bearer.
//
// Fase 1 = MVP read-only. Escrita (pausar item/loja, responder review) é Fase 2+.
'use strict';

const { z } = require('zod');

// ---------------------------------------------------------------------------
// Erro customizado
// ---------------------------------------------------------------------------
class IfoodApiError extends Error {
  constructor(message, status, body) {
    super(message);
    this.name = 'IfoodApiError';
    this.status = status; // 0 = rede/timeout/credencial ausente; 4xx/5xx = HTTP do iFood
    this.body = body; // corpo de erro do iFood (regra de negócio)
  }
}

// ---------------------------------------------------------------------------
// Config lazy — lida dentro de cada chamada, nunca no topo do módulo.
// Centralized: 1 par clientId+clientSecret (nível CD). O parâmetro tenantId já
// existe na assinatura para a Fase 4 (resolução por tenant) — zero mudança de
// assinatura na virada.
// ---------------------------------------------------------------------------
function getIfoodConfig(_tenantId) {
  const baseUrl = (process.env.IFOOD_BASE_URL || 'https://merchant-api.ifood.com.br').replace(/\/+$/, '');
  const clientId = process.env.IFOOD_CLIENT_ID;
  const clientSecret = process.env.IFOOD_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new IfoodApiError(
      'Credencial iFood ausente. Configure IFOOD_CLIENT_ID e IFOOD_CLIENT_SECRET no Infisical/env do Bridge.',
      0,
      null
    );
  }
  return { baseUrl, clientId, clientSecret };
}

// ---------------------------------------------------------------------------
// Token — Centralized / client_credentials. Cache em memória + single-flight.
// Renova quando faltar < 5 min para expirar. Sem refresh_token: pede token novo.
// ponytail: cache in-process basta para 1 instância do Bridge; multi-instância
// pode pedir 1 token por processo (aceitável — o iFood não rotaciona credencial).
// ---------------------------------------------------------------------------
const TOKEN_PATH = '/authentication/v1.0/oauth/token';
const RENEW_SKEW_MS = 5 * 60 * 1000; // renova com 5 min de folga
const tokenCache = { token: null, expiresAt: 0 };
let tokenInFlight = null; // single-flight: 1 Promise compartilhada sob concorrência

async function requestNewToken(tenantId) {
  const { baseUrl, clientId, clientSecret } = getIfoodConfig(tenantId);
  const body = new URLSearchParams({
    grantType: 'client_credentials',
    clientId,
    clientSecret,
  });

  let response;
  try {
    response = await fetch(`${baseUrl}${TOKEN_PATH}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    throw new IfoodApiError(`iFood auth indisponível: ${err.message}`, 0, null);
  }

  const text = await response.text();
  let parsed;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  if (!response.ok) {
    throw new IfoodApiError(
      `iFood auth retornou ${response.status}: ${response.statusText}`,
      response.status,
      parsed
    );
  }

  const accessToken = parsed?.accessToken;
  const expiresIn = Number(parsed?.expiresIn) || 21600; // 6h default
  if (!accessToken) {
    throw new IfoodApiError('iFood auth não retornou accessToken', response.status, parsed);
  }
  tokenCache.token = accessToken;
  tokenCache.expiresAt = Date.now() + expiresIn * 1000;
  return accessToken;
}

async function getAccessToken(tenantId) {
  const valid = tokenCache.token && tokenCache.expiresAt - Date.now() > RENEW_SKEW_MS;
  if (valid) return tokenCache.token;
  if (tokenInFlight) return tokenInFlight; // coalesce chamadas concorrentes
  tokenInFlight = requestNewToken(tenantId).finally(() => {
    tokenInFlight = null;
  });
  return tokenInFlight;
}

// ---------------------------------------------------------------------------
// Retry — só em 429 (rate limit) e 5xx. 4xx (exceto 429) e status 0 = não retenta.
// ---------------------------------------------------------------------------
function shouldRetry(status) {
  return status === 429 || status >= 500;
}

async function withRetry(fn, maxAttempts = 3) {
  const delaysMs = [0, 1000, 2000];
  let lastError = null;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const delay = delaysMs[attempt] ?? 2000;
    if (delay > 0) await new Promise((r) => setTimeout(r, delay));
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (err instanceof IfoodApiError && !shouldRetry(err.status)) throw err;
      if (attempt === maxAttempts - 1) throw err;
    }
  }
  throw lastError ?? new IfoodApiError('withRetry esgotou tentativas', 0, null);
}

// ---------------------------------------------------------------------------
// Fetch base — injeta Authorization: Bearer + Content-Type/accept, timeout 15s.
// `path` já inclui o prefixo da API (cada módulo iFood tem o seu: /merchant/v1.0,
// /catalog/v2.0, /financial/v3.0, /review/v2.0).
// ---------------------------------------------------------------------------
async function ifoodFetch(path, { method = 'GET', query, body } = {}, tenantId) {
  const { baseUrl } = getIfoodConfig(tenantId);
  const token = await getAccessToken(tenantId);
  const url = `${baseUrl}${path}${qs(query)}`;

  const headers = {
    accept: 'application/json',
    Authorization: `Bearer ${token}`,
  };
  if (body !== undefined && body !== null) headers['Content-Type'] = 'application/json';

  let response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: body !== undefined && body !== null ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    // timeout / rede — status 0 (NÃO retentável). iFood fora do ar falha rápido.
    throw new IfoodApiError(`iFood indisponível: ${err.message}`, 0, null);
  }

  let parsed;
  const text = await response.text();
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text; // resposta não-JSON
  }

  if (!response.ok) {
    throw new IfoodApiError(
      `iFood API retornou ${response.status}: ${response.statusText}`,
      response.status,
      parsed
    );
  }
  return parsed;
}

// Helper p/ querystring (omite undefined/null/'').
function qs(params = {}) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params || {})) {
    if (v !== undefined && v !== null && v !== '') sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}

// ---------------------------------------------------------------------------
// Schemas tolerantes — só garantem que é objeto/array; passthrough mantém o resto.
// ---------------------------------------------------------------------------
const PassObj = z.object({}).passthrough();
const tolerant = (raw) => {
  if (Array.isArray(raw)) return z.array(PassObj).parse(raw);
  if (raw && typeof raw === 'object') return PassObj.parse(raw);
  return raw;
};

// ---------------------------------------------------------------------------
// Métodos de LEITURA (GET) — um por domínio do MVP. Prefixos confirmados no
// 00-api-reference.md (Merchant /merchant/v1.0, Catalog /catalog/v2.0,
// Financial /financial/v3.0, Review /review/v2.0).
// ---------------------------------------------------------------------------

// Catálogo — lista catálogos do merchant (→ catalogId/groupId).
async function listarCatalogos(merchantId, tenantId) {
  return withRetry(() =>
    ifoodFetch(`/catalog/v2.0/merchants/${merchantId}/catalogs`, {}, tenantId)
  ).then(tolerant);
}

// Itens vendáveis — a doc usa o param `groupId` (NÃO `catalogId`) nesta rota.
async function listarSellableItems(merchantId, groupId, tenantId) {
  return withRetry(() =>
    ifoodFetch(`/catalog/v2.0/merchants/${merchantId}/catalogs/${groupId}/sellableItems`, {}, tenantId)
  ).then(tolerant);
}

// Status da loja — aberta/fechada agora.
async function getStatusLoja(merchantId, tenantId) {
  return withRetry(() =>
    ifoodFetch(`/merchant/v1.0/merchants/${merchantId}/status`, {}, tenantId)
  ).then(tolerant);
}

// Avaliações — lista reviews da loja.
async function listarReviews(merchantId, tenantId) {
  return withRetry(() =>
    ifoodFetch(`/review/v2.0/merchants/${merchantId}/reviews`, {}, tenantId)
  ).then(tolerant);
}

// Vendas — financeiro, por período (dataInicio/dataFim → query).
async function listarVendas(merchantId, { dataInicio, dataFim } = {}, tenantId) {
  return withRetry(() =>
    ifoodFetch(
      `/financial/v3.0/merchants/${merchantId}/sales`,
      { query: { beginSalesDate: dataInicio, endSalesDate: dataFim } },
      tenantId
    )
  ).then(tolerant);
}

module.exports = {
  IfoodApiError,
  getIfoodConfig,
  getAccessToken,
  // leitura
  listarCatalogos,
  listarSellableItems,
  getStatusLoja,
  listarReviews,
  listarVendas,
};
