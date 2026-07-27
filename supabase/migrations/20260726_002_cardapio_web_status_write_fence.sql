-- Impede PUTs faturados concorrentes para o mesmo pedido.
-- Reversão: ALTER TABLE public.cardapio_web_orders DROP COLUMN venda_write_started_at;

BEGIN;

ALTER TABLE public.cardapio_web_orders
  ADD COLUMN IF NOT EXISTS venda_write_started_at timestamptz;

COMMIT;
