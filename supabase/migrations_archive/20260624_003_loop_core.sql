-- Migration: 20260624_003_loop_core.sql
-- Data: 2026-06-24
-- Autor: Claude Code (sessão AI-First FASE 1)
-- Motivo: Cabear o loop ponta-a-ponta AI-First:
--   conversations → recebe loop_status + ponteiro active_task_id + attending_agent_id
--   client_tasks  → recebe conversation_id + loop_state + target_system + execution_run_id
--                   + execution_result + proposal_id
-- Risco: Baixo — aditivo, IF NOT EXISTS em todas as colunas.
-- Reversão:
--   ALTER TABLE public.conversations DROP COLUMN IF EXISTS loop_status;
--   ALTER TABLE public.conversations DROP COLUMN IF EXISTS active_task_id;
--   ALTER TABLE public.conversations DROP COLUMN IF EXISTS attending_agent_id;
--   ALTER TABLE public.client_tasks  DROP COLUMN IF EXISTS conversation_id;
--   ALTER TABLE public.client_tasks  DROP COLUMN IF EXISTS loop_state;
--   ALTER TABLE public.client_tasks  DROP COLUMN IF EXISTS target_system;
--   ALTER TABLE public.client_tasks  DROP COLUMN IF EXISTS execution_run_id;
--   ALTER TABLE public.client_tasks  DROP COLUMN IF EXISTS execution_result;
--   ALTER TABLE public.client_tasks  DROP COLUMN IF EXISTS proposal_id;

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. conversations — estado do loop de atendimento
-- ─────────────────────────────────────────────────────────────────────────────
-- Máquina de estados:
--   attending   → especialista atendendo (resposta rápida)
--   task_pending → tarefa criada, aguardando execução
--   replied     → resposta enviada/aprovada ao cliente
-- Não substitui status_v2 (ENUM do chat): coexistem para propósitos distintos.

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS loop_status        text
    CHECK (loop_status IN ('attending', 'task_pending', 'replied')),
  ADD COLUMN IF NOT EXISTS active_task_id     uuid
    REFERENCES public.client_tasks(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS attending_agent_id text;

COMMENT ON COLUMN public.conversations.loop_status IS
  'Estado do loop AI-First. NULL = nenhum agente no loop. '
  'attending = especialista atendendo agora; task_pending = tarefa aberta para execução; '
  'replied = resposta enviada ao cliente.';

COMMENT ON COLUMN public.conversations.active_task_id IS
  'Tarefa client_tasks aberta atualmente para esta conversa no loop AI-First.';

COMMENT ON COLUMN public.conversations.attending_agent_id IS
  'Slug do agente atendendo a conversa (ex: breno, cora). NULL quando sem loop ativo.';

-- Índice para buscar conversas com loop ativo
CREATE INDEX IF NOT EXISTS idx_conversations_loop_status_tenant
  ON public.conversations (tenant_id, loop_status)
  WHERE loop_status IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. client_tasks — execução do loop
-- ─────────────────────────────────────────────────────────────────────────────
-- loop_state:
--   open      → tarefa criada, aguardando execução
--   executing → agente executando no sistema externo
--   done      → execução concluída (resultado em execution_result)

ALTER TABLE public.client_tasks
  ADD COLUMN IF NOT EXISTS conversation_id  uuid
    REFERENCES public.conversations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS loop_state       text
    CHECK (loop_state IN ('open', 'executing', 'done')),
  ADD COLUMN IF NOT EXISTS target_system    text
    CHECK (target_system IN ('vendaerp', 'asaas', 'nenhum')),
  ADD COLUMN IF NOT EXISTS execution_run_id text,
  ADD COLUMN IF NOT EXISTS execution_result jsonb,
  ADD COLUMN IF NOT EXISTS proposal_id      uuid
    REFERENCES public.vendaerp_proposals(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.client_tasks.conversation_id IS
  'Conversa WhatsApp que originou esta tarefa no loop AI-First.';

COMMENT ON COLUMN public.client_tasks.loop_state IS
  'Estado de execução no loop: open | executing | done.';

COMMENT ON COLUMN public.client_tasks.target_system IS
  'Sistema externo alvo da execução: vendaerp | asaas | nenhum.';

COMMENT ON COLUMN public.client_tasks.execution_run_id IS
  'ID do run Trigger.dev que executou esta tarefa (rastreabilidade).';

COMMENT ON COLUMN public.client_tasks.execution_result IS
  'Resultado da execução no sistema externo (JSON bruto).';

COMMENT ON COLUMN public.client_tasks.proposal_id IS
  'Proposta VendaERP associada (gated write). FK → vendaerp_proposals.';

-- Índice para buscar tarefas abertas no loop
CREATE INDEX IF NOT EXISTS idx_client_tasks_loop_state_tenant
  ON public.client_tasks (tenant_id, loop_state)
  WHERE loop_state IN ('open', 'executing');

COMMIT;
