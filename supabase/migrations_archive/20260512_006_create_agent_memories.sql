-- Fase 0 | Tarefa 3.6
-- Memória persistente de agentes (DELI e outros que precisam de contexto entre sessões)
-- agent_id referencia agents(id)

CREATE TABLE IF NOT EXISTS agent_memories (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id    text        NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  tenant_id   uuid        REFERENCES tenants(id)         ON DELETE CASCADE,
  user_id     uuid        REFERENCES auth.users(id)      ON DELETE SET NULL,
  kind        text        NOT NULL
              CHECK (kind IN ('fact', 'preference', 'history', 'decision')),
  content     text        NOT NULL,
  importance  integer     NOT NULL DEFAULT 5 CHECK (importance BETWEEN 1 AND 10),
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz
);

COMMENT ON TABLE agent_memories IS 'Memória persistente de agentes. expires_at NULL = sem expiração.';
COMMENT ON COLUMN agent_memories.importance IS '1 = trivial, 10 = crítico. Usado para priorizar contexto no prompt.';

CREATE INDEX IF NOT EXISTS agent_memories_agent_tenant_idx ON agent_memories (agent_id, tenant_id);
CREATE INDEX IF NOT EXISTS agent_memories_expires_at_idx   ON agent_memories (expires_at)
  WHERE expires_at IS NOT NULL;

ALTER TABLE agent_memories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_manage_memories"
  ON agent_memories FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "tenant_members_view_memories"
  ON agent_memories FOR SELECT
  USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid()
    )
  );
