-- ============================================================
-- MIGRATION: RBAC — Papéis, Permissões, Acesso a Agentes e Auditoria
-- Data: 2026-05-04
-- ============================================================

-- ------------------------------------------------------------
-- 1. ROLES — papéis disponíveis dentro de cada tenant
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS roles (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  is_system   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, name)
);

COMMENT ON TABLE roles IS 'Papéis disponíveis dentro de um tenant. Ex: admin, dev, marketing, atendimento.';

ALTER TABLE roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "roles_select_tenant" ON roles
  FOR SELECT USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "roles_insert_admin" ON roles
  FOR INSERT WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "roles_update_admin" ON roles
  FOR UPDATE USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "roles_delete_admin" ON roles
  FOR DELETE USING (
    is_system = FALSE AND
    tenant_id IN (
      SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- ------------------------------------------------------------
-- 2. USER_ROLES — N usuários podem ter N papéis
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_roles (
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role_id    UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  granted_by UUID REFERENCES auth.users(id),
  PRIMARY KEY (user_id, role_id)
);

COMMENT ON TABLE user_roles IS 'Associação usuário ↔ papel. Um usuário pode ter múltiplos papéis.';

ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_roles_select_tenant" ON user_roles
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM roles r
      JOIN tenant_members tm ON tm.tenant_id = r.tenant_id
      WHERE r.id = user_roles.role_id AND tm.user_id = auth.uid()
    )
  );

CREATE POLICY "user_roles_manage_admin" ON user_roles
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM roles r
      JOIN tenant_members tm ON tm.tenant_id = r.tenant_id
      WHERE r.id = user_roles.role_id AND tm.user_id = auth.uid() AND tm.role = 'admin'
    )
  );

-- ------------------------------------------------------------
-- 3. ROLE_PERMISSIONS — o que cada papel pode fazer
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS role_permissions (
  role_id  UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  resource TEXT NOT NULL,
  action   TEXT NOT NULL,
  PRIMARY KEY (role_id, resource, action)
);

COMMENT ON TABLE role_permissions IS 'Permissões por papel. resource: financeiro, crm, cobranca, analise_ifood, agents_panel, reports, tenant_admin, kanban, chat, grupos_whatsapp. action: view, create, edit, delete, execute, approve.';

ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "role_permissions_select_tenant" ON role_permissions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM roles r
      JOIN tenant_members tm ON tm.tenant_id = r.tenant_id
      WHERE r.id = role_permissions.role_id AND tm.user_id = auth.uid()
    )
  );

CREATE POLICY "role_permissions_manage_admin" ON role_permissions
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM roles r
      JOIN tenant_members tm ON tm.tenant_id = r.tenant_id
      WHERE r.id = role_permissions.role_id AND tm.user_id = auth.uid() AND tm.role = 'admin'
    )
  );

-- ------------------------------------------------------------
-- 4. USER_AGENT_ACCESS — controle granular por agente
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_agent_access (
  user_id            UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_name         TEXT NOT NULL,
  can_invoke         BOOLEAN NOT NULL DEFAULT TRUE,
  can_view_history   BOOLEAN NOT NULL DEFAULT TRUE,
  can_approve_drafts BOOLEAN NOT NULL DEFAULT FALSE,
  granted_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  granted_by         UUID REFERENCES auth.users(id),
  PRIMARY KEY (user_id, agent_name)
);

COMMENT ON TABLE user_agent_access IS 'Controle granular de acesso a agentes IA. Sobrescreve permissões de role para um agente específico.';

ALTER TABLE user_agent_access ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_agent_access_self" ON user_agent_access
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "user_agent_access_manage_admin" ON user_agent_access
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM tenant_members tm
      WHERE tm.user_id = auth.uid() AND tm.role = 'admin'
    )
  );

-- ------------------------------------------------------------
-- 5. AUDIT_LOG — registro imutável de ações
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_log (
  id         BIGSERIAL PRIMARY KEY,
  tenant_id  UUID NOT NULL,
  user_id    UUID REFERENCES auth.users(id),
  agent_name TEXT,
  action     TEXT NOT NULL,
  resource   TEXT,
  metadata   JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE audit_log IS 'Log imutável de todas as ações relevantes. Append-only: sem UPDATE, sem DELETE.';

CREATE INDEX IF NOT EXISTS idx_audit_log_tenant_ts ON audit_log(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_user_ts   ON audit_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_agent_ts  ON audit_log(agent_name, created_at DESC);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_log_select_admin" ON audit_log
  FOR SELECT USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "audit_log_insert_authenticated" ON audit_log
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Helper function
CREATE OR REPLACE FUNCTION log_audit(
  p_tenant_id  UUID,
  p_action     TEXT,
  p_resource   TEXT DEFAULT NULL,
  p_agent_name TEXT DEFAULT NULL,
  p_metadata   JSONB DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO audit_log(tenant_id, user_id, agent_name, action, resource, metadata)
  VALUES (p_tenant_id, auth.uid(), p_agent_name, p_action, p_resource, p_metadata);
END;
$$;
