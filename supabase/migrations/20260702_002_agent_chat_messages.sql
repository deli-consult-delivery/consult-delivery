-- 20260702_002_agent_chat_messages.sql
-- Histórico de conversa genérico por agente (F0 do GESTOR, mas reutilizável por
-- qualquer especialista com chat próprio no Console).
--
-- Por que uma tabela nova em vez de reusar deli_messages (20260514_011): trigger/deli/conversa.ts
-- lê deli_messages sem filtro de agent_id — é o histórico exclusivo da DELI. Reusar aqui
-- misturaria conversas de agentes diferentes na mesma consulta sem quebrar nada visivelmente,
-- um bug silencioso. agent_chat_messages é agent_id-aware desde a coluna.

CREATE TABLE IF NOT EXISTS public.agent_chat_messages (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  agent_id    text        NOT NULL REFERENCES public.agents(id),
  user_id     uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  loja_id     uuid        REFERENCES public.lojas(id) ON DELETE SET NULL,
  role        text        NOT NULL CHECK (role IN ('user', 'assistant')),
  content     text        NOT NULL,
  metadata    jsonb       DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.agent_chat_messages IS
  'Histórico de conversas humano ↔ agente, genérico por agent_id (ex.: GESTOR). Append-only.';

CREATE INDEX IF NOT EXISTS agent_chat_messages_tenant_agent_loja_idx
  ON public.agent_chat_messages (tenant_id, agent_id, loja_id, created_at);

ALTER TABLE public.agent_chat_messages ENABLE ROW LEVEL SECURITY;

-- Membros do tenant vêem/inserem as próprias mensagens
CREATE POLICY "tenant_members_select_agent_chat_messages"
  ON public.agent_chat_messages FOR SELECT
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "tenant_members_insert_agent_chat_messages"
  ON public.agent_chat_messages FOR INSERT
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid()
    )
  );

-- Service role (tasks Trigger.dev) tem acesso total
CREATE POLICY "service_role_manage_agent_chat_messages"
  ON public.agent_chat_messages FOR ALL
  USING (auth.role() = 'service_role');

-- Realtime — espelha 20260626_001 (agent_drafts): REPLICA IDENTITY FULL para que
-- UPDATEs carreguem o valor anterior da linha, e garante a tabela na publication.
ALTER TABLE public.agent_chat_messages REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'agent_chat_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_chat_messages;
  END IF;
END$$;
