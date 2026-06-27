#!/usr/bin/env node
/**
 * PostToolUse — watchdog de contexto.
 * Em vez de pedir ao usuário para salvar manualmente, salva automaticamente
 * um snapshot completo (git state + último checkpoint gstack) nos thresholds.
 * A mensagem é informativa, não uma chamada para ação.
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

function safeExec(cmd, cwd) {
  try { return execSync(cmd, { cwd, encoding: 'utf-8', timeout: 6000 }).trim(); }
  catch (_) { return ''; }
}

function findLatestGstackCheckpoint() {
  try {
    const gstackDir = path.join(os.homedir(), '.gstack', 'projects');
    if (!fs.existsSync(gstackDir)) return null;
    let latestFile = null, latestMtime = 0;
    for (const proj of fs.readdirSync(gstackDir)) {
      const cpDir = path.join(gstackDir, proj, 'checkpoints');
      if (!fs.existsSync(cpDir)) continue;
      for (const file of fs.readdirSync(cpDir).filter(f => f.endsWith('.md'))) {
        const fp = path.join(cpDir, file);
        const mtime = fs.statSync(fp).mtimeMs;
        if (mtime > latestMtime) { latestMtime = mtime; latestFile = fp; }
      }
    }
    if (!latestFile) return null;
    const ageHours = (Date.now() - latestMtime) / 3600000;
    if (ageHours > 24) return null;
    return fs.readFileSync(latestFile, 'utf-8').slice(0, 4000);
  } catch (_) { return null; }
}

function writeAutoSnapshot(trigger) {
  try {
    const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
    const branch = safeExec('git branch --show-current', projectDir);
    const gitStatus = safeExec('git status --short', projectDir);
    const recentCommits = safeExec('git log --oneline -5', projectDir);
    const diffStat = safeExec('git diff --stat', projectDir);
    const gstackCheckpoint = findLatestGstackCheckpoint();

    const handoffsDir = path.join(os.homedir(), '.claude', 'handoffs');
    fs.mkdirSync(handoffsDir, { recursive: true });

    const parts = [
      `---`,
      `timestamp: ${new Date().toISOString()}`,
      `branch: ${branch || 'unknown'}`,
      `trigger: ${trigger}`,
      `tool_calls: ${count}`,
      `---`,
      `# Auto-Snapshot @ ${count} tool calls`,
      ``,
      `## Estado Git`,
      `Branch: ${branch || 'desconhecido'}`,
      gitStatus ? `Status:\n\`\`\`\n${gitStatus}\n\`\`\`` : 'Working tree limpo',
      diffStat ? `Diff stat:\n\`\`\`\n${diffStat}\n\`\`\`` : '',
      recentCommits ? `Commits recentes:\n\`\`\`\n${recentCommits}\n\`\`\`` : '',
    ];

    if (gstackCheckpoint) {
      parts.push('', '## Último /context-save (checkpoint gstack)', gstackCheckpoint);
    }

    fs.writeFileSync(
      path.join(handoffsDir, 'pre-compact.md'),
      parts.filter(l => l !== undefined).join('\n'),
      'utf-8'
    );
    return true;
  } catch (_) { return false; }
}

// Thresholds: salva automaticamente, mensagem informativa (não pede ação)
const THRESHOLDS = [40, 60, 80];
const isThreshold = THRESHOLDS.includes(count) || (count > 80 && count % 10 === 0);

if (!isThreshold) {
  process.stdout.write(JSON.stringify({ continue: true, suppressOutput: true }) + '\n');
  process.exit(0);
}

const saved = writeAutoSnapshot(`watchdog-${count}-calls`);

const level = count >= 80 ? '🔴' : count >= 60 ? '🟠' : '🟡';
const pct   = count >= 80 ? '~90%+' : count >= 60 ? '~85%' : '~70%';

const message = saved
  ? `${level}  Contexto ${pct} (${count} tool calls) — snapshot preservado automaticamente.\nContinue normalmente. Na próxima compactação o contexto será restaurado.`
  : `${level}  Contexto ${pct} (${count} tool calls). Considere /context-save para preservar detalhes do trabalho atual.`;

process.stdout.write(JSON.stringify({
  continue: true,
  suppressOutput: false,
  hookSpecificOutput: {
    hookEventName: 'PostToolUse',
    additionalContext: message,
  },
}) + '\n');
