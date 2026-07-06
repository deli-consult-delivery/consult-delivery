-- 20260706_007_reviews_rls_tenant_scope.sql
-- Fecha o vazamento CRITICO raiz da tabela `reviews` (achado na revisao do
-- PR #759, doc historico: migrations_archive/20260701_003).
--
-- Schema real (baseline): `reviews` NAO tem tenant_id nem loja_id -- so
-- `store` (text livre, sem FK p/ lojas). Uso real hoje (unico consumidor):
-- src/console/PainelAvaliacoesConsultor.jsx ("resp-avaliacoes"), ferramenta
-- INTERNA do time p/ o piloto Consultor de iFood (14 lojas), consultada com
-- select('*') SEM filtro nenhum (nem de tenant nem de store) pelo client
-- Supabase autenticado (role authenticated) -- so funciona hoje pq o modulo
-- 'resp-avaliacoes' fica desabilitado em todo tenant que nao seja a agencia
-- (migrations_archive/20260701_003/004 e 20260706_006). Sem FK viavel p/
-- lojas.tenant_id, aplicamos a alternativa minima do brief: SELECT restrito
-- a membros do tenant agencia raiz (9079bd4d-4df7-4023-90fb-d79c8ba7e900).
--
-- 2 bugs de RLS achados e corrigidos:
--   1) "service_full_access" nao tinha `TO service_role` -- sem esse
--      escopo, a policy (USING(true), sem FOR = cobre ALL comandos) valia
--      pra QUALQUER role, inclusive authenticated e anon. Corrigido: agora
--      so vale pra service_role (que ja bypassa RLS por padrao no Supabase --
--      a policy fica so como seguranca-em-profundidade).
--   2) "anon_select" (USING(true), sem filtro) permitia dump completo da
--      tabela via anon key (publica no bundle). O uso legitimo de anon aqui
--      e a pagina publica de aprovacao (public/aprovacao-avaliacao.html),
--      que sempre busca por `token` (uuid aleatorio, imprevisivel) -- nunca
--      precisa de "select * sem filtro". Trocado por 2 funcoes
--      SECURITY DEFINER (get_review_by_token / get_reviews_by_tokens) que
--      so retornam a(s) linha(s) cujo token bate -- fecha o dump, mantem a
--      pagina funcionando (commit companheiro atualiza as 2 chamadas em
--      public/aprovacao-avaliacao.html p/ usar as funcoes).
--
-- Fora de escopo (nao mexido nesta migration -- flagued para decisao a
-- parte): "anon_insert"/"anon_update" continuam USING(true)/WITH CHECK(true)
-- -- quem tem a anon key pode atualizar QUALQUER review por id (nao so pelo
-- token que already conhece). O brief pediu escopo em SELECT; UPDATE/INSERT
-- tem o mesmo problema mas exigiria redesenhar o fluxo de aprovacao
-- (idealmente: RPC SECURITY DEFINER tambem pro update, validando o token no
-- servidor) -- proponho como item separado, nao inclui aqui p/ nao
-- misturar 2 mudancas de superficie diferentes numa migration de RLS.
--
-- Aditivo/reversivel. Idempotente: DROP POLICY IF EXISTS + CREATE (replay-safe).
--
-- Rollback:
--   DROP POLICY IF EXISTS "reviews_select_agencia" ON public.reviews;
--   DROP FUNCTION IF EXISTS public.get_review_by_token(uuid);
--   DROP FUNCTION IF EXISTS public.get_reviews_by_tokens(uuid[]);
--   CREATE POLICY "anon_select" ON public.reviews FOR SELECT TO anon USING (true);
--   DROP POLICY IF EXISTS "service_full_access" ON public.reviews;
--   CREATE POLICY "service_full_access" ON public.reviews USING (true) WITH CHECK (true);

BEGIN;

-- 1) service_full_access: escopa pro role certo (service_role ja bypassa RLS
--    de qualquer forma -- isso e so hardening, nao muda comportamento real).
DROP POLICY IF EXISTS "service_full_access" ON public.reviews;
CREATE POLICY "service_full_access" ON public.reviews
  TO service_role
  USING (true) WITH CHECK (true);

-- 2) remove o dump aberto por anon.
DROP POLICY IF EXISTS "anon_select" ON public.reviews;

-- 3) SELECT restrito a membros do tenant agencia (unico consumidor legitimo
--    hoje, via authenticated). accessible_tenant_ids() ja existe (baseline)
--    e faz a recursao tenant_members -> DESCENDENTES (nunca ancestrais); aqui
--    checamos se a agencia esta no proprio conjunto (equivalente a "sou
--    membro direto da agencia OU de algum ancestral dela"). A agencia tem
--    pai (tenant Plataforma, 8bf3132d... -- ver 20260701_001_tenancy_hierarchy),
--    entao NAO e tecnicamente raiz -- mas nenhuma migration hoje cria
--    tenant_members para o tenant Plataforma, entao na pratica isso equivale
--    a "sou membro direto da agencia". Se um role de plataforma/revenda vier
--    a existir com membership no tenant Plataforma, reavaliar esta policy.
CREATE POLICY "reviews_select_agencia" ON public.reviews
  FOR SELECT
  TO authenticated
  USING (
    '9079bd4d-4df7-4023-90fb-d79c8ba7e900' IN (SELECT public.accessible_tenant_ids())
  );

-- 4) RPCs SECURITY DEFINER p/ a pagina publica de aprovacao continuar
--    funcionando sem precisar de SELECT aberto -- so devolvem linha(s) cujo
--    token bate com o parametro (capacidade = conhecer o token, nao "ver
--    tudo"). search_path fixo (mesma convencao de accessible_tenant_ids()).
CREATE OR REPLACE FUNCTION public.get_review_by_token(p_token uuid)
RETURNS SETOF public.reviews
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT * FROM public.reviews WHERE token = p_token;
$$;

CREATE OR REPLACE FUNCTION public.get_reviews_by_tokens(p_tokens uuid[])
RETURNS SETOF public.reviews
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT * FROM public.reviews WHERE token = ANY(p_tokens);
$$;

GRANT EXECUTE ON FUNCTION public.get_review_by_token(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_reviews_by_tokens(uuid[]) TO anon, authenticated;

COMMIT;

-- ============================================================================
-- TESTE DE ISOLAMENTO (NAO EXECUTAR AQUI -- rodar a parte, manualmente, apos
-- aplicar a migration acima; pede um user_id real de cada lado). Espera-se:
--   membro cd-demo/cd-homolog -> 0 linhas
--   membro da agencia         -> continua vendo as reviews (count > 0 se a
--                                 tabela tiver dados reais do piloto)
-- ============================================================================
--
-- BEGIN;
-- SET LOCAL role authenticated;
-- SELECT set_config('request.jwt.claims', json_build_object('sub', '<uuid do membro cd-demo>')::text, true);
-- SELECT count(*) AS deve_ser_zero FROM public.reviews;
-- ROLLBACK;
--
-- BEGIN;
-- SET LOCAL role authenticated;
-- SELECT set_config('request.jwt.claims', json_build_object('sub', '<uuid de um membro da agencia>')::text, true);
-- SELECT count(*) AS deve_continuar_igual FROM public.reviews;
-- ROLLBACK;
