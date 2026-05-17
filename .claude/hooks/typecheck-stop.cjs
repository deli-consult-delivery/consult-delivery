#!/usr/bin/env node
const { execSync } = require('child_process');
const path = require('path');

const projectDir = path.resolve(__dirname, '..', '..');
const tscBin = path.join(projectDir, 'node_modules', '.bin', 'tsc');

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
