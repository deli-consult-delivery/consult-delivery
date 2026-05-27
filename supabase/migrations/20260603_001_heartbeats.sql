-- supabase/migrations/20260603_001_heartbeats.sql
-- Sprint 1 — Heartbeats: agentes proativos agendados

-- ─────────────────────────────────────────────
-- 1. heartbeats (definições)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.heartbeats (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name              text        NOT NULL,
  description       text,
  agent_slug        text        NOT NULL,                -- 'deli', 'lara', 'vera', etc.
  prompt            text        NOT NULL,                -- prompt a executar quando disparar
  decision_prompt   text,                               -- se preenchido: se output contém SKIP, não age
  interval_seconds  integer     NOT NULL DEFAULT 3600,   -- frequência de execução
  enabled           boolean     NOT NULL DEFAULT false,
  wake_triggers     text[]      NOT NULL DEFAULT '{interval}', -- 'interval', 'manual'
  execution_mode    text        NOT NULL DEFAULT 'api'   CHECK (execution_mode IN ('api', 'claude_cli')),
  max_tokens        integer     NOT NULL DEFAULT 2048,
  timeout_seconds   integer     NOT NULL DEFAULT 120,
  last_run_at       timestamptz,
  next_run_at       timestamptz,
  run_count         integer     NOT NULL DEFAULT 0,
  created_by        uuid        REFERENCES auth.users(id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name)
);

CREATE INDEX IF NOT EXISTS idx_heartbeats_tenant
  ON public.heartbeats (tenant_id, enabled);

CREATE INDEX IF NOT EXISTS idx_heartbeats_next_run
  ON public.heartbeats (next_run_at, enabled)
  WHERE enabled = true;

ALTER TABLE public.heartbeats ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON public.heartbeats
  FOR ALL
  USING (
    tenant_id = (
      SELECT tenant_id FROM public.tenant_members
      WHERE user_id = auth.uid()
      LIMIT 1
    )
  );

COMMENT ON TABLE public.heartbeats IS
  'Heartbeats — agentes proativos agendados. Cada registro define um agente que acorda em intervalos, verifica estado e decide se age.';
