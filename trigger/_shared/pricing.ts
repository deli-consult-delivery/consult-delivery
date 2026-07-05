/**
 * Tabela de preços por modelo Anthropic — fonte única de verdade para cost_usd.
 *
 * Fonte oficial: https://platform.claude.com/docs/en/about-claude/pricing (consultado 2026-07-05).
 * USD por milhão de tokens. cacheWrite5m = escrita de cache de 5min (padrão da API quando
 * cache_control é usado sem "ttl"); cacheRead = leitura de cache (cache hit).
 *
 * Modelo não listado (ex: futuro provider Ollama/OpenRouter) → calcularCustoUsd retorna null.
 * Nunca gravar 0 fake para modelo desconhecido.
 */
interface ModelPricing {
  input: number;
  output: number;
  cacheWrite5m: number;
  cacheRead: number;
}

const PRICING_USD_PER_MTOK: Record<string, ModelPricing> = {
  "claude-sonnet-4-6":         { input: 3, output: 15, cacheWrite5m: 3.75, cacheRead: 0.30 },
  "claude-haiku-4-5-20251001": { input: 1, output: 5,  cacheWrite5m: 1.25, cacheRead: 0.10 },
};

export interface ClaudeUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
}

export function calcularCustoUsd(model: string, usage: ClaudeUsage): number | null {
  const preco = PRICING_USD_PER_MTOK[model];
  if (!preco) return null;

  return (
    (usage.input_tokens / 1_000_000) * preco.input +
    (usage.output_tokens / 1_000_000) * preco.output +
    ((usage.cache_creation_input_tokens ?? 0) / 1_000_000) * preco.cacheWrite5m +
    ((usage.cache_read_input_tokens ?? 0) / 1_000_000) * preco.cacheRead
  );
}
