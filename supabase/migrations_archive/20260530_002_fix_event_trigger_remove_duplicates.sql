-- Remove 'closed' e 'reopened' do trigger automático.
-- O frontend insere esses eventos manualmente com actor_name correto.
-- Manter o trigger inserindo também causava duplicação na timeline.

CREATE OR REPLACE FUNCTION public.trg_fn_conv_status_changed()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- 'closed' e 'reopened' são inseridos pelo frontend com actor info completo.
  -- Trigger não insere mais para evitar duplicação.
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.trg_fn_conv_status_changed() IS
  'Trigger desativado: eventos closed/reopened são gerenciados pelo frontend com actor_name.';
