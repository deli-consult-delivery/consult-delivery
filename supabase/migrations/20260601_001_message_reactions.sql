-- Migration: 20260601_001_message_reactions.sql
-- Data: 2026-06-01
-- Autor: Wandson (via Claude Code)
-- Motivo: A Evolution API envia eventos MESSAGES_UPSERT com reactionMessage quando
--         alguém reage a uma mensagem WhatsApp. Sem esta coluna o webhook descartava
--         silenciosamente esses eventos. A coluna armazena o estado atual das reações
--         (adição e remoção) sem criar nova tabela, mantendo consultas simples.
-- Risco: Baixo — coluna nova com DEFAULT seguro ('[]'::jsonb), nenhuma query existente
--        é afetada. Sem migração de dados necessária (histórico sem reações = array vazio).
-- Reversão: ALTER TABLE public.messages DROP COLUMN IF EXISTS reactions;

BEGIN;

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS reactions JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.messages.reactions IS
  'Array de reações WhatsApp no formato [{jid: string, emoji: string, name: string}]. '
  'Atualizado pelo evolution-webhook ao receber reactionMessage. '
  'Emoji vazio string significa remoção de reação (elemento removido do array).';

COMMIT;
