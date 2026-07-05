-- supabase/migrations/20260520_003_conversation_events.sql
-- Sprint 1 — Chat Ao Vivo
-- Tabela base de eventos do sistema para a timeline da conversa

-- ─────────────────────────────────────────────
-- 1. Tabela conversation_events
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.conversation_events (
  id              bigint        GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id       uuid          NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  conversation_id uuid          NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  event_type      text          NOT NULL CHECK (event_type IN (
    'created',
    'assigned',
    'unassigned',
    'transferred',
    'tagged',
    'untagged',
    'closed',
    'reopened',
    'note_added',
    'automation_executed'
  )),
  actor_id        uuid          REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_type      text          NOT NULL DEFAULT 'user' CHECK (actor_type IN ('user', 'agent', 'system')),
  actor_name      text,
  -- actor_name desnormalizado para preservar identidade mesmo se user deletado
  metadata        jsonb         NOT NULL DEFAULT '{}',
  ts              timestamptz   NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────
-- 2. Índices
-- ─────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_conversation_events_conv_ts
  ON public.conversation_events (conversation_id, ts DESC);

CREATE INDEX IF NOT EXISTS idx_conversation_events_tenant_ts
  ON public.conversation_events (tenant_id, ts DESC);

-- ─────────────────────────────────────────────
-- 3. RLS
-- ─────────────────────────────────────────────
ALTER TABLE public.conversation_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON public.conversation_events
  FOR ALL
  USING (
    tenant_id = (
      SELECT tenant_id FROM public.tenant_members
      WHERE user_id = auth.uid()
      LIMIT 1
    )
  );

-- ─────────────────────────────────────────────
-- 4. Realtime
-- ─────────────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversation_events;

-- ─────────────────────────────────────────────
-- 5. Comentários
-- ─────────────────────────────────────────────
COMMENT ON TABLE public.conversation_events IS
  'Eventos do sistema na timeline da conversa (finalizou, transferiu, etc). Imutável — apenas INSERT.';
COMMENT ON COLUMN public.conversation_events.actor_name IS
  'Nome desnormalizado — preserva identidade mesmo após deleção do usuário.';
COMMENT ON COLUMN public.conversation_events.metadata IS
  'Dados extras por tipo: ex: {dept_from, dept_to} para transferred, {tag_name} para tagged.';
