-- ============================================================
-- Onda 07 F1 — Migration 002
-- Data: 2026-05-25
-- Motivo: tarefa_anexos — prints/evidências associados à conclusão
--         de tarefas. Frontend faz upload ao Storage; bridge registra
--         metadados. _notificarConclusao envia via sendMedia.
-- Risco: BAIXO — tabela nova; sem ALTER em tabelas existentes.
-- Reversão:
--   DROP TABLE IF EXISTS tarefa_anexos;
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS tarefa_anexos (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tarefa_id   uuid        NOT NULL REFERENCES tarefas_loja(id)     ON DELETE CASCADE,
  acao_id     uuid        REFERENCES tarefa_aprovacoes(id)          ON DELETE SET NULL,
  tenant_id   uuid        NOT NULL REFERENCES tenants(id),
  url         text        NOT NULL,
  mime_type   text        NOT NULL,
  size_bytes  int         NOT NULL,
  uploaded_by uuid        REFERENCES auth.users(id),
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tarefa_anexos_tarefa ON tarefa_anexos(tarefa_id);
CREATE INDEX IF NOT EXISTS idx_tarefa_anexos_tenant ON tarefa_anexos(tenant_id);

ALTER TABLE tarefa_anexos ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "ver_anexos_tenant"
    ON tarefa_anexos FOR SELECT
    USING (tenant_id IN (
      SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid()
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END$$;

DO $$ BEGIN
  CREATE POLICY "inserir_anexos_tenant"
    ON tarefa_anexos FOR INSERT
    WITH CHECK (tenant_id IN (
      SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid()
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END$$;

DO $$ BEGIN
  CREATE POLICY "deletar_anexos_tenant"
    ON tarefa_anexos FOR DELETE
    USING (
      uploaded_by = auth.uid()
      OR tenant_id IN (
        SELECT tenant_id FROM tenant_members
        WHERE user_id = auth.uid() AND role IN ('admin', 'dev')
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END$$;

COMMIT;
