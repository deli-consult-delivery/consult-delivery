-- ============================================================
-- 20260610_002_deli_pending_approvals_dedup.sql
-- ------------------------------------------------------------
-- TRAVA ANTI-SPAM do deli-orchestrator (causa-raiz da emergência 2026-05-26):
-- triggers que casam condição PERMANENTE (toda loja sem métrica/timeline
-- dispara TODO ciclo) + ZERO deduplicação em deli_pending_approvals
-- (INSERT puro, sem UNIQUE) => N pendências idênticas por ciclo.
--
-- Esta migration é ADITIVA e REVERSÍVEL:
--   - Adiciona a coluna dedup_key (nullable). Linhas antigas ficam com NULL.
--   - Cria índice único PARCIAL: só vale para status='waiting' E dedup_key IS NOT NULL.
--     => NULLs antigos NÃO conflitam entre si (parcial exclui NULL).
--     => Permite no máximo 1 pendência 'waiting' por dedup_key
--        (tenant|trigger|item|janela_dia). Reabre naturalmente quando a
--        pendência sai de 'waiting' (approved/rejected/expired/failed).
--   - Idempotente (IF NOT EXISTS em ambos), pode rodar mais de uma vez.
--
-- Reversão: DROP INDEX deli_pending_approvals_dedup_waiting;
--           ALTER TABLE deli_pending_approvals DROP COLUMN dedup_key;
--
-- ⚠️ NÃO APLICADA AINDA — versionada em git. A religação do motor
--    (cron + flag + notifyBridge) é um passo GATED aprovado pelo Wandson;
--    aplicar esta migration faz parte desse passo.
-- ============================================================

ALTER TABLE deli_pending_approvals
  ADD COLUMN IF NOT EXISTS dedup_key text;

COMMENT ON COLUMN deli_pending_approvals.dedup_key IS
  'Chave de deduplicação anti-spam: tenant_id|trigger_name|item_id|janela_dia (YYYY-MM-DD). Garante no máximo 1 pendência waiting por evento/dia via índice único parcial.';

CREATE UNIQUE INDEX IF NOT EXISTS deli_pending_approvals_dedup_waiting
  ON deli_pending_approvals (dedup_key)
  WHERE status = 'waiting' AND dedup_key IS NOT NULL;
