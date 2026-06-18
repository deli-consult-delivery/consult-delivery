-- Migration: bot_configs — adiciona suporte a resposta automática em grupos
-- Criada em: 18/06/2026
-- Aditiva/reversível: ADD COLUMN IF NOT EXISTS com DEFAULT false

ALTER TABLE bot_configs
  ADD COLUMN IF NOT EXISTS respond_to_groups BOOLEAN NOT NULL DEFAULT false;
