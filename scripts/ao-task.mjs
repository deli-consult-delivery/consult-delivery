#!/usr/bin/env node
// Cria uma task no Agent Orchestrator que APARECE no board E executa.
// Uso: node scripts/ao-task.mjs "<brief completo>" [titulo curto]
// Ponte board<->orquestrador: 1) POST /sessions cria o card  2) POST /:id/send injeta o brief no terminal (roda).
const API = process.env.AO_API || 'http://127.0.0.1:3001/api/v1';
const PROJECT = process.env.AO_PROJECT || 'consult-delivery';

const brief = process.argv[2];
if (!brief) { console.error('uso: node scripts/ao-task.mjs "<brief>" [titulo]'); process.exit(1); }
const title = process.argv[3] || brief.slice(0, 60);

const post = async (path, body) => {
  const r = await fetch(API + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok) throw new Error(`${path} -> ${r.status} ${JSON.stringify(j)}`);
  return j;
};

const { session } = await post('/sessions', { projectId: PROJECT, kind: 'worker', prompt: title });
// ponytail: espera fixa p/ o terminal subir o Claude antes do send (senão a msg se perde). Subir p/ ~12s se ainda cair a corrida.
await new Promise(r => setTimeout(r, 8000));
await post(`/sessions/${session.id}/send`, { message: brief });
console.log(`card criado e despachado: ${session.id} (branch ${session.branch})`);
