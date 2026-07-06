-- 20260706_008_reviews_anon_write_scope.sql
-- Fecha o debito flagado no cabecalho da 20260706_007: `anon_insert` e
-- `anon_update` em public.reviews continuavam USING(true)/WITH CHECK(true)
-- -- quem tem a anon key (publica no bundle) podia INSERIR e ATUALIZAR
-- QUALQUER review (qualquer linha, qualquer filtro -- ate um PATCH sem
-- filtro nenhum, corrompendo/aprovando a tabela inteira), nao so a review do
-- token que conhece.
--
-- Investigacao (INSERT legitimo via anon?): grep em bridge-server/,
-- ifood-portal-worker/, trigger/, src/, public/ por qualquer
-- `.insert(...)` ou `INSERT INTO` em `reviews` -- ZERO ocorrencias. Nenhum
-- codigo deste repo insere nessa tabela (nem service_role, nem anon); as
-- linhas existentes vem de um processo anterior (fora deste repo). Sem
-- consumidor legitimo achado -> `anon_insert` e removida (nao escopada).
--
-- UPDATE legitimo via anon: so public/aprovacao-avaliacao.html (pagina
-- publica de aprovacao, cliente final sem login, via link ?token=<uuid>).
-- Investigado: os 4 pontos de UPDATE dessa pagina so mudam
-- status ('approved'|'modified'), final_response e approved_at -- sempre
-- pelo token que a pagina ja carregou (nunca por id arbitrario vindo de
-- fora). Fix: RPC SECURITY DEFINER `update_review_by_token` que resolve a
-- linha pelo TOKEN internamente (nao aceita id nem filtro livre do cliente)
-- e valida o status contra os 2 valores que esse fluxo realmente usa.
-- Token errado/inexistente -> UPDATE casa 0 linhas -> RETURNING vazio (sem
-- erro, sem linha afetada). Commit companheiro troca as 4 chamadas
-- correspondentes em public/aprovacao-avaliacao.html de
-- `.from('reviews').update(...).eq('id',...)` para
-- `.rpc('update_review_by_token', {...})` (mesmo padrao ja usado nos
-- SELECTs na 20260706_007).
--
-- Aditivo/reversivel. Idempotente: CREATE OR REPLACE + DROP POLICY IF EXISTS.
--
-- Rollback:
--   DROP FUNCTION IF EXISTS public.update_review_by_token(uuid, text, text);
--   CREATE POLICY "anon_insert" ON public.reviews FOR INSERT TO anon WITH CHECK (true);
--   CREATE POLICY "anon_update" ON public.reviews FOR UPDATE TO anon USING (true) WITH CHECK (true);

BEGIN;

CREATE OR REPLACE FUNCTION public.update_review_by_token(
  p_token uuid,
  p_status text,
  p_final_response text
)
RETURNS SETOF public.reviews
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF p_status NOT IN ('approved', 'modified') THEN
    RAISE EXCEPTION 'status invalido para aprovacao via token: %', p_status;
  END IF;

  RETURN QUERY
  UPDATE public.reviews
  SET status = p_status,
      final_response = p_final_response,
      approved_at = now()
  WHERE token = p_token
  RETURNING *;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_review_by_token(uuid, text, text) TO anon, authenticated;

DROP POLICY IF EXISTS "anon_insert" ON public.reviews;
DROP POLICY IF EXISTS "anon_update" ON public.reviews;

COMMIT;

-- ============================================================================
-- TESTE (NAO EXECUTAR AQUI -- rodar a parte apos aplicar; usar um token real
-- de uma review em status 'pending'/'sent_to_client'). Esperado:
--   UPDATE direto na tabela (anon)        -> 0 linhas afetadas (RLS bloqueia)
--   RPC com token valido                  -> 1 linha, status atualizado
--   RPC com token invalido/aleatorio      -> 0 linhas (RETURNING vazio)
-- ============================================================================
--
-- BEGIN;
-- SET LOCAL role anon;
-- UPDATE public.reviews SET status = 'approved' WHERE token = '<token real>';
-- -- esperado: UPDATE 0
-- ROLLBACK;
--
-- BEGIN;
-- SET LOCAL role anon;
-- SELECT * FROM public.update_review_by_token('<token real>'::uuid, 'approved', 'resposta de teste');
-- -- esperado: 1 linha, status='approved'
-- ROLLBACK;
--
-- BEGIN;
-- SET LOCAL role anon;
-- SELECT * FROM public.update_review_by_token(gen_random_uuid(), 'approved', 'x');
-- -- esperado: 0 linhas
-- ROLLBACK;
