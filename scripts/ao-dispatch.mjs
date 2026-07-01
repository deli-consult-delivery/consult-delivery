#!/usr/bin/env node
// Auto-despacho dos cards do botao "New Task": varre o ao.db, acha workers que ainda nao rodaram
// e injeta o brief guardado via /send. Uso do fluxo: crie a task no botao New Task -> rode isto.
// Uma passada so. Repita via loop do orquestrador (ScheduleWakeup) ou:  while true; do node scripts/ao-dispatch.mjs; sleep 30; done
import { DatabaseSync } from 'node:sqlite';
import { homedir } from 'node:os';
import { join } from 'node:path';

const API = process.env.AO_API || 'http://127.0.0.1:3001/api/v1';
const DB = process.env.AO_DB || join(homedir(), '.ao', 'data', 'ao.db');

const db = new DatabaseSync(DB, { readOnly: true });
// worker vivo, com brief, que nunca rodou, criado ha >10s (terminal ja subiu). 2-min de cadencia evita double-send.
const rows = db.prepare(`
  SELECT id, prompt FROM sessions
  WHERE kind='worker' AND is_terminated=0 AND first_signal_at IS NULL
    AND prompt IS NOT NULL AND prompt <> ''
    AND (julianday('now') - julianday(replace(created_at,' +0000 UTC',''))) * 86400 > 10
`).all();

if (!rows.length) { console.log('nada pendente'); process.exit(0); }
for (const r of rows) {
  const res = await fetch(`${API}/sessions/${r.id}/send`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: r.prompt }),
  });
  console.log(`${res.ok ? 'despachado' : 'FALHOU'}: ${r.id} <- ${r.prompt.slice(0, 50)}`);
}
