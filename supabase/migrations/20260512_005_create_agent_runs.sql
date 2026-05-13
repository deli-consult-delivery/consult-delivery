-- Fase 0 | Tarefa 3.5
-- Log imutável de todas as execuções de agentes (audit + custo + duração)

CREATE TABLE IF NOT EXISTS agent_runs (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid        REFERENCES tenants(id) ON DELETE SET NULL,
  agent_slug          text        REFERENCES agents(slug) ON DELETE SET NULL,
  triggered_by        uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  trigger_dev_run_id  text        UNIQUE,
  status              text        NOT NULL DEFAULT 'queued'
                                  CHECK (status IN ('queued', 'running', 'success', 'failed')),
  input               jsonb,
  output              jsonb,
  cost_usd            numeric(10,4),
  duration_ms         integer,
  created_at          timestamptz NOT NULL DEFAULT now(),
  completed_at        timestamptz
);

COMMENT ON TABLE agent_runs IS 'Audit log de execuções. Nunca deletar — append-only por convenção.';
COMMENT ON COLUMN agent_runs.trigger_dev_run_id IS 'ID do run no Trigger.dev cloud (para cross-reference no dashboard).';

-- Índices para queries comuns
CREATE INDEX IF NOT EXISTS agent_runs_tenant_id_idx    ON agent_runs (tenant_id);
CREATE INDEX IF NOT EXISTS agent_runs_agent_slug_idx   ON agent_runs (agent_slug);
CREATE INDEX IF NOT EXISTS agent_runs_triggered_by_idx ON agent_runs (triggered_by);
CREATE INDEX IF NOT EXISTS agent_runs_created_at_idx   ON agent_runs (created_at DESC);

-- RLS: cada tenant vê só seus próprios runs
ALTER TABLE agent_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_members_view_own_runs"
  ON agent_runs
  FOR SELECT
  USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid()
    )
  );

-- Service role (Bridge Server / Trigger.dev tasks) pode inserir/atualizar sem restrição
CREATE POLICY "service_role_manage_runs"
  ON agent_runs
  FOR ALL
  USING (auth.role() = 'service_role');
