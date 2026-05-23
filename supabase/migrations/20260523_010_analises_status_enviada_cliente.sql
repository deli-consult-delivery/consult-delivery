-- Migration: 20260523_010_analises_status_enviada_cliente.sql
-- Data: 2026-05-23
-- Autor: Wandson (via Claude Code)
-- Motivo: O endpoint bridge-server POST .../enviar-whatsapp faz PATCH em analises
--         setando status='enviada_cliente' mas esse valor não estava no CHECK constraint
--         (migration 007 adicionou apenas os valores do ciclo PT: rascunho/processando/processada/erro).
--         Smoke E2E T10 revelou a omissão — constraint 23514 ao tentar enviar análise.
-- Risco: Baixo — apenas expande o CHECK com um valor novo. Zero impacto nos dados existentes.
-- Reversão:
--   ALTER TABLE analises DROP CONSTRAINT IF EXISTS analises_status_check;
--   ALTER TABLE analises ADD CONSTRAINT analises_status_check
--     CHECK (status IN ('pending','processing','done','error',
--                       'rascunho','processando','processada','erro'));

ALTER TABLE analises
  DROP CONSTRAINT IF EXISTS analises_status_check;

ALTER TABLE analises
  ADD CONSTRAINT analises_status_check
    CHECK (status IN (
      'pending', 'processing', 'done', 'error',
      'rascunho', 'processando', 'processada', 'erro',
      'enviada_cliente'
    ));

COMMENT ON COLUMN analises.status IS
  'Status do ciclo de vida da análise.
   Legado analise-ifood (EN): pending → processing → done | error.
   Onda 04 (PT): rascunho → processando → processada → enviada_cliente | erro.
   Ambos conjuntos válidos permanentemente — não migrar dados entre conjuntos.';
