'use strict';

// Teste offline (sem rede real) das rotas /api/evolution/*: mocka sbFetch
// (lookup da instância) e o fetch global (chamada à Evolution), sobe o
// router isolado com supertest-like chamada via http local.
//
// Roda com: node bridge-server/test-evolution-actions.offline.js

const assert  = require('assert');
const http    = require('http');
const express = require('express');

const FAKE_INSTANCE = { evolution_url: 'https://fake-evo.test', api_key: 'fake-key', instance_name: 'inst-1' };

async function sbFetchMock(path) {
  assert(path.includes('evolution_instances'), 'sbFetch deveria consultar evolution_instances');
  assert(path.includes('instance_name=eq.inst-1'), 'deveria filtrar por instance_name');
  return [FAKE_INSTANCE];
}

async function requireJwtMock(req, res, next) { req.user = { id: 'test-user' }; next(); }

// mocka o fetch global usado pelo proxy para "chamar a Evolution" — chamadas
// ao servidor de teste local (http://127.0.0.1) passam direto (originalFetch);
// só a chamada real à Evolution (evolution_url fake) é interceptada/validada.
const originalFetch = global.fetch;
global.fetch = async (url, opts) => {
  if (String(url).startsWith('http://127.0.0.1')) return originalFetch(url, opts);
  assert(url.startsWith(FAKE_INSTANCE.evolution_url), 'deveria chamar a evolution_url resolvida, não uma URL do front');
  assert.strictEqual(opts.headers.apikey, FAKE_INSTANCE.api_key, 'deveria usar a api_key resolvida no servidor');
  return { ok: true, status: 200, text: async () => JSON.stringify({ echo: { url, body: opts.body ? JSON.parse(opts.body) : null } }) };
};

async function main() {
  const buildRouter = require('./routes/evolution-actions');
  const app = express();
  app.use(express.json());
  app.use('/api', buildRouter({ requireJwt: requireJwtMock, sbFetch: sbFetchMock }));

  const server = app.listen(0);
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;

  // 1. send-text
  {
    const r = await fetch(`${base}/api/evolution/send-text`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ instance_name: 'inst-1', to: '5511999999999', text: 'oi' }),
    });
    const json = await r.json();
    assert.strictEqual(r.status, 200);
    assert(json.echo.url.includes('/message/sendText/inst-1'));
    assert.strictEqual(json.echo.body.number, '5511999999999');
    console.log('✓ send-text');
  }

  // 2. send-text sem campos obrigatórios → 400 (não chega a resolver instância)
  {
    const r = await fetch(`${base}/api/evolution/send-text`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ instance_name: 'inst-1' }),
    });
    assert.strictEqual(r.status, 400);
    console.log('✓ send-text valida campos obrigatórios');
  }

  // 3. groups (GET, query string)
  {
    const r = await fetch(`${base}/api/evolution/groups?instance_name=inst-1&get_participants=true`);
    const json = await r.json();
    assert.strictEqual(r.status, 200);
    assert(json.echo.url.includes('/group/fetchAllGroups/inst-1?getParticipants=true'));
    console.log('✓ groups (GET)');
  }

  // 4. instância inexistente → 404, nunca chama a Evolution
  {
    let evoCalled = false;
    global.fetch = async (url, opts) => {
      if (String(url).startsWith('http://127.0.0.1')) return originalFetch(url, opts);
      evoCalled = true;
      throw new Error('não deveria chamar a Evolution');
    };
    const r = await (async () => {
      // sbFetch retorna vazio para instance_name desconhecido
      const buildRouter2 = require('./routes/evolution-actions');
      const app2 = express();
      app2.use(express.json());
      app2.use('/api', buildRouter2({ requireJwt: requireJwtMock, sbFetch: async () => [] }));
      const server2 = app2.listen(0);
      const { port: port2 } = server2.address();
      const res = await fetch(`http://127.0.0.1:${port2}/api/evolution/send-text`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instance_name: 'nao-existe', to: '55119', text: 'oi' }),
      });
      server2.close();
      return res;
    })();
    assert.strictEqual(r.status, 404);
    assert.strictEqual(evoCalled, false, 'não deveria ter chamado a Evolution para instância inexistente');
    console.log('✓ instância inexistente → 404, Evolution nunca chamada');
  }

  server.close();
  global.fetch = originalFetch;
  console.log('\nTodos os testes offline passaram.');
}

main().catch((err) => { console.error('FALHOU:', err.message); process.exit(1); });
