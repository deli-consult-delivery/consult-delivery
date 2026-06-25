#!/usr/bin/env node
/**
 * PreCompact hook — injeta template estruturado para que Claude preserve o essencial
 * no resumo de compactação. Também persiste o estado git em ~/.claude/handoffs/pre-compact.md
 * para que os hooks PostCompact e SessionStart possam restaurar contexto.
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

const branch = safeExec('git branch --show-current');
const gitStatus = safeExec('git status --short');
const recentCommits = safeExec('git log --oneline -5');
const modifiedFiles = safeExec("git diff --name-only HEAD 2>/dev/null; git diff --name-only --cached 2>/dev/null");
const now = new Date().toISOString();

// Persiste estado git para PostCompact e SessionStart lerem
const handoffsDir = path.join(os.homedir(), '.claude', 'handoffs');
try {
  fs.mkdirSync(handoffsDir, { recursive: true });
  const snapshot = [
    `---`,
    `timestamp: ${now}`,
    `branch: ${branch || 'unknown'}`,
    `---`,
    `# Snapshot Pré-Compactação — ${now}`,
    ``,
    `## Estado Git`,
    `Branch: ${branch || 'desconhecido'}`,
    gitStatus ? `\`\`\`\n${gitStatus}\n\`\`\`` : 'Working tree limpo',
    ``,
    `## Commits Recentes`,
    recentCommits ? `\`\`\`\n${recentCommits}\n\`\`\`` : '(nenhum)',
    ``,
    `## Arquivos Modificados`,
    modifiedFiles ? modifiedFiles.split('\n').map(f => `- ${f}`).join('\n') : '(nenhum)',
  ].filter(l => l !== undefined).join('\n');
  fs.writeFileSync(path.join(handoffsDir, 'pre-compact.md'), snapshot, 'utf-8');
} catch (_) {}

const stateBlock = [
  '=== ESTADO NESTE MOMENTO ===',
  `Branch: ${branch || 'desconhecido'}`,
  `Timestamp: ${now}`,
  gitStatus ? `Arquivos modificados:\n${gitStatus}` : 'Working tree limpo',
  recentCommits ? `Commits recentes:\n${recentCommits}` : '',
  '============================',
].filter(Boolean).join('\n');

const instructions = [
  '╔══ HANDOFF OBRIGATÓRIO — ANTES DE COMPACTAR ══╗',
  '║ O resumo desta sessão DEVE incluir os 6 itens ║',
  '╚═══════════════════════════════════════════════╝',
  '',
  '1. TAREFA ATIVA: qual exatamente é a tarefa em andamento? (seja específico, não genérico)',
  '2. STATUS:',
  '   - done=[] o que foi concluído nesta tarefa',
  '   - pendente=[] o que ainda falta fazer',
  '   - bloqueado=[] o que está bloqueado e por quê',
  '3. BRANCH + ARQUIVOS: branch atual e lista dos arquivos que foram criados/modificados',
  '4. DECISÕES desta sessão: decisões não-óbvias que não estão documentadas no código',
  '5. PRÓXIMO PASSO EXATO: o próximo comando ou ação concreta (não vaga)',
  '6. CONTEXTO CRÍTICO: IDs, endpoints, variáveis de ambiente, flags relevantes',
  '',
  '⚠️  Não resumir em termos genéricos. Cada item deve ter conteúdo real.',
  '⚠️  Se itens 4-6 não se aplicam, escrever "N/A" explicitamente.',
  '',
  stateBlock,
].join('\n');

process.stdout.write(JSON.stringify({
  hookSpecificOutput: {
    hookEventName: 'PreCompact',
    additionalContext: instructions,
  },
}) + '\n');
