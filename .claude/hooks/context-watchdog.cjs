#!/usr/bin/env node
/**
 * PostToolUse hook — contador de chamadas de ferramentas por sessão.
 * Proxy de uso de contexto: avisa Claude quando está se aproximando do limite.
 *
 * Threshold 40  (~70% estimado) → aviso: rode /context-save
 * Threshold 60  (~90% estimado) → aviso urgente: compactação iminente
 * Threshold 80+ → aviso a cada 10 calls
 *
 * Armazena contador em /tmp/cc-watchdog-<sessionId>
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const os = require('os');

const SESSION_ID = process.env.CLAUDE_CODE_SESSION_ID || process.env.CLAUDE_SESSION_ID || 'unknown';
const COUNTER_FILE = path.join(os.tmpdir(), `cc-watchdog-${SESSION_ID}`);

function getCount() {
  try { return parseInt(fs.readFileSync(COUNTER_FILE, 'utf-8').trim(), 10) || 0; }
  catch (_) { return 0; }
}

function setCount(n) {
  try { fs.writeFileSync(COUNTER_FILE, String(n), 'utf-8'); } catch (_) {}
}

const count = getCount() + 1;
setCount(count);

// Só emite aviso nos thresholds exatos (não todo turn)
let message = null;

if (count === 40) {
  message = [
    '⚠️  CONTEXTO ~70% — Execute /context-save agora.',
    'Isso garante que a próxima compactação automática preserve o trabalho desta sessão.',
    `Tool calls nesta sessão: ${count}`,
  ].join('\n');
} else if (count === 60) {
  message = [
    '🔴 CONTEXTO ~90% — Compactação automática iminente.',
    'Execute /context-save ANTES de prosseguir para não perder contexto.',
    `Tool calls nesta sessão: ${count}`,
  ].join('\n');
} else if (count > 60 && count % 10 === 0) {
  message = `🔴 Contexto saturado (${count} tool calls). Execute /context-save imediatamente.`;
}

if (!message) {
  process.stdout.write(JSON.stringify({ continue: true, suppressOutput: true }) + '\n');
  process.exit(0);
}

// Também persiste um snapshot rápido de git state no threshold 40
if (count === 40) {
  try {
    const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
    const branch = execSync('git branch --show-current', { cwd: projectDir, encoding: 'utf-8', timeout: 5000 }).trim();
    const gitStatus = execSync('git status --short', { cwd: projectDir, encoding: 'utf-8', timeout: 5000 }).trim();
    const handoffsDir = path.join(os.homedir(), '.claude', 'handoffs');
    fs.mkdirSync(handoffsDir, { recursive: true });
    const snapshot = [
      `---`,
      `timestamp: ${new Date().toISOString()}`,
      `branch: ${branch}`,
      `trigger: watchdog-40-calls`,
      `---`,
      `# Watchdog Snapshot @ 40 tool calls`,
      ``,
      `Branch: ${branch}`,
      gitStatus ? `Status:\n\`\`\`\n${gitStatus}\n\`\`\`` : 'Working tree limpo',
    ].join('\n');
    fs.writeFileSync(path.join(handoffsDir, 'pre-compact.md'), snapshot, 'utf-8');
  } catch (_) {}
}

process.stdout.write(JSON.stringify({
  continue: true,
  suppressOutput: false,
  hookSpecificOutput: {
    hookEventName: 'PostToolUse',
    additionalContext: message,
  },
}) + '\n');
