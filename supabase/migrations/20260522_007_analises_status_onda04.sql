-- Migration: 20260522_007_analises_status_onda04.sql
-- Data: 2026-05-22
-- Autor: Wandson (via Claude Code)
-- Motivo: A tabela `analises` foi criada no módulo legado analise-ifood com status em inglês
--         ('pending', 'processing', 'done', 'error'). A Onda 04 (piloto WhatsApp + Loom)
--         adicionou código novo em trigger/analise/gerar-relatorio.ts e bridge-server/routes/analises.js
--         que usa os mesmos conceitos mas em português ('rascunho', 'processando', 'processada', 'erro').
--         Os dois conjuntos coexistem permanentemente: legado (analise-ifood) continua gravando em inglês,
--         Onda 04 grava em português. Expandir o CHECK para aceitar ambos é o caminho mais seguro —
--         não requer migração de dados e não quebra nenhum cliente existente.
-- Risco: Baixo — apenas remove e recria o CHECK constraint na coluna status.
--         Zero impacto nos dados existentes (4 rows 'done', 5 rows 'pending' continuam válidos).
--         Operação DDL rápida, sem lock prolongado em produção (tabela com ~9 rows).
--
-- Reversão (para desfazer esta migration se necessário):
--   ALTER TABLE analises DROP CONSTRAINT IF EXISTS analises_status_check;
--   ALTER TABLE analises ADD CONSTRAINT analises_status_check
--     CHECK (status IN ('pending', 'processing', 'done', 'error'));
--   NOTA: só rodar a reversão se não houver rows com status em português gravadas.
--
-- Sem BEGIN/COMMIT — cada ALTER TABLE é auto-commit (conforme padrão do projeto).

-- 1. Remove o constraint existente (gerado inline no CREATE TABLE de 20260502_analises.sql).
--    IF EXISTS garante idempotência: sem erro se já foi removido manualmente ou em retry.
ALTER TABLE analises
  DROP CONSTRAINT IF EXISTS analises_status_check;

-- 2. Recria o constraint aceitando ambos os conjuntos de valores:
--    - Inglês (legado analise-ifood): pending, processing, done, error
--    - Português (Onda 04 / gerar-relatorio.ts): rascunho, processando, processada, erro
ALTER TABLE analises
  ADD CONSTRAINT analises_status_check
    CHECK (status IN (
      'pending', 'processing', 'done', 'error',
      'rascunho', 'processando', 'processada', 'erro'
    ));

COMMENT ON COLUMN analises.status IS
  'Status do ciclo de vida da análise. Dois conjuntos coexistem:
   Legado analise-ifood (EN): pending → processing → done | error.
   Onda 04 (PT): rascunho → processando → processada | erro.
   Ambos válidos permanentemente — não migrar dados entre conjuntos.';
