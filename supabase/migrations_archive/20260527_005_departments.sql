-- supabase/migrations/20260527_005_departments.sql
-- Sprint 2 — Chat Ao Vivo
-- Departamentos de atendimento + membros + FK em conversations

-- ─────────────────────────────────────────────
-- 1. departments
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.departments (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name        text        NOT NULL,
  description text,
  color       text        NOT NULL DEFAULT '#6B7280',
  is_active   boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name)
);

CREATE INDEX IF NOT EXISTS idx_departments_tenant
  ON public.departments (tenant_id, is_active);

ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON public.departments
  FOR ALL
  USING (
    tenant_id = (
      SELECT tenant_id FROM public.tenant_members
      WHERE user_id = auth.uid()
      LIMIT 1
    )
  );

COMMENT ON TABLE public.departments IS
  'Departamentos de atendimento. Complementam RBAC: RBAC define quem é a pessoa, departamento define onde a conversa está roteada.';

-- ─────────────────────────────────────────────
-- 2. department_members
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.department_members (
  department_id uuid        NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  user_id       uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  granted_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (department_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_department_members_user
  ON public.department_members (user_id);

ALTER TABLE public.department_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON public.department_members
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.departments d
      INNER JOIN public.tenant_members tm ON tm.tenant_id = d.tenant_id
      WHERE d.id = department_id
        AND tm.user_id = auth.uid()
    )
  );

COMMENT ON TABLE public.department_members IS
  'Membros de cada departamento. Uma pessoa pode pertencer a N departamentos independente do RBAC.';

-- ─────────────────────────────────────────────
-- 3. FK conversations → departments
-- ─────────────────────────────────────────────
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_conversations_department
  ON public.conversations (tenant_id, department_id);

COMMENT ON COLUMN public.conversations.department_id IS
  'Departamento atual da conversa. NULL = sem departamento atribuído.';
