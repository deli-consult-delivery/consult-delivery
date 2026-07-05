-- supabase/migrations/20260527_007_conversation_events_full.sql
-- Sprint 2 — Chat Ao Vivo
-- Triggers automáticos em conversations:
--   • mudar department_id → INSERT conversation_events tipo 'transferred'
--   • mudar status_v2     → INSERT conversation_events tipo 'closed' ou 'reopened'

-- ─────────────────────────────────────────────
-- 1. Trigger: department_id mudou → 'transferred'
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.trg_fn_conv_department_changed()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_dept_from text;
  v_dept_to   text;
BEGIN
  SELECT name INTO v_dept_from FROM public.departments WHERE id = OLD.department_id;
  SELECT name INTO v_dept_to   FROM public.departments WHERE id = NEW.department_id;

  INSERT INTO public.conversation_events (
    tenant_id,
    conversation_id,
    event_type,
    actor_type,
    metadata,
    ts
  ) VALUES (
    NEW.tenant_id,
    NEW.id,
    'transferred',
    'system',
    jsonb_build_object(
      'dept_from',    v_dept_from,
      'dept_to',      v_dept_to,
      'dept_id_from', OLD.department_id,
      'dept_id_to',   NEW.department_id
    ),
    now()
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_conv_department_changed ON public.conversations;

CREATE TRIGGER trg_conv_department_changed
  AFTER UPDATE OF department_id ON public.conversations
  FOR EACH ROW
  WHEN (NEW.department_id IS DISTINCT FROM OLD.department_id)
  EXECUTE FUNCTION public.trg_fn_conv_department_changed();

COMMENT ON FUNCTION public.trg_fn_conv_department_changed() IS
  'Ao mudar conversations.department_id, registra evento transferred em conversation_events com nomes dos deptos.';

-- ─────────────────────────────────────────────
-- 2. Trigger: status_v2 mudou → 'closed' | 'reopened'
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.trg_fn_conv_status_changed()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_event_type text;
BEGIN
  v_event_type := CASE NEW.status_v2
    WHEN 'closed' THEN 'closed'
    WHEN 'in_progress' THEN
      CASE WHEN OLD.status_v2 = 'closed' THEN 'reopened' ELSE NULL END
    ELSE NULL
  END;

  IF v_event_type IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.conversation_events (
    tenant_id,
    conversation_id,
    event_type,
    actor_type,
    metadata,
    ts
  ) VALUES (
    NEW.tenant_id,
    NEW.id,
    v_event_type,
    'system',
    jsonb_build_object(
      'status_from', OLD.status_v2::text,
      'status_to',   NEW.status_v2::text
    ),
    now()
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_conv_status_changed ON public.conversations;

CREATE TRIGGER trg_conv_status_changed
  AFTER UPDATE OF status_v2 ON public.conversations
  FOR EACH ROW
  WHEN (NEW.status_v2 IS DISTINCT FROM OLD.status_v2)
  EXECUTE FUNCTION public.trg_fn_conv_status_changed();

COMMENT ON FUNCTION public.trg_fn_conv_status_changed() IS
  'Ao mudar conversations.status_v2 para closed ou in_progress (vindo de closed), registra evento na timeline.';

-- ─────────────────────────────────────────────
-- 3. Índice de suporte (já criado em 003, garantir idempotência)
-- ─────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_conversation_events_conv_ts
  ON public.conversation_events (conversation_id, ts DESC);
