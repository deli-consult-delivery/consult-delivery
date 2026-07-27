-- Data: 2026-07-26 | Autor: Wandson | Risco: baixo
-- Motivo: impedir PUT/DELETE concorrentes e repetição de efeitos financeiros.
-- Reversão: ALTER TABLE public.cardapio_web_orders DROP COLUMN venda_write_started_at;

BEGIN;

ALTER TABLE public.cardapio_web_orders
  ADD COLUMN IF NOT EXISTS venda_write_started_at timestamptz;

COMMIT;
