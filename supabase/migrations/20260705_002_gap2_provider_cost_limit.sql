-- GAP-2 (restante): provider editavel + limite de custo por agente/tenant.
-- Aditivo/reversivel — nao altera dados existentes, so acrescenta colunas.
-- Consumo em runtime (roteamento multi-provider, D1) fica para depois; por ora
-- e apenas configuracao exibida/gravada pela UI (AgenteConfig.jsx).
--
-- Rollback:
--   ALTER TABLE public.tenant_agent_config DROP COLUMN IF EXISTS provider;
--   ALTER TABLE public.tenant_agent_config DROP COLUMN IF EXISTS cost_limit_usd;

ALTER TABLE public.tenant_agent_config
  ADD COLUMN IF NOT EXISTS provider text CHECK (provider IN ('anthropic', 'ollama', 'openrouter')),
  ADD COLUMN IF NOT EXISTS cost_limit_usd numeric CHECK (cost_limit_usd >= 0);

COMMENT ON COLUMN public.tenant_agent_config.provider IS 'Provider preferido do tenant p/ este agente (NULL = usa padrao da plataforma). Sem efeito em runtime ainda — roteamento multi-provider (D1) consome depois.';
COMMENT ON COLUMN public.tenant_agent_config.cost_limit_usd IS 'Limite de custo mensal (US$) do tenant p/ este agente (NULL = sem limite). Sem efeito em runtime ainda.';
