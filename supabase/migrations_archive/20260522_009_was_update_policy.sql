-- Migration: 20260522_009_was_update_policy.sql
-- Data: 2026-05-22
-- Autor: Wandson (via Claude Code)
-- Motivo: Adicionar política UPDATE em whatsapp_aprovacao_sessions para permitir
--         que consultores encerrem sessões manualmente pela plataforma (T8 Onda 04).
--         A cláusula WITH CHECK restringe o UPDATE a apenas setar status='cancelada'.
-- Nota: Renomeado de 007 → 009 para corrigir prefixo duplicado. Idempotente via DROP IF EXISTS.
-- Risco: Baixo — recria policy sem alterar dados.
-- Reversão:
--   DROP POLICY IF EXISTS "Cancelar sessao do tenant" ON whatsapp_aprovacao_sessions;

BEGIN;

DROP POLICY IF EXISTS "Cancelar sessao do tenant" ON whatsapp_aprovacao_sessions;

CREATE POLICY "Cancelar sessao do tenant"
  ON whatsapp_aprovacao_sessions FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM lojas l
      WHERE l.id = whatsapp_aprovacao_sessions.loja_id
        AND l.tenant_id IN (
          SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid()
        )
    )
  )
  WITH CHECK (status = 'cancelada');

COMMIT;
