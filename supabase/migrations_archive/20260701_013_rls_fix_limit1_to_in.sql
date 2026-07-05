-- Fix RLS: trocar `tenant_id = (SELECT ... LIMIT 1)` por `tenant_id IN (SELECT ...)`
-- em 27 policies. Bug: LIMIT 1 sem ORDER BY escolhe tenant arbitrário para usuário
-- multi-tenant (equipe da agência virou multi-tenant após a cópia A1 da Fase 1b) ->
-- vê/grava só 1 tenant ao acaso. Relatório: docs/tenancy-bug-rls-limit1-report.md
--
-- Seguro por construção: `= (um arbitrário meu)` -> `IN (todos os meus)`. Só amplia
-- para os tenants de que o usuário JÁ é membro (nunca vaza tenant alheio). Para
-- single-tenant (lojista) o conjunto tem 1 elemento -> IN equivale a = (sem mudança).
--
-- NÃO inclui max_knowledge_base/max_kb_write: é EXISTS(role IN admin/owner) LIMIT 1,
-- não compara tenant_id -> LIMIT 1 inofensivo, fica como está.
-- Atômico (BEGIN/COMMIT), idempotente (DROP IF EXISTS). Rollback = restaurar `= (...LIMIT 1)`.

BEGIN;

-- 25 policies padrão puro (cmd ALL, USING só; with_check omitido = herda USING, igual ao original)
DO $$
DECLARE
  r record;
  std text := 'tenant_id IN ( SELECT tm.tenant_id FROM public.tenant_members tm WHERE tm.user_id = auth.uid() )';
  alvos text[][] := ARRAY[
    ['aceite_recontratacao','tenant_own'],
    ['agent_action_approvals','agent_action_approvals_tenant'],
    ['agent_knowledge_base','knowledge_base_tenant'],
    ['agent_ticket_activity','agent_ticket_activity_tenant'],
    ['agent_ticket_comments','agent_ticket_comments_tenant'],
    ['agent_tickets','agent_tickets_tenant'],
    ['breno_interactions','breno_interactions_tenant'],
    ['breno_triagem','tenant_isolation'],
    ['conversation_events','tenant_isolation'],
    ['cora_acoes','cora_acoes_tenant'],
    ['cora_cobrancas','cora_cobrancas_tenant'],
    ['cora_reguas','cora_reguas_tenant'],
    ['customer_addresses','tenant_isolation'],
    ['customer_notes','tenant_isolation'],
    ['departments','tenant_isolation'],
    ['goal_tasks','tenant_isolation'],
    ['goals','tenant_isolation'],
    ['heartbeat_runs','tenant_isolation'],
    ['heartbeats','tenant_isolation'],
    ['lead_lists','tenant_isolation'],
    ['lead_tags','tenant_isolation'],
    ['mia_analises','mia_analises_tenant'],
    ['missions','tenant_isolation'],
    ['nova_blueprints','nova_blueprints_tenant'],
    ['projects','tenant_isolation']
  ];
BEGIN
  FOR i IN 1 .. array_length(alvos,1) LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', alvos[i][2], alvos[i][1]);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO public USING (%s)',
                   alvos[i][2], alvos[i][1], std);
  END LOOP;
END $$;

-- cobrancas: original tinha USING + WITH CHECK -> preserva ambos
DROP POLICY IF EXISTS cobrancas_tenant_isolation ON public.cobrancas;
CREATE POLICY cobrancas_tenant_isolation ON public.cobrancas FOR ALL TO public
  USING (tenant_id IN ( SELECT tm.tenant_id FROM public.tenant_members tm WHERE tm.user_id = auth.uid() ))
  WITH CHECK (tenant_id IN ( SELECT tm.tenant_id FROM public.tenant_members tm WHERE tm.user_id = auth.uid() ));

-- max_kb_select: SELECT, preserva o wrapper (tenant_id IS NULL) OR (...)
DROP POLICY IF EXISTS max_kb_select ON public.max_knowledge_base;
CREATE POLICY max_kb_select ON public.max_knowledge_base FOR SELECT TO public
  USING ( (tenant_id IS NULL)
          OR (tenant_id IN ( SELECT tm.tenant_id FROM public.tenant_members tm WHERE tm.user_id = auth.uid() )) );

COMMIT;
