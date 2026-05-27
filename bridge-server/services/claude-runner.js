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

module.exports = { runHeartbeatPrompt, runViaClaude, runViaAPI };
