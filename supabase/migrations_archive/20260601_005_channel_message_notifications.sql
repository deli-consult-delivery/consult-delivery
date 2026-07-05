-- supabase/migrations/20260601_005_channel_message_notifications.sql
-- Notificações automáticas quando uma mensagem é enviada em canal interno.
-- Trigger SECURITY DEFINER que insere uma notificação por membro do tenant
-- (excluindo o remetente) ao receber INSERT em channel_messages.

-- 1. Adicionar 'channel_message' ao CHECK constraint do kind
ALTER TABLE public.internal_notifications
  DROP CONSTRAINT IF EXISTS internal_notifications_kind_check;

ALTER TABLE public.internal_notifications
  ADD CONSTRAINT internal_notifications_kind_check CHECK (kind IN (
    'agent_invoked',
    'agent_completed',
    'agent_failed',
    'draft_pending',
    'draft_approved',
    'draft_rejected',
    'deli_proposal',
    'deli_alert',
    'system',
    'channel_message'
  ));

-- 2. Garantir que channel_messages tem sender_id (coluna já existe mas pode não estar
--    sendo populada pelo frontend — uso futuro para exclusão do remetente)
ALTER TABLE public.channel_messages
  ADD COLUMN IF NOT EXISTS sender_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- 3. Função trigger: insere notificação por membro do tenant ao enviar msg no canal
CREATE OR REPLACE FUNCTION public.notify_on_channel_message()
RETURNS trigger
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  v_tenant_id  uuid;
  v_chan_name  text;
  v_member     record;
  v_body       text;
BEGIN
  SELECT tenant_id, name INTO v_tenant_id, v_chan_name
  FROM public.internal_channels
  WHERE id = NEW.channel_id;

  IF v_tenant_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_body := NEW.sender_name || ': ' || LEFT(COALESCE(NEW.text, ''), 100);

  FOR v_member IN
    SELECT user_id
    FROM public.tenant_members
    WHERE tenant_id = v_tenant_id
      AND (NEW.sender_id IS NULL OR user_id != NEW.sender_id)
  LOOP
    INSERT INTO public.internal_notifications (
      tenant_id,
      recipient_user_id,
      kind,
      title,
      body,
      link,
      metadata
    ) VALUES (
      v_tenant_id,
      v_member.user_id,
      'channel_message',
      '#' || v_chan_name,
      v_body,
      '/chat',
      jsonb_build_object(
        'channel_id', NEW.channel_id,
        'message_id', NEW.id,
        'sender_name', NEW.sender_name
      )
    );
  END LOOP;

  RETURN NEW;
END;
$$;

-- 4. Trigger dispara após cada mensagem inserida no canal
DROP TRIGGER IF EXISTS trg_channel_messages_notify ON public.channel_messages;
CREATE TRIGGER trg_channel_messages_notify
  AFTER INSERT ON public.channel_messages
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_channel_message();
