-- Adiciona campos de extrato financeiro Asaas à tabela cobrancas
-- Aditiva/reversível — D5 v3

ALTER TABLE cobrancas
  ADD COLUMN IF NOT EXISTS payment_date        date,
  ADD COLUMN IF NOT EXISTS net_value           numeric,
  ADD COLUMN IF NOT EXISTS date_created        date,
  ADD COLUMN IF NOT EXISTS invoice_viewed_date timestamptz,
  ADD COLUMN IF NOT EXISTS description         text,
  ADD COLUMN IF NOT EXISTS confirmed_date      date;

COMMENT ON COLUMN cobrancas.payment_date        IS 'Data real do pagamento (paymentDate do Asaas)';
COMMENT ON COLUMN cobrancas.net_value           IS 'Valor líquido após taxa Asaas (netValue)';
COMMENT ON COLUMN cobrancas.date_created        IS 'Data de criação da cobrança no Asaas (dateCreated)';
COMMENT ON COLUMN cobrancas.invoice_viewed_date IS 'Timestamp em que o cliente visualizou a fatura (invoiceViewedDate)';
COMMENT ON COLUMN cobrancas.description         IS 'Descrição da cobrança no Asaas';
COMMENT ON COLUMN cobrancas.confirmed_date      IS 'Data de confirmação do pagamento (confirmedDate)';
