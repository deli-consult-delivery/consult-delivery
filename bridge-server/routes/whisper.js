const express = require('express');
const router = express.Router();
const multer = require('multer');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });
const WHISPER_URL = 'http://127.0.0.1:3002/transcribe';

// POST /api/whisper/transcribe
// Body: multipart/form-data, campo "audio" (blob de áudio ou vídeo)
router.post('/transcribe', upload.single('audio'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Campo "audio" obrigatório' });
  try {
    // Node.js v22 tem FormData e fetch nativos
    const form = new FormData();
    const blob = new Blob([req.file.buffer], { type: req.file.mimetype || 'audio/webm' });
    form.append('file', blob, req.file.originalname || 'audio.webm');

    const response = await fetch(WHISPER_URL, { method: 'POST', body: form });
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Whisper HTTP ${response.status}: ${detail}`);
    }
    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error('[whisper] erro:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
