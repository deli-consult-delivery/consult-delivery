const express = require('express');
const router = express.Router();
const dns = require('node:dns').promises;
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs/promises');

const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20 MB
const FETCH_TIMEOUT_MS = 30_000;

const ALLOWED_HOSTS = [
  /\.evolutionapi\.com$/i,
  /^api\.evolutionapi\.com$/i,
  /\.supabase\.co$/i,
  /^czyanilrverorwenikqw\.supabase\.co$/i,
];

const PRIVATE_IP_RE = /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|::1$|^fc|^fd|^fe80)/i;

const SUPPORTED_MIMES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'text/plain',
  'text/markdown',
  'text/csv',
]);

async function validateUrl(raw) {
  let parsed;
  try { parsed = new URL(raw); } catch { throw new Error('url inválida'); }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('url: protocolo não permitido');
  }
  if (!ALLOWED_HOSTS.some(re => re.test(parsed.hostname))) {
    throw new Error('url: host não autorizado');
  }
  try {
    const addrs = await dns.lookup(parsed.hostname, { all: true });
    for (const { address } of addrs) {
      if (PRIVATE_IP_RE.test(address)) throw new Error('url: host resolve para IP privado');
    }
  } catch (e) {
    if (e.message.startsWith('url:')) throw e;
    throw new Error('url: falha na resolução DNS');
  }
  return parsed;
}

async function fetchSafe(url) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ac.signal, redirect: 'manual' });
    if (res.status >= 300 && res.status < 400) throw new Error('redirect não permitido');
    if (!res.ok) throw new Error(`falha ao buscar arquivo: ${res.status}`);
    const contentLength = Number(res.headers.get('content-length') || 0);
    if (contentLength > MAX_FILE_BYTES) throw new Error('arquivo excede limite de 20 MB');

    const chunks = [];
    let total = 0;
    for await (const chunk of res.body) {
      total += chunk.length;
      if (total > MAX_FILE_BYTES) throw new Error('arquivo excede limite de 20 MB durante download');
      chunks.push(chunk);
    }
    const mimeRaw = res.headers.get('content-type') || '';
    const mime = mimeRaw.split(';')[0].trim().toLowerCase();
    return { buffer: Buffer.concat(chunks), mime };
  } finally {
    clearTimeout(timer);
  }
}

async function extractPdf(buffer) {
  const pdfParse = require('pdf-parse');
  const data = await pdfParse(buffer);
  return data.text || '';
}

async function extractDocx(buffer) {
  const mammoth = require('mammoth');
  const result = await mammoth.extractRawText({ buffer });
  return result.value || '';
}

async function extractXlsx(buffer) {
  const XLSX = require('xlsx');
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const lines = [];
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    lines.push(`## ${sheetName}`);
    lines.push(XLSX.utils.sheet_to_csv(ws));
  }
  return lines.join('\n');
}

async function extractText(buffer, mime) {
  if (mime === 'application/pdf') return extractPdf(buffer);
  if (mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      mime === 'application/msword') return extractDocx(buffer);
  if (mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      mime === 'application/vnd.ms-excel') return extractXlsx(buffer);
  if (mime.startsWith('text/')) return buffer.toString('utf8');
  throw new Error(`tipo não suportado: ${mime}`);
}

// POST /api/documents/extract-text
// Body: { url: string, mime_type?: string }
// Returns: { markdown: string, chars: number, mime: string, source: string }
router.post('/extract-text', async (req, res) => {
  try {
    const { url, mime_type } = req.body ?? {};
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'campo url obrigatório' });
    }

    const parsed = await validateUrl(url);
    const { buffer, mime: detectedMime } = await fetchSafe(parsed.href);

    const effectiveMime = (mime_type || detectedMime || '').toLowerCase();
    if (!SUPPORTED_MIMES.has(effectiveMime)) {
      return res.status(422).json({
        error: `tipo de arquivo não suportado: ${effectiveMime}`,
        supported: [...SUPPORTED_MIMES],
      });
    }

    const text = await extractText(buffer, effectiveMime);
    const markdown = text.trim();

    return res.json({
      markdown,
      chars: markdown.length,
      mime: effectiveMime,
      source: url,
    });
  } catch (err) {
    const status = err.message?.includes('não autorizado') ? 403
      : err.message?.includes('inválida') ? 400
      : err.message?.includes('não suportado') ? 422
      : 500;
    return res.status(status).json({ error: err.message });
  }
});

module.exports = router;
