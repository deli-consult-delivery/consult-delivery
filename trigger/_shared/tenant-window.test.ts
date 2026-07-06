/**
 * Smoke test de tenant-window.ts (PoC TD#44/#57). Sem rede.
 * Roda com: npx tsx trigger/_shared/tenant-window.test.ts
 */
import assert from "node:assert";
import { estaNaJanela, horaParaMinutos, minutosAgoraBRT, isSabadoBRT } from "./tenant-window";

function utcDate(iso: string): Date {
  return new Date(iso);
}

function run() {
  // horaParaMinutos
  assert.strictEqual(horaParaMinutos("09:00"), 540);
  assert.strictEqual(horaParaMinutos("00:00"), 0);
  assert.strictEqual(horaParaMinutos("23:59:00"), 1439);
  assert.throws(() => horaParaMinutos("9:0"), /formato inválido/);
  assert.throws(() => horaParaMinutos("24:00"), /fora do range/);

  // minutosAgoraBRT — 12:00 UTC = 09:00 BRT (UTC-3, fixo)
  assert.strictEqual(minutosAgoraBRT(utcDate("2026-07-06T12:00:00Z")), 9 * 60);
  assert.strictEqual(minutosAgoraBRT(utcDate("2026-07-06T12:14:00Z")), 9 * 60 + 14);

  // estaNaJanela — tenant configurado p/ 09:00 BRT, tolerância padrão 15min
  assert.strictEqual(
    estaNaJanela({ horaConfigurada: "09:00", agora: utcDate("2026-07-06T12:00:00Z") }),
    true,
    "exatamente no horário configurado deveria estar na janela"
  );
  assert.strictEqual(
    estaNaJanela({ horaConfigurada: "09:00", agora: utcDate("2026-07-06T12:14:00Z") }),
    true,
    "14min depois (dentro da tolerância de 15min) deveria estar na janela"
  );
  assert.strictEqual(
    estaNaJanela({ horaConfigurada: "09:00", agora: utcDate("2026-07-06T12:15:00Z") }),
    false,
    "15min depois (limite exclusivo) NÃO deveria estar na janela"
  );
  assert.strictEqual(
    estaNaJanela({ horaConfigurada: "09:00", agora: utcDate("2026-07-06T11:59:00Z") }),
    false,
    "1min antes do horário configurado NÃO deveria estar na janela"
  );

  // tolerância customizada
  assert.strictEqual(
    estaNaJanela({ horaConfigurada: "08:00", agora: utcDate("2026-07-06T11:25:00Z"), toleranciaMin: 30 }),
    true,
    "29min depois com tolerância de 30min deveria estar na janela"
  );

  // isSabadoBRT — 2026-07-04 é sábado; meia-noite UTC (04) ainda é sexta 21h BRT (03)
  assert.strictEqual(isSabadoBRT(utcDate("2026-07-04T12:00:00Z")), true, "sábado ao meio-dia BRT deveria ser detectado");
  assert.strictEqual(isSabadoBRT(utcDate("2026-07-04T02:00:00Z")), false, "02h UTC de sábado é 23h BRT de sexta");

  console.log("OK — tenant-window.test.ts: horaParaMinutos, minutosAgoraBRT, isSabadoBRT e estaNaJanela corretos");
}

run();
