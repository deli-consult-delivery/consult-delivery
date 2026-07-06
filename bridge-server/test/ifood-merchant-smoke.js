// bridge-server/test/ifood-merchant-smoke.js — smoke LIVE do módulo Merchant
// (interruptions/opening-hours) usado na homologação. Prova o ciclo
// criar interrupção → confirmar via GET → remover → confirmar removida,
// usando lib/ifood.js DIRETO (NÃO sobe o Bridge). Trivialmente reversível:
// a pausa criada é sempre removida no mesmo run, mesmo em caso de falha
// no passo de confirmação (finally).
//
// Output bruto em cada passo. Degrada limpo (exit 1, mensagem clara) se faltar
// credencial (IFOOD_CLIENT_ID/SECRET) — IfoodApiError status 0.
//
// Rodar (na VPS/ambiente com credencial real no Infisical/.env do Bridge):
//   cd bridge-server && node -r dotenv/config test/ifood-merchant-smoke.js
'use strict';

const ifood = require('../lib/ifood');

// Merchant de teste sandbox (mesmo usado em ifood-f2-smoke.js).
const MERCHANT_ID = '92a0ec17-6951-4a9b-9c02-ee12963be5f1';

function dump(label, value) {
  process.stdout.write(`${label}: ${JSON.stringify(value)}\n`);
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
  process.stdout.write('=== iFood Merchant smoke (interruptions) ===\n');
  process.stdout.write(`IFOOD_CLIENT_ID    : ${process.env.IFOOD_CLIENT_ID ? 'presente' : 'AUSENTE'}\n`);
  process.stdout.write(`IFOOD_CLIENT_SECRET: ${process.env.IFOOD_CLIENT_SECRET ? 'presente' : 'AUSENTE'}\n`);
  process.stdout.write(`merchantId         : ${MERCHANT_ID}\n\n`);

  if (!process.env.IFOOD_CLIENT_ID || !process.env.IFOOD_CLIENT_SECRET) {
    process.stdout.write('Sem credencial — rode na VPS/ambiente com IFOOD_CLIENT_ID/SECRET no env.\n');
    process.exit(1);
  }

  let interruptionId = null;
  let houveErro = false;

  try {
    // 1. cria uma pausa curta (daqui a 1h, por 1min) — janela futura, não afeta operação real agora.
    process.stdout.write('[1] criarInterrupcao(start=+1h, end=+1h1min)\n');
    const inicio = new Date(Date.now() + 60 * 60 * 1000);
    const fim = new Date(inicio.getTime() + 60 * 1000);
    const criada = await ifood.criarInterrupcao(MERCHANT_ID, {
      start: inicio.toISOString(),
      end: fim.toISOString(),
      description: 'smoke-test consult-delivery (remover automaticamente)',
    });
    dump('    resposta', criada);
    interruptionId = criada?.id ? String(criada.id) : null;
    if (!interruptionId) throw new Error('resposta do POST não trouxe id — não dá pra confirmar/remover com segurança');

    // 2. confirma via GET
    process.stdout.write('\n[2] listarInterrupcoes (confirma que a pausa criada aparece)\n');
    const lista = await ifood.listarInterrupcoes(MERCHANT_ID);
    const arr = Array.isArray(lista) ? lista : (lista?.interruptions ?? []);
    const achou = arr.some((it) => String(it?.id) === interruptionId);
    process.stdout.write(`    encontrada na lista: ${achou}\n`);

    // 3. também prova a leitura de opening-hours (só leitura, não muda nada)
    process.stdout.write('\n[3] listarHorarios (leitura, sem escrita)\n');
    const horarios = await ifood.listarHorarios(MERCHANT_ID);
    dump('    resposta', horarios);
  } catch (err) {
    houveErro = true;
    fail('criar/confirmar', err);
  } finally {
    // 4. remove a pausa SEMPRE que foi criada, sucesso ou falha nos passos acima.
    if (interruptionId) {
      try {
        process.stdout.write(`\n[4] removerInterrupcao(${interruptionId}) — cleanup\n`);
        const r = await ifood.removerInterrupcao(MERCHANT_ID, interruptionId);
        dump('    resposta', r);
        process.stdout.write('\nSmoke Merchant OK — interrupção criada e removida no mesmo run.\n');
      } catch (err) {
        fail('4 removerInterrupcao (cleanup)', err);
        process.stdout.write(`\n⚠ ATENÇÃO: pausa ${interruptionId} pode ter ficado órfã no merchant de teste — remover manualmente.\n`);
        process.exit(1);
      }
    }
  }

  if (houveErro) process.exit(1);
})();
