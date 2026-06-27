#!/usr/bin/env node
/**
 * PreCompact hook — persiste snapshot COMPLETO em disco antes de compactar:
 * git state + diff stat + último checkpoint gstack. Injeta instruções para
 * Claude incluir os 6 itens obrigatórios no resumo de compactação.
 * Sem ação manual necessária — tudo é automático.
 */
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const projectDir = process.env.CLAUDE_PROJECT_DIR || path.resolve(__dirname, '..', '..');

function safeExec(cmd) {
  try { return execSync(cmd, { cwd: projectDir, encoding: 'utf-8', timeout: 8000 }).trim(); }
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

const branch        = safeExec('git branch --show-current');
const gitStatus     = safeExec('git status --short');
const recentCommits = safeExec('git log --oneline -5');
const diffStat      = safeExec('git diff --stat');
const modifiedFiles = [
  ...safeExec('git diff --name-only HEAD 2>/dev/null').split('\n'),
  ...safeExec('git diff --name-only --cached 2>/dev/null').split('\n'),
].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i);
const gstackCheckpoint = findLatestGstackCheckpoint();
const now = new Date().toISOString();

// Persiste snapshot COMPLETO (git + gstack checkpoint) para PostCompact ler
const handoffsDir = path.join(os.homedir(), '.claude', 'handoffs');
try {
  fs.mkdirSync(handoffsDir, { recursive: true });
  const parts = [
    `---`,
    `timestamp: ${now}`,
    `branch: ${branch || 'unknown'}`,
    `trigger: pre-compact`,
    `---`,
    `# Snapshot Pré-Compactação — ${now}`,
    ``,
    `## Estado Git`,
    `Branch: ${branch || 'desconhecido'}`,
    gitStatus ? `\`\`\`\n${gitStatus}\n\`\`\`` : 'Working tree limpo',
    diffStat ? `Diff stat:\n\`\`\`\n${diffStat}\n\`\`\`` : '',
    ``,
    `## Commits Recentes`,
    recentCommits ? `\`\`\`\n${recentCommits}\n\`\`\`` : '(nenhum)',
    ``,
    `## Arquivos Modificados`,
    modifiedFiles.length ? modifiedFiles.map(f => `- ${f}`).join('\n') : '(nenhum)',
  ];
  if (gstackCheckpoint) {
    parts.push('', '## Último /context-save (checkpoint gstack)', gstackCheckpoint);
  }
  fs.writeFileSync(path.join(handoffsDir, 'pre-compact.md'), parts.filter(l => l !== undefined).join('\n'), 'utf-8');
} catch (_) {}

const stateBlock = [
  '=== ESTADO NESTE MOMENTO ===',
  `Branch: ${branch || 'desconhecido'}`,
  `Timestamp: ${now}`,
  gitStatus ? `Arquivos modificados:\n${gitStatus}` : 'Working tree limpo',
  recentCommits ? `Commits recentes:\n${recentCommits}` : '',
  gstackCheckpoint ? 'Checkpoint gstack disponível — PostCompact vai restaurar automaticamente.' : '',
  '============================',
].filter(Boolean).join('\n');

const instructions = [
  '╔══ HANDOFF OBRIGATÓRIO — ANTES DE COMPACTAR ══╗',
  '║ O resumo desta sessão DEVE incluir os 6 itens ║',
  '╚═══════════════════════════════════════════════╝',
  '',
  '1. TAREFA ATIVA: qual exatamente é a tarefa em andamento? (seja específico)',
  '2. STATUS:',
  '   - done=[] o que foi concluído',
  '   - pendente=[] o que ainda falta (próximo passo EXATO: arquivo + linha + o que fazer)',
  '   - bloqueado=[] o que está bloqueado e por quê',
  '3. BRANCH + ARQUIVOS: branch atual e todos os arquivos criados/modificados',
  '4. DECISÕES desta sessão: escolhas não-óbvias que não estão no código',
  '5. PRÓXIMO PASSO EXATO: comando ou ação concreta (não vaga)',
  '6. CONTEXTO CRÍTICO: IDs, tokens, flags, task IDs relevantes',
  '',
  '⚠️  Snapshot completo salvo automaticamente em disco. PostCompact vai restaurá-lo.',
  '⚠️  Não resumir em termos genéricos. Cada item deve ter conteúdo real.',
  '',
  stateBlock,
].join('\n');

process.stdout.write(JSON.stringify({
  hookSpecificOutput: {
    hookEventName: 'PreCompact',
    additionalContext: instructions,
  },
}) + '\n');
