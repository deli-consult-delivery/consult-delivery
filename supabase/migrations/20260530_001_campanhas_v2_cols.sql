-- V2-8: Campanhas v2 — colunas para geração via Bridge/LARA (sem n8n)
ALTER TABLE campanhas
  ADD COLUMN IF NOT EXISTS conteudo_gerado jsonb,
  ADD COLUMN IF NOT EXISTS agent_run_id   text,
  ADD COLUMN IF NOT EXISTS tom_override   text;
