-- Migration: Status de atendimento para conversas
-- Adiciona CHECK constraint e colunas auxiliares para fluxo de atendimento
-- Date: 2026-05-04

-- ─────────────────────────────────────────────
-- 1. Definir status válidos na tabela conversations
-- ─────────────────────────────────────────────

-- Remover valores inválidos existentes antes de aplicar o constraint
UPDATE conversations
SET status = 'aguardando'
WHERE status IS NULL OR status NOT IN ('aguardando','em_atendimento','atendimento_aberto','automacao','finalizado');

-- Aplicar valor default
ALTER TABLE conversations
  ALTER COLUMN status SET DEFAULT 'aguardando';

-- Adicionar CHECK constraint (idempotente: dropa se existir)
ALTER TABLE conversations
  DROP CONSTRAINT IF EXISTS conversations_status_check;

ALTER TABLE conversations
  ADD CONSTRAINT conversations_status_check
  CHECK (status IN ('aguardando','em_atendimento','atendimento_aberto','automacao','finalizado'));

-- ─────────────────────────────────────────────
-- 2. Colunas auxiliares do fluxo de atendimento
-- ─────────────────────────────────────────────
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS started_at  timestamptz,
  ADD COLUMN IF NOT EXISTS finished_at timestamptz,
  ADD COLUMN IF NOT EXISTS reopened_at timestamptz,
  ADD COLUMN IF NOT EXISTS finished_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reopened_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS internal_notes text;

-- ─────────────────────────────────────────────
-- 3. Índices para performance
-- ─────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_conversations_status
  ON conversations(status, tenant_id);

CREATE INDEX IF NOT EXISTS idx_conversations_assigned
  ON conversations(assigned_to, status);

-- ─────────────────────────────────────────────
-- 4. Função helper: atualizar timestamp ao mudar status
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_conversation_status_changed()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'em_atendimento' AND OLD.status != 'em_atendimento' THEN
    NEW.started_at := COALESCE(NEW.started_at, NOW());
  END IF;

  IF NEW.status = 'finalizado' AND OLD.status != 'finalizado' THEN
    NEW.finished_at := COALESCE(NEW.finished_at, NOW());
  END IF;

  IF NEW.status != 'finalizado' AND OLD.status = 'finalizado' THEN
    NEW.reopened_at := COALESCE(NEW.reopened_at, NOW());
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_conversation_status_changed ON conversations;

CREATE TRIGGER trg_conversation_status_changed
  BEFORE UPDATE OF status ON conversations
  FOR EACH ROW
  EXECUTE FUNCTION fn_conversation_status_changed();

-- ─────────────────────────────────────────────
-- 5. RLS: membros do tenant podem atualizar status das conversas
-- ─────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'conversations'
      AND policyname = 'members can update conversation status'
  ) THEN
    CREATE POLICY "members can update conversation status"
      ON conversations FOR UPDATE
      USING (
        tenant_id IN (
          SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid()
        )
      )
      WITH CHECK (
        tenant_id IN (
          SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid()
        )
      );
  END IF;
END $$;
