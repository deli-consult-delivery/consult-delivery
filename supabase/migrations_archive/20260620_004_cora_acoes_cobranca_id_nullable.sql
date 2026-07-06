-- Migration: 20260620_004_cora_acoes_cobranca_id_nullable
-- Autor: Claude Code (sessão 2026-06-20)
-- Motivo: cora_acoes.cobranca_id é FK NOT NULL para cora_cobrancas (V1).
--         Registros V2 usam cobranca_v2_id (→ cobrancas) e não têm entrada em cora_cobrancas.
--         Tornar nullable permite inserção de registros V2 sem violar a constraint.
--         Registros V1 existentes não são afetados (já têm valor preenchido).
-- Risco: Baixo — ALTER COLUMN SET DEFAULT NULL / DROP NOT NULL não altera dados existentes.
-- Reversão: ALTER TABLE public.cora_acoes ALTER COLUMN cobranca_id SET NOT NULL;

ALTER TABLE public.cora_acoes
  ALTER COLUMN cobranca_id DROP NOT NULL;
