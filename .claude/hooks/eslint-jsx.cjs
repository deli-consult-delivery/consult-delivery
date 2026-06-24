#!/usr/bin/env node
'use strict';
const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

let raw = '';
process.stdin.on('data', chunk => (raw += chunk));
process.stdin.on('end', () => {
  let input = {};
  try { input = JSON.parse(raw); } catch (_) {}

  const filePath = input.tool_input?.file_path || input.tool_input?.filePath || '';
  if (!filePath.match(/src[/\\].*\.jsx$/)) return;

  // Resolve project root (works from worktree too)
  function findProjectRoot(startDir) {
    let dir = startDir;
    for (;;) {
      if (fs.existsSync(path.join(dir, 'eslint.config.js'))) return dir;
      const parent = path.dirname(dir);
      if (parent === dir) return null;
      dir = parent;
    }
  }

  const projectDir = findProjectRoot(__dirname) || path.resolve(__dirname, '..', '..');

  function findBin(name, startDir) {
    let dir = startDir;
    for (;;) {
      const bin = path.join(dir, 'node_modules', '.bin', name);
      if (fs.existsSync(bin)) return bin;
      const parent = path.dirname(dir);
      if (parent === dir) return null;
      dir = parent;
    }
  }

  const eslintBin = findBin('eslint', projectDir);
  if (!eslintBin) return;

  const result = spawnSync(eslintBin, [filePath], {
    cwd: projectDir,
    encoding: 'utf-8',
    timeout: 30000,
  });

  if (result.status !== 0) {
    const out = ((result.stdout || '') + (result.stderr || '')).trim();
    if (!out) return;
    const lines = out.split('\n').filter(l => l.includes('error')).slice(0, 20).join('\n');
    if (!lines) return;
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PostToolUse',
          additionalContext: `ESLint errors in ${path.basename(filePath)}:\n${lines}`,
        },
      }) + '\n'
    );
  }
});
