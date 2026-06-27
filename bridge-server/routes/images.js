const express = require('express');
const router = express.Router();

const HF_API = 'https://api-inference.huggingface.co/models/black-forest-labs/FLUX.1-schnell';
const PROMPT_MAX = 500;
const IMAGE_TIMEOUT_MS = 60_000; // FLUX schnell leva ~10-30s no free tier

function getHfToken() {
  const token = process.env.HF_TOKEN;
  if (!token) throw new Error('HF_TOKEN não configurado');
  return token;
}

function getSupabaseStorage() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase não configurado');
  return { url, key };
}

async function gerarImagem(prompt) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), IMAGE_TIMEOUT_MS);
  try {
    const res = await fetch(HF_API, {
      method: 'POST',
      signal: ac.signal,
      headers: {
        Authorization: `Bearer ${getHfToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        inputs: prompt,
        parameters: { num_inference_steps: 4 }, // schnell padrão — rápido
      }),
    });

    if (res.status === 503) {
      const body = await res.json().catch(() => ({}));
      const wait = body.estimated_time ?? 20;
      throw new Error(`modelo carregando — tente novamente em ${Math.ceil(wait)}s`);
    }
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`HuggingFace erro ${res.status}: ${body.slice(0, 200)}`);
    }

    return Buffer.from(await res.arrayBuffer());
  } finally {
    clearTimeout(timer);
  }
}

async function salvarNoStorage(imageBuffer, filename) {
  const { url, key } = getSupabaseStorage();
  const storageUrl = `${url}/storage/v1/object/marketing/${filename}`;

  const res = await fetch(storageUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'image/png',
      'x-upsert': 'true',
    },
    body: imageBuffer,
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`falha ao salvar imagem: ${body.slice(0, 200)}`);
  }

  // URL pública do Supabase Storage
  return `${url}/storage/v1/object/public/marketing/${filename}`;
}

// POST /api/images/generate
// Body: { prompt: string, filename?: string }
// Returns: { url: string, prompt: string, model: string }
router.post('/generate', async (req, res) => {
  try {
    const { prompt, filename } = req.body ?? {};

    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
      return res.status(400).json({ error: 'campo prompt obrigatório' });
    }
    if (prompt.length > PROMPT_MAX) {
      return res.status(400).json({ error: `prompt excede ${PROMPT_MAX} caracteres` });
    }

    const imageBuffer = await gerarImagem(prompt.trim());

    const ts = Date.now();
    const safeName = (filename || `img-${ts}`).replace(/[^a-z0-9_-]/gi, '-');
    const storagePath = `${safeName}-${ts}.png`;

    const publicUrl = await salvarNoStorage(imageBuffer, storagePath);

    return res.json({
      url: publicUrl,
      prompt: prompt.trim(),
      model: 'FLUX.1-schnell',
    });
  } catch (err) {
    const status = err.message?.includes('carregando') ? 503
      : err.message?.includes('obrigatório') || err.message?.includes('excede') ? 400
      : 500;
    return res.status(status).json({ error: err.message });
  }
});

module.exports = router;
