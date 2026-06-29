// semaforo.test.js — gate de semáforo no servidor (puro, sem rede).
'use strict';

const assert = require('node:assert');
const { decideEnvio, modoToSemaforo } = require('../lib/semaforo');

let failures = 0;
function check(label, fn) {
  try { fn(); process.stdout.write(`  ok  ${label}\n`); }
  catch (e) { failures++; process.stdout.write(`  FAIL ${label}: ${e.message}\n`); }
}

// verde envia sempre (humano ou automático)
check('verde + automático → envia', () => assert.strictEqual(decideEnvio({ autonomyLevel: 'verde', viaHumano: false }).allowed, true));
check('verde + humano → envia', () => assert.strictEqual(decideEnvio({ autonomyLevel: 'verde', viaHumano: true }).allowed, true));

// amarelo: só com humano
check('amarelo + automático → bloqueia', () => assert.strictEqual(decideEnvio({ autonomyLevel: 'amarelo', viaHumano: false }).allowed, false));
check('amarelo + humano → envia', () => assert.strictEqual(decideEnvio({ autonomyLevel: 'amarelo', viaHumano: true }).allowed, true));

// vermelho: só com humano
check('vermelho + automático → bloqueia', () => assert.strictEqual(decideEnvio({ autonomyLevel: 'vermelho', viaHumano: false }).allowed, false));
check('vermelho + humano → envia', () => assert.strictEqual(decideEnvio({ autonomyLevel: 'vermelho', viaHumano: true }).allowed, true));

// fail-closed: nível inválido/ausente nunca envia (nem com humano)
check('nível ausente → bloqueia (fail-closed)', () => assert.strictEqual(decideEnvio({ viaHumano: true }).allowed, false));
check('nível lixo → bloqueia (fail-closed)', () => assert.strictEqual(decideEnvio({ autonomyLevel: 'xpto', viaHumano: true }).allowed, false));

// mapeamento modo→semáforo
check('modoToSemaforo ia/hibrido/humano', () => {
  assert.strictEqual(modoToSemaforo('ia'), 'verde');
  assert.strictEqual(modoToSemaforo('hibrido'), 'amarelo');
  assert.strictEqual(modoToSemaforo('humano'), 'vermelho');
  assert.strictEqual(modoToSemaforo('xpto'), null);
});

if (failures > 0) { process.stdout.write(`\n${failures} falha(s).\n`); process.exit(1); }
process.stdout.write('\nsemaforo: todas as asserções passaram.\n');
