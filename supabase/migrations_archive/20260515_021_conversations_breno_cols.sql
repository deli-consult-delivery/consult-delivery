-- Migration: 20260515_021_conversations_breno_cols.sql
-- Data: 2026-05-15
-- Autor: Wandson (via Claude Code)
-- Motivo: Feature V2-2 BRENO — adiciona estado BRENO diretamente em conversations.
--         last_breno_handled_at permite ao frontend exibir "último atendimento BRENO"
--         e ao próprio agente saber quanto tempo passou desde a última ação dele.
--         breno_paused permite que Eduardo assuma uma conversa manualmente, sinalizando
--         ao BRENO que deve silenciar naquela conversa até liberação explícita.
-- Risco: Baixo — ADD COLUMN IF NOT EXISTS em tabela existente.
--        Colunas nullable ou com DEFAULT seguro. Zero impacto em queries existentes.
--        Índice parcial tem cardinalidade muito baixa (poucas conversas pausadas ao mesmo tempo).
-- Dependências:
--   - public.conversations (existe desde migrations iniciais; ALTER TABLE, não CREATE)
-- Reversão:
--   BEGIN;
--   DROP INDEX IF EXISTS idx_conversations_breno_paused;
--   ALTER TABLE public.conversations
--     DROP COLUMN IF EXISTS last_breno_handled_at,
--     DROP COLUMN IF EXISTS breno_paused;
--   COMMIT;

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Novas colunas em public.conversations
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS last_breno_handled_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS breno_paused           boolean     NOT NULL DEFAULT false;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Comentários
-- ─────────────────────────────────────────────────────────────────────────────
COMMENT ON COLUMN public.conversations.last_breno_handled_at IS
  'Timestamp da última vez que BRENO atuou nesta conversa (sent ou suggested). NULL = BRENO nunca atuou.';

COMMENT ON COLUMN public.conversations.breno_paused IS
  'Se true, Eduardo assumiu a conversa manualmente e BRENO deve silenciar até ser explicitamente liberado.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Índice parcial — listar conversas com BRENO pausado por tenant
--    Cardinalidade esperada baixa: apenas conversas em atendimento manual ativo.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_conversations_breno_paused
  ON public.conversations (tenant_id)
  WHERE breno_paused = true;

COMMIT;
