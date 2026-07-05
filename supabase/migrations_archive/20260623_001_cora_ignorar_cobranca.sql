-- Adiciona suporte a isenção de cobrança e baixa manual por PIX
-- Aditivo/reversível: ADD COLUMN IF NOT EXISTS com DEFAULT seguro

ALTER TABLE cobrancas
  ADD COLUMN IF NOT EXISTS ignorar_cobranca BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS ignorar_motivo   TEXT;

-- Índice para a régua diária filtrar rapidamente os isentos
CREATE INDEX IF NOT EXISTS idx_cobrancas_ignorar
  ON cobrancas (tenant_id, ignorar_cobranca)
  WHERE ignorar_cobranca = FALSE;
