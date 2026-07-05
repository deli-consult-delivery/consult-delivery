-- 20260628_002_loop_state_aguardando_autorizacao_ceo.sql
-- GATE 0 / Fluxo C (AI-First Hermes-First): "CEO autoriza demanda do cliente".
--
-- Quando a triagem detecta que o cliente pediu algo que exige EXECUÇÃO REAL (ex.:
-- escrita no VendaERP, cobrança, mudança de cardápio), a tarefa nasce em
-- 'aguardando_autorizacao_ceo' e só avança para 'executing' após o `ok` do CEO
-- vinculado a um proposal_id imutável (nada executa antes da autorização).
--
-- ADITIVO/REVERSÍVEL: apenas AMPLIA o CHECK de client_tasks.loop_state (não remove
-- valores, não toca dados). Reverter = re-adicionar o CHECK com os 3 valores antigos.
-- Descobre o nome real da constraint dinamicamente (foi gerada por ADD COLUMN ... CHECK
-- em 20260624_003, então o nome pode variar entre ambientes).

DO $$
DECLARE c text;
BEGIN
  SELECT conname INTO c
  FROM pg_constraint
  WHERE conrelid = 'public.client_tasks'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%loop_state%';
  IF c IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.client_tasks DROP CONSTRAINT %I', c);
  END IF;
END $$;

ALTER TABLE public.client_tasks
  ADD CONSTRAINT client_tasks_loop_state_check
  CHECK (loop_state IN ('open', 'executing', 'done', 'aguardando_autorizacao_ceo'));
