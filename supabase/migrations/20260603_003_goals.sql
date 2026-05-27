-- supabase/migrations/20260603_003_goals.sql
-- Sprint 2 — Goals/OKR cascade: missions → projects → goals → goal_tasks

-- ─────────────────────────────────────────────
-- 1. missions — top-level company purpose
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.missions (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  title       TEXT        NOT NULL,
  description TEXT,
  due_date    DATE,
  status      TEXT        NOT NULL DEFAULT 'active' CHECK (status IN ('active','achieved','on_hold','cancelled')),
  created_by  UUID        REFERENCES auth.users(id),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_missions_tenant ON public.missions(tenant_id);

ALTER TABLE public.missions ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON public.missions
  FOR ALL
  USING (
    tenant_id = (
      SELECT tenant_id FROM public.tenant_members
      WHERE user_id = auth.uid()
      LIMIT 1
    )
  );

-- ─────────────────────────────────────────────
-- 2. projects — groups work under a mission
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.projects (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  mission_id  UUID        REFERENCES public.missions(id) ON DELETE SET NULL,
  title       TEXT        NOT NULL,
  description TEXT,
  status      TEXT        NOT NULL DEFAULT 'active' CHECK (status IN ('active','on_hold','completed','cancelled')),
  created_by  UUID        REFERENCES auth.users(id),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_projects_tenant  ON public.projects(tenant_id);
CREATE INDEX IF NOT EXISTS idx_projects_mission ON public.projects(mission_id);

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON public.projects
  FOR ALL
  USING (
    tenant_id = (
      SELECT tenant_id FROM public.tenant_members
      WHERE user_id = auth.uid()
      LIMIT 1
    )
  );

-- ─────────────────────────────────────────────
-- 3. goals — measurable target within a project
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.goals (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  project_id    UUID        REFERENCES public.projects(id) ON DELETE SET NULL,
  title         TEXT        NOT NULL,
  description   TEXT,
  metric_type   TEXT        NOT NULL DEFAULT 'count' CHECK (metric_type IN ('count','currency','percentage','boolean')),
  target_value  NUMERIC     NOT NULL DEFAULT 1,
  current_value NUMERIC     NOT NULL DEFAULT 0,
  due_date      DATE,
  status        TEXT        NOT NULL DEFAULT 'active' CHECK (status IN ('active','achieved','on_hold','cancelled')),
  created_by    UUID        REFERENCES auth.users(id),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_goals_tenant  ON public.goals(tenant_id);
CREATE INDEX IF NOT EXISTS idx_goals_project ON public.goals(project_id);

ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON public.goals
  FOR ALL
  USING (
    tenant_id = (
      SELECT tenant_id FROM public.tenant_members
      WHERE user_id = auth.uid()
      LIMIT 1
    )
  );

-- ─────────────────────────────────────────────
-- 4. goal_tasks — unit of work linked to a goal
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.goal_tasks (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  goal_id        UUID        REFERENCES public.goals(id) ON DELETE SET NULL,
  title          TEXT        NOT NULL,
  description    TEXT,
  status         TEXT        NOT NULL DEFAULT 'todo' CHECK (status IN ('todo','in_progress','done','cancelled')),
  priority       TEXT        NOT NULL DEFAULT 'medium' CHECK (priority IN ('urgent','high','medium','low')),
  assignee_agent TEXT,
  due_date       DATE,
  created_by     UUID        REFERENCES auth.users(id),
  completed_at   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_goal_tasks_tenant ON public.goal_tasks(tenant_id);
CREATE INDEX IF NOT EXISTS idx_goal_tasks_goal   ON public.goal_tasks(goal_id);

ALTER TABLE public.goal_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON public.goal_tasks
  FOR ALL
  USING (
    tenant_id = (
      SELECT tenant_id FROM public.tenant_members
      WHERE user_id = auth.uid()
      LIMIT 1
    )
  );

-- ─────────────────────────────────────────────
-- 5. Trigger: task done → increment goal progress
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_task_done_updates_goal()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'done' AND OLD.status != 'done' AND NEW.goal_id IS NOT NULL THEN
    UPDATE public.goals
    SET current_value = current_value + 1,
        updated_at = NOW()
    WHERE id = NEW.goal_id;

    UPDATE public.goals
    SET status = 'achieved', updated_at = NOW()
    WHERE id = NEW.goal_id AND current_value >= target_value AND status = 'active';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_task_done_updates_goal
AFTER UPDATE OF status ON public.goal_tasks
FOR EACH ROW EXECUTE FUNCTION fn_task_done_updates_goal();

COMMENT ON TABLE public.missions   IS 'Sprint 2 — Goals cascade: missions (top-level purpose per tenant).';
COMMENT ON TABLE public.projects   IS 'Sprint 2 — Goals cascade: projects group work under a mission.';
COMMENT ON TABLE public.goals      IS 'Sprint 2 — Goals cascade: measurable targets within a project.';
COMMENT ON TABLE public.goal_tasks IS 'Sprint 2 — Goals cascade: units of work linked to a goal; completing a task auto-increments goal progress.';
