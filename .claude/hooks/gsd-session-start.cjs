#!/usr/bin/env node
// Injects active GSD phase into Claude's context at session start
const fs = require('fs');
const path = require('path');

const planningDir = path.join(__dirname, '..', '..', '.planning');
if (!fs.existsSync(planningDir)) process.exit(0);

let activePhase = null;
try {
  const entries = fs.readdirSync(planningDir)
    .filter(f => f.startsWith('phase-'))
    .map(f => ({ name: f, mtime: fs.statSync(path.join(planningDir, f)).mtime }))
    .sort((a, b) => b.mtime - a.mtime);
  if (entries.length > 0) activePhase = entries[0].name;
} catch (_) {}

if (!activePhase) process.exit(0);

// Check for PLAN.md to get phase title
let phaseTitle = activePhase;
try {
  const planPath = path.join(planningDir, activePhase, 'PLAN.md');
  if (fs.existsSync(planPath)) {
    const firstLine = fs.readFileSync(planPath, 'utf-8').split('\n').find(l => l.startsWith('#'));
    if (firstLine) phaseTitle = firstLine.replace(/^#+\s*/, '').trim();
  }
} catch (_) {}

process.stdout.write(JSON.stringify({
  hookSpecificOutput: {
    hookEventName: 'SessionStart',
    additionalContext: `GSD active: ${phaseTitle} (${activePhase}). Run /gsd-progress to check status before starting work.`
  }
}) + '\n');
