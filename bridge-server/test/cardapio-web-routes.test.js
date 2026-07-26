'use strict';

const assert = require('node:assert');
const crypto = require('node:crypto');
const http = require('node:http');
const express = require('express');
const cardapio = require('../lib/cardapio-web');
const buildRouter = require('../routes/cardapio-web');

const TENANT = '22222222-2222-4222-8222-222222222222';
const BOOTSTRAP_CODE = 'bootstrap-test-0123456789abcdef-XYZ';
process.env.CARDAPIO_WEB_CLIENT_ID = 'client-test';
process.env.CARDAPIO_WEB_TOKEN_ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64');
process.env.CARDAPIO_WEB_BOOTSTRAP_TENANT_ID = TENANT;
process.env.CARDAPIO_WEB_BOOTSTRAP_MERCHANT_ID = '3268';
process.env.CARDAPIO_WEB_BOOTSTRAP_VENDA_EMPRESA = 'Empresa';
process.env.CARDAPIO_WEB_BOOTSTRAP_TOKEN = BOOTSTRAP_CODE;
process.env.CARDAPIO_WEB_VENDA_WRITE_ENABLED = 'false';
process.env.CARDAPIO_WEB_WEBHOOK_TOKEN = 'webhook-test';
process.env.VENDAERP_TOKEN = 'venda-token-test';
process.env.VENDAERP_USER = 'venda-user-test';
process.env.VENDAERP_APP = 'venda-app-test';

let failures = 0;
async function check(label, fn) {
  try {
    await fn();
    process.stdout.write(`  ok  ${label}\n`);
  } catch (err) {
    failures++;
    process.stdout.write(`  FAIL ${label}: ${err.message}\n`);
  }
}

async function request(
  router,
  method,
  path,
  body,
  contentType = 'application/json',
  forwardedFor = null
) {
  const app = express();
  if (forwardedFor) app.set('trust proxy', 1);
  app.use(express.json());
  app.use('/api', router);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const options = {
      method,
      headers: {
        ...(body ? { 'content-type': contentType } : {}),
        ...(forwardedFor ? { 'x-forwarded-for': forwardedFor } : {}),
      },
    };
    const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
      ...options,
      body: body
        ? (contentType === 'application/x-www-form-urlencoded'
          ? new URLSearchParams(body).toString()
          : JSON.stringify(body))
        : undefined,
      redirect: 'manual',
    });
    return {
      status: response.status,
      location: response.headers.get('location'),
      cacheControl: response.headers.get('cache-control'),
      referrerPolicy: response.headers.get('referrer-policy'),
      retryAfter: response.headers.get('retry-after'),
      body: await response.text(),
    };
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function routerWithRole(role, calls = [], installationScope = 'orders store', authMode = 'oauth') {
  const sbFetch = async (path, options) => {
    calls.push({ path, options });
    if (path.startsWith('tenant_members?')) return [{ role }];
    if (path.startsWith('cardapio_web_oauth_states?bootstrap_token_hash=')) {
      const hash = path.match(/bootstrap_token_hash=eq\.([^&]+)/)?.[1];
      return calls.some((call) =>
        call.path === 'cardapio_web_oauth_states' &&
        call.options?.body?.bootstrap_token_hash === hash
      ) ? [{}] : [];
    }
    if (path.startsWith('cardapio_web_installations?') && !options) {
      return path.includes('select=auth_mode,scope')
        ? [{ auth_mode: authMode, scope: installationScope }]
        : [];
    }
    if (path.startsWith('cardapio_web_installations?') && options?.method === 'PATCH') {
      return [{ enabled: options.body.enabled }];
    }
    if (path === 'cardapio_web_oauth_states' && options?.method === 'POST') return [{}];
    return [];
  };
  return buildRouter({
    requireJwt: (req, _res, next) => {
      req.user = { id: 'user-test' };
      next();
    },
    assertTenantMember: async () => true,
    sbFetch,
  });
}

(async () => {
  await check('GET público renderiza formulário sem expor código e sem cache/referrer', async () => {
    const calls = [];
    const response = await request(
      routerWithRole('admin', calls),
      'GET',
      '/api/cardapio-web/oauth/start'
    );
    assert.strictEqual(response.status, 200);
    assert.match(response.body, /<form method="post" action="\/api\/cardapio-web\/oauth\/start"/);
    assert.match(response.body, /name="installation_code"/);
    assert.doesNotMatch(response.body, new RegExp(BOOTSTRAP_CODE));
    assert.strictEqual(response.cacheControl, 'no-store');
    assert.strictEqual(response.referrerPolicy, 'no-referrer');
    assert.strictEqual(calls.length, 0);
  });

  await check('código de instalação não é aceito no path', async () => {
    const response = await request(
      routerWithRole('admin'),
      'GET',
      `/api/cardapio-web/oauth/start/${BOOTSTRAP_CODE}`
    );
    assert.strictEqual(response.status, 404);
  });

  await check('POST rejeita Content-Type diferente de formulário', async () => {
    const calls = [];
    const response = await request(
      routerWithRole('admin', calls),
      'POST',
      '/api/cardapio-web/oauth/start',
      { installation_code: BOOTSTRAP_CODE }
    );
    assert.strictEqual(response.status, 415);
    assert.strictEqual(calls.length, 0);
  });

  await check('POST rejeita código incorreto antes de consultar banco', async () => {
    const calls = [];
    const response = await request(
      routerWithRole('admin', calls),
      'POST',
      '/api/cardapio-web/oauth/start',
      { installation_code: 'token-incorreto-0123456789abcdef-XYZ' },
      'application/x-www-form-urlencoded'
    );
    assert.strictEqual(response.status, 401);
    assert.strictEqual(calls.length, 0);
  });

  await check('POST válido usa allowlist fixa, persiste one-shot e inicia PKCE sem token na URL', async () => {
    const calls = [];
    const response = await request(
      routerWithRole('admin', calls),
      'POST',
      '/api/cardapio-web/oauth/start',
      { installation_code: BOOTSTRAP_CODE },
      'application/x-www-form-urlencoded'
    );
    assert.strictEqual(response.status, 302);
    assert.match(response.location, /client_id=client-test/);
    assert.doesNotMatch(response.location, new RegExp(BOOTSTRAP_CODE));
    assert.doesNotMatch(response.location, /installation_code/);
    assert.strictEqual(response.cacheControl, 'no-store');
    assert.strictEqual(response.referrerPolicy, 'no-referrer');
    const stateWrite = calls.find((call) => call.path === 'cardapio_web_oauth_states');
    assert.strictEqual(stateWrite.options.body.tenant_id, TENANT);
    assert.strictEqual(stateWrite.options.body.merchant_id, 3268);
    assert.match(stateWrite.options.body.bootstrap_token_hash, /^[a-f0-9]{64}$/);
  });

  await check('código de instalação é one-shot', async () => {
    const calls = [];
    const router = routerWithRole('admin', calls);
    const first = await request(
      router,
      'POST',
      '/api/cardapio-web/oauth/start',
      { installation_code: BOOTSTRAP_CODE },
      'application/x-www-form-urlencoded'
    );
    const second = await request(
      router,
      'POST',
      '/api/cardapio-web/oauth/start',
      { installation_code: BOOTSTRAP_CODE },
      'application/x-www-form-urlencoded'
    );
    assert.strictEqual(first.status, 302);
    assert.strictEqual(second.status, 409);
    assert.match(second.body, /já utilizado/);
    assert.strictEqual(
      calls.filter((call) => call.path === 'cardapio_web_oauth_states').length,
      1
    );
  });

  await check('rota administrativa autenticada continua separada do formulário público', async () => {
    const calls = [];
    const response = await request(
      routerWithRole('admin', calls),
      'GET',
      `/api/cardapio-web/oauth/start/admin?tenant_id=${TENANT}&merchant_id=3268&venda_empresa=Empresa`
    );
    assert.strictEqual(response.status, 302);
    assert.doesNotMatch(response.location, new RegExp(BOOTSTRAP_CODE));
    const stateWrite = calls.find((call) => call.path === 'cardapio_web_oauth_states');
    assert.strictEqual(stateWrite.options.body.bootstrap_token_hash, null);
  });

  await check('OAuth sem client_id falha antes de persistir state', async () => {
    const calls = [];
    const clientId = process.env.CARDAPIO_WEB_CLIENT_ID;
    delete process.env.CARDAPIO_WEB_CLIENT_ID;
    try {
      const response = await request(
        routerWithRole('admin', calls),
        'GET',
        `/api/cardapio-web/oauth/start/admin?tenant_id=${TENANT}&merchant_id=3268&venda_empresa=Empresa`
      );
      assert.strictEqual(response.status, 503);
      assert.strictEqual(
        calls.some((call) => call.path === 'cardapio_web_oauth_states'),
        false
      );
    } finally {
      process.env.CARDAPIO_WEB_CLIENT_ID = clientId;
    }
  });

  await check('membro sem papel admin/owner não altera integração', async () => {
    const response = await request(
      routerWithRole('operador'),
      'PATCH',
      '/api/cardapio-web/integration',
      { tenant_id: TENANT, merchant_id: 3268, enabled: false }
    );
    assert.strictEqual(response.status, 403);
  });

  await check('kill switch bloqueia habilitação mesmo para admin', async () => {
    const response = await request(
      routerWithRole('admin'),
      'PATCH',
      '/api/cardapio-web/integration',
      { tenant_id: TENANT, merchant_id: 3268, enabled: true }
    );
    assert.strictEqual(response.status, 503);
  });

  await check('callback recusa autorização sem escopo store antes de consultar merchant', async () => {
    const saved = {
      id: '11111111-1111-4111-8111-111111111111',
      tenant_id: TENANT,
      merchant_id: 3268,
      code_verifier_ciphertext: 'ciphertext',
      venda_empresa: 'Empresa',
    };
    let merchantCalls = 0;
    let installationWrites = 0;
    const sbFetch = async (path, options) => {
      if (path.startsWith('cardapio_web_oauth_states?state_hash=')) return [saved];
      if (path.startsWith('cardapio_web_oauth_states?id=') && options?.method === 'PATCH') return [saved];
      if (path.startsWith('cardapio_web_installations') && options?.method === 'POST') {
        installationWrites++;
      }
      return [];
    };
    const originals = {
      exchangeCode: cardapio.exchangeCode,
      decryptSecret: cardapio.decryptSecret,
      fetchMerchant: cardapio.fetchMerchant,
    };
    cardapio.exchangeCode = async () => ({
      access_token: 'access',
      refresh_token: 'refresh',
      expires_in: 3600,
      scope: 'orders',
    });
    cardapio.decryptSecret = () => 'verifier';
    cardapio.fetchMerchant = async () => {
      merchantCalls++;
      return { id: 3268 };
    };
    try {
      const response = await request(buildRouter({
        requireJwt: (_req, _res, next) => next(),
        assertTenantMember: async () => true,
        sbFetch,
      }), 'GET', '/api/cardapio-web/oauth/callback?code=code-test&state=state-test');
      assert.strictEqual(response.status, 403);
      assert.strictEqual(merchantCalls, 0);
      assert.strictEqual(installationWrites, 0);
    } finally {
      Object.assign(cardapio, originals);
    }
  });

  await check('ativação recusa instalação sem escopo store', async () => {
    process.env.CARDAPIO_WEB_VENDA_WRITE_ENABLED = 'true';
    try {
      const response = await request(
        routerWithRole('admin', [], 'orders'),
        'PATCH',
        '/api/cardapio-web/integration',
        { tenant_id: TENANT, merchant_id: 3268, enabled: true }
      );
      assert.strictEqual(response.status, 409);
      assert.match(response.body, /orders e store/);
    } finally {
      process.env.CARDAPIO_WEB_VENDA_WRITE_ENABLED = 'false';
    }
  });

  await check('bootstrap estático valida merchant, é idempotente e preserva OAuth', async () => {
    const originalFetchMerchant = cardapio.fetchMerchant;
    process.env.CARDAPIO_WEB_ACCESS_TOKEN = 'static-secret-test';
    process.env.CARDAPIO_WEB_ENV = 'sandbox';
    let merchantValidated = false;
    cardapio.fetchMerchant = async (token) => {
      assert.strictEqual(token, process.env.CARDAPIO_WEB_ACCESS_TOKEN);
      merchantValidated = true;
      return { id: 3268 };
    };
    try {
      const createCalls = [];
      const createRouter = buildRouter({
        requireJwt: (_req, _res, next) => next(),
        assertTenantMember: async () => true,
        sbFetch: async (path, options) => {
          createCalls.push({ path, options });
          if (path.startsWith('cardapio_web_installations?')) return [];
          if (path === 'cardapio_web_installations') {
            assert.strictEqual(merchantValidated, true);
            return [{ id: 'static-installation', ...options.body }];
          }
          return [];
        },
      });
      assert.strictEqual(await createRouter.startWorker(), null);
      const created = createCalls.find((call) => call.path === 'cardapio_web_installations');
      assert.strictEqual(created.options.body.auth_mode, 'static');
      assert.strictEqual(created.options.body.enabled, false);
      assert.strictEqual(created.options.body.access_token_ciphertext, null);
      assert.strictEqual(created.options.body.refresh_token_ciphertext, null);
      assert.strictEqual(created.options.body.token_expires_at, null);
      assert.doesNotMatch(JSON.stringify(created.options.body), /static-secret-test/);

      const restartCalls = [];
      const restartRouter = buildRouter({
        requireJwt: (_req, _res, next) => next(),
        assertTenantMember: async () => true,
        sbFetch: async (path, options) => {
          restartCalls.push({ path, options });
          if (path.includes('select=id,tenant_id,merchant_id,auth_mode')) {
            return [{
              id: 'static-installation',
              tenant_id: TENANT,
              merchant_id: 3268,
              auth_mode: 'static',
              enabled: true,
            }];
          }
          return [];
        },
      });
      assert.strictEqual(await restartRouter.startWorker(), null);
      assert.strictEqual(restartCalls.some((call) => call.options?.method), false);

      merchantValidated = false;
      process.env.CARDAPIO_WEB_ENV = 'production';
      const oauthCalls = [];
      const oauthRouter = buildRouter({
        requireJwt: (_req, _res, next) => next(),
        assertTenantMember: async () => true,
        sbFetch: async (path, options) => {
          oauthCalls.push({ path, options });
          if (path.includes('select=id,tenant_id,merchant_id,auth_mode')) {
            return [{ id: 'oauth-installation', tenant_id: TENANT, merchant_id: 3268, auth_mode: 'oauth' }];
          }
          return [];
        },
      });
      assert.strictEqual(await oauthRouter.startWorker(), null);
      assert.strictEqual(merchantValidated, false);
      assert.strictEqual(oauthCalls.some((call) => call.options?.method), false);
    } finally {
      cardapio.fetchMerchant = originalFetchMerchant;
      delete process.env.CARDAPIO_WEB_ACCESS_TOKEN;
      delete process.env.CARDAPIO_WEB_ENV;
    }
  });

  await check('worker pode iniciar apenas com token estático no Sandbox', async () => {
    const originalFetchMerchant = cardapio.fetchMerchant;
    process.env.CARDAPIO_WEB_ACCESS_TOKEN = 'static-secret-test';
    process.env.CARDAPIO_WEB_ENV = 'sandbox';
    process.env.CARDAPIO_WEB_VENDA_WRITE_ENABLED = 'true';
    cardapio.fetchMerchant = async () => ({ id: 3268 });
    try {
      const router = buildRouter({
        requireJwt: (_req, _res, next) => next(),
        assertTenantMember: async () => true,
        sbFetch: async (path, options) => {
          if (path.startsWith('cardapio_web_installations?') && !options) return [];
          if (path === 'cardapio_web_installations') {
            return [{ id: 'static-installation', ...options.body }];
          }
          return [];
        },
      });
      const timer = await router.startWorker();
      assert.ok(timer);
      clearInterval(timer);
    } finally {
      cardapio.fetchMerchant = originalFetchMerchant;
      delete process.env.CARDAPIO_WEB_ACCESS_TOKEN;
      delete process.env.CARDAPIO_WEB_ENV;
      process.env.CARDAPIO_WEB_VENDA_WRITE_ENABLED = 'false';
    }
  });

  await check('IP bloqueado não esgota cota global de outro IP', async () => {
    const calls = [];
    const router = routerWithRole('admin', calls);
    let response;
    for (let attempt = 1; attempt <= 101; attempt++) {
      response = await request(
        router,
        'POST',
        '/api/cardapio-web/oauth/start',
        { installation_code: `invalid-code-0123456789abcdef-${String(attempt).padStart(3, '0')}` },
        'application/x-www-form-urlencoded',
        '198.51.100.10'
      );
      assert.strictEqual(response.status, attempt <= 10 ? 401 : 429);
    }
    assert.match(response.retryAfter, /^\d+$/);
    assert.strictEqual(calls.length, 0);
    const otherIp = await request(
      router,
      'POST',
      '/api/cardapio-web/oauth/start',
      { installation_code: BOOTSTRAP_CODE },
      'application/x-www-form-urlencoded',
      '198.51.100.11'
    );
    assert.strictEqual(otherIp.status, 302);
  });

  if (failures) {
    process.stdout.write(`\n${failures} falha(s).\n`);
    process.exit(1);
  }
  process.stdout.write('\nTodas as asserções passaram.\n');
})();
