-- Migration: 20260522_005_tarefas_loja_analise_fk.sql
-- Data: 2026-05-22
-- Autor: Wandson (via Claude Code)
-- Motivo: Adicionar índice em tarefas_loja.analise_id para performance de queries Onda 04
--         que buscam tarefas geradas por uma análise específica.
-- Risco: Baixo — apenas CREATE INDEX IF NOT EXISTS, sem ALTER TABLE.
-- Observação: A FK tarefas_loja_analise_id_fkey (REFERENCES analises(id) ON DELETE SET NULL)
--             JÁ EXISTE — criada na Onda 02. Este arquivo NÃO adiciona ALTER TABLE ADD CONSTRAINT
--             (causaria erro "duplicate constraint"). Apenas adiciona o índice que estava faltando.
-- Reversão: DROP INDEX IF EXISTS idx_tarefas_analise;

-- FK analise_id já existe (tarefas_loja_analise_id_fkey criado na Onda 02)
-- Apenas adicionar índice para performance em queries do tipo:
--   SELECT * FROM tarefas_loja WHERE analise_id = $1;

CREATE INDEX IF NOT EXISTS idx_tarefas_analise
  ON tarefas_loja(analise_id)
  WHERE analise_id IS NOT NULL;
