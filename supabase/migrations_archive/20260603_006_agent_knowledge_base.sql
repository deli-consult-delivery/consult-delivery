-- Sprint 3D: Base de Conhecimento genérica por agente
CREATE TABLE IF NOT EXISTS agent_knowledge_base (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  agent_slug TEXT,                 -- 'deli', 'lara', 'vera', etc. (null = global/todos)
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  tags TEXT[] DEFAULT '{}',
  source TEXT DEFAULT 'manual',    -- 'manual', 'imported', 'auto-generated'
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE agent_knowledge_base ENABLE ROW LEVEL SECURITY;

CREATE POLICY "knowledge_base_tenant" ON agent_knowledge_base FOR ALL USING (
  tenant_id = (SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid() LIMIT 1)
);

CREATE INDEX IF NOT EXISTS idx_knowledge_base_tenant ON agent_knowledge_base(tenant_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_base_agent ON agent_knowledge_base(agent_slug);
CREATE INDEX IF NOT EXISTS idx_knowledge_base_active ON agent_knowledge_base(tenant_id, agent_slug, is_active) WHERE is_active = true;
