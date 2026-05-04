-- ============================================================
-- MIGRATION: Habilitar RLS em conversations, messages e evolution_instances
-- Data: 2026-05-04
-- Motivo: tabelas criadas antes do RBAC ficaram sem RLS ativo
-- ============================================================

-- ------------------------------------------------------------
-- conversations
-- ------------------------------------------------------------
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "conversations_select_tenant" ON conversations
  FOR SELECT USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "conversations_insert_tenant" ON conversations
  FOR INSERT WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "conversations_update_tenant" ON conversations
  FOR UPDATE USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "conversations_delete_admin" ON conversations
  FOR DELETE USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- ------------------------------------------------------------
-- messages
-- Pode ter tenant_id direto OU herdado via conversation_id
-- ------------------------------------------------------------
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "messages_select_tenant" ON messages
  FOR SELECT USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid()
    )
    OR
    conversation_id IN (
      SELECT id FROM conversations
      WHERE tenant_id IN (
        SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "messages_insert_tenant" ON messages
  FOR INSERT WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid()
    )
    OR
    conversation_id IN (
      SELECT id FROM conversations
      WHERE tenant_id IN (
        SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "messages_update_tenant" ON messages
  FOR UPDATE USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid()
    )
    OR
    conversation_id IN (
      SELECT id FROM conversations
      WHERE tenant_id IN (
        SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid()
      )
    )
  );

-- ------------------------------------------------------------
-- evolution_instances
-- Sem tenant_id direto — isolado via conversations da instância
-- ------------------------------------------------------------
ALTER TABLE evolution_instances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "evolution_instances_select_tenant" ON evolution_instances
  FOR SELECT USING (
    id IN (
      SELECT DISTINCT instance_id FROM conversations
      WHERE tenant_id IN (
        SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "evolution_instances_manage_admin" ON evolution_instances
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM tenant_members
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );
