-- Agent Tickets: internal work inbox for AI agents
CREATE TABLE IF NOT EXISTS agent_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','blocked','review','resolved','closed')),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('urgent','high','medium','low')),
  assignee_agent TEXT,         -- slug do agente (ex: 'deli', 'lara')
  goal_id UUID,                -- link opcional ao sistema de goals (Sprint 2)
  -- Atomic checkout (prevents double-work)
  locked_at TIMESTAMPTZ,
  locked_by TEXT,              -- agent slug ou 'human:userId'
  lock_timeout_seconds INTEGER DEFAULT 1800,
  -- Metadata
  source_agent TEXT,           -- quem criou
  source_session_id TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Comments with mentions support
CREATE TABLE IF NOT EXISTS agent_ticket_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES agent_tickets(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  author TEXT NOT NULL,        -- 'human:userId', 'agent:slug', 'system'
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Activity log (immutable)
CREATE TABLE IF NOT EXISTS agent_ticket_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES agent_tickets(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,    -- created, status_changed, checkout, released, comment_added, assigned
  actor TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Agent Action Approvals (Semáforo: Verde/Amarelo/Vermelho)
CREATE TABLE IF NOT EXISTS agent_action_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  agent_slug TEXT NOT NULL,
  action_type TEXT NOT NULL,   -- 'send_message', 'create_campaign', 'execute_payment', etc.
  action_label TEXT NOT NULL,  -- human-readable description
  action_payload JSONB,        -- dados da ação proposta
  severity TEXT NOT NULL DEFAULT 'amarelo' CHECK (severity IN ('verde','amarelo','vermelho')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,
  review_note TEXT,
  heartbeat_run_id UUID,       -- link ao heartbeat que gerou
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '24 hours')
);

-- RLS policies
ALTER TABLE agent_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_ticket_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_ticket_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_action_approvals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agent_tickets_tenant" ON agent_tickets FOR ALL USING (
  tenant_id = (SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid() LIMIT 1)
);
CREATE POLICY "agent_ticket_comments_tenant" ON agent_ticket_comments FOR ALL USING (
  tenant_id = (SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid() LIMIT 1)
);
CREATE POLICY "agent_ticket_activity_tenant" ON agent_ticket_activity FOR ALL USING (
  tenant_id = (SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid() LIMIT 1)
);
CREATE POLICY "agent_action_approvals_tenant" ON agent_action_approvals FOR ALL USING (
  tenant_id = (SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid() LIMIT 1)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_agent_tickets_tenant ON agent_tickets(tenant_id);
CREATE INDEX IF NOT EXISTS idx_agent_tickets_assignee ON agent_tickets(assignee_agent) WHERE assignee_agent IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_agent_tickets_status ON agent_tickets(status);
CREATE INDEX IF NOT EXISTS idx_agent_ticket_comments_ticket ON agent_ticket_comments(ticket_id);
CREATE INDEX IF NOT EXISTS idx_agent_approvals_tenant_status ON agent_action_approvals(tenant_id, status) WHERE status = 'pending';
