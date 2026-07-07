'use strict';

/**
 * pricing.js — tabela de preços por modelo Anthropic, para cost_usd do Bridge.
 *
 * Espelho de trigger/_shared/pricing.ts (mesma fonte oficial, mesmos valores).
 * Runtimes separados (VPS Node/CommonJS vs Trigger.dev cloud/TS) sem bundler
 * compartilhado entre os dois — não dá pra importar o .ts direto daqui. Se o
 * preço de um modelo mudar, atualizar os dois arquivos juntos.
 *
 * Modelo não listado → calcularCustoUsd retorna null. Nunca gravar 0 fake.
 */

const PRICING_USD_PER_MTOK = {
  'claude-sonnet-4-6':         { input: 3, output: 15, cacheWrite5m: 3.75, cacheRead: 0.30 },
  'claude-haiku-4-5-20251001': { input: 1, output: 5,  cacheWrite5m: 1.25, cacheRead: 0.10 },
};

/**
 * @param {string} model
 * @param {{input_tokens?: number, output_tokens?: number, cache_creation_input_tokens?: number, cache_read_input_tokens?: number}} usage
 * @returns {number|null}
 */
function calcularCustoUsd(model, usage) {
  const preco = PRICING_USD_PER_MTOK[model];
  if (!preco || !usage) return null;

  return (
    ((usage.input_tokens || 0) / 1_000_000) * preco.input +
    ((usage.output_tokens || 0) / 1_000_000) * preco.output +
    ((usage.cache_creation_input_tokens || 0) / 1_000_000) * preco.cacheWrite5m +
    ((usage.cache_read_input_tokens || 0) / 1_000_000) * preco.cacheRead
  );
}

module.exports = { calcularCustoUsd, PRICING_USD_PER_MTOK };
