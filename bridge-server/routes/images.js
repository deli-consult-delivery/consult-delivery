const express = require('express');
const router = express.Router();
const crypto = require('node:crypto');

const HF_API = 'https://api-inference.huggingface.co/models/black-forest-labs/FLUX.1-schnell';
const PROMPT_MAX = 500;
const IMAGE_TIMEOUT_MS = 60_000;
const IMAGE_MAX_BYTES = 10 * 1024 * 1024; // 10 MB

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
        parameters: { num_inference_steps: 4 },
      }),
    });

    if (res.status === 503) {
      const body = await res.json().catch(() => ({}));
      const wait = body.estimated_time ?? 20;
      throw new Error(`modelo carregando — tente novamente em ${Math.ceil(wait)}s`);
    }
    if (!res.ok) {
      // Não expõe corpo da resposta HF ao cliente
      console.error('[images] HF erro', res.status);
      throw new Error(`falha na geração de imagem (${res.status})`);
    }

    // Validar que a resposta é realmente uma imagem
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.startsWith('image/')) {
      console.error('[images] HF retornou content-type inesperado:', contentType);
      throw new Error('resposta inesperada do modelo de imagem');
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length > IMAGE_MAX_BYTES) throw new Error('imagem gerada excede limite de 10 MB');

    // Validar magic bytes PNG (89 50 4E 47)
    if (buffer[0] !== 0x89 || buffer[1] !== 0x50 || buffer[2] !== 0x4e || buffer[3] !== 0x47) {
      throw new Error('imagem gerada não é PNG válido');
    }

    return buffer;
  } finally {
    clearTimeout(timer);
  }
}

async function salvarNoStorage(imageBuffer, tenantId, label) {
  const { url, key } = getSupabaseStorage();

  // Path namespaced por tenant + UUID não adivinhável — sem upsert (não sobrescreve)
  const uniqueId = crypto.randomUUID();
  const safeLabel = label.replace(/[^a-z0-9_-]/gi, '-').slice(0, 40);
  const storagePath = `${tenantId}/${safeLabel}-${uniqueId}.png`;

  const storageUrl = `${url}/storage/v1/object/marketing/${storagePath}`;
  const res = await fetch(storageUrl, {
    method: 'POST', // POST sem x-upsert = não sobrescreve arquivo existente
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'image/png',
    },
    body: imageBuffer,
  });

  if (!res.ok) {
    console.error('[images] falha ao salvar no Storage', res.status);
    throw new Error('falha ao salvar imagem');
  }

  return `${url}/storage/v1/object/public/marketing/${storagePath}`;
}

// POST /api/images/generate
// Body: { prompt: string, label?: string }
// Returns: { url: string, prompt: string, model: string }
// Requer: req.user.tenant_id (via requireJwt)
router.post('/generate', async (req, res) => {
  try {
    const tenantId = req.user?.tenant_id;
    if (!tenantId) return res.status(403).json({ error: 'tenant não identificado' });

    const { prompt, label } = req.body ?? {};

    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
      return res.status(400).json({ error: 'campo prompt obrigatório' });
    }
    if (prompt.length > PROMPT_MAX) {
      return res.status(400).json({ error: `prompt excede ${PROMPT_MAX} caracteres` });
    }

    const imageBuffer = await gerarImagem(prompt.trim());
    const publicUrl = await salvarNoStorage(imageBuffer, tenantId, label || 'img');

    return res.json({ url: publicUrl, prompt: prompt.trim(), model: 'FLUX.1-schnell' });
  } catch (err) {
    const status = err.message?.includes('carregando') ? 503
      : err.message?.includes('obrigatório') || err.message?.includes('excede') ? 400
      : err.message?.includes('tenant') ? 403
      : 500;
    return res.status(status).json({ error: err.message });
  }
});

module.exports = router;
