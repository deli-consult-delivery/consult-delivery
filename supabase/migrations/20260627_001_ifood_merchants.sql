-- 20260627_001_ifood_merchants.sql
-- F1 read-only da integração iFood (Centralized / client_credentials).
-- Tabela guarda SÓ o mapa tenant_id → merchant_id (qual loja iFood pertence a
-- qual restaurante da CD). SEM access_token/refresh_token por loja: o token é da
-- integradora (1 par clientId/clientSecret no Infisical, cacheado no Bridge).
-- Ver docs/integracoes/ifood/PLANO-INTEGRACAO-IFOOD.md §3 e §5.4.
--
-- SQL ADITIVO/REVERSÍVEL. NÃO aplicar automaticamente (regra da tarefa F1).

CREATE TABLE IF NOT EXISTS ifood_merchants (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id),
  merchant_id text NOT NULL,                       -- ID da loja no iFood
  nome        text,
  status      text NOT NULL DEFAULT 'connected'
              CHECK (status IN ('connected','revoked','error')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ifood_merchants ENABLE ROW LEVEL SECURITY;

-- Isolamento por tenant via tenant_members. NÃO é o que protege a leitura pelo
-- Bridge (service_role bypassa RLS por design — ver §5.4): a defesa anti-cross-tenant
-- da credencial é o filtro { tenant_id } em código de aplicação. Esta policy cobre
-- o acesso direto via API/Console (anon/auth key).
CREATE POLICY ifood_merchants_tenant_isolation ON ifood_merchants
  USING (tenant_id IN (SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid()));

CREATE UNIQUE INDEX IF NOT EXISTS ifood_merchants_tenant_merchant
  ON ifood_merchants (tenant_id, merchant_id);
