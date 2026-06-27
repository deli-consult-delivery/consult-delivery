const express = require('express');
const router = express.Router();
const { spawn } = require('node:child_process');
const path = require('node:path');

const SCRIPT = path.join(__dirname, '../scripts/scrapling_ifood.py');
const TIMEOUT_MS = 35_000;
const URL_MAX_LEN = 2048;

// Apenas domínio exato e subdomínios legítimos do iFood
const IFOOD_HOSTNAMES = new Set(['www.ifood.com.br', 'ifood.com.br']);

function validarUrlIfood(raw) {
  if (typeof raw !== 'string' || raw.length > URL_MAX_LEN) {
    throw new Error('url inválida');
  }
  let parsed;
  try { parsed = new URL(raw); } catch { throw new Error('url inválida'); }

  // Só HTTPS em produção
  if (parsed.protocol !== 'https:') {
    throw new Error('url: apenas HTTPS permitido');
  }
  // Hostname exato — evita bypass via xifood.com.br ou evil.ifood.com.br.attacker.com
  if (!IFOOD_HOSTNAMES.has(parsed.hostname)) {
    throw new Error('url: apenas URLs do ifood.com.br são aceitas');
  }
  // Sem credenciais embutidas
  if (parsed.username || parsed.password) {
    throw new Error('url: credenciais não permitidas');
  }
  return parsed.href;
}

function runScraper(url) {
  return new Promise((resolve, reject) => {
    const proc = spawn('python3', [SCRIPT, url], {
      timeout: TIMEOUT_MS,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { PATH: process.env.PATH }, // ambiente mínimo, sem secrets do processo pai
    });

    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', d => { stdout += d; if (stdout.length > 500_000) proc.kill(); });
    proc.stderr.on('data', d => { stderr += d; });

    proc.on('close', code => {
      if (!stdout.trim()) {
        // Não expõe stderr ao cliente — loga internamente
        console.error('[scraping] scraper sem output', { code, stderr: stderr.slice(0, 500) });
        return reject(new Error('falha ao raspar o endereço informado'));
      }
      try {
        const data = JSON.parse(stdout);
        if (data.erro) return reject(new Error(data.erro));
        resolve(data);
      } catch {
        reject(new Error('resposta do scraper inválida'));
      }
    });

    proc.on('error', err => {
      console.error('[scraping] falha ao iniciar scraper', err.message);
      reject(new Error('scraper indisponível'));
    });
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
      : err.message?.includes('apenas URLs') || err.message?.includes('apenas HTTPS') ? 403
      : 500;
    return res.status(status).json({ error: err.message });
  }
});

module.exports = router;
