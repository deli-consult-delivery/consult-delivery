const express = require('express');
const router = express.Router();
const multer = require('multer');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });
const WHISPER_URL = 'http://127.0.0.1:3002/transcribe';

async function sendToWhisper(buffer, mimeType, fileName) {
  const form = new FormData();
  const blob = new Blob([buffer], { type: mimeType });
  form.append('file', blob, fileName);
  const response = await fetch(WHISPER_URL, { method: 'POST', body: form });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Whisper HTTP ${response.status}: ${detail}`);
  }
  return response.json();
}

// POST /api/whisper/transcribe
// Aceita JSON { mediaUrl } (bridge busca server-side) ou multipart/form-data com campo "audio"
router.post('/transcribe', (req, res, next) => {
  const ct = req.headers['content-type'] || '';
  if (ct.includes('application/json')) return next();
  upload.single('audio')(req, res, next);
}, async (req, res) => {
  try {
    let buffer, mimeType, fileName;

    if (req.body?.mediaUrl) {
      const mediaRes = await fetch(req.body.mediaUrl);
      if (!mediaRes.ok) throw new Error(`Falha ao buscar mídia: ${mediaRes.status}`);
      buffer = Buffer.from(await mediaRes.arrayBuffer());
      mimeType = mediaRes.headers.get('content-type') || 'audio/ogg';
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
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
