'use strict';

const OLLAMA_BASE = (process.env.OLLAMA_BASE_URL || 'http://localhost:11434').replace(/\/$/, '');
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'kimi-k2.6:cloud';
const OLLAMA_TIMEOUT = 30_000;

const SYSTEM_PROMPT = `Você é um analisador de conversas de food delivery brasileiro.
Dado uma mensagem de cliente, retorne APENAS um JSON válido (sem markdown, sem explicação) no schema exato:
{"fatos":["string"],"tarefas_sugeridas":["string"],"confianca":number}

Regras:
- Responda SOMENTE com o JSON puro, nada antes ou depois
- "fatos": lista de fatos objetivos extraídos (mínimo 1 item)
- "tarefas_sugeridas": ações recomendadas para o atendente (pode ser lista vazia)
- "confianca": número de 0.0 a 1.0`;

async function callOllama(messageBody) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT);
  const start = Date.now();
  try {
    const res = await fetch(`${OLLAMA_BASE}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: messageBody },
        ],
        stream: false,
        format: 'json',
        options: { temperature: 0.1, num_predict: 512 },
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Ollama HTTP ${res.status}: ${body.slice(0, 200)}`);
    }

    const data = await res.json();
    if (data.error) throw new Error(data.error);

    return { text: data.message?.content ?? '', latencyMs: Date.now() - start };
  } finally {
    clearTimeout(timer);
  }
}

function parseSchema(raw) {
  let obj;
  try { obj = JSON.parse(raw.trim()); }
  catch {
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) throw new Error('Resposta não contém JSON');
    obj = JSON.parse(m[0]);
  }
  if (typeof obj !== 'object' || !obj) throw new Error('Raiz não é objeto');
  if (!Array.isArray(obj.fatos)) throw new Error('"fatos" ausente ou não é array');
  if (!Array.isArray(obj.tarefas_sugeridas)) throw new Error('"tarefas_sugeridas" ausente');
  if (typeof obj.confianca !== 'number') throw new Error('"confianca" ausente ou não é number');
  if (obj.confianca < 0 || obj.confianca > 1) throw new Error(`"confianca" fora de 0–1: ${obj.confianca}`);
  if (obj.fatos.length === 0) throw new Error('"fatos" vazio — mínimo 1 item');
  return { fatos: obj.fatos, tarefas_sugeridas: obj.tarefas_sugeridas, confianca: obj.confianca };
}

async function salvarAnalise({ SUPABASE_URL, SUPABASE_SERVICE_KEY }, row) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return;
  await fetch(`${SUPABASE_URL}/rest/v1/mia_analises`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(row),
  });
}

/**
 * Analisa uma mensagem de WhatsApp via Kimi K2.6.
 * Fire-and-forget — não lança exceção para o chamador.
 */
async function analisarMensagem({ SUPABASE_URL, SUPABASE_SERVICE_KEY }, payload) {
  const { tenant_id, conversation_id, message_id, sender_jid, message_body } = payload;

  if (!message_body || !tenant_id) {
    console.warn('[mia] analisar ignorado — message_body ou tenant_id ausente');
    return;
  }

  // Pular mensagens muito curtas ou sem conteúdo útil
  if (message_body.trim().length < 3) {
    await salvarAnalise({ SUPABASE_URL, SUPABASE_SERVICE_KEY }, {
      tenant_id, conversation_id: conversation_id || null,
      message_id: message_id || null, sender_jid: sender_jid || null,
      message_body, fatos: ['mensagem muito curta'], tarefas_sugeridas: [],
      confianca: null, model_used: OLLAMA_MODEL, latency_ms: 0, status: 'skipped',
    });
    return;
  }

  let latencyMs = 0;
  try {
    const { text, latencyMs: ms } = await callOllama(message_body);
    latencyMs = ms;
    const { fatos, tarefas_sugeridas, confianca } = parseSchema(text);

    await salvarAnalise({ SUPABASE_URL, SUPABASE_SERVICE_KEY }, {
      tenant_id, conversation_id: conversation_id || null,
      message_id: message_id || null, sender_jid: sender_jid || null,
      message_body, fatos, tarefas_sugeridas,
      confianca, model_used: OLLAMA_MODEL, latency_ms: latencyMs, status: 'ok',
    });

    console.log(`[mia] ok tenant=${tenant_id} confianca=${confianca} fatos=${fatos.length} ${latencyMs}ms`);
  } catch (err) {
    console.error('[mia] erro:', err.message);
    await salvarAnalise({ SUPABASE_URL, SUPABASE_SERVICE_KEY }, {
      tenant_id, conversation_id: conversation_id || null,
      message_id: message_id || null, sender_jid: sender_jid || null,
      message_body, fatos: [], tarefas_sugeridas: [],
      confianca: null, model_used: OLLAMA_MODEL, latency_ms: latencyMs,
      status: 'error', error_message: err.message.slice(0, 500),
    });
  }
}

module.exports = { analisarMensagem };
