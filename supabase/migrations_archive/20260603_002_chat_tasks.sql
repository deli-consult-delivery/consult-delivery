-- Tabela de tarefas operacionais do Chat ao Vivo
-- Uso: equipe lança/acompanha tarefas diretamente do painel Chat (ex: chamados, follow-ups)
-- Separada de `tasks` (Kanban app) e `client_tasks` (lifecycle de cliente) — sem FK obrigatório
-- Reversão: DROP TABLE public.chat_tasks;

CREATE TABLE public.chat_tasks (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  title        text        NOT NULL,
  description  text        DEFAULT '',
  status       text        NOT NULL DEFAULT 'todo'
                           CHECK (status IN ('todo','doing','waiting','done','canceled')),
  priority     text        NOT NULL DEFAULT 'normal'
                           CHECK (priority IN ('urgent','high','normal','low')),
  assignee_id  uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  contact_name text,
  due_date     date,
  created_by   uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.chat_tasks ENABLE ROW LEVEL SECURITY;

-- Qualquer membro do tenant pode criar, ler, atualizar e deletar tarefas do tenant
CREATE POLICY "chat_tasks_tenant_isolation" ON public.chat_tasks
  USING (
    EXISTS (
      SELECT 1 FROM public.tenant_members tm
      WHERE tm.tenant_id = chat_tasks.tenant_id AND tm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.tenant_members tm
      WHERE tm.tenant_id = chat_tasks.tenant_id AND tm.user_id = auth.uid()
    )
  );

CREATE INDEX idx_chat_tasks_tenant_status ON public.chat_tasks(tenant_id, status);
CREATE INDEX idx_chat_tasks_assignee ON public.chat_tasks(assignee_id) WHERE assignee_id IS NOT NULL;