#!/usr/bin/env node
// PreCompact: injeta instrucoes para Claude preservar contexto de trabalho no resumo
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const projectDir = path.resolve(__dirname, '..', '..');

function safeExec(cmd) {
  try { return execSync(cmd, { cwd: projectDir, encoding: 'utf-8', timeout: 8000 }).trim(); }
  catch (_) { return ''; }
}

const branch = safeExec('git branch --show-current');
const gitStatus = safeExec('git status --short');
const recentCommit = safeExec('git log --oneline -3');

// Detecta fase GSD ativa
let activePhase = '';
try {
  const planningDir = path.join(projectDir, '.planning');
  if (fs.existsSync(planningDir)) {
    const phases = fs.readdirSync(planningDir)
      .filter(f => f.startsWith('phase-'))
      .map(f => ({ name: f, mtime: fs.statSync(path.join(planningDir, f)).mtime }))
      .sort((a, b) => b.mtime - a.mtime);
    if (phases.length > 0) activePhase = phases[0].name;
  }
} catch (_) {}

const stateBlock = [
  '=== ESTADO NO MOMENTO DA COMPACTAÇÃO ===',
  `Branch: ${branch || 'desconhecido'}`,
  gitStatus ? `Arquivos modificados:\n${gitStatus}` : 'Working tree limpo',
  recentCommit ? `Commits recentes:\n${recentCommit}` : '',
  activePhase ? `Fase GSD ativa: ${activePhase}` : '',
  '=========================================',
].filter(Boolean).join('\n');

const instructions = [
  'INSTRUÇÃO PRÉ-COMPACTAÇÃO:',
  'Ao gerar o resumo desta sessão, inclua obrigatoriamente:',
  '1. A tarefa exata que estava sendo executada (seja específico)',
  '2. O que já foi concluído nesta tarefa',
  '3. O próximo passo concreto (próxima ação, próximo arquivo, próximo comando)',
  '4. Qualquer decisão ou contexto não-óbvio que não está no código',
  '5. Arquivos críticos abertos ou sendo editados',
  '',
  stateBlock,
].join('\n');

process.stdout.write(JSON.stringify({
  hookSpecificOutput: {
    hookEventName: 'PreCompact',
    additionalContext: instructions
  }
}) + '\n');
