-- TD#24: coluna is_active para soft-delete de lojas
-- Limpeza one-shot de lojas seed/lixo feita manualmente em produção (não incluída aqui)
ALTER TABLE lojas ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true NOT NULL;
