-- Migration: bot_configs_extra_messages
-- Adiciona suporte a múltiplas faixas de horário com mensagens individuais
-- Cada item do array: { id, label, days: string[], start, end, message }

ALTER TABLE bot_configs
  ADD COLUMN IF NOT EXISTS extra_messages JSONB NOT NULL DEFAULT '[]';
