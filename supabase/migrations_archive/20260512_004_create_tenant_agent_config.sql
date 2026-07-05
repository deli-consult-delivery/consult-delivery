-- Fase 0 | Tarefa 3.4
-- Override de modo e configuração por agente/tenant
-- agent_id referencia agents(id) (chave existente da tabela)

CREATE TABLE IF NOT EXISTS tenant_agent_config (
  tenant_id     uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  agent_id      text        NOT NULL REFERENCES agents(id)  ON DELETE CASCADE,
  modo_override text                 CHECK (modo_override IN ('humano', 'hibrido', 'ia')),
  enabled       boolean     NOT NULL DEFAULT true,
  config        jsonb       NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (tenant_id, agent_id)
);

COMMENT ON TABLE tenant_agent_config IS
  'Override por (tenant, agente). modo_override NULL = herda tenant.modo_padrao.';

ALTER TABLE tenant_agent_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_admin_manage_agent_config"
  ON tenant_agent_config
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM tenant_members
      WHERE tenant_members.tenant_id = tenant_agent_config.tenant_id
        AND tenant_members.user_id   = auth.uid()
        AND tenant_members.role      IN ('admin', 'owner')
    )
  );
