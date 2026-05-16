#!/usr/bin/env node
// After a git commit, suggests gsd-capture for non-obvious decisions
let raw = '';
process.stdin.on('data', chunk => (raw += chunk));
process.stdin.on('end', () => {
  let input = {};
  try { input = JSON.parse(raw); } catch (_) {}

  const cmd = input.tool_input?.command || '';
  if (!cmd.match(/git\s+commit/)) return;

  // Only hint if it looks like a feature/fix commit (not a merge or chore)
  if (cmd.match(/merge|Merge|chore|wip|WIP/)) return;

  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PostToolUse',
      additionalContext: 'Commit feito. Se esta decisão tiver contexto não-óbvio (por quê, não o quê), considere /gsd-capture para preservar para sessões futuras.'
    }
  }) + '\n');
});
