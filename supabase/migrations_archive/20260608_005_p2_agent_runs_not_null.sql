-- FASE 2 · onda 2 · P-2: cutover logAgentRun — tenant_id NOT NULL
-- Branch: feat/seguranca-s1
-- ================================================================
-- REQUER APROVAÇÃO EXPLÍCITA DO WANDSON ANTES DE APLICAR
-- ================================================================
--
-- Pré-condição:
--   • trigger/_shared/audit.ts atualizado (tenantId ?? CONSULT_TENANT_ID)
--   • Deploy do worker Trigger.dev feito com a nova versão de audit.ts
--   • Todos os runs após o deploy já gravam tenant_id preenchido
--
-- Esta migration:
--   1. Backfill final: qualquer run gravado antes do deploy do worker
--   2. NOT NULL em agent_runs.tenant_id
--   3. Aposta a policy legada authenticated_view_global_runs
--      (era válvula de escape para runs de sistema; não mais necessária)
--
-- Nota: DROP POLICY não destrói dados — é código de autorização recriável.

-- 1. Backfill final (idempotente)
UPDATE public.agent_runs
SET    tenant_id = '9079bd4d-4df7-4023-90fb-d79c8ba7e900'::uuid
WHERE  tenant_id IS NULL;

-- 2. Apertar NOT NULL
ALTER TABLE public.agent_runs
  ALTER COLUMN tenant_id SET NOT NULL;

-- 3. Aposentar policy legada
DROP POLICY IF EXISTS "authenticated_view_global_runs" ON public.agent_runs;

-- Validação manual pós-aplicação (esperados: 0, 0):
--   SELECT count(*) FROM public.agent_runs WHERE tenant_id IS NULL;
--   SELECT count(*) FROM pg_policies
--    WHERE tablename = 'agent_runs'
--      AND policyname = 'authenticated_view_global_runs';
