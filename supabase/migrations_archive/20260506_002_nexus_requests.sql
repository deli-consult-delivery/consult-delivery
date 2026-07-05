-- ============================================================
-- Migration: nexus_requests — rastreio de chamadas async ao Nexus
-- Data: 06/05/2026
-- Depende de: 20260506_001_lara_regua.sql (tabelas lara)
-- ============================================================

CREATE TABLE IF NOT EXISTS nexus_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  loja_id         UUID NOT NULL REFERENCES lojas(id) ON DELETE CASCADE,
  agent           TEXT NOT NULL CHECK (agent IN ('pesquisa', 'regua', 'midia')),
  request_id      UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  status          TEXT NOT NULL DEFAULT 'queued'
                    CHECK (status IN ('queued', 'running', 'done', 'error', 'timeout')),
  request_payload  JSONB,
  response_payload JSONB,
  error_detail     TEXT,
  queued_at        TIMESTAMPTZ DEFAULT NOW(),
  responded_at     TIMESTAMPTZ,
  expires_at       TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '10 minutes')
);

CREATE INDEX idx_nexus_requests_request_id ON nexus_requests(request_id);
CREATE INDEX idx_nexus_requests_loja_status ON nexus_requests(loja_id, status);
CREATE INDEX idx_nexus_requests_tenant ON nexus_requests(tenant_id);

COMMENT ON TABLE nexus_requests IS
  'Rastreio de chamadas assíncronas da LARA aos sub-agentes Nexus. Cada invoke do Nexus gera uma linha; callback atualiza status e response_payload.';

ALTER TABLE nexus_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_nexus_requests ON nexus_requests
  USING (tenant_id IN (SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid()));

CREATE POLICY tenant_write_nexus_requests ON nexus_requests
  FOR ALL TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid()))
  WITH CHECK (tenant_id IN (SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid()));
