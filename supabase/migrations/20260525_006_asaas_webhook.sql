-- G03.3 — Tabela asaas_eventos + colunas pagamento em contratos

CREATE TABLE IF NOT EXISTS asaas_eventos (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid        NOT NULL REFERENCES tenants(id),
  contrato_id      uuid        REFERENCES contratos(id) ON DELETE SET NULL,
  asaas_charge_id  text        NOT NULL,
  evento_tipo      text        NOT NULL,
  payload          jsonb,
  received_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE asaas_eventos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_own" ON asaas_eventos
  FOR ALL
  USING (tenant_id IN (
    SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid()
  ));

CREATE INDEX idx_asaas_eventos_tenant      ON asaas_eventos (tenant_id, received_at DESC);
CREATE INDEX idx_asaas_eventos_contrato    ON asaas_eventos (contrato_id) WHERE contrato_id IS NOT NULL;
CREATE INDEX idx_asaas_eventos_charge      ON asaas_eventos (asaas_charge_id);

-- Colunas de status de pagamento nos contratos
ALTER TABLE contratos
  ADD COLUMN IF NOT EXISTS pagamento_status    text,
  ADD COLUMN IF NOT EXISTS ultimo_pagamento_em timestamptz,
  ADD COLUMN IF NOT EXISTS proxima_cobranca    timestamptz;
