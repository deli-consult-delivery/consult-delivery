#!/usr/bin/env node
// lint-persona.cjs — barra VALOR DE NEGÓCIO na camada de persona (Blueprint v2 §3/FASE 4).
//
// SOUL.md (persona) e SKILL.md (playbook de tom) devem ser SÓ persona/política — zero
// regra de negócio. Valores, %, prazos e tabelas vivem em tools MCP determinísticas no
// Bridge/Supabase, não na persona (senão derivam e ninguém audita). Este lint falha se
// achar um valor NUMÉRICO de negócio (R$, %, "N dias", decimal/limiar) nesses arquivos.
//
// Pega NÚMEROS, não palavras: as linhas de disclaimer ("prazos vivem no Bridge") são
// legítimas e não têm dígito → não disparam.
//
// Uso:  node hermes/routing/lint-persona.cjs            # falha (exit 1) se achar valor
//       node hermes/routing/lint-persona.cjs --self-test
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const HERMES_DIR = path.resolve(__dirname, '..');

// Cada regra: nome + regex de um valor de negócio numérico.
const RULES = [
  { name: 'valor em R$',        re: /R\$\s?\d/ },
  { name: 'percentual',         re: /\b\d+(?:[.,]\d+)?\s?%/ },
  { name: 'prazo em dias',      re: /\b\d+\s?dias?\b/i },
  { name: 'limiar/decimal',     re: /\b\d+[.,]\d+\b/ },
];

function scanText(text) {
  const hits = [];
  text.split('\n').forEach((line, i) => {
    for (const rule of RULES) {
      const m = line.match(rule.re);
      if (m) hits.push({ line: i + 1, rule: rule.name, trecho: m[0] });
    }
  });
  return hits;
}

function listFiles() {
  const files = [];
  const profDir = path.join(HERMES_DIR, 'profiles');
  if (fs.existsSync(profDir)) {
    for (const slug of fs.readdirSync(profDir)) {
      const f = path.join(profDir, slug, 'SOUL.md');
      if (fs.existsSync(f)) files.push(f);
    }
  }
  const skillsDir = path.join(HERMES_DIR, 'skills');
  if (fs.existsSync(skillsDir)) {
    const walk = (d) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) walk(p);
        else if (e.name === 'SKILL.md') files.push(p);
      }
    };
    walk(skillsDir);
  }
  return files;
}

function main() {
  const files = listFiles();
  let total = 0;
  for (const f of files) {
    const hits = scanText(fs.readFileSync(f, 'utf8'));
    for (const h of hits) {
      total++;
      process.stderr.write(`[lint-persona] ${path.relative(HERMES_DIR, f)}:${h.line} — ${h.rule}: "${h.trecho}"\n`);
    }
  }
  if (total > 0) {
    process.stderr.write(`[lint-persona] ${total} valor(es) de negócio na persona — mova p/ tools MCP no Bridge. FALHOU.\n`);
    process.exit(1);
  }
  process.stdout.write(`[lint-persona] OK — ${files.length} arquivo(s) de persona, zero valor de negócio.\n`);
}

if (process.argv.includes('--self-test')) {
  const bad = scanText('Cobro R$ 147 por loja e dou 40% após 7 dias, nota 4,5.');
  const good = scanText('Cobro com firmeza e respeito; valores e prazos vivem no Bridge.');
  const ok = bad.length >= 3 && good.length === 0;
  process.stdout.write(ok ? 'SELF-TEST OK\n' : `SELF-TEST FAIL (bad=${bad.length} good=${good.length})\n`);
  process.exit(ok ? 0 : 1);
}

main();
