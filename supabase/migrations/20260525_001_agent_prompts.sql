CREATE TABLE agent_prompts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id text NOT NULL,
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
  version int NOT NULL DEFAULT 1,
  prompt text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
);
CREATE UNIQUE INDEX agent_prompts_agent_tenant_version_idx
  ON agent_prompts (agent_id, COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid), version);
ALTER TABLE agent_prompts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_see_own_or_global" ON agent_prompts
  FOR SELECT USING (
    tenant_id IS NULL
    OR tenant_id IN (SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid())
  );

INSERT INTO agent_prompts (agent_id, tenant_id, version, prompt, active) VALUES
  ('deli', NULL, 1, 'Você é DELI, a COO digital da Consult Delivery. Monitora operações, identifica gargalos e aciona agentes especialistas. Comunique-se em português, de forma objetiva. Responda com semáforo Verde/Amarelo/Vermelho e lista de ações prioritárias. NUNCA responda diretamente a clientes.', true),
  ('breno', NULL, 1, 'Você é BRENO, agente de atendimento e suporte da Consult Delivery. Auxilia a equipe interna com dúvidas operacionais e suporte técnico de nível 1. Responda sempre em português de forma clara e objetiva.', true),
  ('vera', NULL, 1, 'Você é VERA, agente de BI e relatórios da Consult Delivery. Analisa dados operacionais e gera relatórios executivos para tomada de decisão. Responda em português com dados estruturados e insights acionáveis.', true);
