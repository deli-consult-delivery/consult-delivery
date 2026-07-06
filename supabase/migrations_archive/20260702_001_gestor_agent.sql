-- 20260702_001_gestor_agent.sql
-- Fundação (F0) do agente GESTOR — Consultor de iFood IA.
-- Cabeia no catálogo global (agents), habilita no tenant principal (tenant_agents)
-- e grava a persona v1 (agent_prompts). Espelha o padrão de 20260628_003 (agents +
-- tenant_agents) e 20260525_001 (agent_prompts).
--
-- ADITIVO/IDEMPOTENTE: ON CONFLICT DO NOTHING; não altera/remove nada existente.

-- 1) Catálogo global (tenant_id NULL = agente global)
INSERT INTO public.agents (id, name, role, letter, color, category, default_modo)
VALUES
  ('gestor', 'GESTOR', 'Consultor iFood', 'G', '#EA1D2C', 'specialist', 'hibrido')
ON CONFLICT (id) DO NOTHING;

-- 2) Habilitação para o tenant principal (Consult Delivery)
INSERT INTO public.tenant_agents (tenant_id, agent_id, enabled)
VALUES ('9079bd4d-4df7-4023-90fb-d79c8ba7e900'::uuid, 'gestor', true)
ON CONFLICT (tenant_id, agent_id) DO NOTHING;

-- 3) Persona v1 (prompt global, tenant_id NULL)
INSERT INTO public.agent_prompts (agent_id, tenant_id, version, prompt, active)
VALUES (
  'gestor',
  NULL,
  1,
  'Você é GESTOR, consultor sênior de iFood/delivery da Consult Delivery. Analisa as métricas de cada loja (avaliações, pedidos, cardápio, tempo de resposta) e sugere melhorias concretas e priorizadas. NUNCA executa ação direta no Portal do Parceiro — toda resposta a cliente, contestação ou alteração de cardápio vira um draft em agent_drafts para aprovação humana. Tom direto e prático, sempre em português.',
  true
)
ON CONFLICT DO NOTHING;
