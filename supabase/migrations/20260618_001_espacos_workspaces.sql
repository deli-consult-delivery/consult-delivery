-- Migration: Workspaces (Espaços de Trabalho) + workspace_id em folders
-- Adição pura — não altera colunas existentes, não apaga dados.
-- Reversão: ver comentário no final.

-- Tabela de Workspaces ─────────────────────────────────────────────────────
CREATE TABLE public.espacos_workspaces (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name        text        NOT NULL,
  color       text        NOT NULL DEFAULT '#B70C00',
  icon        text,
  position    integer     NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_espacos_workspaces_tenant_position
  ON public.espacos_workspaces (tenant_id, position ASC);

-- RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE public.espacos_workspaces ENABLE ROW LEVEL SECURITY;

CREATE POLICY espacos_workspaces_tenant_isolation ON public.espacos_workspaces
  FOR ALL USING (
    tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid())
  )
  WITH CHECK (
    tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid())
  );

-- Trigger updated_at ───────────────────────────────────────────────────────
CREATE TRIGGER set_updated_at_espacos_workspaces
  BEFORE UPDATE ON public.espacos_workspaces
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Adicionar workspace_id em espacos_folders ────────────────────────────────
ALTER TABLE public.espacos_folders
  ADD COLUMN IF NOT EXISTS workspace_id uuid
    REFERENCES public.espacos_workspaces(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_espacos_folders_workspace
  ON public.espacos_folders (workspace_id);

-- Seed: workspace "Consultoria" + linkar folders existentes ────────────────
-- CTE sem UUID hardcoded — usa subquery para derivar tenant_id dos dados reais.
WITH ws AS (
  INSERT INTO public.espacos_workspaces (tenant_id, name, color, icon, position)
  SELECT tenant_id, 'Consultoria', '#B70C00', 'briefcase', 0
  FROM public.espacos_folders
  WHERE customer_id IS NOT NULL
  LIMIT 1
  RETURNING id, tenant_id
)
UPDATE public.espacos_folders f
SET workspace_id = ws.id
FROM ws
WHERE f.tenant_id = ws.tenant_id
  AND f.customer_id IS NOT NULL;

-- REVERSÃO (executar nesta ordem se precisar desfazer):
-- ALTER TABLE public.espacos_folders DROP COLUMN IF EXISTS workspace_id;
-- DROP TABLE IF EXISTS public.espacos_workspaces;
