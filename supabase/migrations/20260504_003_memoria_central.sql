-- ============================================================
-- MIGRATION: Memória Central dos Agentes
-- Data: 2026-05-04
-- ============================================================

-- ------------------------------------------------------------
-- 1. LOJAS — cada cliente/loja gerenciada pelo tenant
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS lojas (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nome        TEXT NOT NULL,
  segmento    TEXT,
  plataformas TEXT[],
  cidade      TEXT,
  ativo       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE lojas IS 'Lojas/clientes gerenciados pelo tenant. Base para client_facts e client_timeline.';

CREATE INDEX IF NOT EXISTS idx_lojas_tenant ON lojas(tenant_id);

ALTER TABLE lojas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lojas_select_tenant" ON lojas
  FOR SELECT USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "lojas_insert_tenant" ON lojas
  FOR INSERT WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "lojas_update_tenant" ON lojas
  FOR UPDATE USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "lojas_delete_admin" ON lojas
  FOR DELETE USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- ------------------------------------------------------------
-- 2. CLIENT_FACTS — fatos duráveis sobre uma loja
-- Substituem memory/*.md na VPS — qualquer agente lê/escreve
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS client_facts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loja_id     UUID NOT NULL REFERENCES lojas(id) ON DELETE CASCADE,
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  agent_name  TEXT,
  category    TEXT NOT NULL,
  fact        TEXT NOT NULL,
  confidence  SMALLINT NOT NULL DEFAULT 100 CHECK (confidence BETWEEN 0 AND 100),
  expires_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE client_facts IS 'Fatos duráveis sobre lojas. category: preferencia, restricao, historico, objetivo, risco. Agentes leem antes de agir e atualizam após aprender.';

CREATE INDEX IF NOT EXISTS idx_client_facts_loja  ON client_facts(loja_id);
CREATE INDEX IF NOT EXISTS idx_client_facts_tenant ON client_facts(tenant_id);

ALTER TABLE client_facts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "client_facts_select_tenant" ON client_facts
  FOR SELECT USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "client_facts_insert_tenant" ON client_facts
  FOR INSERT WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "client_facts_update_tenant" ON client_facts
  FOR UPDATE USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "client_facts_delete_admin" ON client_facts
  FOR DELETE USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- ------------------------------------------------------------
-- 3. CLIENT_TIMELINE — linha do tempo imutável por loja
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS client_timeline (
  id          BIGSERIAL PRIMARY KEY,
  loja_id     UUID NOT NULL REFERENCES lojas(id) ON DELETE CASCADE,
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  agent_name  TEXT,
  event_type  TEXT NOT NULL,
  summary     TEXT NOT NULL,
  metadata    JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE client_timeline IS 'Linha do tempo imutável de eventos por loja. event_type: analise, cobranca, mensagem, reuniao, meta, alerta. Append-only: sem UPDATE.';

CREATE INDEX IF NOT EXISTS idx_client_timeline_loja    ON client_timeline(loja_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_client_timeline_tenant  ON client_timeline(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_client_timeline_type    ON client_timeline(event_type);

ALTER TABLE client_timeline ENABLE ROW LEVEL SECURITY;

CREATE POLICY "client_timeline_select_tenant" ON client_timeline
  FOR SELECT USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "client_timeline_insert_tenant" ON client_timeline
  FOR INSERT WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid()
    )
  );

-- ------------------------------------------------------------
-- 4. LOJA_METRICAS — snapshot diário de métricas operacionais
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS loja_metricas (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loja_id      UUID NOT NULL REFERENCES lojas(id) ON DELETE CASCADE,
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  data_ref     DATE NOT NULL,
  faturamento  NUMERIC(12,2),
  pedidos      INT,
  ticket_medio NUMERIC(10,2),
  avaliacao    NUMERIC(3,2),
  cancelamentos INT,
  fonte        TEXT NOT NULL DEFAULT 'manual',
  raw_data     JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(loja_id, data_ref, fonte)
);

COMMENT ON TABLE loja_metricas IS 'Snapshot diário de métricas por loja. fonte: ifood, rappi, manual, analise_agente. Populado pelo n8n e pelo analista-ifood.';

CREATE INDEX IF NOT EXISTS idx_loja_metricas_loja   ON loja_metricas(loja_id, data_ref DESC);
CREATE INDEX IF NOT EXISTS idx_loja_metricas_tenant ON loja_metricas(tenant_id, data_ref DESC);

ALTER TABLE loja_metricas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "loja_metricas_select_tenant" ON loja_metricas
  FOR SELECT USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "loja_metricas_insert_tenant" ON loja_metricas
  FOR INSERT WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "loja_metricas_update_tenant" ON loja_metricas
  FOR UPDATE USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "loja_metricas_delete_admin" ON loja_metricas
  FOR DELETE USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid() AND role = 'admin'
    )
  );
