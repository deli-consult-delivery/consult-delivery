#!/usr/bin/env node
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const projectDir = path.resolve(__dirname, '..', '..');

// Resolve o tsc subindo a árvore de diretórios. Num git worktree o projectDir
// não tem node_modules próprio (gitignored) — as deps vivem no checkout
// principal, alguns níveis acima. Andar pra cima acha o tsc lá, igual ao npx.
function findTsc(startDir) {
  let dir = startDir;
  for (;;) {
    const bin = path.join(dir, 'node_modules', '.bin', 'tsc');
    if (fs.existsSync(bin)) return bin;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

const tscBin = findTsc(projectDir);

// Sem tsc instalado em lugar nenhum → infra de typecheck ausente, não é erro
// de código. Liberar o stop em vez de reportar falso "TypeScript errors found".
if (!tscBin) {
  process.exit(0);
}

try {
  execSync(`"${tscBin}" --noEmit`, { cwd: projectDir, stdio: 'pipe', timeout: 55000 });
  // TypeScript OK — allow stop
  process.exit(0);
} catch (e) {
  const out = ((e.stdout || Buffer.alloc(0)).toString('utf-8') + (e.stderr || Buffer.alloc(0)).toString('utf-8')).trim();
  const lines = out ? out.split('\n').slice(0, 30).join('\n') : 'tsc falhou sem output.';
  process.stdout.write(JSON.stringify({
    continue: false,
    stopReason: 'TypeScript errors found — fix before marking work done.',
    systemMessage: `tsc --noEmit falhou. Corrija os erros antes de concluir:\n\n${lines}`
  }) + '\n');
  process.exit(0);
}
