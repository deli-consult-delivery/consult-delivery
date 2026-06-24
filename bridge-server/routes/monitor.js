'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');

const SPAWN_QUEUE = path.join(process.env.HOME || '/root', '.claude', 'spawn-queue');
const SPAWN_LOGS  = path.join(process.env.HOME || '/root', '.claude', 'spawn-logs');

function getTaskFiles(subdir) {
  const dir = path.join(SPAWN_QUEUE, subdir);
  try {
    return fs.readdirSync(dir)
      .filter(f => f.endsWith('.task'))
      .map(f => ({ file: f, slug: f.replace(/\.task$/, ''), dir: subdir }));
  } catch {
    return [];
  }
}

function getLogTail(slug, lines = 50) {
  const logPath = path.join(SPAWN_LOGS, `${slug}.log`);
  try {
    const content = fs.readFileSync(logPath, 'utf8');
    const all = content.split('\n');
    return all.slice(-lines).join('\n');
  } catch {
    return null;
  }
}

function detectStatus(slug) {
  const done       = fs.existsSync(path.join(SPAWN_QUEUE, 'done',       `${slug}.task`));
  const failed     = fs.existsSync(path.join(SPAWN_QUEUE, 'failed',     `${slug}.task`));
  const processing = fs.existsSync(path.join(SPAWN_QUEUE, 'processing', `${slug}.task`));
  if (done)       return 'concluida';
  if (failed)     return 'falha';
  if (processing) return 'ativa';
  return 'ativa'; // task sem subpasta = ainda na raiz da fila
}

function getLogMtime(slug) {
  const logPath = path.join(SPAWN_LOGS, `${slug}.log`);
  try {
    return fs.statSync(logPath).mtime.toISOString();
  } catch {
    return null;
  }
}

function detectAguardandoAprovacao(slug) {
  const tail = getLogTail(slug, 30) || '';
  const lower = tail.toLowerCase();
  return (
    lower.includes('aguardando aprovação') ||
    lower.includes('aguardando aprovacao') ||
    lower.includes('wandson') && lower.includes('aprovação') ||
    lower.includes('confirmar') && lower.includes('?')
  );
}

module.exports = function buildMonitorRouter({ requireJwt }) {
  const router = express.Router();

  // GET /api/monitor/sessions — lista todas as sessões
  router.get('/monitor/sessions', requireJwt, (req, res) => {
    try {
      const slugsVisto = new Set();
      const sessions = [];

      // Varrer todas as subpastas da spawn-queue
      for (const subdir of ['done', 'failed', 'processing', '']) {
        const entries = subdir === ''
          ? (function() {
              try {
                return fs.readdirSync(SPAWN_QUEUE)
                  .filter(f => f.endsWith('.task'))
                  .map(f => ({ file: f, slug: f.replace(/\.task$/, ''), dir: '' }));
              } catch { return []; }
            })()
          : getTaskFiles(subdir);

        for (const entry of entries) {
          if (slugsVisto.has(entry.slug)) continue;
          slugsVisto.add(entry.slug);

          const status = detectStatus(entry.slug);
          const logMtime = getLogMtime(entry.slug);
          const aguardando = status === 'ativa' ? detectAguardandoAprovacao(entry.slug) : false;

          // ler resumo do prompt (primeiras 2 linhas do .task)
          let prompt = '';
          for (const d of [entry.dir, 'done', 'failed', 'processing', '']) {
            const taskPath = path.join(SPAWN_QUEUE, d, `${entry.slug}.task`);
            try {
              const lines = fs.readFileSync(taskPath, 'utf8').split('\n');
              prompt = lines.slice(0, 2).join(' ').trim().slice(0, 120);
              break;
            } catch { /* continua */ }
          }

          sessions.push({
            slug: entry.slug,
            status,
            aguardando_aprovacao: aguardando,
            log_atualizado: logMtime,
            prompt,
          });
        }
      }

      // Ordenar: ativas primeiro, depois concluídas, falhas por último
      const ordem = { ativa: 0, concluida: 1, falha: 2 };
      sessions.sort((a, b) => (ordem[a.status] ?? 9) - (ordem[b.status] ?? 9));

      res.json(sessions);
    } catch (err) {
      console.error('[monitor] GET sessions', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/monitor/logs/:slug — stream SSE do log em tempo real
  router.get('/monitor/logs/:slug', requireJwt, (req, res) => {
    const { slug } = req.params;
    // Validar slug: apenas letras, números, traços e underscores
    if (!/^[\w-]+$/.test(slug)) {
      return res.status(400).json({ error: 'slug inválido' });
    }

    const logPath = path.join(SPAWN_LOGS, `${slug}.log`);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    // Enviar histórico completo primeiro
    let offset = 0;
    try {
      const content = fs.readFileSync(logPath, 'utf8');
      if (content) {
        res.write(`data: ${JSON.stringify({ lines: content, reset: true })}\n\n`);
        offset = Buffer.byteLength(content, 'utf8');
      }
    } catch {
      res.write(`data: ${JSON.stringify({ lines: `[sem log para ${slug}]\n`, reset: true })}\n\n`);
    }

    // Polling do arquivo a cada 1s para novas linhas
    let watcher = null;
    let pollTimer = null;

    function poll() {
      try {
        const stat = fs.statSync(logPath);
        const newSize = stat.size;
        if (newSize > offset) {
          const fd = fs.openSync(logPath, 'r');
          const buf = Buffer.alloc(newSize - offset);
          fs.readSync(fd, buf, 0, buf.length, offset);
          fs.closeSync(fd);
          const chunk = buf.toString('utf8');
          offset = newSize;
          res.write(`data: ${JSON.stringify({ lines: chunk, reset: false })}\n\n`);
        }
      } catch { /* arquivo pode não existir ainda */ }
    }

    pollTimer = setInterval(poll, 1000);

    // Heartbeat a cada 25s para manter conexão viva
    const hbTimer = setInterval(() => {
      res.write(': heartbeat\n\n');
    }, 25000);

    req.on('close', () => {
      clearInterval(pollTimer);
      clearInterval(hbTimer);
      if (watcher) watcher.close();
    });
  });

  return router;
};
