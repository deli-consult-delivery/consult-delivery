#!/usr/bin/env node
const { execSync } = require('child_process');
const path = require('path');

let raw = '';
process.stdin.on('data', chunk => (raw += chunk));
process.stdin.on('end', () => {
  let input = {};
  try { input = JSON.parse(raw); } catch (_) {}

  const filePath = input.tool_input?.file_path || input.tool_input?.filePath || '';
  if (!filePath.match(/trigger[/\\].*\.ts$/)) return;

  const projectDir = path.resolve(__dirname, '..', '..');
  const tscBin = path.join(projectDir, 'node_modules', '.bin', 'tsc');

  try {
    execSync(`"${tscBin}" --noEmit`, { cwd: projectDir, stdio: 'pipe', timeout: 30000 });
  } catch (e) {
    const out = ((e.stdout || Buffer.alloc(0)).toString('utf-8') + (e.stderr || Buffer.alloc(0)).toString('utf-8')).trim();
    if (!out) return;
    const lines = out.split('\n').slice(0, 25).join('\n');
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PostToolUse',
        additionalContext: `TypeScript errors in trigger/ after editing ${path.basename(filePath)}:\n${lines}`
      }
    }) + '\n');
  }
});
