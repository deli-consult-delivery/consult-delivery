'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');

const SPAWN_QUEUE = path.join(process.env.HOME || '/root', '.claude', 'spawn-queue');
const SPAWN_LOGS  = path.join(process.env.HOME || '/root', '.claude', 'spawn-logs');

// Operadores autorizados: e-mails separados por vírgula no env, ou fallback fixo
const OPERATORS = new Set(
  (process.env.BRIDGE_OPERATORS || 'wandson@consultdelivery.com.br')
    .split(',').map(e => e.trim().toLowerCase()).filter(Boolean)
);

// Limite de streams SSE simultâneos por usuário
const MAX_SSE_PER_USER = 3;
const MAX_SSE_DURATION_MS = 30 * 60 * 1000; // 30 min
const sseCountByUser = new Map();

// ── helpers ──────────────────────────────────────────────────────────────────

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

function detectStatus(slug) {
  if (fs.existsSync(path.join(SPAWN_QUEUE, 'done',       `${slug}.task`))) return 'concluida';
  if (fs.existsSync(path.join(SPAWN_QUEUE, 'failed',     `${slug}.task`))) return 'falha';
  if (fs.existsSync(path.join(SPAWN_QUEUE, 'processing', `${slug}.task`))) return 'ativa';
  return 'ativa';
}

function getLogMtime(slug) {
  try { return fs.statSync(path.join(SPAWN_LOGS, `${slug}.log`)).mtime.toISOString(); }
  catch { return null; }
}

function detectAguardandoAprovacao(slug) {
  const logPath = path.join(SPAWN_LOGS, `${slug}.log`);
  try {
    const stat = fs.statSync(logPath);
    const tailSize = Math.min(stat.size, 4096);
    const fd = fs.openSync(logPath, 'r');
    let tail = '';
    try {
      const buf = Buffer.alloc(tailSize);
      fs.readSync(fd, buf, 0, tailSize, stat.size - tailSize);
      tail = buf.toString('utf8').toLowerCase();
    } finally {
      fs.closeSync(fd);
    }
    if (tail.includes('aguardando aprovação') || tail.includes('aguardando aprovacao')) return true;
    // Verificar se "wandson" e "aprovação" estão na mesma linha
    return tail.split('\n').some(l =>
      (l.includes('wandson') && l.includes('aprovação')) ||
      (l.includes('wandson') && l.includes('aprovacao'))
    );
  } catch {
    return false;
  }
}

// Middleware: aceita Bearer header OU ?token= query param (necessário para EventSource)
// Copia o token do query param para o header antes de chamar requireJwt
function tokenFromQuery(req, _res, next) {
  if (!req.headers['authorization'] && req.query?.token) {
    req.headers['authorization'] = `Bearer ${req.query.token}`;
  }
  next();
}

// Gate: apenas operadores autorizados acessam os endpoints de monitor
function requireOperator(req, res, next) {
  const email = (req.user?.email || '').toLowerCase();
  if (!OPERATORS.has(email)) {
    return res.status(403).json({ error: 'acesso restrito a operadores' });
  }
  next();
}

// ── router ───────────────────────────────────────────────────────────────────

module.exports = function buildMonitorRouter({ requireJwt }) {
  const router = express.Router();

  // GET /api/monitor/sessions — lista todas as sessões
  router.get('/monitor/sessions', requireJwt, requireOperator, (req, res) => {
    try {
      const slugsVisto = new Set();
      const sessions = [];

      for (const subdir of ['', 'done', 'failed', 'processing']) {
        const entries = subdir === ''
          ? (() => {
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

          let prompt = '';
          for (const d of [entry.dir, 'done', 'failed', 'processing', '']) {
            const taskPath = path.join(SPAWN_QUEUE, d, `${entry.slug}.task`);
            try {
              const lines = fs.readFileSync(taskPath, 'utf8').split('\n');
              prompt = lines.slice(0, 2).join(' ').trim().slice(0, 120);
              break;
            } catch { /* continua */ }
          }

          sessions.push({ slug: entry.slug, status, aguardando_aprovacao: aguardando, log_atualizado: logMtime, prompt });
        }
      }

      const ordem = { ativa: 0, concluida: 1, falha: 2 };
      sessions.sort((a, b) => (ordem[a.status] ?? 9) - (ordem[b.status] ?? 9));
      res.json(sessions);
    } catch (err) {
      console.error('[monitor] GET sessions', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/monitor/logs/:slug — stream SSE do log em tempo real
  router.get('/monitor/logs/:slug', tokenFromQuery, requireJwt, requireOperator, (req, res) => {
    const { slug } = req.params;
    if (!/^[\w-]+$/.test(slug)) return res.status(400).json({ error: 'slug inválido' });

    const userId = req.user?.id || req.user?.sub || 'unknown';
    const currentCount = sseCountByUser.get(userId) || 0;
    if (currentCount >= MAX_SSE_PER_USER) {
      return res.status(429).json({ error: `limite de ${MAX_SSE_PER_USER} streams simultâneos atingido` });
    }
    sseCountByUser.set(userId, currentCount + 1);

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

    function poll() {
      try {
        const stat = fs.statSync(logPath);
        const newSize = stat.size;
        if (newSize > offset) {
          const fd = fs.openSync(logPath, 'r');
          let chunk = '';
          try {
            const buf = Buffer.alloc(newSize - offset);
            fs.readSync(fd, buf, 0, buf.length, offset);
            chunk = buf.toString('utf8');
          } finally {
            fs.closeSync(fd);
          }
          offset = newSize;
          res.write(`data: ${JSON.stringify({ lines: chunk, reset: false })}\n\n`);
        }
      } catch { /* arquivo pode não existir ainda */ }
    }

    const pollTimer = setInterval(poll, 1000);
    const hbTimer   = setInterval(() => { res.write(': heartbeat\n\n'); }, 25000);

    // Timeout máximo para evitar conexões infinitas
    const maxTimer = setTimeout(() => {
      res.write(`data: ${JSON.stringify({ lines: '\n[stream encerrado — tempo máximo atingido]\n', reset: false })}\n\n`);
      cleanup();
      res.end();
    }, MAX_SSE_DURATION_MS);

    let cleaned = false;
    function cleanup() {
      if (cleaned) return;
      cleaned = true;
      clearInterval(pollTimer);
      clearInterval(hbTimer);
      clearTimeout(maxTimer);
      const n = sseCountByUser.get(userId) || 1;
      if (n <= 1) sseCountByUser.delete(userId);
      else sseCountByUser.set(userId, n - 1);
    }

    req.on('close', cleanup);
    res.on('close', cleanup);
    res.on('error', cleanup);
  });

  return router;
};
