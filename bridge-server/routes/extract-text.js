const express = require('express');
const router = express.Router();
const dns = require('node:dns').promises;

const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20 MB
const FETCH_TIMEOUT_MS = 30_000;

// Mesma whitelist do whisper.js — só Supabase Storage e Evolution API
const ALLOWED_HOSTS = [
  /\.evolutionapi\.com$/i,
  /^api\.evolutionapi\.com$/i,
  /\.supabase\.co$/i,
  /^czyanilrverorwenikqw\.supabase\.co$/i,
];

const PRIVATE_IP_RE = /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|::1$|^fc|^fd|^fe80)/i;

// MIME aceitos — mapa para parser (não expor ao cliente para controlar)
const MIME_TO_PARSER = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/msword': 'docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-excel': 'xlsx',
  'text/plain': 'text',
  'text/markdown': 'text',
  'text/csv': 'text',
};

// Assinaturas de magic bytes para validação independente de MIME
const MAGIC = [
  { bytes: Buffer.from([0x25, 0x50, 0x44, 0x46]), parser: 'pdf' },       // %PDF
  { bytes: Buffer.from([0x50, 0x4b, 0x03, 0x04]), parser: 'zip-based' }, // PK (docx/xlsx são zip)
];

function detectMagic(buffer) {
  for (const { bytes, parser } of MAGIC) {
    if (buffer.slice(0, bytes.length).equals(bytes)) return parser;
  }
  return null;
}

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
      if (total > MAX_FILE_BYTES) throw new Error('arquivo excede 20 MB durante download');
      chunks.push(chunk);
    }
    // Content-Type do servidor é fonte primária — mime_type do cliente só como fallback
    const serverMime = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    return { buffer: Buffer.concat(chunks), serverMime };
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
    lines.push(`## ${sheetName}`);
    lines.push(XLSX.utils.sheet_to_csv(wb.Sheets[sheetName]));
  }
  return lines.join('\n');
}

async function runParser(parser, buffer) {
  if (parser === 'pdf') return extractPdf(buffer);
  if (parser === 'docx') return extractDocx(buffer);
  if (parser === 'xlsx') return extractXlsx(buffer);
  if (parser === 'text') return buffer.toString('utf8');
  throw new Error(`parser interno desconhecido: ${parser}`);
}

// POST /api/documents/extract-text
// Body: { url: string, mime_type?: string }
// Returns: { markdown: string, chars: number, mime: string }
router.post('/extract-text', async (req, res) => {
  try {
    const { url, mime_type } = req.body ?? {};
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'campo url obrigatório' });
    }

    const parsed = await validateUrl(url);
    const { buffer, serverMime } = await fetchSafe(parsed.href);

    // Servidor tem precedência; cliente só preenche lacuna quando servidor omite MIME
    const effectiveMime = (serverMime || (mime_type ?? '').toLowerCase()).trim();

    const parser = MIME_TO_PARSER[effectiveMime];
    if (!parser) {
      return res.status(422).json({
        error: `tipo de arquivo não suportado: ${effectiveMime || '(desconhecido)'}`,
        supported: Object.keys(MIME_TO_PARSER),
      });
    }

    // Validação de magic bytes: impede que cliente force parser errado
    const magic = detectMagic(buffer);
    if (magic === 'pdf' && parser !== 'pdf') {
      return res.status(422).json({ error: 'conteúdo parece PDF mas MIME indica outro formato' });
    }
    if (magic === 'zip-based' && parser === 'pdf') {
      return res.status(422).json({ error: 'conteúdo parece ZIP/Office mas MIME indica PDF' });
    }

    const text = await runParser(parser, buffer);
    const markdown = text.trim();

    return res.json({ markdown, chars: markdown.length, mime: effectiveMime });
  } catch (err) {
    const status = err.message?.includes('não autorizado') ? 403
      : err.message?.includes('inválida') ? 400
      : err.message?.includes('não suportado') ? 422
      : 500;
    return res.status(status).json({ error: err.message });
  }
});

module.exports = router;
