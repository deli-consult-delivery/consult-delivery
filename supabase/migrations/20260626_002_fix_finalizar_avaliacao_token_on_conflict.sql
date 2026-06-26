-- supabase/migrations/20260626_002_fix_finalizar_avaliacao_token_on_conflict.sql
-- ----------------------------------------------------------------------------
-- FIX CRÍTICO: "não consigo finalizar atendimentos"
--
-- Causa raiz (provada em LIVE via EXPLAIN + UPDATE open->closed em rollback):
--   A trigger AFTER UPDATE OF status_v2 `trg_fn_conv_gen_avaliacao_token`
--   executa um INSERT ... ON CONFLICT (conversation_id) SEM o predicado do
--   índice. O índice único de conversation_id é PARCIAL:
--     CREATE UNIQUE INDEX atend_aval_conversation_unique_partial
--       ON atendimento_avaliacoes (conversation_id) WHERE conversation_id IS NOT NULL;
--   No PostgreSQL, ON CONFLICT só infere um índice parcial se o predicado for
--   repetido. Sem ele, o planner lança 42P10 "no unique or exclusion constraint
--   matching the ON CONFLICT specification" -> a trigger falha -> o UPDATE de
--   fechamento (status_v2 = 'closed') é ABORTADO na mesma transação.
--   Resultado: qualquer tentativa de finalizar via UI quebrava.
--
-- Correção (aditiva/reversível — apenas CREATE OR REPLACE FUNCTION):
--   1. Adicionar o predicado WHERE conversation_id IS NOT NULL ao ON CONFLICT.
--   2. Blindar AMBAS as triggers de side-effect (avaliação + NPS) com
--      EXCEPTION WHEN OTHERS -> RAISE WARNING + RETURN NEW. Gerar token de
--      avaliação/NPS é efeito colateral secundário e NUNCA deve abortar a
--      finalização do atendimento.
--
-- Rollback: re-aplicar a definição anterior das funções (sem o predicado e sem
--   o bloco EXCEPTION). Nenhum dado é alterado por esta migration.
-- ----------------------------------------------------------------------------

-- 1. Token de AVALIAÇÃO (CSAT) — corrige o ON CONFLICT + blindagem
CREATE OR REPLACE FUNCTION public.trg_fn_conv_gen_avaliacao_token()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_atendente_nome text;
BEGIN
  IF NEW.assigned_to IS NOT NULL THEN
    SELECT full_name INTO v_atendente_nome FROM public.profiles WHERE id = NEW.assigned_to LIMIT 1;
  END IF;

  INSERT INTO public.atendimento_avaliacoes (
    tenant_id, conversation_id, assigned_to, agent_id, atendente_nome
  ) VALUES (
    NEW.tenant_id, NEW.id, NEW.assigned_to, NEW.agent_id, v_atendente_nome
  )
  ON CONFLICT (conversation_id) WHERE conversation_id IS NOT NULL DO NOTHING;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Geração do token de avaliação NUNCA deve impedir a finalização.
  RAISE WARNING 'trg_fn_conv_gen_avaliacao_token falhou para conv %: % (%)', NEW.id, SQLERRM, SQLSTATE;
  RETURN NEW;
END;
$function$;

-- 2. Token de NPS — mesma blindagem defensiva (lógica inalterada)
CREATE OR REPLACE FUNCTION public.trg_fn_conv_gen_nps_token()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_contact_nome text;
BEGIN
  IF NEW.whatsapp_chat_id IS NULL OR NEW.whatsapp_chat_id = '' THEN
    RETURN NEW;
  END IF;

  v_contact_nome := COALESCE(NULLIF(TRIM(NEW.push_name), ''), NULLIF(TRIM(NEW.contact_name), ''));

  IF NOT EXISTS (
    SELECT 1 FROM public.nps_avaliacoes
     WHERE tenant_id          = NEW.tenant_id
       AND contact_identifier = NEW.whatsapp_chat_id
       AND created_at         > now() - interval '30 days'
  ) THEN
    INSERT INTO public.nps_avaliacoes (
      tenant_id,
      contact_identifier,
      contact_nome,
      origin_conversation_id
    ) VALUES (
      NEW.tenant_id,
      NEW.whatsapp_chat_id,
      v_contact_nome,
      NEW.id
    );
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Geração do token de NPS NUNCA deve impedir a finalização.
  RAISE WARNING 'trg_fn_conv_gen_nps_token falhou para conv %: % (%)', NEW.id, SQLERRM, SQLSTATE;
  RETURN NEW;
END;
$function$;
