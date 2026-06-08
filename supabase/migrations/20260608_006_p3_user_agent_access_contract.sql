-- FASE 2 · onda 2 · P-3: contrato user_agent_access
-- Branch: feat/seguranca-s2
-- ================================================================
-- REQUER APROVAÇÃO EXPLÍCITA DO WANDSON ANTES DE APLICAR
-- ================================================================
--
-- Pré-condição:
--   • Onda 1 (20260607_005) backfillou tenant_id e agent_id em todas as linhas
--   • src/hooks/usePermissions.js atualizado (indexa por agent_id + agent_name)
--
-- Validação antes de apertar (esperado: 0):
--   SELECT count(*) FROM public.user_agent_access
--    WHERE tenant_id IS NULL OR agent_id IS NULL;

-- 1. NOT NULL nas colunas novas (backfill da onda 1 garante 0 nulos)
ALTER TABLE public.user_agent_access
  ALTER COLUMN tenant_id SET NOT NULL,
  ALTER COLUMN agent_id   SET NOT NULL;

-- 2. Constraint única canônica (nova identidade por tenant+user+agente)
ALTER TABLE public.user_agent_access
  ADD CONSTRAINT uq_uaa_tenant_user_agent
  UNIQUE (tenant_id, user_id, agent_id);

-- PK antiga (user_id, agent_name) e coluna agent_name permanecem.
-- Remoção deferred para onda 3 (quando todos os callers usarem agent_id).

-- Validação pós-aplicação (esperado: constraint listada):
--   SELECT conname FROM pg_constraint
--    WHERE conrelid = 'public.user_agent_access'::regclass
--      AND contype = 'u';
