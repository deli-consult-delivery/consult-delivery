#!/usr/bin/env node
/**
 * PostCompact hook — restaura contexto após compactação automática.
 * Lê o snapshot pré-compactação (~/.claude/handoffs/pre-compact.md) e
 * o checkpoint gstack mais recente para injetar como additionalContext.
 */
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const projectDir = path.resolve(__dirname, '..', '..');

function safeExec(cmd) {
  try { return execSync(cmd, { cwd: projectDir, encoding: 'utf-8', timeout: 8000 }).trim(); }
  catch (_) { return ''; }
}

function findLatestGstackCheckpoint() {
  try {
    const gstackDir = path.join(os.homedir(), '.gstack', 'projects');
    if (!fs.existsSync(gstackDir)) return null;
    const projects = fs.readdirSync(gstackDir);
    let latestFile = null, latestMtime = 0;
    for (const proj of projects) {
      const checkpointsDir = path.join(gstackDir, proj, 'checkpoints');
      if (!fs.existsSync(checkpointsDir)) continue;
      const files = fs.readdirSync(checkpointsDir).filter(f => f.endsWith('.md'));
      for (const file of files) {
        const filePath = path.join(checkpointsDir, file);
        const mtime = fs.statSync(filePath).mtimeMs;
        if (mtime > latestMtime) { latestMtime = mtime; latestFile = filePath; }
      }
    }
    if (!latestFile) return null;
    const ageHours = (Date.now() - latestMtime) / 3600000;
    if (ageHours > 8) return null;
    return fs.readFileSync(latestFile, 'utf-8').slice(0, 3000);
  } catch (_) { return null; }
}

function readPreCompactSnapshot() {
  try {
    const snapshotPath = path.join(os.homedir(), '.claude', 'handoffs', 'pre-compact.md');
    if (!fs.existsSync(snapshotPath)) return null;
    const stat = fs.statSync(snapshotPath);
    const ageMinutes = (Date.now() - stat.mtimeMs) / 60000;
    if (ageMinutes > 60) return null;
    return fs.readFileSync(snapshotPath, 'utf-8');
  } catch (_) { return null; }
}

let raw = '';
process.stdin.on('data', chunk => (raw += chunk));
process.stdin.on('end', () => {
  const branch = safeExec('git branch --show-current');
  const gitStatus = safeExec('git status --short');
  const recentCommits = safeExec('git log --oneline -5');

  const parts = [
    '╔══ CONTEXTO RESTAURADO (após compactação automática) ══╗',
    '',
    `Branch: ${branch || 'desconhecido'}`,
    gitStatus ? `Arquivos com mudanças locais:\n${gitStatus}` : 'Working tree limpo',
    recentCommits ? `Commits recentes:\n${recentCommits}` : '',
  ];

  const preCompact = readPreCompactSnapshot();
  if (preCompact) {
    parts.push('', '--- Snapshot capturado antes da compactação ---', preCompact);
  }

  const gstackCheckpoint = findLatestGstackCheckpoint();
  if (gstackCheckpoint) {
    parts.push('', '--- Último checkpoint /context-save ---', gstackCheckpoint);
  }

  parts.push(
    '',
    '╚══════════════════════════════════════════════════════╝',
    'Continue exatamente de onde parou. Use o contexto acima para retomar.',
    'Em caso de dúvida: git status, git diff, ou /context-restore.',
  );

  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PostCompact',
      additionalContext: parts.filter(Boolean).join('\n'),
    },
  }) + '\n');
});
