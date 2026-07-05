-- Migration: 20260517_028_bom_dia_feedback_comment.sql
-- Data: 2026-05-17
-- Autor: Wandson (via Claude Code)
-- Motivo: Permitir que o usuário deixe um comentário textual junto ao voto
--         (thumbs_up/thumbs_down) no feedback de postagens do Bom Dia.
--         Campo opcional — não quebra nenhum insert existente.
-- Risco: Mínimo — ADD COLUMN IF NOT EXISTS com nullable, sem default.
--        Queries existentes não são afetadas.
-- Reversão: ALTER TABLE public.bom_dia_feedback DROP COLUMN IF EXISTS comment;

BEGIN;

ALTER TABLE public.bom_dia_feedback
  ADD COLUMN IF NOT EXISTS comment TEXT;

COMMENT ON COLUMN public.bom_dia_feedback.comment IS
  'Comentário livre do usuário ao registrar o voto. Nullable — campo opcional.';

COMMIT;
