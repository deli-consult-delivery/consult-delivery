-- Sprint 3A | Tarefa 1 — Suporte a agentes customizados por tenant
-- Colunas novas na tabela agents + RLS para isolamento

ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS is_custom        BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS custom_prompt    TEXT,
  ADD COLUMN IF NOT EXISTS custom_model     TEXT DEFAULT 'claude-haiku-4-5-20251001',
  ADD COLUMN IF NOT EXISTS custom_max_tokens INTEGER DEFAULT 4096,
  ADD COLUMN IF NOT EXISTS tenant_id        UUID REFERENCES tenants(id) ON DELETE CASCADE;

COMMENT ON COLUMN agents.is_custom IS 'true = agente criado pelo tenant; false = agente global da plataforma';
COMMENT ON COLUMN agents.tenant_id IS 'NULL = agente global (seed); NOT NULL = agente customizado do tenant';

-- Índice para filtragem por tenant
CREATE INDEX IF NOT EXISTS agents_tenant_id_idx ON agents(tenant_id);

-- RLS: agentes globais visíveis a todos; customizados, só ao próprio tenant
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;

-- Remove policy anterior (se existir) para recriar sem conflito
DROP POLICY IF EXISTS "agents_tenant_isolation" ON agents;

CREATE POLICY "agents_tenant_isolation" ON agents
  FOR ALL
  USING (
    tenant_id IS NULL
    OR tenant_id = (
      SELECT tenant_id FROM tenant_members
      WHERE user_id = auth.uid()
      LIMIT 1
    )
  );
