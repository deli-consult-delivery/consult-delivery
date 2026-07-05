-- ============================================================
-- FASE 2 onda 1 · Migration 4/5 — Backfill tenant_id + NOT NULL barato
-- Estado ao vivo 2026-06-06: agent_runs 1684 total, 383 com tenant NULL;
-- agent_memories 0 linhas. tenants count = 1 (consult é o único destino
-- possível do backfill — runs de sistema pertencem operacionalmente a ele).
-- Não destrutiva (UPDATE de NULL → valor; nenhuma linha deletada).
-- ============================================================

-- Backfill (≈383 linhas no momento da redação; número pode crescer até aplicar)
UPDATE public.agent_runs
SET tenant_id = '9079bd4d-4df7-4023-90fb-d79c8ba7e900'::uuid
WHERE tenant_id IS NULL;

-- Apertar NOT NULL onde é grátis (tabela vazia)
ALTER TABLE public.agent_memories ALTER COLUMN tenant_id SET NOT NULL;

-- NOTA: agent_runs.tenant_id permanece NULLABLE nesta onda — o logAgentRun
-- ainda pode gravar runs de sistema sem tenant. SET NOT NULL só na onda 2,
-- após cutover do logAgentRun para sempre enviar tenant_id.
-- A policy authenticated_view_global_runs (tenant IS NULL) permanece para
-- runs novos de sistema até esse cutover.

-- Validação pós-aplicação (esperado: 0):
-- SELECT count(*) FROM agent_runs WHERE tenant_id IS NULL;
