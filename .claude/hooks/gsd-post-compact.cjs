#!/usr/bin/env node
// PostCompact: restaura contexto de trabalho apos compactacao automatica
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const projectDir = path.resolve(__dirname, '..', '..');

function safeExec(cmd) {
  try { return execSync(cmd, { cwd: projectDir, encoding: 'utf-8', timeout: 8000 }).trim(); }
  catch (_) { return ''; }
}

let raw = '';
process.stdin.on('data', chunk => (raw += chunk));
process.stdin.on('end', () => {
  let input = {};
  try { input = JSON.parse(raw); } catch (_) {}

  const branch = safeExec('git branch --show-current');
  const gitStatus = safeExec('git status --short');
  const recentCommits = safeExec('git log --oneline -5');

  let activePhase = '', phaseTitle = '';
  try {
    const planningDir = path.join(projectDir, '.planning');
    if (fs.existsSync(planningDir)) {
      const phases = fs.readdirSync(planningDir)
        .filter(f => f.startsWith('phase-'))
        .map(f => ({ name: f, mtime: fs.statSync(path.join(planningDir, f)).mtime }))
        .sort((a, b) => b.mtime - a.mtime);
      if (phases.length > 0) {
        activePhase = phases[0].name;
        const planPath = path.join(planningDir, activePhase, 'PLAN.md');
        if (fs.existsSync(planPath)) {
          const firstLine = fs.readFileSync(planPath, 'utf-8').split('\n').find(l => l.startsWith('#'));
          if (firstLine) phaseTitle = firstLine.replace(/^#+\s*/, '').trim();
        }
      }
    }
  } catch (_) {}

  const lines = [
    '=== CONTEXTO RESTAURADO (compactacao automatica) ===',
    `Branch: ${branch || 'desconhecido'}`,
    gitStatus ? `Arquivos com mudancas locais:\n${gitStatus}` : 'Working tree limpo',
    recentCommits ? `Commits recentes:\n${recentCommits}` : '',
    activePhase ? `Fase GSD ativa: ${phaseTitle || activePhase} (${activePhase})` : '',
    '====================================================',
    'Continue exatamente de onde parou.',
    'Se precisar revisar: git status, git diff, ou /gsd-progress.',
  ].filter(Boolean).join('\n');

  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PostCompact',
      additionalContext: lines
    }
  }) + '\n');
});
