const express = require('express');
const router = express.Router();
const { spawn } = require('node:child_process');
const path = require('node:path');

const SCRIPT = path.join(__dirname, '../scripts/scrapling_ifood.py');
const TIMEOUT_MS = 35_000;

// Whitelist estrita: só URLs do iFood
function validarUrlIfood(raw) {
  let parsed;
  try { parsed = new URL(raw); } catch { throw new Error('url inválida'); }
  if (!['https:', 'http:'].includes(parsed.protocol)) {
    throw new Error('url: protocolo não permitido');
  }
  if (!parsed.hostname.endsWith('ifood.com.br')) {
    throw new Error('url: apenas URLs do ifood.com.br são aceitas');
  }
  return parsed.href;
}

function runScraper(url) {
  return new Promise((resolve, reject) => {
    const proc = spawn('python3', [SCRIPT, url], {
      timeout: TIMEOUT_MS,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', d => { stdout += d; });
    proc.stderr.on('data', d => { stderr += d; });

    proc.on('close', code => {
      if (!stdout.trim()) {
        return reject(new Error(`scraper sem output (exit ${code}): ${stderr.slice(0, 200)}`));
      }
      try {
        const data = JSON.parse(stdout);
        if (data.erro) return reject(new Error(data.erro));
        resolve(data);
      } catch {
        reject(new Error('resposta do scraper não é JSON válido'));
      }
    });

    proc.on('error', err => reject(new Error(`falha ao iniciar scraper: ${err.message}`)));
  });
}

// POST /api/scraping/ifood-competitor
// Body: { url: string }
// Returns: { nome, url, categorias: [{ nome, itens: [{ nome, preco, descricao }] }] }
router.post('/ifood-competitor', async (req, res) => {
  try {
    const { url } = req.body ?? {};
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'campo url obrigatório' });
    }

    const urlSafe = validarUrlIfood(url);
    const dados = await runScraper(urlSafe);

    return res.json(dados);
  } catch (err) {
    const status = err.message?.includes('inválida') || err.message?.includes('não permitido') ? 400
      : err.message?.includes('apenas URLs') ? 403
      : 500;
    return res.status(status).json({ error: err.message });
  }
});

module.exports = router;
