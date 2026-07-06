-- 20260628_003_agents_hermes_roster.sql
-- AI-First Hermes-First (Blueprint v2 §6): cabeia os 4 agentes NOVOS do org-chart no
-- catálogo global (agents) e habilita-os para o tenant principal (tenant_agents).
-- Os outros 8 (deli, breno, max, analista-ifood, lara, cora, sofia, vera) já existem.
--
-- ADITIVO/IDEMPOTENTE: ON CONFLICT DO NOTHING; não altera/remove nada existente.
-- ⚠️ PENDENTE DE APLICAÇÃO — aplicar via Supabase MCP (apply_migration) e verificar
--    o schema real de `agents` antes (colunas confirmadas no recon: id,name,role,letter,
--    color,category,default_modo,tenant_id,is_custom). O despachador (cd_despachar_especialista)
--    valida o slug contra tenant_agents.enabled — sem estas linhas, os 4 novos não despacham.

-- 1) Catálogo global (tenant_id NULL = agente global)
INSERT INTO public.agents (id, name, role, letter, color, category, default_modo)
VALUES
  ('revisor', 'REVISOR', 'Verificação / QA',          'R', '#6b7280', 'specialist', 'ia'),
  ('pedro',   'PEDRO',   'Planejamento',              'P', '#0ea5e9', 'specialist', 'hibrido'),
  ('estela',  'ESTELA',  'Estratégia',                'E', '#8b5cf6', 'specialist', 'hibrido'),
  ('vitor',   'VITOR',   'Vendas / Closing',          'V', '#16a34a', 'specialist', 'humano')
ON CONFLICT (id) DO NOTHING;

-- 2) Habilitação para o tenant principal (Consult Delivery)
INSERT INTO public.tenant_agents (tenant_id, agent_id, enabled)
SELECT '9079bd4d-4df7-4023-90fb-d79c8ba7e900'::uuid, a.id, true
FROM (VALUES ('revisor'), ('pedro'), ('estela'), ('vitor')) AS a(id)
ON CONFLICT (tenant_id, agent_id) DO NOTHING;
