-- Migration: 20260624_004_pipeline_live.sql
-- Data: 2026-06-24
-- Autor: Claude Code (sessão AI-First FASE 2)
-- Motivo: Pipeline ao Vivo + Explicabilidade — adiciona colunas em agent_runs
--   para o kanban de pipeline mostrar: stage, posição, score de confiança e
--   explicação legível do porquê o agente agiu.
-- Risco: Baixo — aditivo, IF NOT EXISTS em todas as colunas.
-- Reversão:
--   ALTER TABLE public.agent_runs DROP COLUMN IF EXISTS explanation;
--   ALTER TABLE public.agent_runs DROP COLUMN IF EXISTS confidence_score;
--   ALTER TABLE public.agent_runs DROP COLUMN IF EXISTS pipeline_stage;
--   ALTER TABLE public.agent_runs DROP COLUMN IF EXISTS pipeline_position;

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- agent_runs — colunas de explicabilidade e posição de pipeline
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.agent_runs
  ADD COLUMN IF NOT EXISTS explanation      text,
  ADD COLUMN IF NOT EXISTS confidence_score numeric(3,2)
    CHECK (confidence_score IS NULL OR (confidence_score >= 0 AND confidence_score <= 1)),
  ADD COLUMN IF NOT EXISTS pipeline_stage   text,
  ADD COLUMN IF NOT EXISTS pipeline_position integer DEFAULT 0;

COMMENT ON COLUMN public.agent_runs.explanation IS
  'Explicação em linguagem natural do porquê o agente agiu: contexto, raciocínio, decisão.';

COMMENT ON COLUMN public.agent_runs.confidence_score IS
  'Score de confiança do agente na resposta/ação (0.0–1.0). NULL = não avaliado.';

COMMENT ON COLUMN public.agent_runs.pipeline_stage IS
  'Etapa do pipeline em que o agente agiu (ex: triagem, resposta, cobranca, execucao).';

COMMENT ON COLUMN public.agent_runs.pipeline_position IS
  'Posição ordinal dentro da etapa para ordenação no kanban.';

-- Índice para o kanban filtrar por tenant + status + stage
CREATE INDEX IF NOT EXISTS idx_agent_runs_pipeline
  ON public.agent_runs (tenant_id, status, pipeline_stage, created_at DESC);

COMMIT;
