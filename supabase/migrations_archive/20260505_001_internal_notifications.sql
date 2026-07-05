-- supabase/migrations/20260505_001_internal_notifications.sql
-- Notificações internas para a equipe (sino do Topbar)
-- Etapa 1G — Agente B

CREATE TABLE IF NOT EXISTS public.internal_notifications (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  recipient_user_id   uuid        REFERENCES auth.users(id) ON DELETE CASCADE,
  -- NULL = broadcast para todos os membros do tenant
  kind                text        NOT NULL CHECK (kind IN (
    'agent_invoked',
    'agent_completed',
    'agent_failed',
    'draft_pending',
    'draft_approved',
    'draft_rejected',
    'deli_proposal',
    'deli_alert',
    'system'
  )),
  agent               text,
  -- 'deli', 'analista-ifood', 'cora', etc — null para notificações de sistema
  title               text        NOT NULL,
  body                text,
  link                text,
  -- rota interna ex: '/agents/deli' ou '/drafts/<id>'
  metadata            jsonb       NOT NULL DEFAULT '{}'::jsonb,
  read_at             timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.internal_notifications IS
  'Notificações internas para a equipe (sino do Topbar). Distintas dos drafts (que são p/ cliente).';
COMMENT ON COLUMN public.internal_notifications.recipient_user_id IS
  'NULL = broadcast para todos os membros do tenant.';
COMMENT ON COLUMN public.internal_notifications.kind IS
  'Categoria semântica — controla ícone/cor no frontend.';
COMMENT ON COLUMN public.internal_notifications.agent IS
  'Nome do agente que gerou a notificação. NULL para notificações de sistema.';

CREATE INDEX idx_internal_notifications_recipient_unread
  ON public.internal_notifications (tenant_id, recipient_user_id, created_at DESC)
  WHERE read_at IS NULL;

CREATE INDEX idx_internal_notifications_tenant_created
  ON public.internal_notifications (tenant_id, created_at DESC);

-- Função updated_at (criada aqui pois não existia antes)
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_internal_notifications_updated_at
  BEFORE UPDATE ON public.internal_notifications
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS
ALTER TABLE public.internal_notifications ENABLE ROW LEVEL SECURITY;

-- SELECT: usuário vê suas próprias OU broadcasts do tenant que pertence
CREATE POLICY internal_notifications_select
  ON public.internal_notifications FOR SELECT
  USING (
    (recipient_user_id = auth.uid())
    OR (
      recipient_user_id IS NULL
      AND tenant_id IN (
        SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid()
      )
    )
  );

-- UPDATE: só o destinatário direto marca read_at
CREATE POLICY internal_notifications_update_own
  ON public.internal_notifications FOR UPDATE
  USING  (recipient_user_id = auth.uid())
  WITH CHECK (recipient_user_id = auth.uid());

-- INSERT: sem policy → bloqueado para anon/authenticated por RLS
-- Service role (Bridge Server usa SUPABASE_SERVICE_ROLE_KEY) bypassa RLS automaticamente

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.internal_notifications;
