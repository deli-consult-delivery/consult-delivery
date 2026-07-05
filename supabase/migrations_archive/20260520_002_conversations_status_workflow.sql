-- supabase/migrations/20260520_002_conversations_status_workflow.sql
-- Sprint 1 — Chat Ao Vivo
-- Adiciona ENUM de status v2 e colunas de fechamento em conversations
--
-- NOTA: a tabela já possui coluna `status text` com CHECK constraint (valores pt-BR)
-- introduzida em 20260504_conversation_status.sql. Esta migration adiciona
-- status_v2 com ENUM en-US para o novo workflow, mantendo compatibilidade total.

-- ─────────────────────────────────────────────
-- 1. ENUM de status (workflow novo)
-- ─────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE public.conversation_status_v2 AS ENUM (
    'open',
    'in_progress',
    'waiting',
    'closed',
    'archived'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─────────────────────────────────────────────
-- 2. Colunas novas em conversations
-- ─────────────────────────────────────────────
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS status_v2    public.conversation_status_v2 DEFAULT 'open',
  ADD COLUMN IF NOT EXISTS closed_at    timestamptz,
  ADD COLUMN IF NOT EXISTS closed_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS close_reason text;

-- ─────────────────────────────────────────────
-- 3. Índice para filtros por status_v2
-- ─────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_conversations_status_v2_tenant
  ON public.conversations (tenant_id, status_v2, last_message_at DESC);

-- ─────────────────────────────────────────────
-- 4. Comentários
-- ─────────────────────────────────────────────
COMMENT ON COLUMN public.conversations.status_v2 IS
  'Workflow Sprint 1: open → in_progress → waiting → closed → archived';
COMMENT ON COLUMN public.conversations.closed_at IS
  'Timestamp de quando a conversa foi finalizada';
COMMENT ON COLUMN public.conversations.closed_by IS
  'UUID do usuário que finalizou a conversa';
COMMENT ON COLUMN public.conversations.close_reason IS
  'Motivo opcional de fechamento informado pelo atendente';
