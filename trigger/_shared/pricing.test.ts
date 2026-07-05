/**
 * Smoke test de calcularCustoUsd em pricing.ts. Sem rede.
 * Roda com: npx tsx trigger/_shared/pricing.test.ts
 */
import assert from "node:assert";
import { calcularCustoUsd } from "./pricing";

function run() {
  // claude-sonnet-4-6: $3/MTok in, $15/MTok out
  const custoSonnet = calcularCustoUsd("claude-sonnet-4-6", {
    input_tokens: 1_000_000,
    output_tokens: 1_000_000,
  });
  assert.strictEqual(custoSonnet, 18);

  // claude-haiku-4-5: $1/MTok in, $5/MTok out
  const custoHaiku = calcularCustoUsd("claude-haiku-4-5-20251001", {
    input_tokens: 1_000_000,
    output_tokens: 1_000_000,
  });
  assert.strictEqual(custoHaiku, 6);

  // cache write (5m) e cache read entram no cálculo
  const custoComCache = calcularCustoUsd("claude-sonnet-4-6", {
    input_tokens: 0,
    output_tokens: 0,
    cache_creation_input_tokens: 1_000_000,
    cache_read_input_tokens: 1_000_000,
  });
  assert.strictEqual(custoComCache, 3.75 + 0.30);

  // modelo desconhecido → null, nunca 0 fake
  const custoDesconhecido = calcularCustoUsd("gpt-4o", {
    input_tokens: 1_000_000,
    output_tokens: 1_000_000,
  });
  assert.strictEqual(custoDesconhecido, null);

  console.log("OK — pricing.test.ts: calcularCustoUsd íntegro (sonnet, haiku, cache, modelo desconhecido)");
}

run();
