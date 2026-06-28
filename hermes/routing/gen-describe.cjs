#!/usr/bin/env node
// gen-describe.cjs — gera o `profile describe` de cada agente do Hermes a partir do
// roteamento-como-dado (roster.json). O texto resultante é o que o decompositor-LLM
// do Kanban do Hermes lê para rotear tarefas entre profiles (Blueprint v2 §3/§6).
//
// É DETERMINÍSTICO e OFFLINE: não fala com o banco. roster.json é o espelho versionado
// da fonte canônica (Supabase agents/tenant_agents) — regenerar quando o catálogo mudar.
//
// Uso:
//   node hermes/routing/gen-describe.cjs          # escreve profiles/<slug>/describe.txt
//   node hermes/routing/gen-describe.cjs --check   # NÃO escreve; sai 1 se algo está fora de sincronia
//
// deploy-hermes.sh (na VPS) aplica cada describe.txt via:  hermes -p <slug> profile describe --text "$(cat …)"
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const HERMES_DIR = path.resolve(__dirname, '..');
const ROSTER = path.join(__dirname, 'roster.json');

/** Renderiza o texto de roteamento de um agente. Uma função pura, fácil de testar. */
function renderDescribe(agent) {
  const tools = (agent.toolsets || []).join(', ') || '—';
  return [
    `${agent.name} — ${agent.role}.`,
    agent.when,
    `Ferramentas (MCP): ${tools}.`,
    `Semáforo: ${agent.semaforo}.`,
  ].join('\n') + '\n';
}

function loadRoster() {
  const raw = JSON.parse(fs.readFileSync(ROSTER, 'utf8'));
  if (!Array.isArray(raw.agents) || raw.agents.length === 0) {
    throw new Error('roster.json sem agentes');
  }
  return raw.agents;
}

function describePath(slug) {
  return path.join(HERMES_DIR, 'profiles', slug, 'describe.txt');
}

function main() {
  const check = process.argv.includes('--check');
  const agents = loadRoster();
  let drift = 0;
  let written = 0;

  for (const agent of agents) {
    if (!agent.slug || !agent.name || !agent.role || !agent.when) {
      throw new Error(`agente inválido no roster: ${JSON.stringify(agent)}`);
    }
    const dir = path.join(HERMES_DIR, 'profiles', agent.slug);
    if (!fs.existsSync(dir)) {
      throw new Error(`profile dir ausente para slug "${agent.slug}" (${dir}) — crie o SOUL.md antes`);
    }
    const out = describePath(agent.slug);
    const next = renderDescribe(agent);
    const cur = fs.existsSync(out) ? fs.readFileSync(out, 'utf8') : null;

    if (check) {
      if (cur !== next) {
        drift++;
        process.stderr.write(`[gen-describe] DESSINCRONIZADO: ${agent.slug}\n`);
      }
    } else if (cur !== next) {
      fs.writeFileSync(out, next);
      written++;
    }
  }

  if (check) {
    if (drift > 0) {
      process.stderr.write(`[gen-describe] ${drift} describe.txt fora de sincronia — rode "node hermes/routing/gen-describe.cjs"\n`);
      process.exit(1);
    }
    process.stdout.write(`[gen-describe] OK — ${agents.length} describe em sincronia com o roster\n`);
  } else {
    process.stdout.write(`[gen-describe] ${written} escrito(s) / ${agents.length} agentes\n`);
  }
}

// Self-check mínimo (ponytail): roda só com --self-test, sem framework.
if (process.argv.includes('--self-test')) {
  const a = { name: 'X', role: 'Papel', when: 'Quando Y.', toolsets: ['cd-admin'], semaforo: 'verde' };
  const t = renderDescribe(a);
  const ok = t.includes('X — Papel.') && t.includes('Quando Y.') && t.includes('cd-admin') && t.includes('Semáforo: verde.');
  if (!ok) { process.stderr.write('SELF-TEST FAIL\n' + t); process.exit(1); }
  process.stdout.write('SELF-TEST OK\n');
  process.exit(0);
}

main();
