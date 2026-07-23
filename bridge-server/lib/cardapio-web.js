'use strict';

const crypto = require('node:crypto');
const { z } = require('zod');

class CardapioWebApiError extends Error {
  constructor(message, status = 0, body = null) {
    super(message);
    this.name = 'CardapioWebApiError';
    this.status = status;
    this.body = body;
  }
}

const WebhookEventSchema = z.object({
  event_id: z.string().min(1).max(200),
  event_type: z.enum(['ORDER_CREATED', 'ORDER_STATUS_UPDATED']),
  merchant_id: z.coerce.number().int().positive(),
  order_id: z.coerce.number().int().positive(),
  order_status: z.string().min(1).max(100),
  created_at: z.string().datetime({ offset: true }),
}).passthrough();

const TokenResponseSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1).optional(),
  expires_in: z.coerce.number().int().positive(),
  token_type: z.string().default('Bearer'),
  scope: z.string().optional(),
});

const MerchantSchema = z.object({
  id: z.coerce.number().int().positive(),
}).passthrough();

const REQUIRED_SCOPES = ['orders', 'store'];

const DecimalInputSchema = z.union([
  z.number().finite(),
  z.string().trim().regex(/^\d+(?:\.\d+)?$/),
]).transform((value) => typeof value === 'number' ? value : Number(value));
const MoneySchema = DecimalInputSchema.refine((value) => value >= 0);
const QuantitySchema = DecimalInputSchema.refine(
  (value) => Number.isInteger(value) && value > 0
);
const OrderItemSchema = z.lazy(() => z.object({
  quantity: QuantitySchema,
  unit_price: MoneySchema.optional(),
  total_price: MoneySchema.optional(),
  options: z.array(z.object({
    quantity: QuantitySchema,
    unit_price: MoneySchema,
    total_price: MoneySchema.optional(),
  }).passthrough()).default([]),
  items: z.array(OrderItemSchema).default([]),
  combo_steps: z.array(z.object({
    item: OrderItemSchema.nullable().optional(),
  }).passthrough()).default([]),
}).passthrough());

const OrderSchema = z.object({
  id: z.coerce.number().int().positive(),
  merchant_id: z.coerce.number().int().positive(),
  status: z.string().min(1),
  order_type: z.enum(['delivery', 'takeout', 'onsite', 'closed_table']),
  sales_channel: z.string().min(1),
  fiscal_document: z.string().nullable().optional(),
  observation: z.string().nullable().optional(),
  delivery_fee: MoneySchema.default(0),
  service_fee: MoneySchema.default(0),
  additional_fee: MoneySchema.default(0),
  total: MoneySchema,
  created_at: z.string(),
  customer: z.object({ name: z.string().min(1) }).passthrough().nullable().optional(),
  items: z.array(OrderItemSchema).min(1),
  discounts: z.array(z.object({
    total: MoneySchema,
  }).passthrough()).default([]),
  payments: z.array(z.object({
    total: MoneySchema,
    payment_method: z.string().min(1),
    payment_fee: MoneySchema.default(0),
  }).passthrough()).default([]),
}).passthrough();

function hasRequiredScopes(scope) {
  const granted = new Set(
    String(scope || '').toLowerCase().split(/[\s,]+/).filter(Boolean)
  );
  return REQUIRED_SCOPES.every((required) => granted.has(required));
}

function getConfig() {
  const environment = process.env.CARDAPIO_WEB_ENV === 'production' ? 'production' : 'sandbox';
  const clientId = process.env.CARDAPIO_WEB_CLIENT_ID;
  const redirectUri = process.env.CARDAPIO_WEB_REDIRECT_URI ||
    'https://bridge.consultdelivery.com.br/api/cardapio-web/oauth/callback';
  if (!clientId) throw new CardapioWebApiError('CARDAPIO_WEB_CLIENT_ID não configurado');
  return {
    clientId,
    redirectUri,
    apiBaseUrl: (process.env.CARDAPIO_WEB_BASE_URL ||
      (environment === 'production'
        ? 'https://integracao.cardapioweb.com'
        : 'https://integracao.sandbox.cardapioweb.com')).replace(/\/+$/, ''),
    authorizationUrl: process.env.CARDAPIO_WEB_AUTHORIZATION_URL ||
      (environment === 'production'
        ? 'https://www.portal.cardapioweb.com/cw-apps'
        : 'https://portal.sandbox.cardapioweb.com/cw-apps'),
  };
}

function encryptionKey() {
  const raw = process.env.CARDAPIO_WEB_TOKEN_ENCRYPTION_KEY;
  if (!raw) throw new CardapioWebApiError('CARDAPIO_WEB_TOKEN_ENCRYPTION_KEY não configurada');
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    throw new CardapioWebApiError('CARDAPIO_WEB_TOKEN_ENCRYPTION_KEY deve conter 32 bytes em base64');
  }
  return key;
}

function encryptSecret(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString('base64url')).join('.');
}

function decryptSecret(value) {
  const [ivRaw, tagRaw, encryptedRaw, extra] = String(value).split('.');
  if (!ivRaw || !tagRaw || !encryptedRaw || extra) throw new CardapioWebApiError('Segredo criptografado inválido');
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(ivRaw, 'base64url'));
    decipher.setAuthTag(Buffer.from(tagRaw, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(encryptedRaw, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    throw new CardapioWebApiError('Não foi possível descriptografar a credencial Cardápio Web');
  }
}

function createPkce() {
  const verifier = crypto.randomBytes(48).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

function hashState(state) {
  return crypto.createHash('sha256').update(String(state)).digest('hex');
}

function authorizationUrl({ state, challenge }) {
  const config = getConfig();
  const url = new URL(config.authorizationUrl);
  url.search = new URLSearchParams({
    client_id: config.clientId,
    state,
    redirect_uri: config.redirectUri,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  }).toString();
  return url.toString();
}

async function tokenRequest(form) {
  const config = getConfig();
  let response;
  try {
    response = await fetch(`${config.apiBaseUrl}/api/partner/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body: new URLSearchParams(form),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    throw new CardapioWebApiError(`Cardápio Web indisponível: ${err.message}`);
  }
  const text = await response.text();
  let body;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!response.ok) {
    throw new CardapioWebApiError(`Cardápio Web OAuth retornou ${response.status}`, response.status, body);
  }
  return TokenResponseSchema.parse(body);
}

function exchangeCode({ code, verifier }) {
  const config = getConfig();
  return tokenRequest({
    grant_type: 'authorization_code',
    code,
    redirect_uri: config.redirectUri,
    client_id: config.clientId,
    code_verifier: verifier,
  });
}

function refreshToken(refreshTokenValue) {
  const config = getConfig();
  return tokenRequest({
    grant_type: 'refresh_token',
    refresh_token: refreshTokenValue,
    client_id: config.clientId,
  });
}

async function fetchOrder(orderId, accessToken) {
  const { apiBaseUrl } = getConfig();
  let response;
  try {
    response = await fetch(`${apiBaseUrl}/api/partner/v1/orders/${encodeURIComponent(orderId)}`, {
      headers: { Authorization: `Bearer ${accessToken}`, accept: 'application/json' },
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    throw new CardapioWebApiError(`Cardápio Web indisponível: ${err.message}`);
  }
  const text = await response.text();
  let body;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!response.ok) {
    throw new CardapioWebApiError(`Cardápio Web API retornou ${response.status}`, response.status, body);
  }
  return OrderSchema.parse(body);
}

async function fetchMerchant(accessToken) {
  const { apiBaseUrl } = getConfig();
  let response;
  try {
    response = await fetch(`${apiBaseUrl}/api/partner/v1/merchant`, {
      headers: { Authorization: `Bearer ${accessToken}`, accept: 'application/json' },
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    throw new CardapioWebApiError(`Cardápio Web indisponível: ${err.message}`);
  }
  const text = await response.text();
  let body;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!response.ok) {
    throw new CardapioWebApiError(`Cardápio Web API retornou ${response.status}`, response.status, body);
  }
  return MerchantSchema.parse(body);
}

module.exports = {
  CardapioWebApiError,
  WebhookEventSchema,
  OrderSchema,
  REQUIRED_SCOPES,
  hasRequiredScopes,
  getConfig,
  encryptSecret,
  decryptSecret,
  createPkce,
  hashState,
  authorizationUrl,
  exchangeCode,
  refreshToken,
  fetchOrder,
  fetchMerchant,
};
