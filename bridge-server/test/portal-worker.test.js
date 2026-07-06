// Smoke offline da rota POST /api/portal-worker/run — sem docker, sem CDP real.
// Stuba spawn(); exercita allowlist de runner, mutex e o happy path.
'use strict';

const assert = require('node:assert');
const express = require('express');
const http = require('node:http');
const { EventEmitter } = require('node:events');

const factory = require('../routes/portal-worker');

// Fake `spawn`: devolve um EventEmitter com stdout/stderr fake e emite 'close' async.
function fakeSpawn({ exitCode = 0, stdout = '{"ok":true}', stderr = '', delayMs = 0 } = {}) {
  return (_cmd, _args) => {
    const proc = new EventEmitter();
    proc.stdout = new EventEmitter();
    proc.stderr = new EventEmitter();
    setTimeout(() => {
      if (stdout) proc.stdout.emit('data', Buffer.from(stdout));
      if (stderr) proc.stderr.emit('data', Buffer.from(stderr));
      proc.emit('close', exitCode);
    }, delayMs);
    return proc;
  };
}

function buildApp(spawnFn) {
  const app = express();
  app.use(express.json());
  app.use('/api/portal-worker', factory({ spawn: spawnFn }));
  return app;
}

function post(server, body) {
  return new Promise((resolve) => {
    const data = JSON.stringify(body);
    const { port } = server.address();
    const req = http.request(
      { host: '127.0.0.1', port, path: '/api/portal-worker/run', method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } },
      (res) => {
        let buf = '';
        res.on('data', (c) => (buf += c));
        res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(buf || '{}') }));
      }
    );
    req.end(data);
  });
}

(async () => {
  let passed = 0;

  // 1) runner fora da allowlist → 400
  {
    const server = http.createServer(buildApp(fakeSpawn())).listen(0);
    await new Promise((r) => server.once('listening', r));
    const r = await post(server, { runner: 'rm-rf', loja: 'Café Container' });
    assert.strictEqual(r.status, 400);
    server.close();
    passed++;
  }

  // 2) sem loja → 400
  {
    const server = http.createServer(buildApp(fakeSpawn())).listen(0);
    await new Promise((r) => server.once('listening', r));
    const r = await post(server, { runner: 'listar' });
    assert.strictEqual(r.status, 400);
    server.close();
    passed++;
  }

  // 3) happy path → 200, spawn chamado com docker + args esperados
  {
    let capturedArgs = null;
    const spawnFn = (cmd, args) => {
      capturedArgs = { cmd, args };
      return fakeSpawn()(cmd, args);
    };
    const server = http.createServer(buildApp(spawnFn)).listen(0);
    await new Promise((r) => server.once('listening', r));
    const r = await post(server, { runner: 'listar', loja: 'Café Container' });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.ok, true);
    assert.strictEqual(capturedArgs.cmd, 'docker');
    assert.ok(capturedArgs.args.includes('run-listar.js'));
    assert.ok(capturedArgs.args.includes('container:ifood-browser'));
    assert.ok(capturedArgs.args.includes('IFOOD_LOJA=Café Container'));
    server.close();
    passed++;
  }

  // 4) mutex: 2ª chamada concorrente enquanto a 1ª está em execução → 409
  {
    const spawnFn = fakeSpawn({ delayMs: 150 });
    const server = http.createServer(buildApp(spawnFn)).listen(0);
    await new Promise((r) => server.once('listening', r));
    const p1 = post(server, { runner: 'listar', loja: 'Café Container' });
    await new Promise((r) => setTimeout(r, 20)); // garante que a 1ª já marcou o mutex
    const r2 = await post(server, { runner: 'listar', loja: 'Café Container' });
    assert.strictEqual(r2.status, 409);
    assert.strictEqual(r2.body.error, 'runner_em_execucao');
    const r1 = await p1;
    assert.strictEqual(r1.status, 200);
    server.close();
    passed++;
  }

  // 5) env allowlist: só chaves conhecidas viram -e no docker
  {
    let capturedArgs = null;
    const spawnFn = (cmd, args) => {
      capturedArgs = { cmd, args };
      return fakeSpawn()(cmd, args);
    };
    const server = http.createServer(buildApp(spawnFn)).listen(0);
    await new Promise((r) => server.once('listening', r));
    const r = await post(server, {
      runner: 'enviar',
      loja: 'Café Container',
      env: { TEXTO_APROVADO: 'obrigado!', SECRET_KEY: 'nao-deveria-vazar' },
    });
    assert.strictEqual(r.status, 200);
    assert.ok(capturedArgs.args.includes('TEXTO_APROVADO=obrigado!'));
    assert.ok(!capturedArgs.args.some((a) => String(a).includes('SECRET_KEY')));
    server.close();
    passed++;
  }

  console.log(`portal-worker smoke: ${passed}/5 OK`);
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
