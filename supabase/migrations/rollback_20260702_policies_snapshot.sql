-- SNAPSHOT DE ROLLBACK das RLS policies de public — 336 policies
-- Gerado 2026-07-02 antes da Rota B (RLS hierarquica). NAO aplicar em condicoes normais.
-- Uso: para reverter uma policy, DROP POLICY ... e recolar o CREATE correspondente daqui.

CREATE POLICY tenant_own ON public.aceite_recontratacao FOR ALL TO public
  USING ((tenant_id IN ( SELECT tm.tenant_id
   FROM tenant_members tm
  WHERE (tm.user_id = auth.uid()))));
CREATE POLICY agent_action_approvals_tenant ON public.agent_action_approvals FOR ALL TO public
  USING ((tenant_id IN ( SELECT tm.tenant_id
   FROM tenant_members tm
  WHERE (tm.user_id = auth.uid()))));
CREATE POLICY agent_actions_member_all ON public.agent_actions FOR ALL TO public
  USING (is_member_of(tenant_id))
  WITH CHECK (is_member_of(tenant_id));
CREATE POLICY "members can manage agent_corrections" ON public.agent_corrections FOR ALL TO public
  USING ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE (tenant_members.user_id = auth.uid()))))
  WITH CHECK ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE (tenant_members.user_id = auth.uid()))));
CREATE POLICY drafts_insert_tenant ON public.agent_drafts FOR INSERT TO public
  WITH CHECK ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE (tenant_members.user_id = auth.uid()))));
CREATE POLICY drafts_select_tenant ON public.agent_drafts FOR SELECT TO public
  USING ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE (tenant_members.user_id = auth.uid()))));
CREATE POLICY drafts_update_tenant ON public.agent_drafts FOR UPDATE TO public
  USING ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE (tenant_members.user_id = auth.uid()))))
  WITH CHECK (((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE (tenant_members.user_id = auth.uid()))) AND (((status IS DISTINCT FROM 'approved'::text) AND (status IS DISTINCT FROM 'rejected'::text)) OR (EXISTS ( SELECT 1
   FROM tenant_members
  WHERE ((tenant_members.user_id = auth.uid()) AND (tenant_members.tenant_id = agent_drafts.tenant_id) AND (tenant_members.role = ANY (ARRAY['admin'::text, 'owner'::text, 'deli_owner'::text]))))))));
CREATE POLICY knowledge_base_tenant ON public.agent_knowledge_base FOR ALL TO public
  USING ((tenant_id IN ( SELECT tm.tenant_id
   FROM tenant_members tm
  WHERE (tm.user_id = auth.uid()))));
CREATE POLICY service_role_manage_memories ON public.agent_memories FOR ALL TO public
  USING ((auth.role() = 'service_role'::text));
CREATE POLICY tenant_members_view_memories ON public.agent_memories FOR SELECT TO public
  USING ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE (tenant_members.user_id = auth.uid()))));
CREATE POLICY tenant_see_own_or_global ON public.agent_prompts FOR SELECT TO public
  USING (((tenant_id IS NULL) OR (tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE (tenant_members.user_id = auth.uid())))));
CREATE POLICY service_role_manage_runs ON public.agent_runs FOR ALL TO public
  USING ((auth.role() = 'service_role'::text));
CREATE POLICY tenant_members_view_own_runs ON public.agent_runs FOR SELECT TO public
  USING ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE (tenant_members.user_id = auth.uid()))));
CREATE POLICY agent_skills_select ON public.agent_skills FOR SELECT TO public
  USING (((tenant_id IS NULL) OR is_member_of(tenant_id)));
CREATE POLICY agent_skills_write ON public.agent_skills FOR ALL TO public
  USING (((tenant_id IS NOT NULL) AND is_admin_of(tenant_id)))
  WITH CHECK (((tenant_id IS NOT NULL) AND is_admin_of(tenant_id)));
CREATE POLICY agent_ticket_activity_tenant ON public.agent_ticket_activity FOR ALL TO public
  USING ((tenant_id IN ( SELECT tm.tenant_id
   FROM tenant_members tm
  WHERE (tm.user_id = auth.uid()))));
CREATE POLICY agent_ticket_comments_tenant ON public.agent_ticket_comments FOR ALL TO public
  USING ((tenant_id IN ( SELECT tm.tenant_id
   FROM tenant_members tm
  WHERE (tm.user_id = auth.uid()))));
CREATE POLICY agent_tickets_tenant ON public.agent_tickets FOR ALL TO public
  USING ((tenant_id IN ( SELECT tm.tenant_id
   FROM tenant_members tm
  WHERE (tm.user_id = auth.uid()))));
CREATE POLICY agente_analises_insert ON public.agente_analises FOR INSERT TO public
  WITH CHECK (is_member_of(tenant_id));
CREATE POLICY agente_analises_select ON public.agente_analises FOR SELECT TO public
  USING (is_member_of(tenant_id));
CREATE POLICY agents_delete_admin_custom ON public.agents FOR DELETE TO authenticated
  USING ((is_custom AND (tenant_id IS NOT NULL) AND is_admin_of(tenant_id)));
CREATE POLICY agents_insert_admin_custom ON public.agents FOR INSERT TO authenticated
  WITH CHECK ((is_custom AND (tenant_id IS NOT NULL) AND is_admin_of(tenant_id)));
CREATE POLICY agents_select_gated ON public.agents FOR SELECT TO authenticated
  USING (((is_custom AND (tenant_id IS NOT NULL) AND is_member_of(tenant_id)) OR agent_enabled_for_user(id)));
CREATE POLICY agents_update_admin_custom ON public.agents FOR UPDATE TO authenticated
  USING ((is_custom AND (tenant_id IS NOT NULL) AND is_admin_of(tenant_id)))
  WITH CHECK ((is_custom AND (tenant_id IS NOT NULL) AND is_admin_of(tenant_id)));
CREATE POLICY analise_loja_insert ON public.analise_loja FOR INSERT TO public
  WITH CHECK (is_member_of(tenant_id));
CREATE POLICY analise_loja_select ON public.analise_loja FOR SELECT TO public
  USING (is_member_of(tenant_id));
CREATE POLICY "members can manage analises" ON public.analises FOR ALL TO public
  USING ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE (tenant_members.user_id = auth.uid()))));
CREATE POLICY tenant_own ON public.asaas_eventos FOR ALL TO public
  USING ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE (tenant_members.user_id = auth.uid()))));
CREATE POLICY atend_aval_insert_tenant ON public.atendimento_avaliacoes FOR INSERT TO public
  WITH CHECK ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE (tenant_members.user_id = auth.uid()))));
CREATE POLICY atend_aval_select_tenant ON public.atendimento_avaliacoes FOR SELECT TO public
  USING ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE (tenant_members.user_id = auth.uid()))));
CREATE POLICY atend_aval_update_tenant ON public.atendimento_avaliacoes FOR UPDATE TO public
  USING ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE (tenant_members.user_id = auth.uid()))));
CREATE POLICY aval_insert_tenant ON public.atendimento_avaliacoes FOR INSERT TO public
  WITH CHECK ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE (tenant_members.user_id = auth.uid()))));
CREATE POLICY aval_select_tenant ON public.atendimento_avaliacoes FOR SELECT TO public
  USING ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE (tenant_members.user_id = auth.uid()))));
CREATE POLICY aval_update_admin ON public.atendimento_avaliacoes FOR UPDATE TO public
  USING ((tenant_id IN ( SELECT tm.tenant_id
   FROM ((tenant_members tm
     JOIN user_roles ur ON ((ur.user_id = tm.user_id)))
     JOIN roles r ON ((r.id = ur.role_id)))
  WHERE ((tm.user_id = auth.uid()) AND (r.name = ANY (ARRAY['admin'::text, 'dev'::text, 'atendimento'::text]))))));
CREATE POLICY audit_log_insert_authenticated ON public.audit_log FOR INSERT TO public
  WITH CHECK ((auth.uid() IS NOT NULL));
CREATE POLICY audit_log_select_admin ON public.audit_log FOR SELECT TO public
  USING ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE ((tenant_members.user_id = auth.uid()) AND (tenant_members.role = 'admin'::text)))));
CREATE POLICY tenant_admin_write_avaliacao_config ON public.avaliacao_config FOR ALL TO public
  USING ((tenant_id IN ( SELECT tm.tenant_id
   FROM ((tenant_members tm
     JOIN user_roles ur ON ((ur.user_id = tm.user_id)))
     JOIN roles r ON ((r.id = ur.role_id)))
  WHERE ((tm.user_id = auth.uid()) AND (r.name = ANY (ARRAY['admin'::text, 'dev'::text]))))));
CREATE POLICY tenant_member_read_avaliacao_config ON public.avaliacao_config FOR SELECT TO public
  USING ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE (tenant_members.user_id = auth.uid()))));
CREATE POLICY avaliacoes_insert_tenant ON public.avaliacoes FOR INSERT TO public
  WITH CHECK ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE (tenant_members.user_id = auth.uid()))));
CREATE POLICY avaliacoes_select_tenant ON public.avaliacoes FOR SELECT TO public
  USING ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE (tenant_members.user_id = auth.uid()))));
CREATE POLICY avaliacoes_update_tenant ON public.avaliacoes FOR UPDATE TO public
  USING ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE (tenant_members.user_id = auth.uid()))));
CREATE POLICY avaliacoes_cfg_insert_tenant ON public.avaliacoes_loja_config FOR INSERT TO public
  WITH CHECK ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE (tenant_members.user_id = auth.uid()))));
CREATE POLICY avaliacoes_cfg_select_tenant ON public.avaliacoes_loja_config FOR SELECT TO public
  USING ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE (tenant_members.user_id = auth.uid()))));
CREATE POLICY avaliacoes_cfg_update_tenant ON public.avaliacoes_loja_config FOR UPDATE TO public
  USING ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE (tenant_members.user_id = auth.uid()))));
CREATE POLICY bom_dia_config_insert_admin_marketing ON public.bom_dia_config FOR INSERT TO public
  WITH CHECK ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE ((tenant_members.user_id = auth.uid()) AND (tenant_members.role = ANY (ARRAY['admin'::text, 'marketing'::text]))))));
CREATE POLICY bom_dia_config_select_tenant ON public.bom_dia_config FOR SELECT TO public
  USING ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE (tenant_members.user_id = auth.uid()))));
CREATE POLICY bom_dia_config_update_admin_marketing ON public.bom_dia_config FOR UPDATE TO public
  USING ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE ((tenant_members.user_id = auth.uid()) AND (tenant_members.role = ANY (ARRAY['admin'::text, 'marketing'::text]))))));
CREATE POLICY "tenant bom_dia_feedback delete" ON public.bom_dia_feedback FOR DELETE TO public
  USING ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE (tenant_members.user_id = auth.uid()))));
CREATE POLICY "tenant bom_dia_feedback insert" ON public.bom_dia_feedback FOR INSERT TO public
  WITH CHECK ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE (tenant_members.user_id = auth.uid()))));
CREATE POLICY "tenant bom_dia_feedback select" ON public.bom_dia_feedback FOR SELECT TO public
  USING ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE (tenant_members.user_id = auth.uid()))));
CREATE POLICY "tenant bom_dia_feedback update" ON public.bom_dia_feedback FOR UPDATE TO public
  USING ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE (tenant_members.user_id = auth.uid()))));
CREATE POLICY "admin and dev can write bot_config" ON public.bot_configs FOR ALL TO public
  USING ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE ((tenant_members.user_id = auth.uid()) AND (tenant_members.role = ANY (ARRAY['admin'::text, 'dev'::text]))))))
  WITH CHECK ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE ((tenant_members.user_id = auth.uid()) AND (tenant_members.role = ANY (ARRAY['admin'::text, 'dev'::text]))))));
CREATE POLICY "tenant members can read bot_config" ON public.bot_configs FOR SELECT TO public
  USING ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE (tenant_members.user_id = auth.uid()))));
CREATE POLICY tenant_isolation ON public.bot_reply_log FOR ALL TO public
  USING ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE (tenant_members.user_id = auth.uid()))));
CREATE POLICY breno_interactions_tenant ON public.breno_interactions FOR ALL TO public
  USING ((tenant_id IN ( SELECT tm.tenant_id
   FROM tenant_members tm
  WHERE (tm.user_id = auth.uid()))));
CREATE POLICY tenant_isolation ON public.breno_message_buffer FOR ALL TO public
  USING ((tenant_id = (( SELECT (auth.jwt() ->> 'tenant_id'::text)))::uuid));
CREATE POLICY service_role_full ON public.breno_triagem FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);
CREATE POLICY tenant_isolation ON public.breno_triagem FOR ALL TO public
  USING ((tenant_id IN ( SELECT tm.tenant_id
   FROM tenant_members tm
  WHERE (tm.user_id = auth.uid()))));
CREATE POLICY tenant_isolation_campanha_ativos ON public.campanha_ativos FOR ALL TO public
  USING ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE (tenant_members.user_id = auth.uid()))));
CREATE POLICY tenant_write_campanha_ativos ON public.campanha_ativos FOR ALL TO authenticated
  USING ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE (tenant_members.user_id = auth.uid()))))
  WITH CHECK ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE (tenant_members.user_id = auth.uid()))));
CREATE POLICY tenant_isolation_campanhas ON public.campanhas FOR ALL TO public
  USING ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE (tenant_members.user_id = auth.uid()))));
CREATE POLICY tenant_write_campanhas ON public.campanhas FOR ALL TO authenticated
  USING ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE (tenant_members.user_id = auth.uid()))))
  WITH CHECK ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE (tenant_members.user_id = auth.uid()))));
CREATE POLICY allow_all_channel_members ON public.channel_members FOR ALL TO public
  USING (true)
  WITH CHECK (true);
CREATE POLICY allow_all_channel_messages ON public.channel_messages FOR ALL TO public
  USING (true)
  WITH CHECK (true);
CREATE POLICY chat_tasks_tenant_isolation ON public.chat_tasks FOR ALL TO public
  USING ((EXISTS ( SELECT 1
   FROM tenant_members tm
  WHERE ((tm.tenant_id = chat_tasks.tenant_id) AND (tm.user_id = auth.uid())))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM tenant_members tm
  WHERE ((tm.tenant_id = chat_tasks.tenant_id) AND (tm.user_id = auth.uid())))));
CREATE POLICY client_facts_delete_admin ON public.client_facts FOR DELETE TO public
  USING ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE ((tenant_members.user_id = auth.uid()) AND (tenant_members.role = 'admin'::text)))));
CREATE POLICY client_facts_insert_tenant ON public.client_facts FOR INSERT TO public
  WITH CHECK ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE (tenant_members.user_id = auth.uid()))));
CREATE POLICY client_facts_select_tenant ON public.client_facts FOR SELECT TO public
  USING ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE (tenant_members.user_id = auth.uid()))));
CREATE POLICY client_facts_update_tenant ON public.client_facts FOR UPDATE TO public
  USING ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE (tenant_members.user_id = auth.uid()))));
CREATE POLICY client_tasks_tenant_isolation ON public.client_tasks FOR ALL TO authenticated
  USING ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE (tenant_members.user_id = auth.uid()))))
  WITH CHECK ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE (tenant_members.user_id = auth.uid()))));
CREATE POLICY "tenant members can manage client_tasks" ON public.client_tasks FOR ALL TO public
  USING ((EXISTS ( SELECT 1
   FROM tenant_members tm
  WHERE ((tm.tenant_id = client_tasks.tenant_id) AND (tm.user_id = auth.uid())))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM tenant_members tm
  WHERE ((tm.tenant_id = client_tasks.tenant_id) AND (tm.user_id = auth.uid())))));
CREATE POLICY client_timeline_insert_tenant ON public.client_timeline FOR INSERT TO public
  WITH CHECK ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE (tenant_members.user_id = auth.uid()))));
CREATE POLICY client_timeline_select_tenant ON public.client_timeline FOR SELECT TO public
  USING ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE (tenant_members.user_id = auth.uid()))));
CREATE POLICY cobranca_eventos_insert ON public.cobranca_eventos FOR INSERT TO public
  WITH CHECK ((EXISTS ( SELECT 1
   FROM (cobrancas c
     JOIN tenant_members tm ON ((tm.tenant_id = c.tenant_id)))
  WHERE ((c.id = cobranca_eventos.cobranca_id) AND (tm.user_id = auth.uid())))));
CREATE POLICY cobranca_eventos_select ON public.cobranca_eventos FOR SELECT TO public
  USING ((EXISTS ( SELECT 1
   FROM (cobrancas c
     JOIN tenant_members tm ON ((tm.tenant_id = c.tenant_id)))
  WHERE ((c.id = cobranca_eventos.cobranca_id) AND (tm.user_id = auth.uid())))));
CREATE POLICY cobrancas_tenant_isolation ON public.cobrancas FOR ALL TO public
  USING ((tenant_id IN ( SELECT tm.tenant_id
   FROM tenant_members tm
  WHERE (tm.user_id = auth.uid()))))
  WITH CHECK ((tenant_id IN ( SELECT tm.tenant_id
   FROM tenant_members tm
  WHERE (tm.user_id = auth.uid()))));
CREATE POLICY contact_optout_tenant_isolation ON public.contact_optout FOR ALL TO public
  USING ((tenant_id = ( SELECT t.id
   FROM (tenants t
     JOIN tenant_members tm ON ((tm.tenant_id = t.id)))
  WHERE (tm.user_id = auth.uid())
 LIMIT 1)));
CREATE POLICY "tenant members see tags" ON public.contact_tags FOR ALL TO public
  USING ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE (tenant_members.user_id = auth.uid()))));
CREATE POLICY lara_calendar_tenant ON public.content_calendar FOR ALL TO public
  USING ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE (tenant_members.user_id = auth.uid()))));
CREATE POLICY lara_drafts_tenant ON public.content_drafts FOR ALL TO public
  USING ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE (tenant_members.user_id = auth.uid()))));
CREATE POLICY lara_published_tenant ON public.content_published FOR ALL TO public
  USING ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE (tenant_members.user_id = auth.uid()))));
CREATE POLICY tenant_own ON public.contratos FOR ALL TO public
  USING ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE (tenant_members.user_id = auth.uid()))));
CREATE POLICY tenant_isolation ON public.conversation_events FOR ALL TO public
  USING ((tenant_id IN ( SELECT tm.tenant_id
   FROM tenant_members tm
  WHERE (tm.user_id = auth.uid()))));
CREATE POLICY tenant_isolation ON public.conversation_status_log FOR ALL TO public
  USING ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE (tenant_members.user_id = auth.uid()))));
CREATE POLICY tenant_isolation ON public.conversation_tags FOR ALL TO public
  USING ((EXISTS ( SELECT 1
   FROM (lead_tags lt
     JOIN tenant_members tm ON ((tm.tenant_id = lt.tenant_id)))
  WHERE ((lt.id = conversation_tags.tag_id) AND (tm.user_id = auth.uid())))));
CREATE POLICY conversations_delete_admin ON public.conversations FOR DELETE TO public
  USING ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE ((tenant_members.user_id = auth.uid()) AND (tenant_members.role = 'admin'::text)))));
CREATE POLICY conversations_insert_tenant ON public.conversations FOR INSERT TO public
  WITH CHECK ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE (tenant_members.user_id = auth.uid()))));
CREATE POLICY conversations_member_all ON public.conversations FOR ALL TO public
  USING (is_member_of(tenant_id))
  WITH CHECK (is_member_of(tenant_id));
CREATE POLICY conversations_select_tenant ON public.conversations FOR SELECT TO public
  USING ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE (tenant_members.user_id = auth.uid()))));
CREATE POLICY conversations_update_tenant ON public.conversations FOR UPDATE TO public
  USING ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE (tenant_members.user_id = auth.uid()))));
CREATE POLICY "members can update conversation status" ON public.conversations FOR UPDATE TO public
  USING ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE (tenant_members.user_id = auth.uid()))))
  WITH CHECK ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE (tenant_members.user_id = auth.uid()))));
CREATE POLICY cora_acoes_tenant ON public.cora_acoes FOR ALL TO public
  USING ((tenant_id IN ( SELECT tm.tenant_id
   FROM tenant_members tm
  WHERE (tm.user_id = auth.uid()))));
CREATE POLICY cora_cobrancas_tenant ON public.cora_cobrancas FOR ALL TO public
  USING ((tenant_id IN ( SELECT tm.tenant_id
   FROM tenant_members tm
  WHERE (tm.user_id = auth.uid()))));
CREATE POLICY cora_reguas_tenant ON public.cora_reguas FOR ALL TO public
  USING ((tenant_id IN ( SELECT tm.tenant_id
   FROM tenant_members tm
  WHERE (tm.user_id = auth.uid()))));
CREATE POLICY crm_notas_delete ON public.crm_notas FOR DELETE TO public
  USING (is_member_of(tenant_id));
CREATE POLICY crm_notas_insert ON public.crm_notas FOR INSERT TO public
  WITH CHECK (is_member_of(tenant_id));
CREATE POLICY crm_notas_select ON public.crm_notas FOR SELECT TO public
  USING (is_member_of(tenant_id));
CREATE POLICY crm_notas_update ON public.crm_notas FOR UPDATE TO public
  USING (is_member_of(tenant_id))
  WITH CHECK (is_member_of(tenant_id));
CREATE POLICY crm_webhook_tokens_tenant_members ON public.crm_webhook_tokens FOR ALL TO authenticated
  USING ((tenant_id IN ( SELECT tm.tenant_id
   FROM tenant_members tm
  WHERE (tm.user_id = auth.uid()))))
  WITH CHECK ((tenant_id IN ( SELECT tm.tenant_id
   FROM tenant_members tm
  WHERE (tm.user_id = auth.uid()))));
CREATE POLICY tenant_member_custom_field_values ON public.custom_field_values FOR ALL TO public
  USING ((custom_field_id IN ( SELECT custom_fields.id
   FROM custom_fields
  WHERE (custom_fields.tenant_id IN ( SELECT tenant_members.tenant_id
           FROM tenant_members
          WHERE (tenant_members.user_id = auth.uid()))))));
CREATE POLICY tenant_member_custom_fields ON public.custom_fields FOR ALL TO public
  USING ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE (tenant_members.user_id = auth.uid()))));
CREATE POLICY tenant_isolation ON public.customer_addresses FOR ALL TO public
  USING ((tenant_id IN ( SELECT tm.tenant_id
   FROM tenant_members tm
  WHERE (tm.user_id = auth.uid()))));
CREATE POLICY customer_group_members_select ON public.customer_group_members FOR SELECT TO public
  USING ((EXISTS ( SELECT 1
   FROM customers c
  WHERE ((c.id = customer_group_members.customer_id) AND is_member_of(c.tenant_id)))));
CREATE POLICY customer_group_members_write ON public.customer_group_members FOR ALL TO public
  USING ((EXISTS ( SELECT 1
   FROM customers c
  WHERE ((c.id = customer_group_members.customer_id) AND is_admin_of(c.tenant_id)))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM customers c
  WHERE ((c.id = customer_group_members.customer_id) AND is_admin_of(c.tenant_id)))));
CREATE POLICY customer_groups_select ON public.customer_groups FOR SELECT TO public
  USING (((tenant_id IS NOT NULL) AND is_member_of(tenant_id)));
CREATE POLICY customer_groups_write ON public.customer_groups FOR ALL TO public
  USING (((tenant_id IS NOT NULL) AND is_admin_of(tenant_id)))
  WITH CHECK (((tenant_id IS NOT NULL) AND is_admin_of(tenant_id)));
CREATE POLICY note_entries_tenant ON public.customer_note_entries FOR ALL TO public
  USING ((EXISTS ( SELECT 1
   FROM tenant_members tm
  WHERE ((tm.tenant_id = customer_note_entries.tenant_id) AND (tm.user_id = auth.uid())))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM tenant_members tm
  WHERE ((tm.tenant_id = customer_note_entries.tenant_id) AND (tm.user_id = auth.uid())))));
CREATE POLICY tenant_isolation ON public.customer_notes FOR ALL TO public
  USING ((tenant_id IN ( SELECT tm.tenant_id
   FROM tenant_members tm
  WHERE (tm.user_id = auth.uid()))));
CREATE POLICY "tenant members see tag relations" ON public.customer_tag_relations FOR ALL TO public
  USING ((customer_id IN ( SELECT customers.id
   FROM customers
  WHERE (customers.tenant_id IN ( SELECT tenant_members.tenant_id
           FROM tenant_members
          WHERE (tenant_members.user_id = auth.uid()))))));
CREATE POLICY tenant_isolation ON public.customer_tags FOR ALL TO public
  USING ((EXISTS ( SELECT 1
   FROM (lead_tags lt
     JOIN tenant_members tm ON ((tm.tenant_id = lt.tenant_id)))
  WHERE ((lt.id = customer_tags.tag_id) AND (tm.user_id = auth.uid())))));
CREATE POLICY customers_member_all ON public.customers FOR ALL TO public
  USING (is_member_of(tenant_id))
  WITH CHECK (is_member_of(tenant_id));
CREATE POLICY daily_kpis_member_select ON public.daily_kpis FOR SELECT TO public
  USING (is_member_of(tenant_id));
CREATE POLICY defesa_aprovadores_delete ON public.defesa_aprovadores FOR DELETE TO public
  USING (is_member_of(tenant_id));
CREATE POLICY defesa_aprovadores_insert ON public.defesa_aprovadores FOR INSERT TO public
  WITH CHECK (is_member_of(tenant_id));
CREATE POLICY defesa_aprovadores_select ON public.defesa_aprovadores FOR SELECT TO public
  USING (is_member_of(tenant_id));
CREATE POLICY defesa_aprovadores_update ON public.defesa_aprovadores FOR UPDATE TO public
  USING (is_member_of(tenant_id))
  WITH CHECK (is_member_of(tenant_id));
CREATE POLICY defesa_assinaturas_insert_admin ON public.defesa_assinaturas FOR INSERT TO public
  WITH CHECK (is_admin_of(tenant_id));
CREATE POLICY defesa_assinaturas_select ON public.defesa_assinaturas FOR SELECT TO public
  USING (is_member_of(tenant_id));
CREATE POLICY defesa_casos_insert ON public.defesa_casos FOR INSERT TO public
  WITH CHECK (is_member_of(tenant_id));
CREATE POLICY defesa_casos_select ON public.defesa_casos FOR SELECT TO public
  USING (is_member_of(tenant_id));
CREATE POLICY defesa_casos_update ON public.defesa_casos FOR UPDATE TO public
  USING (is_member_of(tenant_id))
  WITH CHECK (is_member_of(tenant_id));
CREATE POLICY deli_log_insert_authenticated ON public.deli_actions_log FOR INSERT TO public
  WITH CHECK ((auth.uid() IS NOT NULL));
CREATE POLICY deli_log_select_tenant ON public.deli_actions_log FOR SELECT TO public
  USING ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE (tenant_members.user_id = auth.uid()))));
CREATE POLICY "service role can insert deli_agenda" ON public.deli_agenda FOR INSERT TO public
  WITH CHECK (true);
CREATE POLICY "tenant members can read deli_agenda" ON public.deli_agenda FOR SELECT TO public
  USING ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE (tenant_members.user_id = auth.uid()))));
CREATE POLICY service_role_manage_deli_messages ON public.deli_messages FOR ALL TO public
  USING ((auth.role() = 'service_role'::text));
CREATE POLICY tenant_members_view_own_deli_messages ON public.deli_messages FOR SELECT TO public
  USING ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE (tenant_members.user_id = auth.uid()))));
CREATE POLICY deli_approvals_insert_tenant ON public.deli_pending_approvals FOR INSERT TO public
  WITH CHECK ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE (tenant_members.user_id = auth.uid()))));
CREATE POLICY deli_approvals_select_tenant ON public.deli_pending_approvals FOR SELECT TO public
  USING ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE (tenant_members.user_id = auth.uid()))));
CREATE POLICY deli_approvals_update_deli_owner ON public.deli_pending_approvals FOR UPDATE TO public
  USING ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE ((tenant_members.user_id = auth.uid()) AND (tenant_members.role = ANY (ARRAY['admin'::text, 'deli_owner'::text]))))));
CREATE POLICY deli_triggers_manage_admin ON public.deli_triggers FOR ALL TO public
  USING ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE ((tenant_members.user_id = auth.uid()) AND (tenant_members.role = 'admin'::text)))));
CREATE POLICY deli_triggers_select_tenant ON public.deli_triggers FOR SELECT TO public
  USING ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE (tenant_members.user_id = auth.uid()))));
CREATE POLICY tenant_isolation ON public.department_members FOR ALL TO public
  USING ((EXISTS ( SELECT 1
   FROM (departments d
     JOIN tenant_members tm ON ((tm.tenant_id = d.tenant_id)))
  WHERE ((d.id = department_members.department_id) AND (tm.user_id = auth.uid())))));
CREATE POLICY tenant_isolation ON public.departments FOR ALL TO public
  USING ((tenant_id IN ( SELECT tm.tenant_id
   FROM tenant_members tm
  WHERE (tm.user_id = auth.uid()))));
CREATE POLICY encerramento_config_insert_admin_marketing ON public.encerramento_config FOR INSERT TO public
  WITH CHECK ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE ((tenant_members.user_id = auth.uid()) AND (tenant_members.role = ANY (ARRAY['admin'::text, 'marketing'::text]))))));
CREATE POLICY encerramento_config_select_tenant ON public.encerramento_config FOR SELECT TO public
  USING ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE (tenant_members.user_id = auth.uid()))));
CREATE POLICY encerramento_config_update_admin_marketing ON public.encerramento_config FOR UPDATE TO public
  USING ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE ((tenant_members.user_id = auth.uid()) AND (tenant_members.role = ANY (ARRAY['admin'::text, 'marketing'::text]))))));
CREATE POLICY espacos_columns_tenant_isolation ON public.espacos_columns FOR ALL TO authenticated
  USING ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE (tenant_members.user_id = auth.uid()))))
  WITH CHECK ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE (tenant_members.user_id = auth.uid()))));
CREATE POLICY espacos_folders_tenant_isolation ON public.espacos_folders FOR ALL TO authenticated
  USING ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE (tenant_members.user_id = auth.uid()))))
  WITH CHECK ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE (tenant_members.user_id = auth.uid()))));
CREATE POLICY espacos_lists_tenant_isolation ON public.espacos_lists FOR ALL TO authenticated
  USING ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE (tenant_members.user_id = auth.uid()))))
  WITH CHECK ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE (tenant_members.user_id = auth.uid()))));
CREATE POLICY espacos_workspaces_tenant_isolation ON public.espacos_workspaces FOR ALL TO public
  USING ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE (tenant_members.user_id = auth.uid()))))
  WITH CHECK ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE (tenant_members.user_id = auth.uid()))));
CREATE POLICY estudio_criacoes_insert ON public.estudio_criacoes FOR INSERT TO public
  WITH CHECK ((is_member_of(tenant_id) AND (status = 'fila'::text)));
CREATE POLICY estudio_criacoes_select ON public.estudio_criacoes FOR SELECT TO public
  USING (is_member_of(tenant_id));
CREATE POLICY estudio_criacoes_update ON public.estudio_criacoes FOR UPDATE TO public
  USING ((is_member_of(tenant_id) AND (status = 'pronto'::text)))
  WITH CHECK ((is_member_of(tenant_id) AND (status = 'aprovado'::text)));
CREATE POLICY evolution_instances_manage_admin ON public.evolution_instances FOR ALL TO public
  USING ((EXISTS ( SELECT 1
   FROM tenant_members
  WHERE ((tenant_members.user_id = auth.uid()) AND (tenant_members.role = 'admin'::text)))));
CREATE POLICY evolution_instances_select_own_tenant ON public.evolution_instances FOR SELECT TO public
  USING ((tenant_id IN ( SELECT r.tenant_id
   FROM (user_roles ur
     JOIN roles r ON ((r.id = ur.role_id)))
  WHERE (ur.user_id = auth.uid()))));
CREATE POLICY evolution_instances_select_tenant ON public.evolution_instances FOR SELECT TO public
  USING ((id IN ( SELECT DISTINCT conversations.instance_id
   FROM conversations
  WHERE ((conversations.tenant_id IN ( SELECT tenant_members.tenant_id
           FROM tenant_members
          WHERE (tenant_members.user_id = auth.uid()))) AND (conversations.instance_id IS NOT NULL)))));
CREATE POLICY tenant_isolation ON public.goal_tasks FOR ALL TO public
  USING ((tenant_id IN ( SELECT tm.tenant_id
   FROM tenant_members tm
  WHERE (tm.user_id = auth.uid()))));
CREATE POLICY tenant_isolation ON public.goals FOR ALL TO public
  USING ((tenant_id IN ( SELECT tm.tenant_id
   FROM tenant_members tm
  WHERE (tm.user_id = auth.uid()))));
CREATE POLICY tenant_isolation ON public.heartbeat_runs FOR ALL TO public
  USING ((tenant_id IN ( SELECT tm.tenant_id
   FROM tenant_members tm
  WHERE (tm.user_id = auth.uid()))));
CREATE POLICY tenant_isolation ON public.heartbeats FOR ALL TO public
  USING ((tenant_id IN ( SELECT tm.tenant_id
   FROM tenant_members tm
  WHERE (tm.user_id = auth.uid()))));
CREATE POLICY tenant_isolation ON public.ifood_merchants FOR ALL TO public
  USING ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE (tenant_members.user_id = auth.uid()))))
  WITH CHECK ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE (tenant_members.user_id = auth.uid()))));
CREATE POLICY inadimplencia_messages_member_all ON public.inadimplencia_messages FOR ALL TO public
  USING (is_member_of(tenant_id))
  WITH CHECK (is_member_of(tenant_id));
CREATE POLICY inadimplencias_member_all ON public.inadimplencias FOR ALL TO public
  USING (is_member_of(tenant_id))
  WITH CHECK (is_member_of(tenant_id));
CREATE POLICY allow_all_internal_channels ON public.internal_channels FOR ALL TO public
  USING (true)
  WITH CHECK (true);
CREATE POLICY internal_notifications_select ON public.internal_notifications FOR SELECT TO public
  USING (((recipient_user_id = auth.uid()) OR ((recipient_user_id IS NULL) AND (tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE (tenant_members.user_id = auth.uid()))))));
CREATE POLICY internal_notifications_update_own ON public.internal_notifications FOR UPDATE TO public
  USING (((recipient_user_id = auth.uid()) OR ((recipient_user_id IS NULL) AND (tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE (tenant_members.user_id = auth.uid()))))))
  WITH CHECK (((recipient_user_id = auth.uid()) OR ((recipient_user_id IS NULL) AND (tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE (tenant_members.user_id = auth.uid()))))));
CREATE POLICY tenant_isolation ON public.lead_list_members FOR ALL TO public
  USING ((EXISTS ( SELECT 1
   FROM (lead_lists ll
     JOIN tenant_members tm ON ((tm.tenant_id = ll.tenant_id)))
  WHERE ((ll.id = lead_list_members.list_id) AND (tm.user_id = auth.uid())))));
CREATE POLICY tenant_isolation ON public.lead_lists FOR ALL TO public
  USING ((tenant_id IN ( SELECT tm.tenant_id
   FROM tenant_members tm
  WHERE (tm.user_id = auth.uid()))));
CREATE POLICY tenant_isolation ON public.lead_tags FOR ALL TO public
  USING ((tenant_id IN ( SELECT tm.tenant_id
   FROM tenant_members tm
  WHERE (tm.user_id = auth.uid()))));
CREATE POLICY leads_tenant_isolation ON public.leads FOR ALL TO public
  USING ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE (tenant_members.user_id = auth.uid()))))
  WITH CHECK ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE (tenant_members.user_id = auth.uid()))));
CREATE POLICY sofia_leads_tenant ON public.leads FOR ALL TO public
  USING ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE (tenant_members.user_id = auth.uid()))))
  WITH CHECK ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE (tenant_members.user_id = auth.uid()))));
CREATE POLICY "Admins gerenciam atribuições" ON public.loja_consultores FOR ALL TO public
  USING ((EXISTS ( SELECT 1
   FROM (((lojas l
     JOIN tenant_members tm ON ((tm.tenant_id = l.tenant_id)))
     JOIN user_roles ur ON ((ur.user_id = tm.user_id)))
     JOIN roles r ON (((r.id = ur.role_id) AND (r.tenant_id = l.tenant_id))))
  WHERE ((l.id = loja_consultores.loja_id) AND (tm.user_id = auth.uid()) AND (r.name = ANY (ARRAY['admin'::text, 'consultor_senior'::text]))))));
CREATE POLICY "Ver atribuições do próprio tenant" ON public.loja_consultores FOR SELECT TO public
  USING ((EXISTS ( SELECT 1
   FROM (lojas l
     JOIN tenant_members tm ON ((tm.tenant_id = l.tenant_id)))
  WHERE ((l.id = loja_consultores.loja_id) AND (tm.user_id = auth.uid())))));
CREATE POLICY lgc_insert ON public.loja_gpt_conversations FOR INSERT TO public
  WITH CHECK ((iniciada_por = auth.uid()));
CREATE POLICY lgc_select ON public.loja_gpt_conversations FOR SELECT TO public
  USING ((EXISTS ( SELECT 1
   FROM (lojas l
     JOIN tenant_members tm ON ((tm.tenant_id = l.tenant_id)))
  WHERE ((l.id = loja_gpt_conversations.loja_id) AND (tm.user_id = auth.uid())))));
CREATE POLICY lgc_update ON public.loja_gpt_conversations FOR UPDATE TO public
  USING (((iniciada_por = auth.uid()) OR (EXISTS ( SELECT 1
   FROM (lojas l
     JOIN tenant_members tm ON ((tm.tenant_id = l.tenant_id)))
  WHERE ((l.id = loja_gpt_conversations.loja_id) AND (tm.user_id = auth.uid()) AND (tm.role = 'admin'::text))))));
CREATE POLICY lgm_select ON public.loja_gpt_messages FOR SELECT TO public
  USING ((EXISTS ( SELECT 1
   FROM ((loja_gpt_conversations c
     JOIN lojas l ON ((l.id = c.loja_id)))
     JOIN tenant_members tm ON ((tm.tenant_id = l.tenant_id)))
  WHERE ((c.id = loja_gpt_messages.conversation_id) AND (tm.user_id = auth.uid())))));
CREATE POLICY loja_metricas_delete_admin ON public.loja_metricas FOR DELETE TO public
  USING ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE ((tenant_members.user_id = auth.uid()) AND (tenant_members.role = 'admin'::text)))));
CREATE POLICY loja_metricas_insert_tenant ON public.loja_metricas FOR INSERT TO public
  WITH CHECK ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE (tenant_members.user_id = auth.uid()))));
CREATE POLICY loja_metricas_select_tenant ON public.loja_metricas FOR SELECT TO public
  USING ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE (tenant_members.user_id = auth.uid()))));
CREATE POLICY loja_metricas_update_tenant ON public.loja_metricas FOR UPDATE TO public
  USING ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE (tenant_members.user_id = auth.uid()))));
CREATE POLICY "Editar métricas: admins, consultores_senior e consultores atri" ON public.loja_metricas_snapshot FOR ALL TO public
  USING (((EXISTS ( SELECT 1
   FROM (((lojas l
     JOIN tenant_members tm ON ((tm.tenant_id = l.tenant_id)))
     JOIN user_roles ur ON ((ur.user_id = tm.user_id)))
     JOIN roles r ON (((r.id = ur.role_id) AND (r.tenant_id = l.tenant_id))))
  WHERE ((l.id = loja_metricas_snapshot.loja_id) AND (tm.user_id = auth.uid()) AND (r.name = ANY (ARRAY['admin'::text, 'consultor_senior'::text]))))) OR (EXISTS ( SELECT 1
   FROM loja_consultores lc
  WHERE ((lc.loja_id = loja_metricas_snapshot.loja_id) AND (lc.user_id = auth.uid()) AND (lc.ativo = true))))));
CREATE POLICY "Métricas do próprio tenant" ON public.loja_metricas_snapshot FOR SELECT TO public
  USING ((EXISTS ( SELECT 1
   FROM (lojas l
     JOIN tenant_members tm ON ((tm.tenant_id = l.tenant_id)))
  WHERE ((l.id = loja_metricas_snapshot.loja_id) AND (tm.user_id = auth.uid())))));
CREATE POLICY lwv_tenant_isolation ON public.loja_whatsapp_vinculo FOR ALL TO public
  USING ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE (tenant_members.user_id = auth.uid()))));
CREATE POLICY lojas_delete_admin ON public.lojas FOR DELETE TO public
  USING ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE ((tenant_members.user_id = auth.uid()) AND (tenant_members.role = 'admin'::text)))));
CREATE POLICY lojas_insert_tenant ON public.lojas FOR INSERT TO public
  WITH CHECK ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE (tenant_members.user_id = auth.uid()))));
CREATE POLICY lojas_select_tenant ON public.lojas FOR SELECT TO public
  USING ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE (tenant_members.user_id = auth.uid()))));
CREATE POLICY lojas_update_tenant ON public.lojas FOR UPDATE TO public
  USING ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE (tenant_members.user_id = auth.uid()))));
CREATE POLICY tenant_isolation_marca_pesquisa ON public.marca_pesquisa FOR ALL TO public
  USING ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE (tenant_members.user_id = auth.uid()))));
CREATE POLICY tenant_write_marca_pesquisa ON public.marca_pesquisa FOR ALL TO authenticated
  USING ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE (tenant_members.user_id = auth.uid()))))
  WITH CHECK ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE (tenant_members.user_id = auth.uid()))));
CREATE POLICY max_kb_select ON public.max_knowledge_base FOR SELECT TO public
  USING (((tenant_id IS NULL) OR (tenant_id IN ( SELECT tm.tenant_id
   FROM tenant_members tm
  WHERE (tm.user_id = auth.uid())))));
CREATE POLICY max_kb_write ON public.max_knowledge_base FOR ALL TO public
  USING ((EXISTS ( SELECT 1
   FROM tenant_members
  WHERE ((tenant_members.user_id = auth.uid()) AND (tenant_members.role = ANY (ARRAY['admin'::text, 'owner'::text, 'deli_owner'::text])))
 LIMIT 1)));
CREATE POLICY messages_auth_all ON public.messages FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);
CREATE POLICY messages_insert_tenant ON public.messages FOR INSERT TO public
  WITH CHECK ((((tenant_id IS NOT NULL) AND (tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE (tenant_members.user_id = auth.uid())))) OR ((tenant_id IS NULL) AND (conversation_id IN ( SELECT conversations.id
   FROM conversations
  WHERE (conversations.tenant_id IN ( SELECT tenant_members.tenant_id
           FROM tenant_members
          WHERE (tenant_members.user_id = auth.uid()))))))));
CREATE POLICY messages_member_all ON public.messages FOR ALL TO public
  USING (is_member_of(tenant_id))
  WITH CHECK (is_member_of(tenant_id));
CREATE POLICY messages_select_tenant ON public.messages FOR SELECT TO public
  USING ((((tenant_id IS NOT NULL) AND (tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE (tenant_members.user_id = auth.uid())))) OR ((tenant_id IS NULL) AND (conversation_id IN ( SELECT conversations.id
   FROM conversations
  WHERE (conversations.tenant_id IN ( SELECT tenant_members.tenant_id
           FROM tenant_members
          WHERE (tenant_members.user_id = auth.uid()))))))));
CREATE POLICY messages_update_tenant ON public.messages FOR UPDATE TO public
  USING ((((tenant_id IS NOT NULL) AND (tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE (tenant_members.user_id = auth.uid())))) OR ((tenant_id IS NULL) AND (conversation_id IN ( SELECT conversations.id
   FROM conversations
  WHERE (conversations.tenant_id IN ( SELECT tenant_members.tenant_id
           FROM tenant_members
          WHERE (tenant_members.user_id = auth.uid()))))))));
CREATE POLICY mia_analises_tenant ON public.mia_analises FOR ALL TO public
  USING ((tenant_id IN ( SELECT tm.tenant_id
   FROM tenant_members tm
  WHERE (tm.user_id = auth.uid()))));
CREATE POLICY mia_audit_tenant_isolation ON public.mia_audit_log FOR SELECT TO public
  USING ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE (tenant_members.user_id = auth.uid()))));
CREATE POLICY tenant_isolation ON public.missions FOR ALL TO public
  USING ((tenant_id IN ( SELECT tm.tenant_id
   FROM tenant_members tm
  WHERE (tm.user_id = auth.uid()))));
CREATE POLICY tenant_isolation_nexus_requests ON public.nexus_requests FOR ALL TO public
  USING ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE (tenant_members.user_id = auth.uid()))));
CREATE POLICY tenant_write_nexus_requests ON public.nexus_requests FOR ALL TO authenticated
  USING ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE (tenant_members.user_id = auth.uid()))))
  WITH CHECK ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE (tenant_members.user_id = auth.uid()))));
CREATE POLICY user_own_prefs ON public.notification_preferences FOR ALL TO public
  USING ((user_id = auth.uid()));
CREATE POLICY nova_blueprints_tenant ON public.nova_blueprints FOR ALL TO public
  USING ((tenant_id IN ( SELECT tm.tenant_id
   FROM tenant_members tm
  WHERE (tm.user_id = auth.uid()))));
CREATE POLICY nps_aval_insert_tenant ON public.nps_avaliacoes FOR INSERT TO public
  WITH CHECK ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE (tenant_members.user_id = auth.uid()))));
CREATE POLICY nps_aval_select_tenant ON public.nps_avaliacoes FOR SELECT TO public
  USING ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE (tenant_members.user_id = auth.uid()))));
CREATE POLICY nps_aval_update_tenant ON public.nps_avaliacoes FOR UPDATE TO public
  USING ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE (tenant_members.user_id = auth.uid()))));
CREATE POLICY onboarding_checklists_tenant_isolation ON public.onboarding_checklists FOR ALL TO authenticated
  USING ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE (tenant_members.user_id = auth.uid()))))
  WITH CHECK ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE (tenant_members.user_id = auth.uid()))));
CREATE POLICY onboarding_templates_see_own_or_global ON public.onboarding_templates FOR SELECT TO authenticated
  USING (((tenant_id IS NULL) OR (tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE (tenant_members.user_id = auth.uid())))));
CREATE POLICY wizard_sessions_authenticated_select ON public.onboarding_wizard_sessions FOR SELECT TO authenticated
  USING (true);
CREATE POLICY oracle_drafts_insert_member ON public.oracle_drafts FOR INSERT TO public
  WITH CHECK ((is_member_of(tenant_id) AND (created_by = auth.uid()) AND (status = 'pendente'::text)));
CREATE POLICY oracle_drafts_select_member ON public.oracle_drafts FOR SELECT TO public
  USING (is_member_of(tenant_id));
CREATE POLICY oracle_drafts_update_admin ON public.oracle_drafts FOR UPDATE TO public
  USING (is_admin_of(tenant_id))
  WITH CHECK (is_admin_of(tenant_id));
CREATE POLICY orders_member_all ON public.orders FOR ALL TO public
  USING (is_member_of(tenant_id))
  WITH CHECK (is_member_of(tenant_id));
CREATE POLICY profiles_select_own ON public.profiles FOR SELECT TO public
  USING ((id = ( SELECT auth.uid() AS uid)));
CREATE POLICY profiles_update_own ON public.profiles FOR UPDATE TO public
  USING ((id = ( SELECT auth.uid() AS uid)))
  WITH CHECK ((id = ( SELECT auth.uid() AS uid)));
CREATE POLICY tenant_peers_see_profiles ON public.profiles FOR SELECT TO public
  USING ((id IN ( SELECT tm2.user_id
   FROM (tenant_members tm1
     JOIN tenant_members tm2 ON ((tm1.tenant_id = tm2.tenant_id)))
  WHERE (tm1.user_id = auth.uid()))));
CREATE POLICY tenant_isolation ON public.projects FOR ALL TO public
  USING ((tenant_id IN ( SELECT tm.tenant_id
   FROM tenant_members tm
  WHERE (tm.user_id = auth.uid()))));
CREATE POLICY prospect_abordagens_select ON public.prospect_abordagens FOR SELECT TO public
  USING ((EXISTS ( SELECT 1
   FROM (prospects p
     JOIN tenant_members tm ON ((tm.tenant_id = p.tenant_id)))
  WHERE ((p.id = prospect_abordagens.prospect_id) AND (tm.user_id = auth.uid()) AND (tm.role = ANY (ARRAY['admin'::text, 'marketing'::text, 'dev'::text, 'viewer'::text]))))));
CREATE POLICY prospect_abordagens_write ON public.prospect_abordagens FOR ALL TO public
  USING ((EXISTS ( SELECT 1
   FROM (prospects p
     JOIN tenant_members tm ON ((tm.tenant_id = p.tenant_id)))
  WHERE ((p.id = prospect_abordagens.prospect_id) AND (tm.user_id = auth.uid()) AND (tm.role = ANY (ARRAY['admin'::text, 'marketing'::text, 'dev'::text]))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM (prospects p
     JOIN tenant_members tm ON ((tm.tenant_id = p.tenant_id)))
  WHERE ((p.id = prospect_abordagens.prospect_id) AND (tm.user_id = auth.uid()) AND (tm.role = ANY (ARRAY['admin'::text, 'marketing'::text, 'dev'::text]))))));
CREATE POLICY prospect_pesquisas_select ON public.prospect_pesquisas FOR SELECT TO public
  USING ((EXISTS ( SELECT 1
   FROM (prospects p
     JOIN tenant_members tm ON ((tm.tenant_id = p.tenant_id)))
  WHERE ((p.id = prospect_pesquisas.prospect_id) AND (tm.user_id = auth.uid()) AND (tm.role = ANY (ARRAY['admin'::text, 'marketing'::text, 'dev'::text, 'viewer'::text]))))));
CREATE POLICY prospect_pesquisas_write ON public.prospect_pesquisas FOR ALL TO public
  USING ((EXISTS ( SELECT 1
   FROM (prospects p
     JOIN tenant_members tm ON ((tm.tenant_id = p.tenant_id)))
  WHERE ((p.id = prospect_pesquisas.prospect_id) AND (tm.user_id = auth.uid()) AND (tm.role = ANY (ARRAY['admin'::text, 'marketing'::text, 'dev'::text]))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM (prospects p
     JOIN tenant_members tm ON ((tm.tenant_id = p.tenant_id)))
  WHERE ((p.id = prospect_pesquisas.prospect_id) AND (tm.user_id = auth.uid()) AND (tm.role = ANY (ARRAY['admin'::text, 'marketing'::text, 'dev'::text]))))));
CREATE POLICY prospects_select_tenant_roles ON public.prospects FOR SELECT TO public
  USING ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE ((tenant_members.user_id = auth.uid()) AND (tenant_members.role = ANY (ARRAY['admin'::text, 'marketing'::text, 'dev'::text, 'viewer'::text]))))));
CREATE POLICY prospects_write_tenant_roles ON public.prospects FOR ALL TO public
  USING ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE ((tenant_members.user_id = auth.uid()) AND (tenant_members.role = ANY (ARRAY['admin'::text, 'marketing'::text, 'dev'::text]))))))
  WITH CHECK ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE ((tenant_members.user_id = auth.uid()) AND (tenant_members.role = ANY (ARRAY['admin'::text, 'marketing'::text, 'dev'::text]))))));
CREATE POLICY user_own_subs ON public.push_subscriptions FOR ALL TO public
  USING ((user_id = auth.uid()));
CREATE POLICY "agents manage own quick_replies" ON public.quick_replies FOR ALL TO public
  USING ((agent_id = auth.uid()))
  WITH CHECK ((agent_id = auth.uid()));
CREATE POLICY "agents see own and workspace quick_replies" ON public.quick_replies FOR SELECT TO public
  USING (((agent_id = auth.uid()) OR (tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE (tenant_members.user_id = auth.uid())))));
CREATE POLICY qr_tenant_select ON public.quick_replies FOR SELECT TO public
  USING (((tenant_id IS NULL) OR (tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE (tenant_members.user_id = auth.uid())))));
CREATE POLICY qr_tenant_write ON public.quick_replies FOR ALL TO authenticated
  USING ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE (tenant_members.user_id = auth.uid()))))
  WITH CHECK ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE (tenant_members.user_id = auth.uid()))));
CREATE POLICY radar_fontes_insert ON public.radar_fontes FOR INSERT TO public
  WITH CHECK (is_member_of(tenant_id));
CREATE POLICY radar_fontes_select ON public.radar_fontes FOR SELECT TO public
  USING (is_member_of(tenant_id));
CREATE POLICY radar_metricas_select ON public.radar_metricas FOR SELECT TO public
  USING (is_member_of(tenant_id));
CREATE POLICY radar_series_select ON public.radar_series FOR SELECT TO public
  USING (is_member_of(tenant_id));
CREATE POLICY regua_cobranca_admin_delete ON public.regua_cobranca FOR DELETE TO public
  USING (is_admin_of(tenant_id));
CREATE POLICY regua_cobranca_admin_insert ON public.regua_cobranca FOR INSERT TO public
  WITH CHECK (is_admin_of(tenant_id));
CREATE POLICY regua_cobranca_admin_update ON public.regua_cobranca FOR UPDATE TO public
  USING (is_admin_of(tenant_id))
  WITH CHECK (is_admin_of(tenant_id));
CREATE POLICY regua_cobranca_select ON public.regua_cobranca FOR SELECT TO public
  USING (is_member_of(tenant_id));
CREATE POLICY tenant_isolation_reguas ON public.reguas FOR ALL TO public
  USING ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE (tenant_members.user_id = auth.uid()))));
CREATE POLICY tenant_write_reguas ON public.reguas FOR ALL TO authenticated
  USING ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE (tenant_members.user_id = auth.uid()))))
  WITH CHECK ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE (tenant_members.user_id = auth.uid()))));
CREATE POLICY anon_insert ON public.reviews FOR INSERT TO anon
  WITH CHECK (true);
CREATE POLICY anon_select ON public.reviews FOR SELECT TO anon
  USING (true);
CREATE POLICY anon_update ON public.reviews FOR UPDATE TO anon
  USING (true)
  WITH CHECK (true);
CREATE POLICY service_full_access ON public.reviews FOR ALL TO public
  USING (true)
  WITH CHECK (true);
CREATE POLICY role_permissions_manage_admin ON public.role_permissions FOR ALL TO public
  USING ((EXISTS ( SELECT 1
   FROM (roles r
     JOIN tenant_members tm ON ((tm.tenant_id = r.tenant_id)))
  WHERE ((r.id = role_permissions.role_id) AND (tm.user_id = auth.uid()) AND (tm.role = 'admin'::text)))));
CREATE POLICY role_permissions_select_tenant ON public.role_permissions FOR SELECT TO public
  USING ((EXISTS ( SELECT 1
   FROM (roles r
     JOIN tenant_members tm ON ((tm.tenant_id = r.tenant_id)))
  WHERE ((r.id = role_permissions.role_id) AND (tm.user_id = auth.uid())))));
CREATE POLICY roles_delete_admin ON public.roles FOR DELETE TO public
  USING (((is_system = false) AND (tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE ((tenant_members.user_id = auth.uid()) AND (tenant_members.role = 'admin'::text))))));
CREATE POLICY roles_insert_admin ON public.roles FOR INSERT TO public
  WITH CHECK ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE ((tenant_members.user_id = auth.uid()) AND (tenant_members.role = 'admin'::text)))));
CREATE POLICY roles_select_tenant ON public.roles FOR SELECT TO public
  USING ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE (tenant_members.user_id = auth.uid()))));
CREATE POLICY roles_update_admin ON public.roles FOR UPDATE TO public
  USING ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE ((tenant_members.user_id = auth.uid()) AND (tenant_members.role = 'admin'::text)))));
CREATE POLICY sugestoes_tenant_isolation ON public.sugestoes_ia FOR ALL TO public
  USING ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE (tenant_members.user_id = auth.uid()))));
CREATE POLICY "members can insert sugestoes" ON public.sugestoes_plataforma FOR INSERT TO public
  WITH CHECK ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE (tenant_members.user_id = auth.uid()))));
CREATE POLICY "members can read sugestoes" ON public.sugestoes_plataforma FOR SELECT TO public
  USING ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE (tenant_members.user_id = auth.uid()))));
CREATE POLICY tenant_own ON public.support_tickets FOR ALL TO public
  USING ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE (tenant_members.user_id = auth.uid()))));
CREATE POLICY deletar_anexos_tenant ON public.tarefa_anexos FOR DELETE TO public
  USING (((uploaded_by = auth.uid()) OR (tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE ((tenant_members.user_id = auth.uid()) AND (tenant_members.role = ANY (ARRAY['admin'::text, 'dev'::text])))))));
CREATE POLICY inserir_anexos_tenant ON public.tarefa_anexos FOR INSERT TO public
  WITH CHECK ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE (tenant_members.user_id = auth.uid()))));
CREATE POLICY ver_anexos_tenant ON public.tarefa_anexos FOR SELECT TO public
  USING ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE (tenant_members.user_id = auth.uid()))));
CREATE POLICY "Registrar acao: admins, consultores_senior e consultores atribu" ON public.tarefa_aprovacoes FOR INSERT TO public
  WITH CHECK (((EXISTS ( SELECT 1
   FROM ((((tarefas_loja t
     JOIN lojas l ON ((l.id = t.loja_id)))
     JOIN tenant_members tm ON ((tm.tenant_id = l.tenant_id)))
     JOIN user_roles ur ON ((ur.user_id = tm.user_id)))
     JOIN roles r ON (((r.id = ur.role_id) AND (r.tenant_id = l.tenant_id))))
  WHERE ((t.id = tarefa_aprovacoes.tarefa_id) AND (tm.user_id = auth.uid()) AND (r.name = ANY (ARRAY['admin'::text, 'consultor_senior'::text]))))) OR (EXISTS ( SELECT 1
   FROM (tarefas_loja t
     JOIN loja_consultores lc ON ((lc.loja_id = t.loja_id)))
  WHERE ((t.id = tarefa_aprovacoes.tarefa_id) AND (lc.user_id = auth.uid()) AND (lc.ativo = true))))));
CREATE POLICY "Ver historico do proprio tenant" ON public.tarefa_aprovacoes FOR SELECT TO public
  USING ((EXISTS ( SELECT 1
   FROM ((tarefas_loja t
     JOIN lojas l ON ((l.id = t.loja_id)))
     JOIN tenant_members tm ON ((tm.tenant_id = l.tenant_id)))
  WHERE ((t.id = tarefa_aprovacoes.tarefa_id) AND (tm.user_id = auth.uid())))));
CREATE POLICY "Comentar: admins, consultores_senior e consultores atribuidos" ON public.tarefa_comentarios FOR INSERT TO public
  WITH CHECK ((((autor_id = auth.uid()) OR (autor_id IS NULL)) AND ((EXISTS ( SELECT 1
   FROM ((((tarefas_loja t
     JOIN lojas l ON ((l.id = t.loja_id)))
     JOIN tenant_members tm ON ((tm.tenant_id = l.tenant_id)))
     JOIN user_roles ur ON ((ur.user_id = tm.user_id)))
     JOIN roles r ON (((r.id = ur.role_id) AND (r.tenant_id = l.tenant_id))))
  WHERE ((t.id = tarefa_comentarios.tarefa_id) AND (tm.user_id = auth.uid()) AND (r.name = ANY (ARRAY['admin'::text, 'consultor_senior'::text]))))) OR (EXISTS ( SELECT 1
   FROM (tarefas_loja t
     JOIN loja_consultores lc ON ((lc.loja_id = t.loja_id)))
  WHERE ((t.id = tarefa_comentarios.tarefa_id) AND (lc.user_id = auth.uid()) AND (lc.ativo = true)))))));
CREATE POLICY "Deletar comentario: autor ou admin" ON public.tarefa_comentarios FOR DELETE TO public
  USING (((autor_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM ((((tarefas_loja t
     JOIN lojas l ON ((l.id = t.loja_id)))
     JOIN tenant_members tm ON ((tm.tenant_id = l.tenant_id)))
     JOIN user_roles ur ON ((ur.user_id = tm.user_id)))
     JOIN roles r ON (((r.id = ur.role_id) AND (r.tenant_id = l.tenant_id))))
  WHERE ((t.id = tarefa_comentarios.tarefa_id) AND (tm.user_id = auth.uid()) AND (r.name = ANY (ARRAY['admin'::text, 'consultor_senior'::text])))))));
CREATE POLICY "Editar proprio comentario" ON public.tarefa_comentarios FOR UPDATE TO public
  USING ((autor_id = auth.uid()))
  WITH CHECK ((autor_id = auth.uid()));
CREATE POLICY "Ver comentarios do proprio tenant" ON public.tarefa_comentarios FOR SELECT TO public
  USING ((EXISTS ( SELECT 1
   FROM ((tarefas_loja t
     JOIN lojas l ON ((l.id = t.loja_id)))
     JOIN tenant_members tm ON ((tm.tenant_id = l.tenant_id)))
  WHERE ((t.id = tarefa_comentarios.tarefa_id) AND (tm.user_id = auth.uid())))));
CREATE POLICY "Enviar prints: admins, consultores_senior e consultores atribui" ON public.tarefa_prints FOR INSERT TO public
  WITH CHECK (((EXISTS ( SELECT 1
   FROM ((((tarefas_loja t
     JOIN lojas l ON ((l.id = t.loja_id)))
     JOIN tenant_members tm ON ((tm.tenant_id = l.tenant_id)))
     JOIN user_roles ur ON ((ur.user_id = tm.user_id)))
     JOIN roles r ON (((r.id = ur.role_id) AND (r.tenant_id = l.tenant_id))))
  WHERE ((t.id = tarefa_prints.tarefa_id) AND (tm.user_id = auth.uid()) AND (r.name = ANY (ARRAY['admin'::text, 'consultor_senior'::text]))))) OR (EXISTS ( SELECT 1
   FROM (tarefas_loja t
     JOIN loja_consultores lc ON ((lc.loja_id = t.loja_id)))
  WHERE ((t.id = tarefa_prints.tarefa_id) AND (lc.user_id = auth.uid()) AND (lc.ativo = true))))));
CREATE POLICY "Remover prints proprios ou como admin" ON public.tarefa_prints FOR DELETE TO public
  USING (((enviado_por = auth.uid()) OR (EXISTS ( SELECT 1
   FROM ((((tarefas_loja t
     JOIN lojas l ON ((l.id = t.loja_id)))
     JOIN tenant_members tm ON ((tm.tenant_id = l.tenant_id)))
     JOIN user_roles ur ON ((ur.user_id = tm.user_id)))
     JOIN roles r ON (((r.id = ur.role_id) AND (r.tenant_id = l.tenant_id))))
  WHERE ((t.id = tarefa_prints.tarefa_id) AND (tm.user_id = auth.uid()) AND (r.name = ANY (ARRAY['admin'::text, 'consultor_senior'::text])))))));
CREATE POLICY "Ver prints do proprio tenant" ON public.tarefa_prints FOR SELECT TO public
  USING ((EXISTS ( SELECT 1
   FROM ((tarefas_loja t
     JOIN lojas l ON ((l.id = t.loja_id)))
     JOIN tenant_members tm ON ((tm.tenant_id = l.tenant_id)))
  WHERE ((t.id = tarefa_prints.tarefa_id) AND (tm.user_id = auth.uid())))));
CREATE POLICY service_role_tarefa_revisoes ON public.tarefa_revisoes FOR ALL TO public
  USING ((auth.role() = 'service_role'::text));
CREATE POLICY tenant_members_view_tarefa_revisoes ON public.tarefa_revisoes FOR SELECT TO public
  USING ((EXISTS ( SELECT 1
   FROM ((tarefas_loja tl
     JOIN lojas l ON ((l.id = tl.loja_id)))
     JOIN tenant_members tm ON ((tm.tenant_id = l.tenant_id)))
  WHERE ((tl.id = tarefa_revisoes.tarefa_id) AND (tm.user_id = auth.uid())))));
CREATE POLICY tarefas_analise_select ON public.tarefas_analise FOR SELECT TO public
  USING ((EXISTS ( SELECT 1
   FROM analises a
  WHERE ((a.id = tarefas_analise.analise_id) AND is_member_of(a.tenant_id)))));
CREATE POLICY tarefas_analise_write ON public.tarefas_analise FOR ALL TO public
  USING ((EXISTS ( SELECT 1
   FROM analises a
  WHERE ((a.id = tarefas_analise.analise_id) AND is_member_of(a.tenant_id)))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM analises a
  WHERE ((a.id = tarefas_analise.analise_id) AND is_member_of(a.tenant_id)))));
CREATE POLICY "Gerenciar tarefas: admins, consultores_senior e consultores atr" ON public.tarefas_loja FOR ALL TO public
  USING (((EXISTS ( SELECT 1
   FROM (((lojas l
     JOIN tenant_members tm ON ((tm.tenant_id = l.tenant_id)))
     JOIN user_roles ur ON ((ur.user_id = tm.user_id)))
     JOIN roles r ON (((r.id = ur.role_id) AND (r.tenant_id = l.tenant_id))))
  WHERE ((l.id = tarefas_loja.loja_id) AND (tm.user_id = auth.uid()) AND (r.name = ANY (ARRAY['admin'::text, 'consultor_senior'::text]))))) OR (EXISTS ( SELECT 1
   FROM loja_consultores lc
  WHERE ((lc.loja_id = tarefas_loja.loja_id) AND (lc.user_id = auth.uid()) AND (lc.ativo = true))))));
CREATE POLICY "Ver tarefas do proprio tenant" ON public.tarefas_loja FOR SELECT TO public
  USING ((EXISTS ( SELECT 1
   FROM (lojas l
     JOIN tenant_members tm ON ((tm.tenant_id = l.tenant_id)))
  WHERE ((l.id = tarefas_loja.loja_id) AND (tm.user_id = auth.uid())))));
CREATE POLICY task_comments_member_all ON public.task_comments FOR ALL TO public
  USING (is_member_of(tenant_id))
  WITH CHECK (is_member_of(tenant_id));
CREATE POLICY tasks_member_all ON public.tasks FOR ALL TO public
  USING (is_member_of(tenant_id))
  WITH CHECK (is_member_of(tenant_id));
CREATE POLICY templates_select ON public.templates FOR SELECT TO public
  USING (is_member_of(tenant_id));
CREATE POLICY templates_write ON public.templates FOR ALL TO public
  USING (is_admin_of(tenant_id))
  WITH CHECK (is_admin_of(tenant_id));
CREATE POLICY "Gerenciar templates: admins e consultores_senior" ON public.templates_tarefa FOR ALL TO public
  USING ((EXISTS ( SELECT 1
   FROM ((tenant_members tm
     JOIN user_roles ur ON ((ur.user_id = tm.user_id)))
     JOIN roles r ON (((r.id = ur.role_id) AND (r.tenant_id = tm.tenant_id))))
  WHERE ((tm.tenant_id = templates_tarefa.tenant_id) AND (tm.user_id = auth.uid()) AND (r.name = ANY (ARRAY['admin'::text, 'consultor_senior'::text]))))));
CREATE POLICY "Ver templates do proprio tenant" ON public.templates_tarefa FOR SELECT TO public
  USING ((EXISTS ( SELECT 1
   FROM tenant_members tm
  WHERE ((tm.tenant_id = templates_tarefa.tenant_id) AND (tm.user_id = auth.uid())))));
CREATE POLICY tenant_admin_manage_agent_config ON public.tenant_agent_config FOR ALL TO public
  USING ((EXISTS ( SELECT 1
   FROM tenant_members
  WHERE ((tenant_members.tenant_id = tenant_agent_config.tenant_id) AND (tenant_members.user_id = auth.uid()) AND (tenant_members.role = ANY (ARRAY['admin'::text, 'owner'::text]))))));
CREATE POLICY tenant_agents_admin_delete ON public.tenant_agents FOR DELETE TO public
  USING (is_admin_of(tenant_id));
CREATE POLICY tenant_agents_admin_insert ON public.tenant_agents FOR INSERT TO public
  WITH CHECK (is_admin_of(tenant_id));
CREATE POLICY tenant_agents_admin_update ON public.tenant_agents FOR UPDATE TO public
  USING (is_admin_of(tenant_id))
  WITH CHECK (is_admin_of(tenant_id));
CREATE POLICY tenant_agents_select ON public.tenant_agents FOR SELECT TO public
  USING (is_member_of(tenant_id));
CREATE POLICY tenant_files_delete ON public.tenant_files FOR DELETE TO public
  USING (is_member_of(tenant_id));
CREATE POLICY tenant_files_insert ON public.tenant_files FOR INSERT TO public
  WITH CHECK (is_member_of(tenant_id));
CREATE POLICY tenant_files_select ON public.tenant_files FOR SELECT TO public
  USING (is_member_of(tenant_id));
CREATE POLICY tenant_files_update ON public.tenant_files FOR UPDATE TO public
  USING (is_member_of(tenant_id))
  WITH CHECK (is_member_of(tenant_id));
CREATE POLICY tenant_gatilhos_delete ON public.tenant_gatilhos FOR DELETE TO public
  USING (is_member_of(tenant_id));
CREATE POLICY tenant_gatilhos_insert ON public.tenant_gatilhos FOR INSERT TO public
  WITH CHECK (is_member_of(tenant_id));
CREATE POLICY tenant_gatilhos_select ON public.tenant_gatilhos FOR SELECT TO public
  USING (is_member_of(tenant_id));
CREATE POLICY tenant_gatilhos_update ON public.tenant_gatilhos FOR UPDATE TO public
  USING (is_member_of(tenant_id))
  WITH CHECK (is_member_of(tenant_id));
CREATE POLICY tenant_integracoes_select ON public.tenant_integracoes FOR SELECT TO public
  USING (is_member_of(tenant_id));
CREATE POLICY tenant_links_delete ON public.tenant_links FOR DELETE TO public
  USING (is_member_of(tenant_id));
CREATE POLICY tenant_links_insert ON public.tenant_links FOR INSERT TO public
  WITH CHECK (is_member_of(tenant_id));
CREATE POLICY tenant_links_select ON public.tenant_links FOR SELECT TO public
  USING (is_member_of(tenant_id));
CREATE POLICY tenant_links_update ON public.tenant_links FOR UPDATE TO public
  USING (is_member_of(tenant_id))
  WITH CHECK (is_member_of(tenant_id));
CREATE POLICY tenant_members_admin_delete ON public.tenant_members FOR DELETE TO public
  USING (is_admin_of(tenant_id));
CREATE POLICY tenant_members_admin_insert ON public.tenant_members FOR INSERT TO public
  WITH CHECK (is_admin_of(tenant_id));
CREATE POLICY tenant_members_admin_update ON public.tenant_members FOR UPDATE TO public
  USING (is_admin_of(tenant_id))
  WITH CHECK (is_admin_of(tenant_id));
CREATE POLICY tenant_members_select ON public.tenant_members FOR SELECT TO public
  USING (((user_id = ( SELECT auth.uid() AS uid)) OR is_admin_of(tenant_id)));
CREATE POLICY tenant_members_self_insert ON public.tenant_members FOR INSERT TO public
  WITH CHECK ((user_id = auth.uid()));
CREATE POLICY tenant_modules_delete_admin ON public.tenant_modules FOR DELETE TO public
  USING ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE ((tenant_members.user_id = auth.uid()) AND (tenant_members.role = ANY (ARRAY['owner'::text, 'admin'::text]))))));
CREATE POLICY tenant_modules_insert_admin ON public.tenant_modules FOR INSERT TO public
  WITH CHECK ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE ((tenant_members.user_id = auth.uid()) AND (tenant_members.role = ANY (ARRAY['owner'::text, 'admin'::text]))))));
CREATE POLICY tenant_modules_select_tenant ON public.tenant_modules FOR SELECT TO public
  USING ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE (tenant_members.user_id = auth.uid()))));
CREATE POLICY tenant_modules_update_admin ON public.tenant_modules FOR UPDATE TO public
  USING ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE ((tenant_members.user_id = auth.uid()) AND (tenant_members.role = ANY (ARRAY['owner'::text, 'admin'::text]))))));
CREATE POLICY tenant_provedores_select ON public.tenant_provedores FOR SELECT TO public
  USING (is_member_of(tenant_id));
CREATE POLICY tenant_sistemas_select ON public.tenant_sistemas FOR SELECT TO public
  USING (is_member_of(tenant_id));
CREATE POLICY tenant_tarefas_delete ON public.tenant_tarefas FOR DELETE TO public
  USING (is_member_of(tenant_id));
CREATE POLICY tenant_tarefas_insert ON public.tenant_tarefas FOR INSERT TO public
  WITH CHECK (is_member_of(tenant_id));
CREATE POLICY tenant_tarefas_select ON public.tenant_tarefas FOR SELECT TO public
  USING (is_member_of(tenant_id));
CREATE POLICY tenant_tarefas_update ON public.tenant_tarefas FOR UPDATE TO public
  USING (is_member_of(tenant_id))
  WITH CHECK (is_member_of(tenant_id));
CREATE POLICY tenant_topicos_delete ON public.tenant_topicos FOR DELETE TO public
  USING (is_member_of(tenant_id));
CREATE POLICY tenant_topicos_insert ON public.tenant_topicos FOR INSERT TO public
  WITH CHECK (is_member_of(tenant_id));
CREATE POLICY tenant_topicos_select ON public.tenant_topicos FOR SELECT TO public
  USING (is_member_of(tenant_id));
CREATE POLICY tenant_topicos_update ON public.tenant_topicos FOR UPDATE TO public
  USING (is_member_of(tenant_id))
  WITH CHECK (is_member_of(tenant_id));
CREATE POLICY tenants_delete_admin ON public.tenants FOR DELETE TO public
  USING (is_admin_of(id));
CREATE POLICY tenants_insert_authenticated ON public.tenants FOR INSERT TO public
  WITH CHECK ((auth.uid() IS NOT NULL));
CREATE POLICY tenants_select_member ON public.tenants FOR SELECT TO public
  USING (is_member_of(id));
CREATE POLICY tenants_update_admin ON public.tenants FOR UPDATE TO public
  USING (is_admin_of(id))
  WITH CHECK (is_admin_of(id));
CREATE POLICY user_agent_access_manage_admin ON public.user_agent_access FOR ALL TO authenticated
  USING (same_tenant_admin(user_id))
  WITH CHECK (same_tenant_admin(user_id));
CREATE POLICY user_agent_access_self ON public.user_agent_access FOR SELECT TO public
  USING ((user_id = auth.uid()));
CREATE POLICY user_roles_manage_admin ON public.user_roles FOR ALL TO public
  USING ((EXISTS ( SELECT 1
   FROM (roles r
     JOIN tenant_members tm ON ((tm.tenant_id = r.tenant_id)))
  WHERE ((r.id = user_roles.role_id) AND (tm.user_id = auth.uid()) AND (tm.role = 'admin'::text)))));
CREATE POLICY user_roles_select_tenant ON public.user_roles FOR SELECT TO public
  USING ((EXISTS ( SELECT 1
   FROM (roles r
     JOIN tenant_members tm ON ((tm.tenant_id = r.tenant_id)))
  WHERE ((r.id = user_roles.role_id) AND (tm.user_id = auth.uid())))));
CREATE POLICY admin_read_screen_perms ON public.user_screen_permissions FOR SELECT TO public
  USING ((EXISTS ( SELECT 1
   FROM tenant_members
  WHERE ((tenant_members.tenant_id = user_screen_permissions.tenant_id) AND (tenant_members.user_id = auth.uid()) AND (tenant_members.role = ANY (ARRAY['admin'::text, 'owner'::text]))))));
CREATE POLICY user_read_own_screen_perms ON public.user_screen_permissions FOR SELECT TO public
  USING ((user_id = auth.uid()));
CREATE POLICY vendaerp_instances_select ON public.vendaerp_instances FOR SELECT TO public
  USING (is_member_of(tenant_id));
CREATE POLICY vendaerp_proposals_select ON public.vendaerp_proposals FOR SELECT TO public
  USING (is_member_of(tenant_id));
CREATE POLICY vera_anomalias_select_tenant_members ON public.vera_anomalias FOR SELECT TO public
  USING ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE (tenant_members.user_id = auth.uid()))));
CREATE POLICY vera_anomalias_service_role_all ON public.vera_anomalias FOR ALL TO public
  USING ((auth.role() = 'service_role'::text));
CREATE POLICY vera_metricas_snapshot_select_tenant_members ON public.vera_metricas_snapshot FOR SELECT TO public
  USING ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE (tenant_members.user_id = auth.uid()))));
CREATE POLICY vera_metricas_snapshot_service_role_all ON public.vera_metricas_snapshot FOR ALL TO public
  USING ((auth.role() = 'service_role'::text));
CREATE POLICY vera_reports_select_tenant_members ON public.vera_reports FOR SELECT TO public
  USING ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE (tenant_members.user_id = auth.uid()))));
CREATE POLICY vera_reports_service_role_all ON public.vera_reports FOR ALL TO public
  USING ((auth.role() = 'service_role'::text));
CREATE POLICY "Cancelar sessao do tenant" ON public.whatsapp_aprovacao_sessions FOR UPDATE TO public
  USING ((EXISTS ( SELECT 1
   FROM lojas l
  WHERE ((l.id = whatsapp_aprovacao_sessions.loja_id) AND (l.tenant_id IN ( SELECT tenant_members.tenant_id
           FROM tenant_members
          WHERE (tenant_members.user_id = auth.uid())))))))
  WITH CHECK ((status = 'cancelada'::text));
CREATE POLICY "Sessoes do tenant" ON public.whatsapp_aprovacao_sessions FOR SELECT TO public
  USING ((EXISTS ( SELECT 1
   FROM lojas l
  WHERE ((l.id = whatsapp_aprovacao_sessions.loja_id) AND (l.tenant_id IN ( SELECT tenant_members.tenant_id
           FROM tenant_members
          WHERE (tenant_members.user_id = auth.uid())))))));
CREATE POLICY wa_contacts_insert_tenant ON public.whatsapp_contacts FOR INSERT TO public
  WITH CHECK ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE (tenant_members.user_id = auth.uid()))));
CREATE POLICY wa_contacts_select_tenant ON public.whatsapp_contacts FOR SELECT TO public
  USING ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE (tenant_members.user_id = auth.uid()))));
CREATE POLICY wa_contacts_update_tenant ON public.whatsapp_contacts FOR UPDATE TO public
  USING ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE (tenant_members.user_id = auth.uid()))));
CREATE POLICY wa_group_members_manage_tenant ON public.whatsapp_group_members FOR ALL TO public
  USING ((EXISTS ( SELECT 1
   FROM (whatsapp_groups g
     JOIN tenant_members tm ON ((tm.tenant_id = g.tenant_id)))
  WHERE ((g.id = whatsapp_group_members.group_id) AND (tm.user_id = auth.uid())))));
CREATE POLICY wa_group_members_select_tenant ON public.whatsapp_group_members FOR SELECT TO public
  USING ((EXISTS ( SELECT 1
   FROM (whatsapp_groups g
     JOIN tenant_members tm ON ((tm.tenant_id = g.tenant_id)))
  WHERE ((g.id = whatsapp_group_members.group_id) AND (tm.user_id = auth.uid())))));
CREATE POLICY wa_groups_insert_tenant ON public.whatsapp_groups FOR INSERT TO public
  WITH CHECK ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE (tenant_members.user_id = auth.uid()))));
CREATE POLICY wa_groups_select_tenant ON public.whatsapp_groups FOR SELECT TO public
  USING ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE (tenant_members.user_id = auth.uid()))));
CREATE POLICY wa_groups_update_admin_marketing ON public.whatsapp_groups FOR UPDATE TO public
  USING ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE ((tenant_members.user_id = auth.uid()) AND (tenant_members.role = ANY (ARRAY['admin'::text, 'marketing'::text]))))));
CREATE POLICY wa_messages_insert_tenant ON public.whatsapp_messages FOR INSERT TO public
  WITH CHECK ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE (tenant_members.user_id = auth.uid()))));
CREATE POLICY wa_messages_select_tenant ON public.whatsapp_messages FOR SELECT TO public
  USING ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE (tenant_members.user_id = auth.uid()))));
CREATE POLICY wa_messages_update_tenant ON public.whatsapp_messages FOR UPDATE TO public
  USING ((tenant_id IN ( SELECT tenant_members.tenant_id
   FROM tenant_members
  WHERE (tenant_members.user_id = auth.uid()))));