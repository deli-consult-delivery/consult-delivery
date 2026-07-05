-- supabase/migrations/20260603_002_heartbeat_runs.sql
-- Sprint 1 — Heartbeats: histórico de execuções

-- ─────────────────────────────────────────────
-- 1. heartbeat_runs (log de execuções)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.heartbeat_runs (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  heartbeat_id    uuid        NOT NULL REFERENCES public.heartbeats(id) ON DELETE CASCADE,
  tenant_id       uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  status          text        NOT NULL DEFAULT 'running'
                    CHECK (status IN ('running', 'success', 'failed', 'skipped')),
  trigger_type    text        NOT NULL DEFAULT 'interval'
                    CHECK (trigger_type IN ('interval', 'manual')),
  prompt_used     text,
  output          text,
  action_taken    boolean     NOT NULL DEFAULT false,
  action_summary  text,
  error_message   text,
  tokens_used     integer,
  cost_usd        numeric(10,6),
  duration_ms     integer,
  execution_mode  text,
  started_at      timestamptz NOT NULL DEFAULT now(),
  finished_at     timestamptz
);

CREATE INDEX IF NOT EXISTS idx_heartbeat_runs_heartbeat
  ON public.heartbeat_runs (heartbeat_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_heartbeat_runs_tenant
  ON public.heartbeat_runs (tenant_id, started_at DESC);

ALTER TABLE public.heartbeat_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON public.heartbeat_runs
  FOR ALL
  USING (
    tenant_id = (
      SELECT tenant_id FROM public.tenant_members
      WHERE user_id = auth.uid()
      LIMIT 1
    )
  );

COMMENT ON TABLE public.heartbeat_runs IS
  'Log imutável de cada execução de heartbeat. Guarda output completo, custo e se ação foi tomada.';
