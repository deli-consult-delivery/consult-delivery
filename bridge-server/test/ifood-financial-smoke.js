// bridge-server/test/ifood-financial-smoke.js — smoke LIVE (read-only) dos 3
// endpoints Financial novos (PR #790): listarRepasses (Settlement),
// listarAntecipacoes (Anticipation), listarOcorrencias (Reconciliation/
// occurrences). Usa lib/ifood.js DIRETO (NÃO sobe o Bridge). Só GET — nenhuma
// escrita, nada a limpar.
//
// Objetivo desta rodada: confirmar se os 3 paths inferidos (settlements,
// anticipations, occurrences) existem de verdade no sandbox, ou se algum
// 404 aponta pro path certo documentado em #789 (financialEvents no lugar
// de occurrences, por exemplo).
//
// Rodar (na VPS/ambiente com credencial real no Infisical/.env do Bridge):
//   cd bridge-server && node -r dotenv/config test/ifood-financial-smoke.js
'use strict';

const ifood = require('../lib/ifood');

// Merchant de teste sandbox (mesmo usado em ifood-merchant-smoke.js/ifood-f2-smoke.js).
const MERCHANT_ID = '92a0ec17-6951-4a9b-9c02-ee12963be5f1';

function dump(label, value) {
  process.stdout.write(`${label}: ${JSON.stringify(value).slice(0, 1500)}\n`);
}

function fail(passo, err) {
  process.stdout.write(`[${passo}] FALHOU — status ${err && err.status != null ? err.status : '?'}: ${err && err.message}\n`);
  if (err && err.body !== undefined && err.body !== null) {
    process.stdout.write(`    body: ${JSON.stringify(err.body).slice(0, 1200)}\n`);
  }
  if (!(err instanceof ifood.IfoodApiError)) {
    process.stdout.write(`    (erro não-iFood) ${err && err.stack ? err.stack : ''}\n`);
  }
}

(async () => {
  process.stdout.write('=== iFood Financial smoke (repasses/antecipacoes/ocorrencias) — READ-ONLY ===\n');
  process.stdout.write(`IFOOD_CLIENT_ID    : ${process.env.IFOOD_CLIENT_ID ? 'presente' : 'AUSENTE'}\n`);
  process.stdout.write(`IFOOD_CLIENT_SECRET: ${process.env.IFOOD_CLIENT_SECRET ? 'presente' : 'AUSENTE'}\n`);
  process.stdout.write(`merchantId         : ${MERCHANT_ID}\n\n`);

  if (!process.env.IFOOD_CLIENT_ID || !process.env.IFOOD_CLIENT_SECRET) {
    process.stdout.write('Sem credencial — rode na VPS/ambiente com IFOOD_CLIENT_ID/SECRET no env.\n');
    process.exit(1);
  }

  let houveErro = false;

  process.stdout.write('[1] listarRepasses (Settlement API — GET .../settlements)\n');
  try {
    const repasses = await ifood.listarRepasses(MERCHANT_ID);
    dump('    resposta', repasses);
  } catch (err) {
    houveErro = true;
    fail('1 listarRepasses', err);
  }

  process.stdout.write('\n[2] listarAntecipacoes (Anticipation API — GET .../anticipations, sem filtro)\n');
  try {
    const antecipacoes = await ifood.listarAntecipacoes(MERCHANT_ID);
    dump('    resposta', antecipacoes);
  } catch (err) {
    houveErro = true;
    fail('2 listarAntecipacoes', err);
  }

  process.stdout.write('\n[3] listarOcorrencias (Reconciliation — GET .../occurrences)\n');
  try {
    const ocorrencias = await ifood.listarOcorrencias(MERCHANT_ID);
    dump('    resposta', ocorrencias);
  } catch (err) {
    houveErro = true;
    fail('3 listarOcorrencias', err);
  }

  process.stdout.write(houveErro ? '\nSmoke Financial: 1+ passo falhou — ver detalhes acima.\n' : '\nSmoke Financial OK — os 3 endpoints responderam.\n');
  if (houveErro) process.exit(1);
})();
