-- Migration: 20260515_001_customers_phone_normalized.sql
-- Data: 2026-05-15
-- Autor: Wandson (via Claude Code)
-- Motivo: Permitir busca de customer pelo JID do WhatsApp (formato numérico, ex: 5594999999999)
--         sem depender do formato digitado pelo usuário (ex: +55 (94) 99999-9999).
--         A coluna gerada elimina a necessidade de normalizar no código da aplicação
--         a cada consulta, e o índice composto torna a busca por (tenant, telefone) O(log n).
-- Risco: Baixo — coluna gerada STORED, somente leitura, não quebra queries existentes.
--        Registros com phone NULL terão phone_normalized NULL (comportamento correto).
-- Reversão: ALTER TABLE customers DROP COLUMN IF EXISTS phone_normalized;
--           DROP INDEX IF EXISTS idx_customers_tenant_phone_norm;

BEGIN;

-- 1. Coluna gerada que normaliza o telefone para apenas dígitos.
--    Remove qualquer caractere que não seja 0-9 (incluindo +, espaços, (), -, .).
--    STORED significa que o valor é persistido em disco e atualizado automaticamente
--    sempre que a coluna phone for modificada.
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS phone_normalized text
  GENERATED ALWAYS AS (regexp_replace(phone, '[^0-9]', '', 'g')) STORED;

COMMENT ON COLUMN customers.phone_normalized IS
  'Gerada automaticamente a partir de phone, contendo apenas dígitos (0-9). '
  'Usada para busca por JID do WhatsApp (formato numérico). Somente leitura.';

-- 2. Índice composto por tenant + telefone normalizado.
--    Cobre o padrão de query mais comum: localizar customer de um tenant
--    a partir do número extraído do JID da Evolution API.
CREATE INDEX IF NOT EXISTS idx_customers_tenant_phone_norm
  ON customers(tenant_id, phone_normalized);

COMMIT;
