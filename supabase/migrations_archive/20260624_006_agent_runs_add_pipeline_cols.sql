-- Adicionar colunas que logAgentRun tenta escrever mas não existiam
-- Causa-raiz: upsert falhava silenciosamente e agent_runs ficava vazio
-- Resultado: orchestrator aparecia como rodando no Trigger.dev mas sem log no BD
ALTER TABLE public.agent_runs
  ADD COLUMN IF NOT EXISTS explanation       text,
  ADD COLUMN IF NOT EXISTS confidence_score  numeric,
  ADD COLUMN IF NOT EXISTS pipeline_stage    text,
  ADD COLUMN IF NOT EXISTS pipeline_position integer;
