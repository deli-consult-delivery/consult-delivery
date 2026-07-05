-- Migration: 20260601_003_client_tasks.sql
-- Data: 2026-06-01
-- Autor: Wandson (via Claude Code)
-- Motivo: Criar tabela client_tasks para o módulo TarefasClientesScreen —
--         tarefas vinculadas a um cliente (customer) organizadas por fase da
--         consultoria (onboarding → renovacao). Separada da tabela tasks do Kanban
--         interno porque tem semântica distinta: lifecycle de cliente, não sprint
--         de equipe.
-- Risco: Baixo — tabela nova, não afeta nenhuma query existente.
-- Reversão: DROP TABLE IF EXISTS public.client_tasks;

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Tabela principal
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.client_tasks (
  id           uuid        DEFAULT gen_random_uuid(),
  tenant_id    uuid        NOT NULL,
  customer_id  uuid        NOT NULL,
  phase_id     text        NOT NULL CHECK (phase_id IN (
    'onboarding',
    'levantamento',
    'diagnostico',
    'planejamento',
    'implantacao',
    'treinamento',
    'acompanhamento',
    'revisao',
    'avaliacoes',
    'renovacao'
  )),
  title        text        NOT NULL,
  description  text        NOT NULL DEFAULT '',
  status       text        NOT NULL DEFAULT 'todo' CHECK (status IN (
    'todo',
    'doing',
    'waiting',
    'blocked',
    'canceled',
    'done'
  )),
  priority     text        NOT NULL DEFAULT 'normal' CHECK (priority IN (
    'urgent',
    'high',
    'normal',
    'low'
  )),
  due_date     date,
  agent_id     text,
  -- slug do agente responsável (ex: 'deli', 'lara'). NULL = tarefa manual.
  assignee_id  uuid,
  position     integer     NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT client_tasks_pkey         PRIMARY KEY (id),
  CONSTRAINT client_tasks_tenant_fkey  FOREIGN KEY (tenant_id)   REFERENCES public.tenants(id)   ON DELETE CASCADE,
  CONSTRAINT client_tasks_customer_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE,
  CONSTRAINT client_tasks_assignee_fkey FOREIGN KEY (assignee_id) REFERENCES public.profiles(id)  ON DELETE SET NULL
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Comentários nas colunas importantes
-- ─────────────────────────────────────────────────────────────────────────────

COMMENT ON TABLE public.client_tasks IS
  'Tarefas do ciclo de vida de um cliente (customer) organizadas por fase da consultoria. '
  'Distintas das tasks do Kanban interno (que são sprints de equipe).';

COMMENT ON COLUMN public.client_tasks.phase_id IS
  'Fase da consultoria a que esta tarefa pertence. '
  'Enum: onboarding | levantamento | diagnostico | planejamento | implantacao | '
  'treinamento | acompanhamento | revisao | avaliacoes | renovacao.';

COMMENT ON COLUMN public.client_tasks.status IS
  'Estado da tarefa: todo | doing | waiting | blocked | canceled | done.';

COMMENT ON COLUMN public.client_tasks.priority IS
  'Prioridade: urgent | high | normal | low.';

COMMENT ON COLUMN public.client_tasks.agent_id IS
  'Slug do agente IA responsável (ex: deli, lara). NULL = tarefa manual / humano.';

COMMENT ON COLUMN public.client_tasks.assignee_id IS
  'Membro da equipe responsável pela execução. FK para profiles(id). '
  'Permite JOIN com alias: profiles!client_tasks_assignee_fkey(id, full_name, avatar_url).';

COMMENT ON COLUMN public.client_tasks.position IS
  'Ordem de exibição dentro de (customer_id, phase_id). Menor = topo da lista.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Índices para as queries do TarefasClientesScreen
-- ─────────────────────────────────────────────────────────────────────────────

-- Query principal: .eq('tenant_id').eq('customer_id').order('position')
CREATE INDEX IF NOT EXISTS idx_client_tasks_tenant_customer_position
  ON public.client_tasks (tenant_id, customer_id, position ASC);

-- Filtro opcional por fase: .eq('phase_id')
CREATE INDEX IF NOT EXISTS idx_client_tasks_customer_phase_position
  ON public.client_tasks (customer_id, phase_id, position ASC);

-- Consultas por assignee (painel de tarefas do colaborador)
CREATE INDEX IF NOT EXISTS idx_client_tasks_assignee
  ON public.client_tasks (assignee_id)
  WHERE assignee_id IS NOT NULL;

-- Consultas por status (ex: todas as tarefas abertas de um tenant)
CREATE INDEX IF NOT EXISTS idx_client_tasks_tenant_status
  ON public.client_tasks (tenant_id, status)
  WHERE status NOT IN ('done', 'canceled');

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Trigger updated_at — usa a função public.set_updated_at() já existente
--    (criada em 20260505_001_internal_notifications.sql)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TRIGGER trg_client_tasks_updated_at
  BEFORE UPDATE ON public.client_tasks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. RLS — Row Level Security
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.client_tasks ENABLE ROW LEVEL SECURITY;

-- Membros autenticados do tenant têm CRUD completo sobre as tarefas do tenant.
-- Padrão idêntico ao usado em lead_tags e outras tabelas do projeto.
CREATE POLICY client_tasks_tenant_isolation
  ON public.client_tasks
  FOR ALL
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_members
      WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_members
      WHERE user_id = auth.uid()
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Realtime (habilita diff de linhas para Supabase Realtime)
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.client_tasks REPLICA IDENTITY FULL;

COMMIT;
