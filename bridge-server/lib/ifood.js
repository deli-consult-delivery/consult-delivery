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
// ponytail: single-flight global, 1 credencial na F1 (getIfoodConfig ignora tenantId);
// trocar por Map<tenantId,Promise> na F4 multi-loja, quando cada tenant tiver seu par.
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
      // erro não-HTTP (Zod/config/programação) não é transitório → não retenta
      if (!(err instanceof IfoodApiError)) throw err;
      lastError = err;
      if (!shouldRetry(err.status)) throw err;
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

// Lojas — lista os merchants vinculados ao app (cada um: id + nome).
async function listarMerchants(tenantId) {
  return withRetry(() =>
    ifoodFetch(`/merchant/v1.0/merchants`, {}, tenantId)
  ).then(tolerant);
}

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

// Avaliações — resumo (contagem total/válida + nota média). Cache curto em
// memória por merchantId: o "BI de notas" da Visão Geral pode pollar essa rota
// com frequência — cache evita bater rate limit à toa (o resumo não muda a
// cada segundo). ponytail: Map em memória do processo basta (1 instância do
// Bridge); TTL curto o suficiente pra não mascarar uma review nova por muito tempo.
const summaryCache = new Map(); // merchantId -> { data, expiresAt }
const SUMMARY_CACHE_TTL_MS = 60 * 1000;

async function getSummaryReviews(merchantId, tenantId) {
  assertPathId(merchantId, 'merchantId');
  const cached = summaryCache.get(merchantId);
  if (cached && cached.expiresAt > Date.now()) return cached.data;
  const data = await withRetry(() =>
    ifoodFetch(`/review/v2.0/merchants/${merchantId}/summary`, {}, tenantId)
  ).then(tolerant);
  summaryCache.set(merchantId, { data, expiresAt: Date.now() + SUMMARY_CACHE_TTL_MS });
  return data;
}

// Vendas — financeiro, por período (dataInicio/dataFim → query, formato
// yyyy-MM-dd). Confirmado live (2026-07-05, merchant de teste): sem período
// o iFood responde 400 — beginSalesDate/endSalesDate são obrigatórios. Default
// sensato quando o chamador não informa: últimos 7 dias (hoje inclusive).
function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

async function listarVendas(merchantId, { dataInicio, dataFim } = {}, tenantId) {
  const hoje = new Date();
  const seteDiasAtras = new Date(hoje.getTime() - 7 * 24 * 60 * 60 * 1000);
  const beginSalesDate = dataInicio || isoDate(seteDiasAtras);
  const endSalesDate = dataFim || isoDate(hoje);
  return withRetry(() =>
    ifoodFetch(
      `/financial/v3.0/merchants/${merchantId}/sales`,
      { query: { beginSalesDate, endSalesDate } },
      tenantId
    )
  ).then(tolerant);
}

// ---------------------------------------------------------------------------
// Validação defensiva de IDs ANTES de interpolar na URL (anti path-traversal /
// injeção de path). Mesma regra do routes/ifood.js: só hex/alfanum + hífens
// (formato UUID do iFood). Vazio/com barra/com espaço → IfoodApiError status 0
// (erro de programação, NÃO retentável). Reusa o padrão MERCHANT_ID_RE.
// ---------------------------------------------------------------------------
const MERCHANT_ID_RE = /^[0-9A-Za-z-]+$/;

function assertPathId(value, label) {
  if (typeof value !== 'string' || !MERCHANT_ID_RE.test(value)) {
    throw new IfoodApiError(`${label} inválido (esperado UUID/alfanumérico): ${value}`, 0, null);
  }
}

// ---------------------------------------------------------------------------
// Métodos de ESCRITA (Catalog v2.0) — POST/PUT/PATCH/DELETE.
// Regra: escrita NÃO passa por withRetry (não idempotente em rede; reenvio
// cego pode duplicar/conflitar). Só GET usa withRetry. PUT /items é idempotente
// no servidor do iFood (substitui o item inteiro), mas mesmo assim sem retry de
// rede — o chamador decide reenviar.
// ---------------------------------------------------------------------------

// Categorias — lista as categorias do catálogo (leitura auxiliar; usa GET+retry).
async function listarCategorias(merchantId, catalogId, tenantId) {
  assertPathId(merchantId, 'merchantId');
  assertPathId(catalogId, 'catalogId');
  return withRetry(() =>
    ifoodFetch(
      `/catalog/v2.0/merchants/${merchantId}/catalogs/${catalogId}/categories`,
      {},
      tenantId
    )
  ).then(tolerant);
}

// Cria categoria no catálogo. template: DEFAULT (itens comuns) ou PIZZA.
async function criarCategoria(merchantId, catalogId, { name, template = 'DEFAULT' } = {}, tenantId) {
  assertPathId(merchantId, 'merchantId');
  assertPathId(catalogId, 'catalogId');
  if (typeof name !== 'string' || name.trim() === '') {
    throw new IfoodApiError('criarCategoria: name é obrigatório', 0, null);
  }
  const body = { name, status: 'AVAILABLE', template };
  return ifoodFetch(
    `/catalog/v2.0/merchants/${merchantId}/catalogs/${catalogId}/categories`,
    { method: 'POST', body },
    tenantId
  ).then(tolerant);
}

// Cria ou atualiza um item (idempotente — substitui o item inteiro).
// payload = { item, products, optionGroups, options } (os 4 sempre presentes).
async function criarOuAtualizarItem(merchantId, payload, tenantId) {
  assertPathId(merchantId, 'merchantId');
  if (!payload || typeof payload !== 'object') {
    throw new IfoodApiError('criarOuAtualizarItem: payload é obrigatório', 0, null);
  }
  return ifoodFetch(
    `/catalog/v2.0/merchants/${merchantId}/items`,
    { method: 'PUT', body: payload },
    tenantId
  ).then(tolerant);
}

// Lista os itens de uma categoria (leitura; GET+retry).
async function listarItensCategoria(merchantId, categoryId, tenantId) {
  assertPathId(merchantId, 'merchantId');
  assertPathId(categoryId, 'categoryId');
  return withRetry(() =>
    ifoodFetch(
      `/catalog/v2.0/merchants/${merchantId}/categories/${categoryId}/items`,
      {},
      tenantId
    )
  ).then(tolerant);
}

// Pausa um item (status UNAVAILABLE) via PATCH (JSON Merge Patch).
async function pausarItem(merchantId, itemId, tenantId) {
  assertPathId(merchantId, 'merchantId');
  assertPathId(itemId, 'itemId');
  return ifoodFetch(
    `/catalog/v2.0/merchants/${merchantId}/items/${itemId}`,
    { method: 'PATCH', body: { status: 'UNAVAILABLE' } },
    tenantId
  ).then(tolerant);
}

// Reabre um item (status AVAILABLE) via PATCH (JSON Merge Patch).
async function reabrirItem(merchantId, itemId, tenantId) {
  assertPathId(merchantId, 'merchantId');
  assertPathId(itemId, 'itemId');
  return ifoodFetch(
    `/catalog/v2.0/merchants/${merchantId}/items/${itemId}`,
    { method: 'PATCH', body: { status: 'AVAILABLE' } },
    tenantId
  ).then(tolerant);
}

// Deleta uma categoria (cleanup). DELETE sem corpo → tolerant() ignora null.
async function deletarCategoria(merchantId, categoryId, tenantId) {
  assertPathId(merchantId, 'merchantId');
  assertPathId(categoryId, 'categoryId');
  return ifoodFetch(
    `/catalog/v2.0/merchants/${merchantId}/categories/${categoryId}`,
    { method: 'DELETE' },
    tenantId
  ).then(tolerant);
}

// Responde uma avaliação (review) — mensagem PÚBLICA ao cliente do lojista.
// Path confirmado no 00-api-reference.md (POST /review/v2.0/merchants/{merchantId}/reviews/{reviewId}/answers).
// Corpo `{ text }` segue o schema documentado da API iFood — ainda NÃO confirmado
// contra uma chamada real (doc capturada do portal não detalha o schema de resposta);
// ajustar aqui se o 1º smoke live devolver 4xx de validação.
// SEM retry: POST não é idempotente (reenvio duplicaria a resposta pública ao cliente).
// Escrita gated: NUNCA chamar direto de um agente — sempre via draft (amarelo) +
// aprovação humana, mesmo padrão de pausarItem/reabrirItem (routes/ifood.js).
async function responderReview(merchantId, reviewId, texto, tenantId) {
  assertPathId(merchantId, 'merchantId');
  assertPathId(reviewId, 'reviewId');
  if (typeof texto !== 'string' || texto.trim() === '') {
    throw new IfoodApiError('responderReview: texto é obrigatório', 0, null);
  }
  return ifoodFetch(
    `/review/v2.0/merchants/${merchantId}/reviews/${reviewId}/answers`,
    { method: 'POST', body: { text: texto } },
    tenantId
  ).then(tolerant);
}

// ---------------------------------------------------------------------------
// Resolução item_nome|externalCode → { itemId, productId, nome } contra o
// cardápio REAL da categoria. NUNCA chuta: 0 ou >1 match devolve candidatos
// para o humano desambiguar (regra §5.5 do PLANO — pausar o item errado
// prejudica o lojista). Match exato case-insensitive por nome OU por externalCode.
//
// Catalog v2.0: GET /categories/{categoryId}/items devolve item[] onde o nome
// vive em products[] (o item carrega productId/externalCode, não o name). Aceita
// também o nome direto no item (resposta tolerante a variações de shape).
// ---------------------------------------------------------------------------
function norm(s) {
  return typeof s === 'string' ? s.trim().toLowerCase() : '';
}

async function buscarItemPorNomeOuExternalCode(merchantId, categoryId, { nome, externalCode } = {}) {
  assertPathId(merchantId, 'merchantId');
  assertPathId(categoryId, 'categoryId');
  const alvoNome = norm(nome);
  const alvoExt = typeof externalCode === 'string' ? externalCode.trim() : '';
  if (!alvoNome && !alvoExt) {
    throw new IfoodApiError('buscarItem: informe nome ou externalCode', 0, null);
  }

  const raw = await listarItensCategoria(merchantId, categoryId);
  // resposta pode ser { items, products } ou só um array de items
  const items = Array.isArray(raw) ? raw : (raw?.items ?? []);
  const products = Array.isArray(raw?.products) ? raw.products : [];
  const productById = new Map(products.map((p) => [String(p?.id ?? ''), p]));

  const nomeDoItem = (it) => {
    if (it?.name) return String(it.name); // shape com name no próprio item
    const prod = it?.productId ? productById.get(String(it.productId)) : null;
    return prod?.name ? String(prod.name) : '';
  };

  const candidatos = items.map((it) => ({
    itemId: it?.id ? String(it.id) : null,
    productId: it?.productId ? String(it.productId) : null,
    nome: nomeDoItem(it),
    externalCode: it?.externalCode != null ? String(it.externalCode) : null,
  }));

  const matches = candidatos.filter((c) => {
    const porExt = alvoExt && c.externalCode === alvoExt;
    const porNome = alvoNome && norm(c.nome) === alvoNome;
    return porExt || porNome;
  });

  if (matches.length === 1) {
    const { itemId, productId, nome: n } = matches[0];
    return { ok: true, item: { itemId, productId, nome: n } };
  }
  return {
    ok: false,
    motivo: matches.length === 0 ? 'nao_encontrado' : 'ambiguo',
    // em ambíguo devolve os que casaram; em não-encontrado, a lista toda p/ o humano escolher
    candidatos: (matches.length === 0 ? candidatos : matches).map((c) => ({
      itemId: c.itemId,
      nome: c.nome,
      externalCode: c.externalCode,
    })),
  };
}

// ---------------------------------------------------------------------------
// Cardápio AGREGADO — monta a árvore completa catálogo→categoria→item para a
// tela de Cardápio iFood. Read-only (só GETs já existentes), 1 request por nó.
//
// REGRA CRÍTICA (descoberta real da API Catalog v2.0): a disponibilidade EFETIVA
// do item (pausado/disponível) NÃO está em `item.status` (top-level, sempre
// AVAILABLE no shape real) — está em `item.contextModifiers[].status` POR CANAL.
// Usamos o contextModifier do catalogContext 'DEFAULT' (ou o 1º como fallback).
// O NOME vive em products[] (item carrega productId → cruzar). Preço em
// contextModifiers[].price.value (canal) com fallback item.price.value.
// ---------------------------------------------------------------------------
function pickContextModifier(item) {
  const mods = Array.isArray(item?.contextModifiers) ? item.contextModifiers : [];
  return mods.find((m) => m?.catalogContext === 'DEFAULT') ?? mods[0] ?? null;
}

function montarItem(item, productById) {
  const mod = pickContextModifier(item);
  const status = mod?.status ?? item?.status ?? null; // efetivo: canal manda
  const prod = item?.productId ? productById.get(String(item.productId)) : null;
  const preco = mod?.price?.value ?? item?.price?.value ?? null;
  return {
    itemId: item?.id ? String(item.id) : null,
    nome: prod?.name ? String(prod.name) : '',
    descricao: prod?.description ? String(prod.description) : '',
    preco,
    externalCode: item?.externalCode != null ? String(item.externalCode) : null,
    disponivel: status === 'AVAILABLE',
    status,
  };
}

async function getCardapio(merchantId, tenantId) {
  assertPathId(merchantId, 'merchantId');

  const catalogosRaw = await listarCatalogos(merchantId, tenantId);
  const catalogos = Array.isArray(catalogosRaw) ? catalogosRaw : (catalogosRaw?.catalogs ?? catalogosRaw?.items ?? []);

  const out = [];
  for (const cat of catalogos) {
    const catalogId = cat?.catalogId ?? cat?.id;
    if (!catalogId) continue;

    const categoriasRaw = await listarCategorias(merchantId, String(catalogId), tenantId);
    const categorias = Array.isArray(categoriasRaw) ? categoriasRaw : (categoriasRaw?.categories ?? categoriasRaw?.items ?? []);

    const categoriasOut = [];
    for (const c of categorias) {
      const categoryId = c?.id ?? c?.categoryId;
      if (!categoryId) continue;

      const itensRaw = await listarItensCategoria(merchantId, String(categoryId), tenantId);
      const items = Array.isArray(itensRaw) ? itensRaw : (itensRaw?.items ?? []);
      const products = Array.isArray(itensRaw?.products) ? itensRaw.products : [];
      const productById = new Map(products.map((p) => [String(p?.id ?? ''), p]));

      categoriasOut.push({
        categoryId: String(categoryId),
        nome: c?.name ? String(c.name) : '',
        status: c?.status ?? null,
        itens: items.map((it) => montarItem(it, productById)),
      });
    }

    out.push({
      catalogId: String(catalogId),
      groupId: cat?.groupId ? String(cat.groupId) : null,
      status: cat?.status ?? null,
      categorias: categoriasOut,
    });
  }

  return { catalogos: out };
}

module.exports = {
  IfoodApiError,
  getIfoodConfig,
  getAccessToken,
  buscarItemPorNomeOuExternalCode,
  getCardapio,
  // leitura
  listarMerchants,
  listarCatalogos,
  listarSellableItems,
  getStatusLoja,
  listarReviews,
  getSummaryReviews,
  listarVendas,
  // escrita (Catalog v2.0) — sem retry
  listarCategorias,
  criarCategoria,
  criarOuAtualizarItem,
  listarItensCategoria,
  pausarItem,
  reabrirItem,
  deletarCategoria,
  responderReview,
};
