-- Migration: adiciona campos Datacrazy e nome_empresa à avaliacao_config
-- Estes campos permitem que o bridge envie mensagens de avaliação
-- diretamente via API do Datacrazy CRM (sem depender da Evolution API)

ALTER TABLE avaliacao_config
  ADD COLUMN IF NOT EXISTS datacrazy_api_key  TEXT,
  ADD COLUMN IF NOT EXISTS nome_empresa       TEXT DEFAULT 'nossa empresa';

-- Seed: preencher nome_empresa para tenant Karina Doceria
-- (datacrazy_api_key deve ser inserida manualmente após obter a credencial)
UPDATE avaliacao_config
SET nome_empresa = 'Karina Doceria'
WHERE tenant_id = 'e9fdaa66-cbe7-4dff-905b-afc4b10219ff'
  AND nome_empresa = 'nossa empresa';
