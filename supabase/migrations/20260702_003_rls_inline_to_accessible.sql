-- Rota B Etapa 4b: converte policies inline flat -> accessible_tenant_ids(). Atomico. Gerado do snapshot.
BEGIN;
DROP POLICY IF EXISTS tenant_own ON public.aceite_recontratacao;
CREATE POLICY tenant_own ON public.aceite_recontratacao FOR ALL TO public
  USING ((tenant_id IN ( SELECT public.accessible_tenant_ids() )));
DROP POLICY IF EXISTS agent_action_approvals_tenant ON public.agent_action_approvals;
CREATE POLICY agent_action_approvals_tenant ON public.agent_action_approvals FOR ALL TO public
  USING ((tenant_id IN ( SELECT public.accessible_tenant_ids() )));
DROP POLICY IF EXISTS "members can manage agent_corrections" ON public.agent_corrections;
CREATE POLICY "members can manage agent_corrections" ON public.agent_corrections FOR ALL TO public
  USING ((tenant_id IN ( SELECT public.accessible_tenant_ids() )))
  WITH CHECK ((tenant_id IN ( SELECT public.accessible_tenant_ids() )));
DROP POLICY IF EXISTS drafts_insert_tenant ON public.agent_drafts;
CREATE POLICY drafts_insert_tenant ON public.agent_drafts FOR INSERT TO public
  WITH CHECK ((tenant_id IN ( SELECT public.accessible_tenant_ids() )));
DROP POLICY IF EXISTS drafts_select_tenant ON public.agent_drafts;
CREATE POLICY drafts_select_tenant ON public.agent_drafts FOR SELECT TO public
  USING ((tenant_id IN ( SELECT public.accessible_tenant_ids() )));
DROP POLICY IF EXISTS knowledge_base_tenant ON public.agent_knowledge_base;
CREATE POLICY knowledge_base_tenant ON public.agent_knowledge_base FOR ALL TO public
  USING ((tenant_id IN ( SELECT public.accessible_tenant_ids() )));
DROP POLICY IF EXISTS tenant_members_view_memories ON public.agent_memories;
CREATE POLICY tenant_members_view_memories ON public.agent_memories FOR SELECT TO public
  USING ((tenant_id IN ( SELECT public.accessible_tenant_ids() )));
DROP POLICY IF EXISTS tenant_see_own_or_global ON public.agent_prompts;
CREATE POLICY tenant_see_own_or_global ON public.agent_prompts FOR SELECT TO public
  USING (((tenant_id IS NULL) OR (tenant_id IN ( SELECT public.accessible_tenant_ids() ))));
DROP POLICY IF EXISTS tenant_members_view_own_runs ON public.agent_runs;
CREATE POLICY tenant_members_view_own_runs ON public.agent_runs FOR SELECT TO public
  USING ((tenant_id IN ( SELECT public.accessible_tenant_ids() )));
DROP POLICY IF EXISTS agent_ticket_activity_tenant ON public.agent_ticket_activity;
CREATE POLICY agent_ticket_activity_tenant ON public.agent_ticket_activity FOR ALL TO public
  USING ((tenant_id IN ( SELECT public.accessible_tenant_ids() )));
DROP POLICY IF EXISTS agent_ticket_comments_tenant ON public.agent_ticket_comments;
CREATE POLICY agent_ticket_comments_tenant ON public.agent_ticket_comments FOR ALL TO public
  USING ((tenant_id IN ( SELECT public.accessible_tenant_ids() )));
DROP POLICY IF EXISTS agent_tickets_tenant ON public.agent_tickets;
CREATE POLICY agent_tickets_tenant ON public.agent_tickets FOR ALL TO public
  USING ((tenant_id IN ( SELECT public.accessible_tenant_ids() )));
DROP POLICY IF EXISTS "members can manage analises" ON public.analises;
CREATE POLICY "members can manage analises" ON public.analises FOR ALL TO public
  USING ((tenant_id IN ( SELECT public.accessible_tenant_ids() )));
DROP POLICY IF EXISTS tenant_own ON public.asaas_eventos;
CREATE POLICY tenant_own ON public.asaas_eventos FOR ALL TO public
  USING ((tenant_id IN ( SELECT public.accessible_tenant_ids() )));
DROP POLICY IF EXISTS atend_aval_insert_tenant ON public.atendimento_avaliacoes;
CREATE POLICY atend_aval_insert_tenant ON public.atendimento_avaliacoes FOR INSERT TO public
  WITH CHECK ((tenant_id IN ( SELECT public.accessible_tenant_ids() )));
DROP POLICY IF EXISTS atend_aval_select_tenant ON public.atendimento_avaliacoes;
CREATE POLICY atend_aval_select_tenant ON public.atendimento_avaliacoes FOR SELECT TO public
  USING ((tenant_id IN ( SELECT public.accessible_tenant_ids() )));
DROP POLICY IF EXISTS atend_aval_update_tenant ON public.atendimento_avaliacoes;
CREATE POLICY atend_aval_update_tenant ON public.atendimento_avaliacoes FOR UPDATE TO public
  USING ((tenant_id IN ( SELECT public.accessible_tenant_ids() )));
DROP POLICY IF EXISTS aval_insert_tenant ON public.atendimento_avaliacoes;
CREATE POLICY aval_insert_tenant ON public.atendimento_avaliacoes FOR INSERT TO public
  WITH CHECK ((tenant_id IN ( SELECT public.accessible_tenant_ids() )));
DROP POLICY IF EXISTS aval_select_tenant ON public.atendimento_avaliacoes;
CREATE POLICY aval_select_tenant ON public.atendimento_avaliacoes FOR SELECT TO public
  USING ((tenant_id IN ( SELECT public.accessible_tenant_ids() )));
DROP POLICY IF EXISTS tenant_member_read_avaliacao_config ON public.avaliacao_config;
CREATE POLICY tenant_member_read_avaliacao_config ON public.avaliacao_config FOR SELECT TO public
  USING ((tenant_id IN ( SELECT public.accessible_tenant_ids() )));
DROP POLICY IF EXISTS avaliacoes_insert_tenant ON public.avaliacoes;
CREATE POLICY avaliacoes_insert_tenant ON public.avaliacoes FOR INSERT TO public
  WITH CHECK ((tenant_id IN ( SELECT public.accessible_tenant_ids() )));
DROP POLICY IF EXISTS avaliacoes_select_tenant ON public.avaliacoes;
CREATE POLICY avaliacoes_select_tenant ON public.avaliacoes FOR SELECT TO public
  USING ((tenant_id IN ( SELECT public.accessible_tenant_ids() )));
DROP POLICY IF EXISTS avaliacoes_update_tenant ON public.avaliacoes;
CREATE POLICY avaliacoes_update_tenant ON public.avaliacoes FOR UPDATE TO public
  USING ((tenant_id IN ( SELECT public.accessible_tenant_ids() )));
DROP POLICY IF EXISTS avaliacoes_cfg_insert_tenant ON public.avaliacoes_loja_config;
CREATE POLICY avaliacoes_cfg_insert_tenant ON public.avaliacoes_loja_config FOR INSERT TO public
  WITH CHECK ((tenant_id IN ( SELECT public.accessible_tenant_ids() )));
DROP POLICY IF EXISTS avaliacoes_cfg_select_tenant ON public.avaliacoes_loja_config;
CREATE POLICY avaliacoes_cfg_select_tenant ON public.avaliacoes_loja_config FOR SELECT TO public
  USING ((tenant_id IN ( SELECT public.accessible_tenant_ids() )));
DROP POLICY IF EXISTS avaliacoes_cfg_update_tenant ON public.avaliacoes_loja_config;
CREATE POLICY avaliacoes_cfg_update_tenant ON public.avaliacoes_loja_config FOR UPDATE TO public
  USING ((tenant_id IN ( SELECT public.accessible_tenant_ids() )));
DROP POLICY IF EXISTS bom_dia_config_select_tenant ON public.bom_dia_config;
CREATE POLICY bom_dia_config_select_tenant ON public.bom_dia_config FOR SELECT TO public
  USING ((tenant_id IN ( SELECT public.accessible_tenant_ids() )));
DROP POLICY IF EXISTS "tenant bom_dia_feedback delete" ON public.bom_dia_feedback;
CREATE POLICY "tenant bom_dia_feedback delete" ON public.bom_dia_feedback FOR DELETE TO public
  USING ((tenant_id IN ( SELECT public.accessible_tenant_ids() )));
DROP POLICY IF EXISTS "tenant bom_dia_feedback insert" ON public.bom_dia_feedback;
CREATE POLICY "tenant bom_dia_feedback insert" ON public.bom_dia_feedback FOR INSERT TO public
  WITH CHECK ((tenant_id IN ( SELECT public.accessible_tenant_ids() )));
DROP POLICY IF EXISTS "tenant bom_dia_feedback select" ON public.bom_dia_feedback;
CREATE POLICY "tenant bom_dia_feedback select" ON public.bom_dia_feedback FOR SELECT TO public
  USING ((tenant_id IN ( SELECT public.accessible_tenant_ids() )));
DROP POLICY IF EXISTS "tenant bom_dia_feedback update" ON public.bom_dia_feedback;
CREATE POLICY "tenant bom_dia_feedback update" ON public.bom_dia_feedback FOR UPDATE TO public
  USING ((tenant_id IN ( SELECT public.accessible_tenant_ids() )));
DROP POLICY IF EXISTS "tenant members can read bot_config" ON public.bot_configs;
CREATE POLICY "tenant members can read bot_config" ON public.bot_configs FOR SELECT TO public
  USING ((tenant_id IN ( SELECT public.accessible_tenant_ids() )));
DROP POLICY IF EXISTS tenant_isolation ON public.bot_reply_log;
CREATE POLICY tenant_isolation ON public.bot_reply_log FOR ALL TO public
  USING ((tenant_id IN ( SELECT public.accessible_tenant_ids() )));
DROP POLICY IF EXISTS breno_interactions_tenant ON public.breno_interactions;
CREATE POLICY breno_interactions_tenant ON public.breno_interactions FOR ALL TO public
  USING ((tenant_id IN ( SELECT public.accessible_tenant_ids() )));
DROP POLICY IF EXISTS tenant_isolation ON public.breno_triagem;
CREATE POLICY tenant_isolation ON public.breno_triagem FOR ALL TO public
  USING ((tenant_id IN ( SELECT public.accessible_tenant_ids() )));
DROP POLICY IF EXISTS tenant_isolation_campanha_ativos ON public.campanha_ativos;
CREATE POLICY tenant_isolation_campanha_ativos ON public.campanha_ativos FOR ALL TO public
  USING ((tenant_id IN ( SELECT public.accessible_tenant_ids() )));
DROP POLICY IF EXISTS tenant_write_campanha_ativos ON public.campanha_ativos;
CREATE POLICY tenant_write_campanha_ativos ON public.campanha_ativos FOR ALL TO authenticated
  USING ((tenant_id IN ( SELECT public.accessible_tenant_ids() )))
  WITH CHECK ((tenant_id IN ( SELECT public.accessible_tenant_ids() )));
DROP POLICY IF EXISTS tenant_isolation_campanhas ON public.campanhas;
CREATE POLICY tenant_isolation_campanhas ON public.campanhas FOR ALL TO public
  USING ((tenant_id IN ( SELECT public.accessible_tenant_ids() )));
DROP POLICY IF EXISTS tenant_write_campanhas ON public.campanhas;
CREATE POLICY tenant_write_campanhas ON public.campanhas FOR ALL TO authenticated
  USING ((tenant_id IN ( SELECT public.accessible_tenant_ids() )))
  WITH CHECK ((tenant_id IN ( SELECT public.accessible_tenant_ids() )));
DROP POLICY IF EXISTS client_facts_insert_tenant ON public.client_facts;
CREATE POLICY client_facts_insert_tenant ON public.client_facts FOR INSERT TO public
  WITH CHECK ((tenant_id IN ( SELECT public.accessible_tenant_ids() )));
DROP POLICY IF EXISTS client_facts_select_tenant ON public.client_facts;
CREATE POLICY client_facts_select_tenant ON public.client_facts FOR SELECT TO public
  USING ((tenant_id IN ( SELECT public.accessible_tenant_ids() )));
DROP POLICY IF EXISTS client_facts_update_tenant ON public.client_facts;
CREATE POLICY client_facts_update_tenant ON public.client_facts FOR UPDATE TO public
  USING ((tenant_id IN ( SELECT public.accessible_tenant_ids() )));
DROP POLICY IF EXISTS client_tasks_tenant_isolation ON public.client_tasks;
CREATE POLICY client_tasks_tenant_isolation ON public.client_tasks FOR ALL TO authenticated
  USING ((tenant_id IN ( SELECT public.accessible_tenant_ids() )))
  WITH CHECK ((tenant_id IN ( SELECT public.accessible_tenant_ids() )));
DROP POLICY IF EXISTS client_timeline_insert_tenant ON public.client_timeline;
CREATE POLICY client_timeline_insert_tenant ON public.client_timeline FOR INSERT TO public
  WITH CHECK ((tenant_id IN ( SELECT public.accessible_tenant_ids() )));
DROP POLICY IF EXISTS client_timeline_select_tenant ON public.client_timeline;
CREATE POLICY client_timeline_select_tenant ON public.client_timeline FOR SELECT TO public
  USING ((tenant_id IN ( SELECT public.accessible_tenant_ids() )));
DROP POLICY IF EXISTS cobrancas_tenant_isolation ON public.cobrancas;
CREATE POLICY cobrancas_tenant_isolation ON public.cobrancas FOR ALL TO public
  USING ((tenant_id IN ( SELECT public.accessible_tenant_ids() )))
  WITH CHECK ((tenant_id IN ( SELECT public.accessible_tenant_ids() )));
DROP POLICY IF EXISTS "tenant members see tags" ON public.contact_tags;
CREATE POLICY "tenant members see tags" ON public.contact_tags FOR ALL TO public
  USING ((tenant_id IN ( SELECT public.accessible_tenant_ids() )));
DROP POLICY IF EXISTS lara_calendar_tenant ON public.content_calendar;
CREATE POLICY lara_calendar_tenant ON public.content_calendar FOR ALL TO public
  USING ((tenant_id IN ( SELECT public.accessible_tenant_ids() )));
DROP POLICY IF EXISTS lara_drafts_tenant ON public.content_drafts;
CREATE POLICY lara_drafts_tenant ON public.content_drafts FOR ALL TO public
  USING ((tenant_id IN ( SELECT public.accessible_tenant_ids() )));
DROP POLICY IF EXISTS lara_published_tenant ON public.content_published;
CREATE POLICY lara_published_tenant ON public.content_published FOR ALL TO public
  USING ((tenant_id IN ( SELECT public.accessible_tenant_ids() )));
DROP POLICY IF EXISTS tenant_own ON public.contratos;
CREATE POLICY tenant_own ON public.contratos FOR ALL TO public
  USING ((tenant_id IN ( SELECT public.accessible_tenant_ids() )));
DROP POLICY IF EXISTS tenant_isolation ON public.conversation_events;
CREATE POLICY tenant_isolation ON public.conversation_events FOR ALL TO public
  USING ((tenant_id IN ( SELECT public.accessible_tenant_ids() )));
DROP POLICY IF EXISTS tenant_isolation ON public.conversation_status_log;
CREATE POLICY tenant_isolation ON public.conversation_status_log FOR ALL TO public
  USING ((tenant_id IN ( SELECT public.accessible_tenant_ids() )));
DROP POLICY IF EXISTS conversations_insert_tenant ON public.conversations;
CREATE POLICY conversations_insert_tenant ON public.conversations FOR INSERT TO public
  WITH CHECK ((tenant_id IN ( SELECT public.accessible_tenant_ids() )));
DROP POLICY IF EXISTS conversations_select_tenant ON public.conversations;
CREATE POLICY conversations_select_tenant ON public.conversations FOR SELECT TO public
  USING ((tenant_id IN ( SELECT public.accessible_tenant_ids() )));
DROP POLICY IF EXISTS conversations_update_tenant ON public.conversations;
CREATE POLICY conversations_update_tenant ON public.conversations FOR UPDATE TO public
  USING ((tenant_id IN ( SELECT public.accessible_tenant_ids() )));
DROP POLICY IF EXISTS "members can update conversation status" ON public.conversations;
CREATE POLICY "members can update conversation status" ON public.conversations FOR UPDATE TO public
  USING ((tenant_id IN ( SELECT public.accessible_tenant_ids() )))
  WITH CHECK ((tenant_id IN ( SELECT public.accessible_tenant_ids() )));
DROP POLICY IF EXISTS cora_acoes_tenant ON public.cora_acoes;
CREATE POLICY cora_acoes_tenant ON public.cora_acoes FOR ALL TO public
  USING ((tenant_id IN ( SELECT public.accessible_tenant_ids() )));
DROP POLICY IF EXISTS cora_cobrancas_tenant ON public.cora_cobrancas;
CREATE POLICY cora_cobrancas_tenant ON public.cora_cobrancas FOR ALL TO public
  USING ((tenant_id IN ( SELECT public.accessible_tenant_ids() )));
DROP POLICY IF EXISTS cora_reguas_tenant ON public.cora_reguas;
CREATE POLICY cora_reguas_tenant ON public.cora_reguas FOR ALL TO public
  USING ((tenant_id IN ( SELECT public.accessible_tenant_ids() )));
DROP POLICY IF EXISTS crm_webhook_tokens_tenant_members ON public.crm_webhook_tokens;
CREATE POLICY crm_webhook_tokens_tenant_members ON public.crm_webhook_tokens FOR ALL TO authenticated
  USING ((tenant_id IN ( SELECT public.accessible_tenant_ids() )))
  WITH CHECK ((tenant_id IN ( SELECT public.accessible_tenant_ids() )));
DROP POLICY IF EXISTS tenant_member_custom_fields ON public.custom_fields;
CREATE POLICY tenant_member_custom_fields ON public.custom_fields FOR ALL TO public
  USING ((tenant_id IN ( SELECT public.accessible_tenant_ids() )));
DROP POLICY IF EXISTS tenant_isolation ON public.customer_addresses;
CREATE POLICY tenant_isolation ON public.customer_addresses FOR ALL TO public
  USING ((tenant_id IN ( SELECT public.accessible_tenant_ids() )));
DROP POLICY IF EXISTS tenant_isolation ON public.customer_notes;
CREATE POLICY tenant_isolation ON public.customer_notes FOR ALL TO public
  USING ((tenant_id IN ( SELECT public.accessible_tenant_ids() )));
DROP POLICY IF EXISTS deli_log_select_tenant ON public.deli_actions_log;
CREATE POLICY deli_log_select_tenant ON public.deli_actions_log FOR SELECT TO public
  USING ((tenant_id IN ( SELECT public.accessible_tenant_ids() )));
DROP POLICY IF EXISTS "tenant members can read deli_agenda" ON public.deli_agenda;
CREATE POLICY "tenant members can read deli_agenda" ON public.deli_agenda FOR SELECT TO public
  USING ((tenant_id IN ( SELECT public.accessible_tenant_ids() )));
DROP POLICY IF EXISTS tenant_members_view_own_deli_messages ON public.deli_messages;
CREATE POLICY tenant_members_view_own_deli_messages ON public.deli_messages FOR SELECT TO public
  USING ((tenant_id IN ( SELECT public.accessible_tenant_ids() )));
DROP POLICY IF EXISTS deli_approvals_insert_tenant ON public.deli_pending_approvals;
CREATE POLICY deli_approvals_insert_tenant ON public.deli_pending_approvals FOR INSERT TO public
  WITH CHECK ((tenant_id IN ( SELECT public.accessible_tenant_ids() )));
DROP POLICY IF EXISTS deli_approvals_select_tenant ON public.deli_pending_approvals;
CREATE POLICY deli_approvals_select_tenant ON public.deli_pending_approvals FOR SELECT TO public
  USING ((tenant_id IN ( SELECT public.accessible_tenant_ids() )));
DROP POLICY IF EXISTS deli_triggers_select_tenant ON public.deli_triggers;
CREATE POLICY deli_triggers_select_tenant ON public.deli_triggers FOR SELECT TO public
  USING ((tenant_id IN ( SELECT public.accessible_tenant_ids() )));
DROP POLICY IF EXISTS tenant_isolation ON public.departments;
CREATE POLICY tenant_isolation ON public.departments FOR ALL TO public
  USING ((tenant_id IN ( SELECT public.accessible_tenant_ids() )));
DROP POLICY IF EXISTS encerramento_config_select_tenant ON public.encerramento_config;
CREATE POLICY encerramento_config_select_tenant ON public.encerramento_config FOR SELECT TO public
  USING ((tenant_id IN ( SELECT public.accessible_tenant_ids() )));
DROP POLICY IF EXISTS espacos_columns_tenant_isolation ON public.espacos_columns;
CREATE POLICY espacos_columns_tenant_isolation ON public.espacos_columns FOR ALL TO authenticated
  USING ((tenant_id IN ( SELECT public.accessible_tenant_ids() )))
  WITH CHECK ((tenant_id IN ( SELECT public.accessible_tenant_ids() )));
DROP POLICY IF EXISTS espacos_folders_tenant_isolation ON public.espacos_folders;
CREATE POLICY espacos_folders_tenant_isolation ON public.espacos_folders FOR ALL TO authenticated
  USING ((tenant_id IN ( SELECT public.accessible_tenant_ids() )))
  WITH CHECK ((tenant_id IN ( SELECT public.accessible_tenant_ids() )));
DROP POLICY IF EXISTS espacos_lists_tenant_isolation ON public.espacos_lists;
CREATE POLICY espacos_lists_tenant_isolation ON public.espacos_lists FOR ALL TO authenticated
  USING ((tenant_id IN ( SELECT public.accessible_tenant_ids() )))
  WITH CHECK ((tenant_id IN ( SELECT public.accessible_tenant_ids() )));
DROP POLICY IF EXISTS espacos_workspaces_tenant_isolation ON public.espacos_workspaces;
CREATE POLICY espacos_workspaces_tenant_isolation ON public.espacos_workspaces FOR ALL TO public
  USING ((tenant_id IN ( SELECT public.accessible_tenant_ids() )))
  WITH CHECK ((tenant_id IN ( SELECT public.accessible_tenant_ids() )));
DROP POLICY IF EXISTS tenant_isolation ON public.goal_tasks;
CREATE POLICY tenant_isolation ON public.goal_tasks FOR ALL TO public
  USING ((tenant_id IN ( SELECT public.accessible_tenant_ids() )));
DROP POLICY IF EXISTS tenant_isolation ON public.goals;
CREATE POLICY tenant_isolation ON public.goals FOR ALL TO public
  USING ((tenant_id IN ( SELECT public.accessible_tenant_ids() )));
DROP POLICY IF EXISTS tenant_isolation ON public.heartbeat_runs;
CREATE POLICY tenant_isolation ON public.heartbeat_runs FOR ALL TO public
  USING ((tenant_id IN ( SELECT public.accessible_tenant_ids() )));
DROP POLICY IF EXISTS tenant_isolation ON public.heartbeats;
CREATE POLICY tenant_isolation ON public.heartbeats FOR ALL TO public
  USING ((tenant_id IN ( SELECT public.accessible_tenant_ids() )));
DROP POLICY IF EXISTS tenant_isolation ON public.ifood_merchants;
CREATE POLICY tenant_isolation ON public.ifood_merchants FOR ALL TO public
  USING ((tenant_id IN ( SELECT public.accessible_tenant_ids() )))
  WITH CHECK ((tenant_id IN ( SELECT public.accessible_tenant_ids() )));
DROP POLICY IF EXISTS internal_notifications_select ON public.internal_notifications;
CREATE POLICY internal_notifications_select ON public.internal_notifications FOR SELECT TO public
  USING (((recipient_user_id = auth.uid()) OR ((recipient_user_id IS NULL) AND (tenant_id IN ( SELECT public.accessible_tenant_ids() )))));
DROP POLICY IF EXISTS internal_notifications_update_own ON public.internal_notifications;
CREATE POLICY internal_notifications_update_own ON public.internal_notifications FOR UPDATE TO public
  USING (((recipient_user_id = auth.uid()) OR ((recipient_user_id IS NULL) AND (tenant_id IN ( SELECT public.accessible_tenant_ids() )))))
  WITH CHECK (((recipient_user_id = auth.uid()) OR ((recipient_user_id IS NULL) AND (tenant_id IN ( SELECT public.accessible_tenant_ids() )))));
DROP POLICY IF EXISTS tenant_isolation ON public.lead_lists;
CREATE POLICY tenant_isolation ON public.lead_lists FOR ALL TO public
  USING ((tenant_id IN ( SELECT public.accessible_tenant_ids() )));
DROP POLICY IF EXISTS tenant_isolation ON public.lead_tags;
CREATE POLICY tenant_isolation ON public.lead_tags FOR ALL TO public
  USING ((tenant_id IN ( SELECT public.accessible_tenant_ids() )));
DROP POLICY IF EXISTS leads_tenant_isolation ON public.leads;
CREATE POLICY leads_tenant_isolation ON public.leads FOR ALL TO public
  USING ((tenant_id IN ( SELECT public.accessible_tenant_ids() )))
  WITH CHECK ((tenant_id IN ( SELECT public.accessible_tenant_ids() )));
DROP POLICY IF EXISTS sofia_leads_tenant ON public.leads;
CREATE POLICY sofia_leads_tenant ON public.leads FOR ALL TO public
  USING ((tenant_id IN ( SELECT public.accessible_tenant_ids() )))
  WITH CHECK ((tenant_id IN ( SELECT public.accessible_tenant_ids() )));
DROP POLICY IF EXISTS loja_metricas_insert_tenant ON public.loja_metricas;
CREATE POLICY loja_metricas_insert_tenant ON public.loja_metricas FOR INSERT TO public
  WITH CHECK ((tenant_id IN ( SELECT public.accessible_tenant_ids() )));
DROP POLICY IF EXISTS loja_metricas_select_tenant ON public.loja_metricas;
CREATE POLICY loja_metricas_select_tenant ON public.loja_metricas FOR SELECT TO public
  USING ((tenant_id IN ( SELECT public.accessible_tenant_ids() )));
DROP POLICY IF EXISTS loja_metricas_update_tenant ON public.loja_metricas;
CREATE POLICY loja_metricas_update_tenant ON public.loja_metricas FOR UPDATE TO public
  USING ((tenant_id IN ( SELECT public.accessible_tenant_ids() )));
DROP POLICY IF EXISTS lwv_tenant_isolation ON public.loja_whatsapp_vinculo;
CREATE POLICY lwv_tenant_isolation ON public.loja_whatsapp_vinculo FOR ALL TO public
  USING ((tenant_id IN ( SELECT public.accessible_tenant_ids() )));
DROP POLICY IF EXISTS lojas_insert_tenant ON public.lojas;
CREATE POLICY lojas_insert_tenant ON public.lojas FOR INSERT TO public
  WITH CHECK ((tenant_id IN ( SELECT public.accessible_tenant_ids() )));
DROP POLICY IF EXISTS lojas_select_tenant ON public.lojas;
CREATE POLICY lojas_select_tenant ON public.lojas FOR SELECT TO public
  USING ((tenant_id IN ( SELECT public.accessible_tenant_ids() )));
DROP POLICY IF EXISTS lojas_update_tenant ON public.lojas;
CREATE POLICY lojas_update_tenant ON public.lojas FOR UPDATE TO public
  USING ((tenant_id IN ( SELECT public.accessible_tenant_ids() )));
DROP POLICY IF EXISTS tenant_isolation_marca_pesquisa ON public.marca_pesquisa;
CREATE POLICY tenant_isolation_marca_pesquisa ON public.marca_pesquisa FOR ALL TO public
  USING ((tenant_id IN ( SELECT public.accessible_tenant_ids() )));
DROP POLICY IF EXISTS tenant_write_marca_pesquisa ON public.marca_pesquisa;
CREATE POLICY tenant_write_marca_pesquisa ON public.marca_pesquisa FOR ALL TO authenticated
  USING ((tenant_id IN ( SELECT public.accessible_tenant_ids() )))
  WITH CHECK ((tenant_id IN ( SELECT public.accessible_tenant_ids() )));
DROP POLICY IF EXISTS max_kb_select ON public.max_knowledge_base;
CREATE POLICY max_kb_select ON public.max_knowledge_base FOR SELECT TO public
  USING (((tenant_id IS NULL) OR (tenant_id IN ( SELECT public.accessible_tenant_ids() ))));
DROP POLICY IF EXISTS mia_analises_tenant ON public.mia_analises;
CREATE POLICY mia_analises_tenant ON public.mia_analises FOR ALL TO public
  USING ((tenant_id IN ( SELECT public.accessible_tenant_ids() )));
DROP POLICY IF EXISTS mia_audit_tenant_isolation ON public.mia_audit_log;
CREATE POLICY mia_audit_tenant_isolation ON public.mia_audit_log FOR SELECT TO public
  USING ((tenant_id IN ( SELECT public.accessible_tenant_ids() )));
DROP POLICY IF EXISTS tenant_isolation ON public.missions;
CREATE POLICY tenant_isolation ON public.missions FOR ALL TO public
  USING ((tenant_id IN ( SELECT public.accessible_tenant_ids() )));
DROP POLICY IF EXISTS tenant_isolation_nexus_requests ON public.nexus_requests;
CREATE POLICY tenant_isolation_nexus_requests ON public.nexus_requests FOR ALL TO public
  USING ((tenant_id IN ( SELECT public.accessible_tenant_ids() )));
DROP POLICY IF EXISTS tenant_write_nexus_requests ON public.nexus_requests;
CREATE POLICY tenant_write_nexus_requests ON public.nexus_requests FOR ALL TO authenticated
  USING ((tenant_id IN ( SELECT public.accessible_tenant_ids() )))
  WITH CHECK ((tenant_id IN ( SELECT public.accessible_tenant_ids() )));
DROP POLICY IF EXISTS nova_blueprints_tenant ON public.nova_blueprints;
CREATE POLICY nova_blueprints_tenant ON public.nova_blueprints FOR ALL TO public
  USING ((tenant_id IN ( SELECT public.accessible_tenant_ids() )));
DROP POLICY IF EXISTS nps_aval_insert_tenant ON public.nps_avaliacoes;
CREATE POLICY nps_aval_insert_tenant ON public.nps_avaliacoes FOR INSERT TO public
  WITH CHECK ((tenant_id IN ( SELECT public.accessible_tenant_ids() )));
DROP POLICY IF EXISTS nps_aval_select_tenant ON public.nps_avaliacoes;
CREATE POLICY nps_aval_select_tenant ON public.nps_avaliacoes FOR SELECT TO public
  USING ((tenant_id IN ( SELECT public.accessible_tenant_ids() )));
DROP POLICY IF EXISTS nps_aval_update_tenant ON public.nps_avaliacoes;
CREATE POLICY nps_aval_update_tenant ON public.nps_avaliacoes FOR UPDATE TO public
  USING ((tenant_id IN ( SELECT public.accessible_tenant_ids() )));
DROP POLICY IF EXISTS onboarding_checklists_tenant_isolation ON public.onboarding_checklists;
CREATE POLICY onboarding_checklists_tenant_isolation ON public.onboarding_checklists FOR ALL TO authenticated
  USING ((tenant_id IN ( SELECT public.accessible_tenant_ids() )))
  WITH CHECK ((tenant_id IN ( SELECT public.accessible_tenant_ids() )));
DROP POLICY IF EXISTS onboarding_templates_see_own_or_global ON public.onboarding_templates;
CREATE POLICY onboarding_templates_see_own_or_global ON public.onboarding_templates FOR SELECT TO authenticated
  USING (((tenant_id IS NULL) OR (tenant_id IN ( SELECT public.accessible_tenant_ids() ))));
DROP POLICY IF EXISTS tenant_isolation ON public.projects;
CREATE POLICY tenant_isolation ON public.projects FOR ALL TO public
  USING ((tenant_id IN ( SELECT public.accessible_tenant_ids() )));
DROP POLICY IF EXISTS "agents see own and workspace quick_replies" ON public.quick_replies;
CREATE POLICY "agents see own and workspace quick_replies" ON public.quick_replies FOR SELECT TO public
  USING (((agent_id = auth.uid()) OR (tenant_id IN ( SELECT public.accessible_tenant_ids() ))));
DROP POLICY IF EXISTS qr_tenant_select ON public.quick_replies;
CREATE POLICY qr_tenant_select ON public.quick_replies FOR SELECT TO public
  USING (((tenant_id IS NULL) OR (tenant_id IN ( SELECT public.accessible_tenant_ids() ))));
DROP POLICY IF EXISTS qr_tenant_write ON public.quick_replies;
CREATE POLICY qr_tenant_write ON public.quick_replies FOR ALL TO authenticated
  USING ((tenant_id IN ( SELECT public.accessible_tenant_ids() )))
  WITH CHECK ((tenant_id IN ( SELECT public.accessible_tenant_ids() )));
DROP POLICY IF EXISTS tenant_isolation_reguas ON public.reguas;
CREATE POLICY tenant_isolation_reguas ON public.reguas FOR ALL TO public
  USING ((tenant_id IN ( SELECT public.accessible_tenant_ids() )));
DROP POLICY IF EXISTS tenant_write_reguas ON public.reguas;
CREATE POLICY tenant_write_reguas ON public.reguas FOR ALL TO authenticated
  USING ((tenant_id IN ( SELECT public.accessible_tenant_ids() )))
  WITH CHECK ((tenant_id IN ( SELECT public.accessible_tenant_ids() )));
DROP POLICY IF EXISTS roles_select_tenant ON public.roles;
CREATE POLICY roles_select_tenant ON public.roles FOR SELECT TO public
  USING ((tenant_id IN ( SELECT public.accessible_tenant_ids() )));
DROP POLICY IF EXISTS sugestoes_tenant_isolation ON public.sugestoes_ia;
CREATE POLICY sugestoes_tenant_isolation ON public.sugestoes_ia FOR ALL TO public
  USING ((tenant_id IN ( SELECT public.accessible_tenant_ids() )));
DROP POLICY IF EXISTS "members can insert sugestoes" ON public.sugestoes_plataforma;
CREATE POLICY "members can insert sugestoes" ON public.sugestoes_plataforma FOR INSERT TO public
  WITH CHECK ((tenant_id IN ( SELECT public.accessible_tenant_ids() )));
DROP POLICY IF EXISTS "members can read sugestoes" ON public.sugestoes_plataforma;
CREATE POLICY "members can read sugestoes" ON public.sugestoes_plataforma FOR SELECT TO public
  USING ((tenant_id IN ( SELECT public.accessible_tenant_ids() )));
DROP POLICY IF EXISTS tenant_own ON public.support_tickets;
CREATE POLICY tenant_own ON public.support_tickets FOR ALL TO public
  USING ((tenant_id IN ( SELECT public.accessible_tenant_ids() )));
DROP POLICY IF EXISTS inserir_anexos_tenant ON public.tarefa_anexos;
CREATE POLICY inserir_anexos_tenant ON public.tarefa_anexos FOR INSERT TO public
  WITH CHECK ((tenant_id IN ( SELECT public.accessible_tenant_ids() )));
DROP POLICY IF EXISTS ver_anexos_tenant ON public.tarefa_anexos;
CREATE POLICY ver_anexos_tenant ON public.tarefa_anexos FOR SELECT TO public
  USING ((tenant_id IN ( SELECT public.accessible_tenant_ids() )));
DROP POLICY IF EXISTS tenant_modules_select_tenant ON public.tenant_modules;
CREATE POLICY tenant_modules_select_tenant ON public.tenant_modules FOR SELECT TO public
  USING ((tenant_id IN ( SELECT public.accessible_tenant_ids() )));
DROP POLICY IF EXISTS vera_anomalias_select_tenant_members ON public.vera_anomalias;
CREATE POLICY vera_anomalias_select_tenant_members ON public.vera_anomalias FOR SELECT TO public
  USING ((tenant_id IN ( SELECT public.accessible_tenant_ids() )));
DROP POLICY IF EXISTS vera_metricas_snapshot_select_tenant_members ON public.vera_metricas_snapshot;
CREATE POLICY vera_metricas_snapshot_select_tenant_members ON public.vera_metricas_snapshot FOR SELECT TO public
  USING ((tenant_id IN ( SELECT public.accessible_tenant_ids() )));
DROP POLICY IF EXISTS vera_reports_select_tenant_members ON public.vera_reports;
CREATE POLICY vera_reports_select_tenant_members ON public.vera_reports FOR SELECT TO public
  USING ((tenant_id IN ( SELECT public.accessible_tenant_ids() )));
DROP POLICY IF EXISTS wa_contacts_insert_tenant ON public.whatsapp_contacts;
CREATE POLICY wa_contacts_insert_tenant ON public.whatsapp_contacts FOR INSERT TO public
  WITH CHECK ((tenant_id IN ( SELECT public.accessible_tenant_ids() )));
DROP POLICY IF EXISTS wa_contacts_select_tenant ON public.whatsapp_contacts;
CREATE POLICY wa_contacts_select_tenant ON public.whatsapp_contacts FOR SELECT TO public
  USING ((tenant_id IN ( SELECT public.accessible_tenant_ids() )));
DROP POLICY IF EXISTS wa_contacts_update_tenant ON public.whatsapp_contacts;
CREATE POLICY wa_contacts_update_tenant ON public.whatsapp_contacts FOR UPDATE TO public
  USING ((tenant_id IN ( SELECT public.accessible_tenant_ids() )));
DROP POLICY IF EXISTS wa_groups_insert_tenant ON public.whatsapp_groups;
CREATE POLICY wa_groups_insert_tenant ON public.whatsapp_groups FOR INSERT TO public
  WITH CHECK ((tenant_id IN ( SELECT public.accessible_tenant_ids() )));
DROP POLICY IF EXISTS wa_groups_select_tenant ON public.whatsapp_groups;
CREATE POLICY wa_groups_select_tenant ON public.whatsapp_groups FOR SELECT TO public
  USING ((tenant_id IN ( SELECT public.accessible_tenant_ids() )));
DROP POLICY IF EXISTS wa_messages_insert_tenant ON public.whatsapp_messages;
CREATE POLICY wa_messages_insert_tenant ON public.whatsapp_messages FOR INSERT TO public
  WITH CHECK ((tenant_id IN ( SELECT public.accessible_tenant_ids() )));
DROP POLICY IF EXISTS wa_messages_select_tenant ON public.whatsapp_messages;
CREATE POLICY wa_messages_select_tenant ON public.whatsapp_messages FOR SELECT TO public
  USING ((tenant_id IN ( SELECT public.accessible_tenant_ids() )));
DROP POLICY IF EXISTS wa_messages_update_tenant ON public.whatsapp_messages;
CREATE POLICY wa_messages_update_tenant ON public.whatsapp_messages FOR UPDATE TO public
  USING ((tenant_id IN ( SELECT public.accessible_tenant_ids() )));
COMMIT;
