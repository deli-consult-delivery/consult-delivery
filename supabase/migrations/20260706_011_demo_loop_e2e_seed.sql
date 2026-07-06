-- 20260706_011_demo_loop_e2e_seed.sql
-- Seed FICTÍCIO e idempotente para rodar o loop AI-First (FASE 1-3 + Revisor,
-- Bloco 2) de ponta a ponta no tenant cd-demo, com target_system='nenhum'
-- (zero efeito externo — nenhuma chamada a ERP/Asaas real).
--
-- Reusa o customer fictício "Fernanda Lima (fictício)" já semeado em
-- 20260706_005_demo_snapshot.sql. Cria 1 conversation (type='internal', não é
-- WhatsApp real) + 1 client_task em loop_state='open', espelhando o que
-- trigger/_shared/loop-tasks.ts::createLoopTask faz normalmente (task + update
-- da conversa), só que direto via SQL em vez do helper da aplicação.
--
-- Idempotente: guard único por título da conversation (não duplica em re-run).
--
-- Rollback (escopado ao tenant cd-demo, não toca outros tenants):
--   DELETE FROM public.client_tasks  WHERE tenant_id = (SELECT id FROM public.tenants WHERE slug = 'cd-demo') AND title = 'E2E Loop Demo (fictício)';
--   DELETE FROM public.conversations WHERE tenant_id = (SELECT id FROM public.tenants WHERE slug = 'cd-demo') AND title = 'E2E Loop Demo (fictício)';

DO $$
DECLARE
  v_tenant       uuid;
  v_customer     uuid;
  v_conversation uuid;
  v_task         uuid;
BEGIN
  SELECT id INTO v_tenant FROM public.tenants WHERE slug = 'cd-demo';
  IF v_tenant IS NULL THEN
    RAISE NOTICE 'tenant cd-demo não encontrado -- rode 20260706_001 primeiro';
    RETURN;
  END IF;

  SELECT id INTO v_customer FROM public.customers
    WHERE tenant_id = v_tenant AND name = 'Fernanda Lima (fictício)';
  IF v_customer IS NULL THEN
    RAISE NOTICE 'customer fictício não encontrado -- rode 20260706_005 primeiro';
    RETURN;
  END IF;

  SELECT id INTO v_conversation FROM public.conversations
    WHERE tenant_id = v_tenant AND customer_id = v_customer AND title = 'E2E Loop Demo (fictício)';

  IF v_conversation IS NULL THEN
    INSERT INTO public.conversations (
      tenant_id, type, customer_id, title, preview, status, contact_name,
      loop_status
    ) VALUES (
      v_tenant, 'internal', v_customer, 'E2E Loop Demo (fictício)',
      'Teste E2E do loop AI-First (fictício, zero efeito externo)',
      'automacao', 'Fernanda Lima (fictício)', 'attending'
    )
    RETURNING id INTO v_conversation;
  END IF;

  SELECT id INTO v_task FROM public.client_tasks
    WHERE tenant_id = v_tenant AND conversation_id = v_conversation AND title = 'E2E Loop Demo (fictício)';

  IF v_task IS NULL THEN
    INSERT INTO public.client_tasks (
      tenant_id, customer_id, conversation_id, title, description,
      status, priority, agent_id, loop_state, target_system
    ) VALUES (
      v_tenant, v_customer, v_conversation,
      'E2E Loop Demo (fictício)',
      'Tarefa de teste do loop AI-First E2E (fictícia, target_system=nenhum, zero efeito externo).',
      'doing', 'normal', 'breno', 'open', 'nenhum'
    )
    RETURNING id INTO v_task;
  END IF;

  UPDATE public.conversations
     SET loop_status = 'task_pending',
         active_task_id = v_task,
         attending_agent_id = 'breno'
   WHERE id = v_conversation;
END $$;
