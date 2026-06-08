-- FASE 2 · onda 2 · P-5: revogar grants órfãos de ex-membros
-- Branch: feat/seguranca-s3
-- ================================================================
-- REQUER APROVAÇÃO EXPLÍCITA DO WANDSON ANTES DE APLICAR
-- (Regra P-5: "LISTAR e pedir OK do Wandson antes de revogar")
-- ================================================================
--
-- Grants órfãos identificados em 2026-06-08 via SELECT:
--
--   eduardo@consultdelivery.com.br
--   user_id: cba66f88-f97d-4eb0-93fc-0a9d585e07ef
--   └─ agent_name=analista-ifood / agent_id=analise-ifood
--      can_invoke=true, can_view_history=true, can_approve_drafts=false
--
--   wellida@consultdelivery.com.br
--   user_id: 14904752-87f9-4d92-bd66-571cd3bd14ac
--   ├─ agent_name=analista-ifood / agent_id=analise-ifood
--   │  can_invoke=true, can_view_history=true, can_approve_drafts=false
--   └─ agent_name=lara / agent_id=lara
--      can_invoke=true, can_view_history=true, can_approve_drafts=true  ⚠️
--
-- Ambos estão em auth.users mas SEM linha em tenant_members.
-- Yasmin não encontrada no auth.users — sem grants a revogar.
--
-- Esta migration DELETA as linhas de user_agent_access dos ex-membros.
-- NÃO toca em auth.users (remoção de usuários do Supabase Auth é feita
-- separadamente via Dashboard, se desejado).

-- Grants de Eduardo (1 linha)
DELETE FROM public.user_agent_access
WHERE user_id = 'cba66f88-f97d-4eb0-93fc-0a9d585e07ef'::uuid;

-- Grants de Wellida (2 linhas: analise-ifood + lara)
DELETE FROM public.user_agent_access
WHERE user_id = '14904752-87f9-4d92-bd66-571cd3bd14ac'::uuid;

-- Validação pós-aplicação (esperado: 0 linhas):
--   SELECT count(*) FROM public.user_agent_access
--    WHERE user_id IN (
--      'cba66f88-f97d-4eb0-93fc-0a9d585e07ef'::uuid,
--      '14904752-87f9-4d92-bd66-571cd3bd14ac'::uuid
--    );
