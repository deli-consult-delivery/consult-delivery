const express = require('express');
const router = express.Router();
const multer = require('multer');
const dns = require('node:dns').promises;

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });
const WHISPER_URL = 'http://127.0.0.1:3002/transcribe';
const MAX_MEDIA_BYTES = 50 * 1024 * 1024; // 50 MB — same as multer cap
const FETCH_TIMEOUT_MS = 30_000;

// Domínios legítimos que o bridge pode buscar server-side (Evolution API + Supabase storage)
const ALLOWED_MEDIA_HOSTS = [
  /\.evolutionapi\.com$/i,
  /^api\.evolutionapi\.com$/i,
  /\.supabase\.co$/i,
  /^czyanilrverorwenikqw\.supabase\.co$/i,
];

// RFC1918 + loopback + link-local + APIPA
const PRIVATE_IP_RE = /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|::1$|^fc|^fd|^fe80)/i;

async function validateMediaUrl(raw) {
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error('mediaUrl inválida');
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('mediaUrl: protocolo não permitido');
  }
  const hostOk = ALLOWED_MEDIA_HOSTS.some(re => re.test(parsed.hostname));
  if (!hostOk) {
    throw new Error('mediaUrl: host não autorizado');
  }
  // Resolve DNS e rejeita IPs privados/loopback para SSRF protection
  try {
    const addrs = await dns.lookup(parsed.hostname, { all: true });
    for (const { address } of addrs) {
      if (PRIVATE_IP_RE.test(address)) {
        throw new Error('mediaUrl: host resolve para endereço privado');
      }
    }
  } catch (e) {
    if (e.message.startsWith('mediaUrl:')) throw e;
    throw new Error('mediaUrl: falha na resolução DNS');
  }
  return parsed;
}

async function fetchMediaSafe(url) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ac.signal, redirect: 'manual' });
    // Rejeita redirects (evita redirect para endereço privado)
    if (res.status >= 300 && res.status < 400) {
      throw new Error('mediaUrl: redirect não permitido');
    }
    if (!res.ok) throw new Error(`Falha ao buscar mídia: ${res.status}`);

    // Verifica Content-Length antes de consumir
    const cl = parseInt(res.headers.get('content-length') || '0', 10);
    if (cl > MAX_MEDIA_BYTES) throw new Error('mediaUrl: arquivo excede 50 MB');

    // Lê em stream com limite
    const reader = res.body.getReader();
    const chunks = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > MAX_MEDIA_BYTES) {
        reader.cancel();
        throw new Error('mediaUrl: arquivo excede 50 MB');
      }
      chunks.push(value);
    }
    const buffer = Buffer.concat(chunks.map(c => Buffer.from(c)));
    const mimeType = res.headers.get('content-type') || 'audio/ogg';
    return { buffer, mimeType };
  } finally {
    clearTimeout(timer);
  }
}

async function sendToWhisper(buffer, mimeType, fileName) {
  const form = new FormData();
  const blob = new Blob([buffer], { type: mimeType });
  form.append('file', blob, fileName);
  const response = await fetch(WHISPER_URL, { method: 'POST', body: form });
  if (!response.ok) {
    throw new Error(`Whisper falhou (${response.status})`);
  }
  return response.json();
}

// POST /api/whisper/transcribe
// Requer JWT via requireJwt aplicado no index.js ao montar a rota.
// Aceita JSON { mediaUrl } (bridge busca server-side, com validação SSRF)
// ou multipart/form-data com campo "audio" (blob já no browser).
router.post('/transcribe', (req, res, next) => {
  const ct = req.headers['content-type'] || '';
  if (ct.includes('application/json')) return next();
  upload.single('audio')(req, res, next);
}, async (req, res) => {
  try {
    let buffer, mimeType, fileName;

    if (req.body?.mediaUrl) {
      await validateMediaUrl(req.body.mediaUrl);
      const fetched = await fetchMediaSafe(req.body.mediaUrl);
      buffer = fetched.buffer;
      mimeType = fetched.mimeType;
      fileName = 'audio.ogg';
    } else if (req.file) {
      buffer = req.file.buffer;
      mimeType = req.file.mimetype || 'audio/webm';
      fileName = req.file.originalname || 'audio.webm';
    } else {
      return res.status(400).json({ error: 'Campo "audio" ou "mediaUrl" obrigatório' });
    }

    const data = await sendToWhisper(buffer, mimeType, fileName);
    res.json(data);
  } catch (err) {
    console.error('[whisper] erro:', err.message);
    // Não vaza detalhes internos ao cliente
    res.status(500).json({ error: 'Erro na transcrição' });
  }
});

module.exports = router;
