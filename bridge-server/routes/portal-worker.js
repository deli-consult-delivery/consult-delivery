// Bridge → ifood-portal-worker — executa runners de browser automation contra o
// Portal do Parceiro iFood, no container que compartilha o network namespace do
// ifood-browser (docker run --network container:ifood-browser). Trigger.dev cloud
// não alcança o CDP da VPS; por isso a task `gestor-conversa` chama esta rota.
'use strict';

const express = require('express');

const WORKER_DIR = '/root/consult-delivery/ifood-portal-worker';
const TIMEOUT_MS = 180_000;

// Allowlist FIXA runner→arquivo. `metricas` ainda não existe (F1 cria run-metricas.js);
// já reservado aqui para não precisar de outro PR só para adicionar a entrada.
const RUNNERS = {
  listar: 'run-listar.js',
  metricas: 'run-metricas.js',
  preencher: 'run-preencher.js',
  enviar: 'run-enviar.js',
  probe: 'probe-dom.js',
};

// Allowlist de env vars repassadas ao container — nunca repassar process.env inteiro.
const ENV_ALLOWLIST = ['PEDIDO', 'CONFIRMAR_ENVIO', 'REVIEW_ID', 'AVALIACAO_JSON', 'TEXTO_APROVADO'];

// factory: recebe `spawn` injetável (default node:child_process) para permitir mock em teste
// sem docker real.
module.exports = function portalWorkerRoutes({ spawn: spawnFn } = {}) {
  const spawn = spawnFn || require('node:child_process').spawn;
  const router = express.Router();

  // Mutex global in-process: 1 sessão de portal = 1 runner por vez (só existe um
  // Chromium/CDP compartilhado). ponytail: lock global, trocar por lock por-loja
  // se um dia paralelizarmos sessões de portal.
  let runnerEmExecucao = false;

  function runDocker(args) {
    return new Promise((resolve) => {
      const proc = spawn('docker', args, { timeout: TIMEOUT_MS, stdio: ['ignore', 'pipe', 'pipe'] });
      let stdout = '';
      let stderr = '';
      proc.stdout.on('data', (d) => { stdout += d; });
      proc.stderr.on('data', (d) => { stderr += d; });
      proc.on('close', (exitCode) => resolve({ stdout, stderr, exitCode }));
      proc.on('error', (err) => resolve({ stdout, stderr: stderr + `\n[spawn error] ${err.message}`, exitCode: null }));
    });
  }

  // POST /run
  // Body: { runner: 'listar'|'metricas'|'preencher'|'enviar'|'probe', loja: string, env?: object }
  router.post('/run', async (req, res) => {
    req.setTimeout(TIMEOUT_MS);
    const { runner, loja, env } = req.body ?? {};

    const arquivo = RUNNERS[runner];
    if (!arquivo) {
      return res.status(400).json({ error: 'runner inválido', runners_permitidos: Object.keys(RUNNERS) });
    }
    if (!loja || typeof loja !== 'string') {
      return res.status(400).json({ error: 'campo loja obrigatório' });
    }

    if (runnerEmExecucao) {
      return res.status(409).json({ error: 'runner_em_execucao' });
    }

    const dockerArgs = [
      'run', '--rm',
      '--network', 'container:ifood-browser',
      '-v', `${WORKER_DIR}:/app`,
      '-w', '/app',
      '-e', `IFOOD_LOJA=${loja}`,
    ];

    if (env && typeof env === 'object') {
      for (const chave of ENV_ALLOWLIST) {
        if (Object.prototype.hasOwnProperty.call(env, chave)) {
          dockerArgs.push('-e', `${chave}=${String(env[chave])}`);
        }
      }
    }

    dockerArgs.push('node:20-alpine', 'node', arquivo);

    runnerEmExecucao = true;
    try {
      const { stdout, stderr, exitCode } = await runDocker(dockerArgs);
      return res.json({ ok: exitCode === 0, runner, loja, stdout, stderr, exitCode });
    } finally {
      runnerEmExecucao = false;
    }
  });

  return router;
};
