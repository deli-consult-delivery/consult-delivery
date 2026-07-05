-- Rota B Etapa 4b-2 G1: policies de dados (sem role) -> accessible_tenant_ids(). Atômico.
BEGIN;

-- FORMA A: agent_chat_messages (INSERT)
DROP POLICY IF EXISTS tenant_members_insert_agent_chat_messages ON public.agent_chat_messages;
CREATE POLICY tenant_members_insert_agent_chat_messages ON public.agent_chat_messages
  FOR INSERT TO public
  WITH CHECK (tenant_id IN ( SELECT public.accessible_tenant_ids()));

-- FORMA A: agent_chat_messages (SELECT)
DROP POLICY IF EXISTS tenant_members_select_agent_chat_messages ON public.agent_chat_messages;
CREATE POLICY tenant_members_select_agent_chat_messages ON public.agent_chat_messages
  FOR SELECT TO public
  USING (tenant_id IN ( SELECT public.accessible_tenant_ids()));

-- FORMA B: chat_tasks (ALL)
DROP POLICY IF EXISTS chat_tasks_tenant_isolation ON public.chat_tasks;
CREATE POLICY chat_tasks_tenant_isolation ON public.chat_tasks
  FOR ALL TO public
  USING (chat_tasks.tenant_id IN ( SELECT public.accessible_tenant_ids()))
  WITH CHECK (chat_tasks.tenant_id IN ( SELECT public.accessible_tenant_ids()));

-- FORMA B: client_tasks (ALL)
DROP POLICY IF EXISTS "tenant members can manage client_tasks" ON public.client_tasks;
CREATE POLICY "tenant members can manage client_tasks" ON public.client_tasks
  FOR ALL TO public
  USING (client_tasks.tenant_id IN ( SELECT public.accessible_tenant_ids()))
  WITH CHECK (client_tasks.tenant_id IN ( SELECT public.accessible_tenant_ids()));

-- FORMA A: custom_field_values (ALL) -- subquery aninhada via custom_fields.tenant_id
DROP POLICY IF EXISTS tenant_member_custom_field_values ON public.custom_field_values;
CREATE POLICY tenant_member_custom_field_values ON public.custom_field_values
  FOR ALL TO public
  USING (custom_field_id IN ( SELECT custom_fields.id
     FROM custom_fields
    WHERE (custom_fields.tenant_id IN ( SELECT public.accessible_tenant_ids()))));

-- FORMA B: customer_note_entries (ALL)
DROP POLICY IF EXISTS note_entries_tenant ON public.customer_note_entries;
CREATE POLICY note_entries_tenant ON public.customer_note_entries
  FOR ALL TO public
  USING (customer_note_entries.tenant_id IN ( SELECT public.accessible_tenant_ids()))
  WITH CHECK (customer_note_entries.tenant_id IN ( SELECT public.accessible_tenant_ids()));

-- FORMA A: customer_tag_relations (ALL) -- subquery aninhada via customers.tenant_id
DROP POLICY IF EXISTS "tenant members see tag relations" ON public.customer_tag_relations;
CREATE POLICY "tenant members see tag relations" ON public.customer_tag_relations
  FOR ALL TO public
  USING (customer_id IN ( SELECT customers.id
     FROM customers
    WHERE (customers.tenant_id IN ( SELECT public.accessible_tenant_ids()))));

-- FORMA A: evolution_instances (SELECT) -- subquery aninhada via conversations.tenant_id
DROP POLICY IF EXISTS evolution_instances_select_tenant ON public.evolution_instances;
CREATE POLICY evolution_instances_select_tenant ON public.evolution_instances
  FOR SELECT TO public
  USING (id IN ( SELECT DISTINCT conversations.instance_id
     FROM conversations
    WHERE ((conversations.tenant_id IN ( SELECT public.accessible_tenant_ids())) AND (conversations.instance_id IS NOT NULL))));

-- FORMA B: templates_tarefa (SELECT)
DROP POLICY IF EXISTS "Ver templates do proprio tenant" ON public.templates_tarefa;
CREATE POLICY "Ver templates do proprio tenant" ON public.templates_tarefa
  FOR SELECT TO public
  USING (templates_tarefa.tenant_id IN ( SELECT public.accessible_tenant_ids()));

COMMIT;
