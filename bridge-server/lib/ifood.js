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
    // this.retryAfterMs é setado à parte em ifoodFetch pra 429 (não passa pelo construtor).
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
// 5xx usa backoff EXPONENCIAL com jitter (exigência literal do checklist de
// homologação Merchant: "retry com backoff exponencial para erros 5xx") — evita
// que retries concorrentes de várias chamadas sincronizem no mesmo instante.
// Em 429, respeita o header Retry-After do iFood (ifoodFetch anexa retryAfterMs
// ao erro) no lugar do backoff — cap de 30s por segurança (prioridade sobre o
// backoff exponencial: o iFood já disse quanto esperar).
// ---------------------------------------------------------------------------
function shouldRetry(status) {
  return status === 429 || status >= 500;
}

const BACKOFF_BASE_MS = 500;
const BACKOFF_CAP_MS = 8_000;

// attempt=0 (1ª tentativa) nunca espera. attempt>=1: base×2^attempt, jitter
// ±25% (evita retries sincronizados), capado em 8s. attempt=1→~1000ms,
// attempt=2→~2000ms — mesma ordem de grandeza do schedule fixo anterior
// [0,1000,2000], só que exponencial de verdade (extensível se maxAttempts
// crescer) e com jitter.
function backoffComJitter(attempt) {
  if (attempt <= 0) return 0;
  const exp = Math.min(BACKOFF_BASE_MS * 2 ** attempt, BACKOFF_CAP_MS);
  const jitter = 1 + (Math.random() * 0.5 - 0.25); // ±25%
  return Math.round(exp * jitter);
}

async function withRetry(fn, maxAttempts = 3) {
  let nextDelayOverrideMs = null;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const delay = nextDelayOverrideMs ?? backoffComJitter(attempt);
    nextDelayOverrideMs = null;
    if (delay > 0) await new Promise((r) => setTimeout(r, delay));
    try {
      return await fn();
    } catch (err) {
      // erro não-HTTP (Zod/config/programação) não é transitório → não retenta
      if (!(err instanceof IfoodApiError)) throw err;
      if (!shouldRetry(err.status)) throw err;
      if (attempt === maxAttempts - 1) throw err;
      if (err.status === 429 && typeof err.retryAfterMs === 'number') {
        nextDelayOverrideMs = Math.min(err.retryAfterMs, 30_000);
      }
    }
  }
  throw new IfoodApiError('withRetry esgotou tentativas', 0, null);
}

// ---------------------------------------------------------------------------
// Fetch base — injeta Authorization: Bearer + Content-Type/accept, timeout 15s.
// `path` já inclui o prefixo da API (cada módulo iFood tem o seu: /merchant/v1.0,
// /catalog/v2.0, /financial/v3.0, /review/v2.0).
// ---------------------------------------------------------------------------
async function ifoodFetch(path, { method = 'GET', query, body, headers: extraHeaders } = {}, tenantId) {
  const { baseUrl } = getIfoodConfig(tenantId);
  const token = await getAccessToken(tenantId);
  const url = `${baseUrl}${path}${qs(query)}`;

  const headers = {
    accept: 'application/json',
    Authorization: `Bearer ${token}`,
    ...extraHeaders,
  };
  // Achado §9 de docs/integracoes/ifood/financas-endpoints.md (PR #789): durante
  // a janela de homologação do módulo Financial, as chamadas devem incluir
  // x-request-homologation: true. Plugável via env — OFF por padrão (não afeta
  // Merchant/Catalog/Review, que não documentam esse header), liga só na janela
  // real da sessão de homologação (nunca hardcoded).
  if (process.env.IFOOD_HOMOLOGATION_HEADER === 'true') {
    headers['x-request-homologation'] = 'true';
  }
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
    const err = new IfoodApiError(
      `iFood API retornou ${response.status}: ${response.statusText}`,
      response.status,
      parsed
    );
    if (response.status === 429) {
      // Retry-After em segundos (formato usado por rate limit; ignora formato HTTP-date).
      const retryAfter = response.headers?.get ? response.headers.get('retry-after') : null;
      const secs = retryAfter != null ? Number(retryAfter) : NaN;
      if (Number.isFinite(secs) && secs >= 0) err.retryAfterMs = secs * 1000;
    }
    throw err;
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

// Avaliações — lista reviews da loja. page/size opcionais (paginação 1-based
// da Review API v2.0 — o checklist do portal documenta o request com
// `pageSize`, não `size`; usamos `size` como nome interno do parâmetro (mesmo
// contrato já exposto pro front/bridge) e só traduzimos pra `pageSize` na
// query real enviada ao iFood. dataInicio/dataFim (yyyy-MM-dd) filtram por
// período — traduzidos pra `dateFrom`/`dateTo` (ISO 8601 date-time, ex.
// 2021-04-05T08:30:00-03:00), nomes documentados em developer.ifood.com.br/.../review
// (não confirmados ainda contra uma chamada real — ajustar aqui se o 1º
// retorno live divergir, mesmo ressalva já feita acima pra pageSize). Offset
// -03:00 (BRT, fixo — sem DST no Brasil desde 2019): limites em UTC (Z)
// excluiriam o fim da noite local (ex. review às 23h BRT cai no dia seguinte
// em UTC e ficaria fora do período pedido).
// size > 50 é responsabilidade do chamador rejeitar antes (o iFood responde
// 400 nesse caso, conforme doc do portal).
async function listarReviews(merchantId, { page, size, dataInicio, dataFim } = {}, tenantId) {
  const query = {};
  if (page !== undefined && page !== null) query.page = page;
  if (size !== undefined && size !== null) query.pageSize = size;
  if (dataInicio) query.dateFrom = `${dataInicio}T00:00:00-03:00`;
  if (dataFim) query.dateTo = `${dataFim}T23:59:59-03:00`;
  return withRetry(() =>
    ifoodFetch(`/review/v2.0/merchants/${merchantId}/reviews`, { query }, tenantId)
  ).then(tolerant);
}

// Avaliações — detalhe de UMA review (todos os campos V2, replies[].from
// MERCHANT|CUSTOMER). 404 se reviewId não existir — propaga como IfoodApiError
// status 404 (o chamador HTTP mapeia 1:1, sem tratamento especial aqui).
async function getReviewDetalhe(merchantId, reviewId, tenantId) {
  assertPathId(merchantId, 'merchantId');
  assertPathId(reviewId, 'reviewId');
  return withRetry(() =>
    ifoodFetch(`/review/v2.0/merchants/${merchantId}/reviews/${reviewId}`, {}, tenantId)
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
  let data;
  try {
    data = await withRetry(() =>
      ifoodFetch(`/review/v2.0/merchants/${merchantId}/summary`, {}, tenantId)
    ).then(tolerant);
  } catch (err) {
    // Merchant sem reviews → iFood responde 404 "Summary not found" (condição de
    // negócio confirmada live no sandbox, não erro de fato) — trata como sucesso
    // com summary null. Cacheado pelo mesmo TTL: sem isso, cada mount do card
    // bateria na API sem proteção de rate limit enquanto a loja não tiver reviews.
    // Só esse 404 específico (checado pelo corpo) vira sucesso — qualquer outro
    // 404 (merchantId errado, rota descontinuada) continua propagando erro, pra
    // não mascarar um problema real como "loja sem avaliações".
    const isSummaryNotFound = err instanceof IfoodApiError && err.status === 404
      && /summary not found/i.test(err.body?.errorMessage || '');
    if (isSummaryNotFound) {
      data = null;
    } else {
      throw err;
    }
  }
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

// Repasses/liquidação (Settlement API) — valor líquido repassado à loja no
// período. CONFIRMADO LIVE contra o sandbox (merchant 92a0ec17..., 2026-07-06):
// beginPaymentDate/endPaymentDate → 200 (a doc também aceita a variante
// beginCalculationDate/endCalculationDate — usamos payment por ser o eixo
// "quando a loja recebe", mais alinhado ao caso de uso da tela). Mesmo default
// de janela (7 dias) dos demais endpoints financeiros.
async function listarRepasses(merchantId, { dataInicio, dataFim } = {}, tenantId) {
  const hoje = new Date();
  const seteDiasAtras = new Date(hoje.getTime() - 7 * 24 * 60 * 60 * 1000);
  const beginPaymentDate = dataInicio || isoDate(seteDiasAtras);
  const endPaymentDate = dataFim || isoDate(hoje);
  return withRetry(() =>
    ifoodFetch(
      `/financial/v3.0/merchants/${merchantId}/settlements`,
      { query: { beginPaymentDate, endPaymentDate } },
      tenantId
    )
  ).then(tolerant);
}

// Antecipações (Anticipation API) — repasses pagos adiantado (planos D+1/D+7
// via iFood Pago). CONFIRMADO LIVE (2026-07-06): o filtro é um INTERVALO
// (begin/end), não uma data única como a doc pública sugeria — testamos
// beginCalculationDate/endCalculationDate → 200 (beginPaymentDate/
// endPaymentDate devolveu 400 "At least one date range must be provided",
// então o par certo pro eixo "payment" tem outro nome ainda não confirmado;
// calculation já resolve o caso de uso da tela). Mesmo formato de período
// (yyyy-MM-dd, default 7 dias) dos demais endpoints financeiros — loja sem
// plano de antecipação contratado devolve settlements:[] (resultado válido).
async function listarAntecipacoes(merchantId, { dataInicio, dataFim } = {}, tenantId) {
  const hoje = new Date();
  const seteDiasAtras = new Date(hoje.getTime() - 7 * 24 * 60 * 60 * 1000);
  const beginCalculationDate = dataInicio || isoDate(seteDiasAtras);
  const endCalculationDate = dataFim || isoDate(hoje);
  return withRetry(() =>
    ifoodFetch(
      `/financial/v3.0/merchants/${merchantId}/anticipations`,
      { query: { beginCalculationDate, endCalculationDate } },
      tenantId
    )
  ).then(tolerant);
}

// Ajustes/ocorrências — NÃO RESOLVIDO no smoke live de 2026-07-06. Testamos 3
// candidatos contra o sandbox (merchant 92a0ec17...):
//   - /occurrences            → 404 "no Route matched" (path inferido errado,
//                                era a hipótese original antes deste smoke)
//   - /financialEvents        → 404 "no Route matched" (nome do doc público
//                                "Financial Events", em camelCase — também errado)
//   - /financial-events       → 500 "Internal server error" (COM e SEM os
//                                query params testados, COM e SEM o header
//                                x-request-homologation — sempre o mesmo 500
//                                genérico, nunca um 400 de validação como os
//                                outros 2 endpoints financeiros davam quando
//                                errávamos o param). Diferente de um 404 limpo,
//                                sugere que ALGO bate nesse path no gateway,
//                                mas quebra antes de validar query — pode ser
//                                limitação do sandbox pra este merchant de
//                                teste, falta de escopo na credencial, ou o
//                                path ainda não é este. NÃO É UM 200 CONFIRMADO.
// Mantivemos /financial-events (o único que não deu 404 limpo) até termos como
// escalar pro suporte iFood (ticket no portal dev vetado nesta janela) ou até
// alguém capturar a doc de homologação LOGADO (mesmo upgrade que #789 já
// recomendou pro doc inteiro). Reescalar antes de expor isso na tela (worker 86).
async function listarOcorrencias(merchantId, { dataInicio, dataFim } = {}, tenantId) {
  const hoje = new Date();
  const seteDiasAtras = new Date(hoje.getTime() - 7 * 24 * 60 * 60 * 1000);
  const beginPaymentDate = dataInicio || isoDate(seteDiasAtras);
  const endPaymentDate = dataFim || isoDate(hoje);
  return withRetry(() =>
    ifoodFetch(
      `/financial/v3.0/merchants/${merchantId}/financial-events`,
      { query: { beginPaymentDate, endPaymentDate } },
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
// Events — /events/v1.0 (polling + acknowledgment). ESQUELETO MÍNIMO.
//
// Achado de pesquisa (docs/integracoes/ifood/events-modulo-analise.md): este
// módulo é o barramento de eventos do fluxo de PEDIDOS (Order/PDV) — novo
// pedido, confirmado, despachado etc. NÃO é fonte de dado financeiro e NÃO
// serve ao app de Finanças/BI (fase 2 deste sprint, "mata o scraping").
// PLANO-INTEGRACAO-IFOOD.md já classificava como "exclusivo PDV — F3", com
// homologação própria (reunião + `/generate-test-order`) separada da Financial.
// Implementado só como client read-safe (poll + ack) — NUNCA chama
// confirm/dispatch de Order. Path/payload vêm do 00-api-reference.md interno;
// NÃO confirmados contra uma chamada real — ajustar se o 1º smoke live
// divergir (mesma ressalva já usada em listarReviews/responderReview acima).
// ---------------------------------------------------------------------------

const MAX_POLLING_MERCHANTS = 100; // limite documentado do header x-polling-merchants
const MAX_ACK_IDS = 2000; // limite documentado do POST acknowledgment

// Busca novos eventos (polling). merchantIds (string|string[]) filtra via header
// x-polling-merchants — sem isso, o iFood devolve eventos de TODOS os merchants
// vinculados ao token (indesejado num Bridge multi-tenant). groups/types
// (string|string[]) filtram por categoria — passthrough pro iFood.
async function listarEventos({ merchantIds, groups, types } = {}, tenantId) {
  const query = {};
  if (groups) query.groups = Array.isArray(groups) ? groups.join(',') : groups;
  if (types) query.types = Array.isArray(types) ? types.join(',') : types;

  const headers = {};
  if (merchantIds) {
    const list = Array.isArray(merchantIds) ? merchantIds : [merchantIds];
    if (list.length === 0) {
      throw new IfoodApiError('listarEventos: merchantIds não pode ser array vazio', 0, null);
    }
    if (list.length > MAX_POLLING_MERCHANTS) {
      throw new IfoodApiError(
        `listarEventos: x-polling-merchants aceita no máx. ${MAX_POLLING_MERCHANTS} merchants por chamada`,
        0,
        null
      );
    }
    for (const id of list) assertPathId(id, 'merchantIds'); // mesma validação anti-injeção do path, aplicada ao header
    headers['x-polling-merchants'] = list.join(',');
  }

  return withRetry(() =>
    ifoodFetch('/events/v1.0/events:polling', { query, headers }, tenantId)
  ).then(tolerant);
}

// Confirma (acknowledgment) os eventos recebidos no polling — housekeeping do
// PROTOCOLO Events ("recebi, pode parar de reenviar"). NÃO é confirmar pedido
// (Order confirm/dispatch) — este client nunca chama isso. SEM retry (mesma
// regra de escrita do arquivo): reenvio cego fica a critério do chamador.
async function confirmarEventos(eventIds, tenantId) {
  const ids = Array.isArray(eventIds) ? eventIds : [eventIds];
  if (ids.length === 0) {
    throw new IfoodApiError('confirmarEventos: eventIds não pode ser vazio', 0, null);
  }
  if (ids.length > MAX_ACK_IDS) {
    throw new IfoodApiError(`confirmarEventos: máx. ${MAX_ACK_IDS} ids por chamada`, 0, null);
  }
  const body = ids.map((id) => ({ id: String(id) }));
  return ifoodFetch('/events/v1.0/events/acknowledgment', { method: 'POST', body }, tenantId).then(tolerant);
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

// Altera o preço de um item via PATCH (JSON Merge Patch) — MESMO endpoint
// síncrono de pausarItem/reabrirItem (PATCH /items/{itemId}), só que no campo
// `price` em vez de `status`. Pesquisa (#800) achou também um mecanismo batch
// (PATCH /items/price → 202 {batchId} + GET /batch/{id}) não confirmado contra
// o sandbox — não implementado aqui; o PATCH direto por item já é usado e
// validado neste client, então espelhamos ele (decisão informada, ver PR).
// Validação: price precisa ser número finito > 0 (preço zero/negativo é erro
// de programação do chamador, não do iFood — não retentável).
async function alterarPrecoItem(merchantId, itemId, novoPreco, tenantId) {
  assertPathId(merchantId, 'merchantId');
  assertPathId(itemId, 'itemId');
  if (typeof novoPreco !== 'number' || !Number.isFinite(novoPreco) || novoPreco <= 0) {
    throw new IfoodApiError('alterarPrecoItem: novoPreco deve ser um número maior que zero', 0, null);
  }
  return ifoodFetch(
    `/catalog/v2.0/merchants/${merchantId}/items/${itemId}`,
    { method: 'PATCH', body: { price: { value: novoPreco } } },
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

// ---------------------------------------------------------------------------
// Merchant v1.0 — Interrupções (pausas programadas da loja) e Horários de
// funcionamento. Mesma regra de escrita: SEM retry (POST/PUT/DELETE não são
// retentados; só as leituras GET usam withRetry).
// ---------------------------------------------------------------------------

// Lista as interrupções (pausas) ativas/agendadas da loja.
async function listarInterrupcoes(merchantId, tenantId) {
  assertPathId(merchantId, 'merchantId');
  return withRetry(() =>
    ifoodFetch(`/merchant/v1.0/merchants/${merchantId}/interruptions`, {}, tenantId)
  ).then(tolerant);
}

// Cria uma interrupção (pausa a loja entre start/end, ISO 8601) → 201 {id,start,end,...}.
async function criarInterrupcao(merchantId, { start, end, description } = {}, tenantId) {
  assertPathId(merchantId, 'merchantId');
  if (!start || !end) {
    throw new IfoodApiError('criarInterrupcao: start e end são obrigatórios', 0, null);
  }
  const body = { start, end };
  if (description) body.description = String(description);
  return ifoodFetch(
    `/merchant/v1.0/merchants/${merchantId}/interruptions`,
    { method: 'POST', body },
    tenantId
  ).then(tolerant);
}

// Remove uma interrupção (despausa a loja) → 204 sem corpo.
async function removerInterrupcao(merchantId, interruptionId, tenantId) {
  assertPathId(merchantId, 'merchantId');
  assertPathId(interruptionId, 'interruptionId');
  return ifoodFetch(
    `/merchant/v1.0/merchants/${merchantId}/interruptions/${interruptionId}`,
    { method: 'DELETE' },
    tenantId
  ).then(tolerant);
}

// Lista os turnos de horário de funcionamento (dayOfWeek/start/duration).
async function listarHorarios(merchantId, tenantId) {
  assertPathId(merchantId, 'merchantId');
  return withRetry(() =>
    ifoodFetch(`/merchant/v1.0/merchants/${merchantId}/opening-hours`, {}, tenantId)
  ).then(tolerant);
}

// Substitui os turnos de horário de funcionamento (PUT — corpo inteiro).
async function atualizarHorarios(merchantId, shifts, tenantId) {
  assertPathId(merchantId, 'merchantId');
  if (!Array.isArray(shifts) || shifts.length === 0) {
    throw new IfoodApiError('atualizarHorarios: shifts (array) é obrigatório', 0, null);
  }
  return ifoodFetch(
    `/merchant/v1.0/merchants/${merchantId}/opening-hours`,
    { method: 'PUT', body: { shifts } },
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
  getReviewDetalhe,
  getSummaryReviews,
  listarVendas,
  listarRepasses,
  listarAntecipacoes,
  listarOcorrencias,
  // events (esqueleto mínimo — não se aplica a Finanças/BI, ver comentário acima)
  listarEventos,
  confirmarEventos,
  // escrita (Catalog v2.0) — sem retry
  listarCategorias,
  criarCategoria,
  criarOuAtualizarItem,
  listarItensCategoria,
  pausarItem,
  reabrirItem,
  alterarPrecoItem,
  deletarCategoria,
  responderReview,
  // escrita (Merchant v1.0) — sem retry
  listarInterrupcoes,
  criarInterrupcao,
  removerInterrupcao,
  listarHorarios,
  atualizarHorarios,
};
