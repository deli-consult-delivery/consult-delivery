-- Rota B 4b-2 Cat.X: visibilidade via join a tabela-pai -> accessible_tenant_ids(). Atômico.
-- Transforma 19 policies que davam visibilidade por membership no tenant-pai (JOIN tenant_members
-- na cadeia + tm.user_id = auth.uid()) para acesso hierárquico: remove o JOIN tenant_members e a
-- condição tm.user_id = auth.uid(), e passa a filtrar <PARENT>.tenant_id IN (SELECT public.accessible_tenant_ids()).
-- Nenhuma dessas policies tinha filtro de role — apenas visibilidade por tenant. Semântica preservada
-- (nome/aspas/cmd/roles/with_check), só a fonte de "tenants visíveis" muda para incluir descendentes.
BEGIN;

-- 1. cobranca_eventos / cobranca_eventos_insert (parent: cobrancas c, EXISTS no WITH CHECK)
DROP POLICY IF EXISTS "cobranca_eventos_insert" ON public.cobranca_eventos;
CREATE POLICY "cobranca_eventos_insert" ON public.cobranca_eventos
  AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (EXISTS ( SELECT 1
     FROM cobrancas c
    WHERE ((c.id = cobranca_eventos.cobranca_id) AND (c.tenant_id IN ( SELECT public.accessible_tenant_ids() )))));

-- 2. cobranca_eventos / cobranca_eventos_select (parent: cobrancas c)
DROP POLICY IF EXISTS "cobranca_eventos_select" ON public.cobranca_eventos;
CREATE POLICY "cobranca_eventos_select" ON public.cobranca_eventos
  AS PERMISSIVE FOR SELECT TO public
  USING (EXISTS ( SELECT 1
     FROM cobrancas c
    WHERE ((c.id = cobranca_eventos.cobranca_id) AND (c.tenant_id IN ( SELECT public.accessible_tenant_ids() )))));

-- 3. conversation_tags / tenant_isolation (parent: lead_tags lt)
DROP POLICY IF EXISTS "tenant_isolation" ON public.conversation_tags;
CREATE POLICY "tenant_isolation" ON public.conversation_tags
  AS PERMISSIVE FOR ALL TO public
  USING (EXISTS ( SELECT 1
     FROM lead_tags lt
    WHERE ((lt.id = conversation_tags.tag_id) AND (lt.tenant_id IN ( SELECT public.accessible_tenant_ids() )))));

-- 4. customer_tags / tenant_isolation (parent: lead_tags lt)
DROP POLICY IF EXISTS "tenant_isolation" ON public.customer_tags;
CREATE POLICY "tenant_isolation" ON public.customer_tags
  AS PERMISSIVE FOR ALL TO public
  USING (EXISTS ( SELECT 1
     FROM lead_tags lt
    WHERE ((lt.id = customer_tags.tag_id) AND (lt.tenant_id IN ( SELECT public.accessible_tenant_ids() )))));

-- 5. department_members / tenant_isolation (parent: departments d)
DROP POLICY IF EXISTS "tenant_isolation" ON public.department_members;
CREATE POLICY "tenant_isolation" ON public.department_members
  AS PERMISSIVE FOR ALL TO public
  USING (EXISTS ( SELECT 1
     FROM departments d
    WHERE ((d.id = department_members.department_id) AND (d.tenant_id IN ( SELECT public.accessible_tenant_ids() )))));

-- 6. lead_list_members / tenant_isolation (parent: lead_lists ll)
DROP POLICY IF EXISTS "tenant_isolation" ON public.lead_list_members;
CREATE POLICY "tenant_isolation" ON public.lead_list_members
  AS PERMISSIVE FOR ALL TO public
  USING (EXISTS ( SELECT 1
     FROM lead_lists ll
    WHERE ((ll.id = lead_list_members.list_id) AND (ll.tenant_id IN ( SELECT public.accessible_tenant_ids() )))));

-- 7. loja_consultores / Ver atribuições do próprio tenant (parent: lojas l)
DROP POLICY IF EXISTS "Ver atribuições do próprio tenant" ON public.loja_consultores;
CREATE POLICY "Ver atribuições do próprio tenant" ON public.loja_consultores
  AS PERMISSIVE FOR SELECT TO public
  USING (EXISTS ( SELECT 1
     FROM lojas l
    WHERE ((l.id = loja_consultores.loja_id) AND (l.tenant_id IN ( SELECT public.accessible_tenant_ids() )))));

-- 8. loja_gpt_conversations / lgc_select (parent: lojas l)
DROP POLICY IF EXISTS "lgc_select" ON public.loja_gpt_conversations;
CREATE POLICY "lgc_select" ON public.loja_gpt_conversations
  AS PERMISSIVE FOR SELECT TO public
  USING (EXISTS ( SELECT 1
     FROM lojas l
    WHERE ((l.id = loja_gpt_conversations.loja_id) AND (l.tenant_id IN ( SELECT public.accessible_tenant_ids() )))));

-- 9. loja_gpt_messages / lgm_select (parent: lojas l, via loja_gpt_conversations c)
DROP POLICY IF EXISTS "lgm_select" ON public.loja_gpt_messages;
CREATE POLICY "lgm_select" ON public.loja_gpt_messages
  AS PERMISSIVE FOR SELECT TO public
  USING (EXISTS ( SELECT 1
     FROM (loja_gpt_conversations c
       JOIN lojas l ON ((l.id = c.loja_id)))
    WHERE ((c.id = loja_gpt_messages.conversation_id) AND (l.tenant_id IN ( SELECT public.accessible_tenant_ids() )))));

-- 10. loja_metricas_snapshot / Métricas do próprio tenant (parent: lojas l)
DROP POLICY IF EXISTS "Métricas do próprio tenant" ON public.loja_metricas_snapshot;
CREATE POLICY "Métricas do próprio tenant" ON public.loja_metricas_snapshot
  AS PERMISSIVE FOR SELECT TO public
  USING (EXISTS ( SELECT 1
     FROM lojas l
    WHERE ((l.id = loja_metricas_snapshot.loja_id) AND (l.tenant_id IN ( SELECT public.accessible_tenant_ids() )))));

-- 11. role_permissions / role_permissions_select_tenant (parent: roles r)
DROP POLICY IF EXISTS "role_permissions_select_tenant" ON public.role_permissions;
CREATE POLICY "role_permissions_select_tenant" ON public.role_permissions
  AS PERMISSIVE FOR SELECT TO public
  USING (EXISTS ( SELECT 1
     FROM roles r
    WHERE ((r.id = role_permissions.role_id) AND (r.tenant_id IN ( SELECT public.accessible_tenant_ids() )))));

-- 12. tarefa_aprovacoes / Ver historico do proprio tenant (parent: lojas l, via tarefas_loja t)
DROP POLICY IF EXISTS "Ver historico do proprio tenant" ON public.tarefa_aprovacoes;
CREATE POLICY "Ver historico do proprio tenant" ON public.tarefa_aprovacoes
  AS PERMISSIVE FOR SELECT TO public
  USING (EXISTS ( SELECT 1
     FROM (tarefas_loja t
       JOIN lojas l ON ((l.id = t.loja_id)))
    WHERE ((t.id = tarefa_aprovacoes.tarefa_id) AND (l.tenant_id IN ( SELECT public.accessible_tenant_ids() )))));

-- 13. tarefa_comentarios / Ver comentarios do proprio tenant (parent: lojas l, via tarefas_loja t)
DROP POLICY IF EXISTS "Ver comentarios do proprio tenant" ON public.tarefa_comentarios;
CREATE POLICY "Ver comentarios do proprio tenant" ON public.tarefa_comentarios
  AS PERMISSIVE FOR SELECT TO public
  USING (EXISTS ( SELECT 1
     FROM (tarefas_loja t
       JOIN lojas l ON ((l.id = t.loja_id)))
    WHERE ((t.id = tarefa_comentarios.tarefa_id) AND (l.tenant_id IN ( SELECT public.accessible_tenant_ids() )))));

-- 14. tarefa_prints / Ver prints do proprio tenant (parent: lojas l, via tarefas_loja t)
DROP POLICY IF EXISTS "Ver prints do proprio tenant" ON public.tarefa_prints;
CREATE POLICY "Ver prints do proprio tenant" ON public.tarefa_prints
  AS PERMISSIVE FOR SELECT TO public
  USING (EXISTS ( SELECT 1
     FROM (tarefas_loja t
       JOIN lojas l ON ((l.id = t.loja_id)))
    WHERE ((t.id = tarefa_prints.tarefa_id) AND (l.tenant_id IN ( SELECT public.accessible_tenant_ids() )))));

-- 15. tarefa_revisoes / tenant_members_view_tarefa_revisoes (parent: lojas l, via tarefas_loja tl)
DROP POLICY IF EXISTS "tenant_members_view_tarefa_revisoes" ON public.tarefa_revisoes;
CREATE POLICY "tenant_members_view_tarefa_revisoes" ON public.tarefa_revisoes
  AS PERMISSIVE FOR SELECT TO public
  USING (EXISTS ( SELECT 1
     FROM (tarefas_loja tl
       JOIN lojas l ON ((l.id = tl.loja_id)))
    WHERE ((tl.id = tarefa_revisoes.tarefa_id) AND (l.tenant_id IN ( SELECT public.accessible_tenant_ids() )))));

-- 16. tarefas_loja / Ver tarefas do proprio tenant (parent: lojas l)
DROP POLICY IF EXISTS "Ver tarefas do proprio tenant" ON public.tarefas_loja;
CREATE POLICY "Ver tarefas do proprio tenant" ON public.tarefas_loja
  AS PERMISSIVE FOR SELECT TO public
  USING (EXISTS ( SELECT 1
     FROM lojas l
    WHERE ((l.id = tarefas_loja.loja_id) AND (l.tenant_id IN ( SELECT public.accessible_tenant_ids() )))));

-- 17. user_roles / user_roles_select_tenant (parent: roles r)
DROP POLICY IF EXISTS "user_roles_select_tenant" ON public.user_roles;
CREATE POLICY "user_roles_select_tenant" ON public.user_roles
  AS PERMISSIVE FOR SELECT TO public
  USING (EXISTS ( SELECT 1
     FROM roles r
    WHERE ((r.id = user_roles.role_id) AND (r.tenant_id IN ( SELECT public.accessible_tenant_ids() )))));

-- 18. whatsapp_group_members / wa_group_members_manage_tenant (parent: whatsapp_groups g)
DROP POLICY IF EXISTS "wa_group_members_manage_tenant" ON public.whatsapp_group_members;
CREATE POLICY "wa_group_members_manage_tenant" ON public.whatsapp_group_members
  AS PERMISSIVE FOR ALL TO public
  USING (EXISTS ( SELECT 1
     FROM whatsapp_groups g
    WHERE ((g.id = whatsapp_group_members.group_id) AND (g.tenant_id IN ( SELECT public.accessible_tenant_ids() )))));

-- 19. whatsapp_group_members / wa_group_members_select_tenant (parent: whatsapp_groups g)
DROP POLICY IF EXISTS "wa_group_members_select_tenant" ON public.whatsapp_group_members;
CREATE POLICY "wa_group_members_select_tenant" ON public.whatsapp_group_members
  AS PERMISSIVE FOR SELECT TO public
  USING (EXISTS ( SELECT 1
     FROM whatsapp_groups g
    WHERE ((g.id = whatsapp_group_members.group_id) AND (g.tenant_id IN ( SELECT public.accessible_tenant_ids() )))));

COMMIT;
