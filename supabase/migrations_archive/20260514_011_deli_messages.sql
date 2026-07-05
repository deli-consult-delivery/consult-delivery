-- Fase 2 — DELI + Análise iFood
-- Histórico de conversação entre Wandson e DELI (COO Digital)
-- Cada linha é uma mensagem: role 'user' (Wandson) ou 'assistant' (DELI)

-- Garantir que deli existe no catálogo de agentes
INSERT INTO public.agents (id, name, role, letter, color, category, default_modo)
VALUES ('deli', 'DELI', 'COO Digital', 'D', '#B70C00', 'orchestrator', 'ia')
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.deli_messages (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid        REFERENCES public.tenants(id)    ON DELETE CASCADE,
  user_id     uuid        REFERENCES auth.users(id)         ON DELETE SET NULL,
  role        text        NOT NULL CHECK (role IN ('user', 'assistant')),
  content     text        NOT NULL,
  metadata    jsonb       DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.deli_messages IS
  'Histórico de conversas Wandson ↔ DELI. Nunca deletar — append-only.';

CREATE INDEX IF NOT EXISTS deli_messages_tenant_user_idx
  ON public.deli_messages (tenant_id, user_id, created_at);

ALTER TABLE public.deli_messages ENABLE ROW LEVEL SECURITY;

-- Membros do tenant vêem as próprias mensagens
CREATE POLICY "tenant_members_view_own_deli_messages"
  ON public.deli_messages FOR SELECT
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid()
    )
  );

-- Service role (tasks Trigger.dev) tem acesso total
CREATE POLICY "service_role_manage_deli_messages"
  ON public.deli_messages FOR ALL
  USING (auth.role() = 'service_role');
