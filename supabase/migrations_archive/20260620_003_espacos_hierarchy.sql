-- Migration: 20260620_003_espacos_hierarchy.sql
-- Data: 2026-06-17
-- Autor: Wandson (via Claude Code)
-- Motivo: Reformular o módulo ESPAÇOS para modelo estilo ClickUp, totalmente
--         customizável por cliente: Pasta (espacos_folders) → Lista
--         (espacos_lists) → Colunas (espacos_columns) → Tarefa (client_tasks).
--         Substitui o modelo antigo de 10 fases fixas (phase_id) + 6 status fixos.
-- Risco: Baixo — aditivo/reversível. As 15 tarefas reais da Planet Pizza são
--         preservadas e religadas à nova hierarquia. Nenhuma linha apagada.
--         phase_id/status NÃO são dropadas (só relaxadas) — cleanup futuro.
--
-- Reversão:
--   ALTER TABLE public.client_tasks DROP COLUMN IF EXISTS column_id;
--   ALTER TABLE public.client_tasks DROP COLUMN IF EXISTS list_id;
--   DROP TABLE IF EXISTS public.espacos_columns;
--   DROP TABLE IF EXISTS public.espacos_lists;
--   DROP TABLE IF EXISTS public.espacos_folders;
--   ALTER TABLE public.client_tasks ALTER COLUMN phase_id SET NOT NULL;
--   -- (re-adicionar o CHECK de phase_id se necessário)

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. espacos_folders — Pasta (raiz da hierarquia, pode pertencer a um cliente)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.espacos_folders (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid        NOT NULL REFERENCES public.tenants(id)   ON DELETE CASCADE,
  customer_id uuid                 REFERENCES public.customers(id) ON DELETE CASCADE,
  name        text        NOT NULL,
  color       text        NOT NULL DEFAULT '#B70C00',
  icon        text,
  position    integer     NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_espacos_folders_tenant_position
  ON public.espacos_folders (tenant_id, position ASC);
CREATE INDEX IF NOT EXISTS idx_espacos_folders_customer
  ON public.espacos_folders (customer_id);

ALTER TABLE public.espacos_folders ENABLE ROW LEVEL SECURITY;

CREATE POLICY espacos_folders_tenant_isolation
  ON public.espacos_folders
  FOR ALL
  TO authenticated
  USING (
    tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid())
  )
  WITH CHECK (
    tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid())
  );

CREATE TRIGGER trg_espacos_folders_updated_at
  BEFORE UPDATE ON public.espacos_folders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.espacos_folders REPLICA IDENTITY FULL;

COMMENT ON TABLE public.espacos_folders IS
  'Pasta do módulo ESPAÇOS (estilo ClickUp). Pode pertencer a um cliente (customer_id) ou ser global (NULL).';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. espacos_lists — Lista (dentro de uma pasta)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.espacos_lists (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid        NOT NULL REFERENCES public.tenants(id)         ON DELETE CASCADE,
  folder_id   uuid        NOT NULL REFERENCES public.espacos_folders(id) ON DELETE CASCADE,
  name        text        NOT NULL,
  color       text        NOT NULL DEFAULT '#6B7280',
  position    integer     NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_espacos_lists_folder_position
  ON public.espacos_lists (folder_id, position ASC);

ALTER TABLE public.espacos_lists ENABLE ROW LEVEL SECURITY;

CREATE POLICY espacos_lists_tenant_isolation
  ON public.espacos_lists
  FOR ALL
  TO authenticated
  USING (
    tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid())
  )
  WITH CHECK (
    tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid())
  );

CREATE TRIGGER trg_espacos_lists_updated_at
  BEFORE UPDATE ON public.espacos_lists
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.espacos_lists REPLICA IDENTITY FULL;

COMMENT ON TABLE public.espacos_lists IS
  'Lista de tarefas dentro de uma pasta ESPAÇOS. As tarefas (client_tasks) referenciam list_id.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. espacos_columns — Coluna (status customizável dentro de uma lista)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.espacos_columns (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid        NOT NULL REFERENCES public.tenants(id)       ON DELETE CASCADE,
  list_id     uuid        NOT NULL REFERENCES public.espacos_lists(id) ON DELETE CASCADE,
  name        text        NOT NULL,
  color       text        NOT NULL DEFAULT '#6B7280',
  position    integer     NOT NULL DEFAULT 0,
  is_done     boolean     NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_espacos_columns_list_position
  ON public.espacos_columns (list_id, position ASC);

ALTER TABLE public.espacos_columns ENABLE ROW LEVEL SECURITY;

CREATE POLICY espacos_columns_tenant_isolation
  ON public.espacos_columns
  FOR ALL
  TO authenticated
  USING (
    tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid())
  )
  WITH CHECK (
    tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid())
  );

CREATE TRIGGER trg_espacos_columns_updated_at
  BEFORE UPDATE ON public.espacos_columns
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.espacos_columns REPLICA IDENTITY FULL;

COMMENT ON TABLE public.espacos_columns IS
  'Coluna (status customizável) de uma lista ESPAÇOS. is_done=true marca a coluna de conclusão.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Estender client_tasks (aditivo) — religar tarefas à nova hierarquia
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.client_tasks
  ADD COLUMN IF NOT EXISTS list_id   uuid REFERENCES public.espacos_lists(id)   ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS column_id uuid REFERENCES public.espacos_columns(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_client_tasks_list_position
  ON public.client_tasks (list_id, position ASC);
CREATE INDEX IF NOT EXISTS idx_client_tasks_column_position
  ON public.client_tasks (column_id, position ASC);

-- Relaxar constraints do modelo antigo (reversível, não perde dados)
ALTER TABLE public.client_tasks DROP CONSTRAINT IF EXISTS client_tasks_phase_id_check;
ALTER TABLE public.client_tasks ALTER COLUMN phase_id DROP NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Migração de dados — criar 1 pasta/lista/colunas para a Planet Pizza
--    e religar as 15 tarefas existentes (sem hardcodar UUIDs gerados)
-- ─────────────────────────────────────────────────────────────────────────────
WITH novo_folder AS (
  INSERT INTO public.espacos_folders (tenant_id, customer_id, name, color, position)
  SELECT
    '9079bd4d-4df7-4023-90fb-d79c8ba7e900'::uuid,
    'a76f17a9-c87b-4ee8-bc5f-08fde8952a81'::uuid,
    'Planet Pizza',
    '#B70C00',
    0
  WHERE NOT EXISTS (
    SELECT 1 FROM public.espacos_folders
    WHERE tenant_id = '9079bd4d-4df7-4023-90fb-d79c8ba7e900'::uuid
      AND customer_id = 'a76f17a9-c87b-4ee8-bc5f-08fde8952a81'::uuid
  )
  RETURNING id, tenant_id
),
nova_lista AS (
  INSERT INTO public.espacos_lists (tenant_id, folder_id, name, color, position)
  SELECT tenant_id, id, 'Tarefas', '#6B7280', 0
  FROM novo_folder
  RETURNING id, tenant_id
),
novas_colunas AS (
  INSERT INTO public.espacos_columns (tenant_id, list_id, name, color, position, is_done)
  SELECT nl.tenant_id, nl.id, c.name, c.color, c.position, c.is_done
  FROM nova_lista nl
  CROSS JOIN (VALUES
    ('A Fazer',    '#6B7280', 0, false),
    ('Fazendo',    '#3B82F6', 1, false),
    ('Aguardando', '#F59E0B', 2, false),
    ('Bloqueado',  '#EF4444', 3, false),
    ('Cancelado',  '#9CA3AF', 4, false),
    ('Concluído',  '#10B981', 5, true)
  ) AS c(name, color, position, is_done)
  RETURNING id, list_id, name
),
lista_alvo AS (
  SELECT id FROM nova_lista
)
UPDATE public.client_tasks ct
SET
  list_id   = (SELECT id FROM lista_alvo),
  column_id = (
    SELECT nc.id FROM novas_colunas nc
    WHERE nc.name = CASE ct.status
      WHEN 'todo'     THEN 'A Fazer'
      WHEN 'doing'    THEN 'Fazendo'
      WHEN 'waiting'  THEN 'Aguardando'
      WHEN 'blocked'  THEN 'Bloqueado'
      WHEN 'canceled' THEN 'Cancelado'
      WHEN 'done'     THEN 'Concluído'
      ELSE 'A Fazer'
    END
    LIMIT 1
  )
WHERE ct.tenant_id  = '9079bd4d-4df7-4023-90fb-d79c8ba7e900'::uuid
  AND ct.customer_id = 'a76f17a9-c87b-4ee8-bc5f-08fde8952a81'::uuid
  AND ct.list_id IS NULL
  AND EXISTS (SELECT 1 FROM lista_alvo);

COMMIT;
