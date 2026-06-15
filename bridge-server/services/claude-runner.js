'use strict';

/**
 * claude-runner.js — executa prompts via Claude Code CLI (assinatura) ou Anthropic API
 *
 * Modo CLI: usa `claude --print` como subprocess (requer claude instalado no VPS)
 * Modo API: usa @anthropic-ai/sdk com ANTHROPIC_API_KEY
 *
 * O modo é escolhido por heartbeat.execution_mode ('api' | 'claude_cli').
 * Se CLI falhar, cai automaticamente para API como fallback.
 */

const { spawn } = require('child_process');

async function runViaClaude(prompt, options = {}) {
  const timeout = (options.timeout_seconds || 120) * 1000;
  const model   = options.model || 'claude-sonnet-4-6';

  return new Promise((resolve, reject) => {
    const args = [
      '--print',
      '--dangerously-skip-permissions',
      '--model', model,
      prompt,
    ];

    const child = spawn('claude', args, {
      env: { ...process.env, ...(options.env || {}) },
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      reject(new Error(`claude CLI timeout após ${timeout}ms`));
    }, timeout);

    child.stdout.on('data', d => { stdout += d.toString(); });
    child.stderr.on('data', d => { stderr += d.toString(); });

    child.on('close', code => {
      clearTimeout(timer);
      if (timedOut) return;
      if (code === 0) {
        resolve({ output: stdout.trim(), mode: 'claude_cli', tokens: null });
      } else {
        reject(new Error(`claude CLI saiu com código ${code}: ${stderr.slice(0, 400)}`));
      }
    });

    child.on('error', err => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

async function runViaAPI(prompt, options = {}) {
  const Anthropic = require('@anthropic-ai/sdk');
  const apiKey = options.api_key || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY não configurada');

  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model: options.model || process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001',
    max_tokens: options.max_tokens || 2048,
    messages: [{ role: 'user', content: prompt }],
    ...(options.system ? { system: options.system } : {}),
  });

  const output = response.content
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('');

  const tokens = (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0);
  const cost   = ((response.usage?.input_tokens || 0) * 0.00000025)
               + ((response.usage?.output_tokens || 0) * 0.00000125);

  return { output, mode: 'api', tokens, cost };
}

const OLLAMA_BASE = (process.env.OLLAMA_BASE_URL || 'http://localhost:11434').replace(/\/$/, '');
const OLLAMA_DEFAULT_MODEL = process.env.OLLAMA_MODEL || 'kimi-k2.6';
const OLLAMA_API_KEY = process.env.OLLAMA_API_KEY || '';
const OLLAMA_DEFAULT_TIMEOUT = 60_000;

/**
 * runViaOllama — executa um prompt via provedor Ollama (mesmo modelo que o Breno/MIA usa).
 *
 * Reusa as env vars OLLAMA_* (OLLAMA_BASE_URL / OLLAMA_MODEL / OLLAMA_API_KEY), então
 * acompanha automaticamente o modelo do Breno (kimi-k2.6 via Ollama Cloud) sem hardcode.
 * Mesmo contrato de retorno do runViaAPI: { output, mode, tokens }.
 *
 * options:
 *   - system:      prompt de sistema (opcional → vira messages[0] role:'system')
 *   - format:      'json' força saída JSON (passar SÓ quando o chamador faz JSON.parse)
 *   - max_tokens:  limite de geração → num_predict (default 700)
 *   - temperature: default 0.5
 *   - timeout_ms:  default 60s
 *   - model:       override do modelo (default OLLAMA_MODEL)
 *   - think:       default false. kimi-k2.6 é um modelo de reasoning: com think
 *                  ligado ele gasta o num_predict preenchendo message.thinking e só
 *                  emite message.content DEPOIS — se o cap estourar antes, content
 *                  volta vazio. think:false desliga o reasoning → content direto,
 *                  mais rápido e barato. Passe think:true só se quiser raciocínio.
 */
async function runViaOllama(prompt, options = {}) {
  const model   = options.model || OLLAMA_DEFAULT_MODEL;
  const timeout = options.timeout_ms || OLLAMA_DEFAULT_TIMEOUT;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  const messages = [];
  if (options.system) messages.push({ role: 'system', content: options.system });
  messages.push({ role: 'user', content: prompt });

  try {
    const res = await fetch(`${OLLAMA_BASE}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(OLLAMA_API_KEY ? { Authorization: `Bearer ${OLLAMA_API_KEY}` } : {}),
      },
      body: JSON.stringify({
        model,
        messages,
        stream: false,
        think: options.think ?? false,
        ...(options.format === 'json' ? { format: 'json' } : {}),
        options: {
          temperature: options.temperature ?? 0.5,
          num_predict: options.max_tokens || 700,
        },
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      throw new Error(`Ollama HTTP ${res.status}: ${errBody.slice(0, 200)}`);
    }

    const data = await res.json();
    if (data.error) {
      throw new Error(typeof data.error === 'string' ? data.error : JSON.stringify(data.error));
    }

    const output = data.message?.content ?? '';
    const tokens = (data.prompt_eval_count || 0) + (data.eval_count || 0);

    return { output, mode: 'ollama', tokens };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * runHeartbeatPrompt — entry point principal
 * Escolhe modo baseado em heartbeat.execution_mode, com fallback para API.
 */
async function runHeartbeatPrompt(heartbeat, extraOptions = {}) {
  const mode = heartbeat.execution_mode || 'api';

  if (mode === 'claude_cli') {
    try {
      return await runViaClaude(heartbeat.prompt, {
        timeout_seconds: heartbeat.timeout_seconds || 120,
        ...extraOptions,
      });
    } catch (cliErr) {
      console.warn('[claude-runner] CLI falhou, tentando API:', cliErr.message);
      // Fallback para API
    }
  }

  return await runViaAPI(heartbeat.prompt, {
    max_tokens: heartbeat.max_tokens || 2048,
    timeout_seconds: heartbeat.timeout_seconds || 120,
    ...extraOptions,
  });
}

module.exports = { runHeartbeatPrompt, runViaClaude, runViaAPI, runViaOllama };
