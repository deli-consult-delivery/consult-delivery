-- ============================================================
-- FASE 2 onda 1 · Migration 5/5 — user_agent_access: EXPAND (§3.2 FASE 1)
-- Problema confirmado ao vivo: agent_name é texto livre sem FK; das 7
-- linhas, os valores são: analista-ifood (×3), lara (×2), deli (×1),
-- main (×1) — 'analista-ifood' e 'main' NÃO existem em agents.id.
-- Estratégia expand→cutover→contract: esta migration só EXPANDE
-- (colunas novas + backfill). PK antiga (user_id, agent_name) fica
-- intacta; contract na onda 2 após cutover do app.
-- ============================================================

ALTER TABLE public.user_agent_access
  ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id),
  ADD COLUMN IF NOT EXISTS agent_id  text REFERENCES public.agents(id);

-- Backfill tenant (único tenant existente)
UPDATE public.user_agent_access
SET tenant_id = '9079bd4d-4df7-4023-90fb-d79c8ba7e900'::uuid
WHERE tenant_id IS NULL;

-- Backfill agent_id com mapeamento dos slugs reais do catálogo
UPDATE public.user_agent_access
SET agent_id = CASE agent_name
  WHEN 'analista-ifood' THEN 'analise-ifood'  -- slug antigo → slug do catálogo
  WHEN 'deli'           THEN 'deli'
  WHEN 'lara'           THEN 'lara'
  ELSE NULL
END
WHERE agent_id IS NULL;

-- ⚠️ PENDÊNCIA P-1 (decisão Wandson): 1 linha com agent_name='main'
-- (user 718e256d…) fica com agent_id NULL — não existe agente 'main'.
-- Opções: (a) mapear para 'deli', (b) aposentar a linha na onda 2.
-- Nada é deletado nesta migration.

-- Validação pós-aplicação (esperado: 7 / 6 / 1):
-- SELECT count(*) total,
--        count(agent_id) mapeados,
--        count(*) FILTER (WHERE agent_id IS NULL) pendentes
-- FROM user_agent_access;
