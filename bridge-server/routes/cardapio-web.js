'use strict';

const crypto = require('node:crypto');
const { z } = require('zod');
const { safeTokenEqual } = require('../lib/auth-middleware');
const cardapio = require('../lib/cardapio-web');
const vendaerp = require('../lib/vendaerp');
const {
  ReconciliationRequiredError,
  processEvent,
} = require('../services/cardapio-venda');

const StartSchema = z.object({
  tenant_id: z.string().uuid(),
  merchant_id: z.coerce.number().int().positive(),
  venda_empresa: z.string().trim().min(1).max(200),
});

const BootstrapSchema = z.object({
  installation_code: z.string().min(32).max(128).regex(/^[A-Za-z0-9_-]+$/),
}).strict();

const ConfigureSchema = z.object({
  tenant_id: z.string().uuid(),
  merchant_id: z.coerce.number().int().positive(),
  enabled: z.boolean(),
  venda_empresa: z.string().trim().min(1).max(200).optional(),
  venda_deposito: z.string().trim().min(1).max(200).optional(),
  venda_cliente_generico: z.string().trim().min(1).max(200).optional(),
  venda_plano_conta: z.string().trim().min(1).max(200).optional(),
  venda_forma_pagamento: z.string().trim().min(1).max(200).optional(),
  venda_payment_mapping: z.record(z.string().trim().min(1).max(200)).optional(),
});

module.exports = function buildCardapioWebRouter({ requireJwt, assertTenantMember, sbFetch }) {
  const router = require('express').Router();
  let workerRunning = false;
  const bootstrapRateLimitByIp = new Map();
  const bootstrapRateWindowMs = 10 * 60 * 1000;
  const bootstrapRateLimitPerIp = 10;
  const bootstrapRateLimitGlobal = 100;
  let bootstrapGlobalRate = { count: 0, resetAt: Date.now() + bootstrapRateWindowMs };
  setInterval(() => {
    const now = Date.now();
    for (const [ip, entry] of bootstrapRateLimitByIp) {
      if (now >= entry.resetAt) bootstrapRateLimitByIp.delete(ip);
    }
  }, bootstrapRateWindowMs).unref();

  function assertAllowedTarget({ tenant_id: tenantId, merchant_id: merchantId, venda_empresa: vendaEmpresa }) {
    const allowedTenant = process.env.CARDAPIO_WEB_BOOTSTRAP_TENANT_ID;
    const allowedMerchant = Number(process.env.CARDAPIO_WEB_BOOTSTRAP_MERCHANT_ID);
    const allowedEmpresa = process.env.CARDAPIO_WEB_BOOTSTRAP_VENDA_EMPRESA;
    return Boolean(
      allowedTenant &&
      Number.isInteger(allowedMerchant) &&
      allowedMerchant > 0 &&
      allowedEmpresa &&
      tenantId === allowedTenant &&
      Number(merchantId) === allowedMerchant &&
      (!vendaEmpresa || vendaEmpresa === allowedEmpresa)
    );
  }

  async function bootstrapStaticInstallation() {
    if (!process.env.CARDAPIO_WEB_ACCESS_TOKEN) return null;
    const parsed = StartSchema.safeParse({
      tenant_id: process.env.CARDAPIO_WEB_BOOTSTRAP_TENANT_ID,
      merchant_id: process.env.CARDAPIO_WEB_BOOTSTRAP_MERCHANT_ID,
      venda_empresa: process.env.CARDAPIO_WEB_BOOTSTRAP_VENDA_EMPRESA,
    });
    if (!parsed.success || !assertAllowedTarget(parsed.data)) {
      throw new Error('Allowlist do Cardápio Web estático não configurada');
    }
    const input = parsed.data;
    const existing = await sbFetch(
      `cardapio_web_installations?merchant_id=eq.${input.merchant_id}` +
      '&select=id,tenant_id,merchant_id,auth_mode&limit=1'
    );
    if (existing?.length) {
      const installation = existing[0];
      if (String(installation.tenant_id) !== input.tenant_id) {
        throw new Error('Merchant Cardápio Web já vinculado a outro tenant');
      }
      if (installation.auth_mode !== 'static') return installation;
    }
    const accessToken = cardapio.getStaticAccessToken();
    const merchant = await cardapio.fetchMerchant(accessToken);
    if (merchant.id !== input.merchant_id) {
      throw new Error('A loja do Access Token não corresponde à allowlist');
    }
    if (existing?.length) return existing[0];
    const rows = await sbFetch('cardapio_web_installations', {
      method: 'POST',
      body: {
        tenant_id: input.tenant_id,
        merchant_id: input.merchant_id,
        auth_mode: 'static',
        access_token_ciphertext: null,
        refresh_token_ciphertext: null,
        token_expires_at: null,
        scope: '',
        enabled: false,
        status: 'active',
        venda_empresa: input.venda_empresa,
      },
    });
    return rows?.[0] || null;
  }

  async function assertTenantAdmin(req, res, tenantId) {
    if (!req.user?.id) {
      res.status(401).json({ error: 'Autenticação obrigatória' });
      return false;
    }
    const rows = await sbFetch(
      `tenant_members?tenant_id=eq.${encodeURIComponent(tenantId)}` +
      `&user_id=eq.${encodeURIComponent(req.user.id)}&select=role&limit=1`
    );
    if (['admin', 'owner'].includes(rows?.[0]?.role)) return true;
    res.status(403).json({ error: 'Apenas admin/owner pode configurar a integração' });
    return false;
  }

  const bootstrapForm = require('express').urlencoded({
    extended: false,
    limit: '4kb',
    parameterLimit: 5,
  });

  router.get('/cardapio-web/oauth/start', bootstrapSecurityHeaders, (_req, res) => {
    return res.type('html').send(`<!doctype html>
<html lang="pt-BR">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Instalar integração</title></head>
<body>
  <main>
    <h1>Instalar integração</h1>
    <form method="post" action="/api/cardapio-web/oauth/start" autocomplete="off">
      <label for="installation_code">Código de instalação</label>
      <input id="installation_code" name="installation_code" type="password" required maxlength="500" autofocus>
      <button type="submit">Continuar</button>
    </form>
  </main>
</body>
</html>`);
  });
  router.post(
    '/cardapio-web/oauth/start',
    bootstrapSecurityHeaders,
    bootstrapRateLimit,
    requireFormContentType,
    bootstrapForm,
    startBootstrapOAuth
  );
  router.get('/cardapio-web/oauth/start/admin', requireJwt, (req, res) => startOAuth(req, res));

  function bootstrapSecurityHeaders(_req, res, next) {
    res.set('Cache-Control', 'no-store');
    res.set('Referrer-Policy', 'no-referrer');
    next();
  }

  function requireFormContentType(req, res, next) {
    if (!req.is('application/x-www-form-urlencoded')) {
      return res.status(415).json({ error: 'Content-Type deve ser application/x-www-form-urlencoded' });
    }
    return next();
  }

  function bootstrapRateLimit(req, res, next) {
    const now = Date.now();
    const ip = req.ip || 'unknown';
    let ipRate = bootstrapRateLimitByIp.get(ip);
    if (!ipRate || now >= ipRate.resetAt) {
      ipRate = { count: 0, resetAt: now + bootstrapRateWindowMs };
      bootstrapRateLimitByIp.set(ip, ipRate);
    }
    if (now >= bootstrapGlobalRate.resetAt) {
      bootstrapGlobalRate = { count: 0, resetAt: now + bootstrapRateWindowMs };
    }
    ipRate.count++;
    if (ipRate.count > bootstrapRateLimitPerIp) {
      res.set('Retry-After', String(Math.max(1, Math.ceil((ipRate.resetAt - now) / 1000))));
      return res.status(429).json({ error: 'Muitas tentativas. Aguarde antes de tentar novamente.' });
    }
    bootstrapGlobalRate.count++;
    if (bootstrapGlobalRate.count > bootstrapRateLimitGlobal) {
      res.set('Retry-After', String(Math.max(
        1,
        Math.ceil((bootstrapGlobalRate.resetAt - now) / 1000)
      )));
      return res.status(429).json({ error: 'Muitas tentativas. Aguarde antes de tentar novamente.' });
    }
    return next();
  }

  async function startBootstrapOAuth(req, res) {
    const parsed = BootstrapSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Código de instalação inválido' });
    const expectedToken = process.env.CARDAPIO_WEB_BOOTSTRAP_TOKEN;
    if (
      !expectedToken ||
      !safeTokenEqual(
        cardapio.hashState(parsed.data.installation_code),
        cardapio.hashState(expectedToken)
      )
    ) {
      return res.status(401).json({ error: 'bootstrap não autorizado' });
    }
    return startOAuth(req, res, parsed.data.installation_code);
  }

  async function startOAuth(req, res, bootstrapToken = null) {
    const source = bootstrapToken ? {
      tenant_id: process.env.CARDAPIO_WEB_BOOTSTRAP_TENANT_ID,
      merchant_id: process.env.CARDAPIO_WEB_BOOTSTRAP_MERCHANT_ID,
      venda_empresa: process.env.CARDAPIO_WEB_BOOTSTRAP_VENDA_EMPRESA,
    } : req.query;
    const parsed = StartSchema.safeParse(source);
    if (!parsed.success) {
      return res.status(bootstrapToken ? 503 : 400).json({
        error: bootstrapToken ? 'Bootstrap Cardápio Web não configurado' : 'Parâmetros inválidos',
        details: parsed.error.flatten(),
      });
    }
    const input = parsed.data;
    try {
      if (!assertAllowedTarget(input)) {
        return res.status(403).json({ error: 'tenant, merchant ou empresa fora da instalação autorizada' });
      }
      if (!bootstrapToken && !await assertTenantAdmin(req, res, input.tenant_id)) return;
      if (bootstrapToken) {
        const existing = await sbFetch(
          `cardapio_web_installations?tenant_id=eq.${encodeURIComponent(input.tenant_id)}` +
          `&merchant_id=eq.${input.merchant_id}&limit=1`
        );
        if (existing?.length) {
          return res.status(409).json({ error: 'Instalação já vinculada; reautorize pelo painel autenticado' });
        }
        const bootstrapHash = cardapio.hashState(bootstrapToken);
        const usedBootstrap = await sbFetch(
          `cardapio_web_oauth_states?bootstrap_token_hash=eq.${bootstrapHash}&limit=1`
        );
        if (usedBootstrap?.length) {
          return res.status(409).json({ error: 'código de instalação já utilizado' });
        }
      }
      const state = crypto.randomBytes(32).toString('base64url');
      const pkce = cardapio.createPkce();
      const redirect = cardapio.authorizationUrl({ state, challenge: pkce.challenge });
      await sbFetch('cardapio_web_oauth_states', {
        method: 'POST',
        body: {
          tenant_id: input.tenant_id,
          merchant_id: input.merchant_id,
          state_hash: cardapio.hashState(state),
          code_verifier_ciphertext: cardapio.encryptSecret(pkce.verifier),
          venda_empresa: input.venda_empresa,
          bootstrap_token_hash: bootstrapToken
            ? cardapio.hashState(bootstrapToken)
            : null,
          expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
        },
      });
      return res.redirect(302, redirect);
    } catch (err) {
      console.error('[cardapio-web/oauth/start]', err.message);
      if (bootstrapToken && String(err.message).includes('Supabase 409')) {
        return res.status(409).json({ error: 'código de instalação já utilizado' });
      }
      return res.status(503).json({ error: err.message });
    }
  }

  router.get('/cardapio-web/oauth/callback', async (req, res) => {
    const code = typeof req.query.code === 'string' ? req.query.code : '';
    const state = typeof req.query.state === 'string' ? req.query.state : '';
    if (!code || !state) return res.status(400).send('Callback OAuth inválido.');
    try {
      const rows = await sbFetch(
        `cardapio_web_oauth_states?state_hash=eq.${cardapio.hashState(state)}` +
        `&used_at=is.null&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&limit=1`
      );
      const saved = rows?.[0];
      if (!saved) return res.status(400).send('State OAuth inválido ou expirado.');
      const claimed = await sbFetch(
        `cardapio_web_oauth_states?id=eq.${encodeURIComponent(saved.id)}&used_at=is.null`,
        { method: 'PATCH', body: { used_at: new Date().toISOString() } }
      );
      if (!claimed?.length) return res.status(400).send('State OAuth já utilizado.');

      const tokens = await cardapio.exchangeCode({
        code,
        verifier: cardapio.decryptSecret(saved.code_verifier_ciphertext),
      });
      if (!tokens.refresh_token) throw new Error('Cardápio Web não retornou refresh_token na autorização inicial');
      if (!cardapio.hasRequiredScopes(tokens.scope)) {
        return res.status(403).send('A autorização precisa incluir os escopos orders e store.');
      }
      const merchant = await cardapio.fetchMerchant(tokens.access_token);
      if (merchant.id !== Number(saved.merchant_id)) {
        return res.status(403).send('A loja autorizada não corresponde à instalação solicitada.');
      }
      await sbFetch('cardapio_web_installations?on_conflict=tenant_id,merchant_id', {
        method: 'POST',
        prefer: 'resolution=merge-duplicates,return=representation',
        body: {
          tenant_id: saved.tenant_id,
          merchant_id: saved.merchant_id,
          auth_mode: 'oauth',
          access_token_ciphertext: cardapio.encryptSecret(tokens.access_token),
          refresh_token_ciphertext: cardapio.encryptSecret(tokens.refresh_token),
          token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
          scope: tokens.scope || '',
          enabled: false,
          status: 'active',
          venda_empresa: saved.venda_empresa,
          updated_at: new Date().toISOString(),
        },
      });
      const target = process.env.CARDAPIO_WEB_SUCCESS_REDIRECT_URL ||
        'https://app.consultdelivery.com.br/?cardapio_web=authorized';
      return res.redirect(302, target);
    } catch (err) {
      console.error('[cardapio-web/oauth/callback]', err.message);
      return res.status(502).send('Não foi possível concluir a autorização do Cardápio Web.');
    }
  });

  router.get('/cardapio-web/integration', requireJwt, async (req, res) => {
    const tenantId = typeof req.query.tenant_id === 'string' ? req.query.tenant_id : '';
    if (!z.string().uuid().safeParse(tenantId).success) return res.status(400).json({ error: 'tenant_id inválido' });
    try {
      if (!await assertTenantMember(req, res, tenantId)) return;
      const rows = await sbFetch(
        `cardapio_web_installations?tenant_id=eq.${encodeURIComponent(tenantId)}` +
        '&select=id,tenant_id,merchant_id,auth_mode,token_expires_at,scope,enabled,status,venda_empresa,' +
        'venda_deposito,venda_cliente_generico,venda_plano_conta,venda_forma_pagamento,' +
        'venda_payment_mapping,updated_at'
      );
      return res.json({ ok: true, installations: rows || [] });
    } catch (err) {
      return res.status(502).json({ error: err.message });
    }
  });

  router.patch('/cardapio-web/integration', requireJwt, async (req, res) => {
    const parsed = ConfigureSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Configuração inválida', details: parsed.error.flatten() });
    const { tenant_id: tenantId, merchant_id: merchantId, ...patch } = parsed.data;
    try {
      if (!assertAllowedTarget({
        tenant_id: tenantId,
        merchant_id: merchantId,
        venda_empresa: patch.venda_empresa,
      })) {
        return res.status(403).json({ error: 'tenant, merchant ou empresa fora da instalação autorizada' });
      }
      if (!await assertTenantAdmin(req, res, tenantId)) return;
      if (patch.enabled) {
        if (process.env.CARDAPIO_WEB_VENDA_WRITE_ENABLED !== 'true') {
          return res.status(503).json({ error: 'escrita Cardápio Web → Venda ERP desativada no servidor' });
        }
        vendaerp.getVendaErpConfig(tenantId);
        if (!process.env.CARDAPIO_WEB_WEBHOOK_TOKEN) {
          return res.status(503).json({ error: 'CARDAPIO_WEB_WEBHOOK_TOKEN não configurado' });
        }
        const installations = await sbFetch(
          `cardapio_web_installations?tenant_id=eq.${encodeURIComponent(tenantId)}` +
          `&merchant_id=eq.${merchantId}&status=eq.active&select=auth_mode,scope&limit=1`
        );
        if (!installations?.length) {
          return res.status(404).json({ error: 'Instalação Cardápio Web não encontrada' });
        }
        if (installations[0].auth_mode === 'static') {
          if (!cardapio.getStaticAccessToken()) {
            return res.status(409).json({ error: 'Access Token estático não configurado no servidor' });
          }
        } else if (!cardapio.hasRequiredScopes(installations[0].scope)) {
          return res.status(409).json({ error: 'reautorize o app com os escopos orders e store' });
        } else {
          cardapio.getOAuthConfig();
        }
      }
      const rows = await sbFetch(
        `cardapio_web_installations?tenant_id=eq.${encodeURIComponent(tenantId)}` +
        `&merchant_id=eq.${merchantId}&status=eq.active`,
        { method: 'PATCH', body: { ...patch, updated_at: new Date().toISOString() } }
      );
      if (!rows?.length) return res.status(404).json({ error: 'Instalação Cardápio Web não encontrada' });
      return res.json({ ok: true, enabled: rows[0].enabled });
    } catch (err) {
      return res.status(502).json({ error: err.message });
    }
  });

  router.post('/cardapio-web/webhook', async (req, res) => {
    const expectedToken = process.env.CARDAPIO_WEB_WEBHOOK_TOKEN;
    if (!expectedToken) return res.status(503).json({ error: 'webhook not configured' });
    if (!safeTokenEqual(req.headers['x-webhook-token'], expectedToken)) {
      return res.status(401).json({ error: 'unauthorized' });
    }
    const parsed = cardapio.WebhookEventSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'invalid webhook payload' });
    const event = parsed.data;
    try {
      const installations = await sbFetch(
        `cardapio_web_installations?merchant_id=eq.${event.merchant_id}` +
        '&enabled=eq.true&status=eq.active&limit=1'
      );
      const installation = installations?.[0];
      if (!installation) return res.status(200).json({ ok: true, ignored: 'integration_disabled' });
      try {
        await sbFetch('cardapio_web_events', {
          method: 'POST',
          body: {
            tenant_id: installation.tenant_id,
            installation_id: installation.id,
            event_id: event.event_id,
            event_type: event.event_type,
            merchant_id: event.merchant_id,
            order_id: event.order_id,
            order_status: event.order_status,
            payload: req.body,
          },
        });
      } catch (err) {
        if (!String(err.message).includes('Supabase 409')) throw err;
        return res.status(200).json({ ok: true, duplicate: true });
      }
      res.status(200).json({ ok: true, queued: true });
      setImmediate(runWorker);
    } catch (err) {
      console.error('[cardapio-web/webhook]', err.message);
      return res.status(503).json({ error: 'webhook inbox unavailable' });
    }
  });

  async function runWorker() {
    if (workerRunning) return;
    workerRunning = true;
    let handled = false;
    try {
      const stale = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      await sbFetch(
        `cardapio_web_events?status=eq.processing&claimed_at=lt.${encodeURIComponent(stale)}`,
        {
          method: 'PATCH',
          body: {
            status: 'pending',
            claimed_at: null,
            available_at: new Date().toISOString(),
            last_error: 'Processamento interrompido; retomado pelo worker',
          },
        }
      );
      const rows = await sbFetch(
        `cardapio_web_events?status=eq.pending&available_at=lte.${encodeURIComponent(new Date().toISOString())}` +
        '&order=received_at.asc&limit=1'
      );
      const event = rows?.[0];
      if (!event) return;
      handled = true;
      const claimed = await sbFetch(
        `cardapio_web_events?id=eq.${encodeURIComponent(event.id)}&status=eq.pending`,
        {
          method: 'PATCH',
          body: {
            status: 'processing',
            attempts: event.attempts + 1,
            claimed_at: new Date().toISOString(),
          },
        }
      );
      if (!claimed?.length) return;
      const installations = await sbFetch(
        `cardapio_web_installations?id=eq.${encodeURIComponent(event.installation_id)}` +
        '&enabled=eq.true&status=eq.active&limit=1'
      );
      const installation = installations?.[0];
      if (!installation) {
        await finishEvent(event.id, 'ignored', 'Integração desativada');
        return;
      }
      try {
        const status = await processEvent(
          { ...event.payload, tenant_id: event.tenant_id },
          installation,
          sbFetch
        );
        await finishEvent(event.id, status, null);
      } catch (err) {
        if (err instanceof ReconciliationRequiredError) {
          await finishEvent(event.id, 'reconcile', err.message);
        } else if (
          event.attempts + 1 < 3 &&
          ['CardapioWebApiError', 'VendaErpApiError'].includes(err.name) &&
          (err.status === 0 || err.status === 429 || err.status >= 500)
        ) {
          await finishEvent(event.id, 'pending', err.message, false, (event.attempts + 1) * 15_000);
        } else {
          await finishEvent(event.id, 'failed', err.message);
        }
      }
    } catch (err) {
      console.error('[cardapio-web/worker]', err.message);
    } finally {
      workerRunning = false;
      if (handled) setImmediate(runWorker);
    }
  }

  function finishEvent(id, status, lastError, processed = true, retryDelayMs = 0) {
    return sbFetch(`cardapio_web_events?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: {
        status,
        last_error: lastError,
        processed_at: processed ? new Date().toISOString() : null,
        claimed_at: null,
        available_at: new Date(Date.now() + retryDelayMs).toISOString(),
      },
    });
  }

  router.startWorker = async () => {
    const staticInstallation = await bootstrapStaticInstallation();
    const staticAccess = staticInstallation?.auth_mode === 'static';
    const oauthAccess = Boolean(
      process.env.CARDAPIO_WEB_CLIENT_ID &&
      process.env.CARDAPIO_WEB_TOKEN_ENCRYPTION_KEY
    );
    if (
      (!staticAccess && !oauthAccess) ||
      !process.env.CARDAPIO_WEB_WEBHOOK_TOKEN ||
      process.env.CARDAPIO_WEB_VENDA_WRITE_ENABLED !== 'true'
    ) return null;
    const timer = setInterval(runWorker, 15_000);
    timer.unref();
    setImmediate(runWorker);
    return timer;
  };

  return router;
};
