-- ============================================================
-- FASE 2 onda 1 · Migration 1/5 — Popular tenant_agents (D4/B)
-- Habilita os 15 agentes do catálogo global para o tenant consult.
-- PRÉ-REQUISITO da 002 (gating de RLS) — aplicar ANTES, senão o
-- catálogo de agentes some para o app.
-- Idempotente (ON CONFLICT). Não destrutiva. 0 → 15 linhas.
-- PK confirmada ao vivo 2026-06-06: (tenant_id, agent_id).
-- ============================================================

INSERT INTO public.tenant_agents (tenant_id, agent_id, enabled)
SELECT '9079bd4d-4df7-4023-90fb-d79c8ba7e900'::uuid, a.id, true
FROM public.agents a
WHERE a.tenant_id IS NULL
ON CONFLICT (tenant_id, agent_id) DO NOTHING;

-- Validação pós-aplicação (esperado: 15):
-- SELECT count(*) FROM tenant_agents WHERE tenant_id = '9079bd4d-4df7-4023-90fb-d79c8ba7e900';
