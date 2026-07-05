-- Migration: Sistema de Status do Chat ao Vivo
-- Adiciona: falha/archived ao CHECK, ENUM status_v2 estendido, colunas de auditoria,
--           conversation_status_log, push_subscriptions, notification_preferences
-- Date: 2026-05-08

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Estender ENUM status_v2 com novos valores
--    (ALTER TYPE ADD VALUE não pode rodar dentro de transação explícita no PG)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TYPE public.conversation_status_v2 ADD VALUE IF NOT EXISTS 'automacao';
ALTER TYPE public.conversation_status_v2 ADD VALUE IF NOT EXISTS 'falha';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Expandir CHECK constraint de status para incluir 'falha' e 'archived'
-- ─────────────────────────────────────────────────────────────────────────────

-- Normaliza valores inválidos antes de recriar o constraint
UPDATE public.conversations
SET status = 'aguardando'
WHERE status IS NOT NULL
  AND status NOT IN (
    'aguardando','em_atendimento','atendimento_aberto',
    'automacao','finalizado','falha','archived'
  );

ALTER TABLE public.conversations
  DROP CONSTRAINT IF EXISTS conversations_status_check;

ALTER TABLE public.conversations
  ADD CONSTRAINT conversations_status_check
  CHECK (status IN (
    'aguardando',
    'em_atendimento',
    'atendimento_aberto',
    'automacao',
    'finalizado',
    'falha',
    'archived'
  ));

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Colunas de auditoria de status em conversations
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS previous_status      text,
  ADD COLUMN IF NOT EXISTS status_changed_at    timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS status_changed_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Tabela de log de transições de status (imutável, auditoria)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.conversation_status_log (
  id              BIGSERIAL PRIMARY KEY,
  tenant_id       uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  from_status     text,
  to_status       text NOT NULL,
  changed_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  trigger         text NOT NULL DEFAULT 'manual',
  metadata        jsonb DEFAULT '{}',
  ts              timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_conv_status_log_conv
  ON public.conversation_status_log(conversation_id, ts DESC);

CREATE INDEX IF NOT EXISTS idx_conv_status_log_tenant
  ON public.conversation_status_log(tenant_id, ts DESC);

ALTER TABLE public.conversation_status_log ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'conversation_status_log'
      AND policyname = 'tenant_isolation'
  ) THEN
    CREATE POLICY "tenant_isolation" ON public.conversation_status_log
      FOR ALL USING (
        tenant_id IN (
          SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Trigger: captura previous_status e loga toda mudança de status
--    (complementa fn_conversation_status_changed existente)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_log_conversation_status_change()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    NEW.previous_status   := OLD.status;
    NEW.status_changed_at := now();

    INSERT INTO public.conversation_status_log(
      tenant_id, conversation_id, from_status, to_status, changed_by, trigger
    ) VALUES (
      NEW.tenant_id,
      NEW.id,
      OLD.status,
      NEW.status,
      NEW.status_changed_by,
      'db_trigger'
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_conversation_status_change ON public.conversations;
CREATE TRIGGER trg_conversation_status_change
  BEFORE UPDATE ON public.conversations
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_log_conversation_status_change();

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Tabela push_subscriptions (Web Push por dispositivo/usuário)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id           BIGSERIAL PRIMARY KEY,
  tenant_id    uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint     text NOT NULL UNIQUE,
  p256dh       text NOT NULL,
  auth_key     text NOT NULL,
  user_agent   text,
  created_at   timestamptz DEFAULT now(),
  last_used_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_push_subs_user   ON public.push_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_push_subs_tenant ON public.push_subscriptions(tenant_id);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'push_subscriptions'
      AND policyname = 'user_own_subs'
  ) THEN
    CREATE POLICY "user_own_subs" ON public.push_subscriptions
      FOR ALL USING (user_id = auth.uid());
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Tabela notification_preferences (preferências por atendente)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notification_preferences (
  user_id                  uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  sound_enabled            boolean DEFAULT true,
  push_enabled             boolean DEFAULT true,
  notify_nao_iniciados     boolean DEFAULT true,
  notify_falha             boolean DEFAULT true,
  notify_cliente_respondeu boolean DEFAULT true,
  updated_at               timestamptz DEFAULT now()
);

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'notification_preferences'
      AND policyname = 'user_own_prefs'
  ) THEN
    CREATE POLICY "user_own_prefs" ON public.notification_preferences
      FOR ALL USING (user_id = auth.uid());
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. Comentários
-- ─────────────────────────────────────────────────────────────────────────────
COMMENT ON COLUMN public.conversations.previous_status   IS 'Status anterior (para Regra B: Falha → recupera status anterior)';
COMMENT ON COLUMN public.conversations.status_changed_at IS 'Timestamp da última mudança de status';
COMMENT ON COLUMN public.conversations.status_changed_by IS 'UUID do usuário que mudou o status (NULL = sistema/webhook)';
COMMENT ON TABLE  public.conversation_status_log         IS 'Log imutável de transições de status de conversa';
COMMENT ON TABLE  public.push_subscriptions              IS 'Subscriptions de Web Push por dispositivo/usuário';
COMMENT ON TABLE  public.notification_preferences        IS 'Preferências de notificação por atendente';
