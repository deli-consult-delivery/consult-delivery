-- 20260706_006_homolog_demo_fix_allowlist_avaliacoes.sql
-- Corrige a allowlist de cd-homolog e cd-demo (20260706_002): a tela da
-- Review API oficial do iFood foi integrada na module_key 'avaliacoes'
-- (Avaliacoes.jsx renderiza AvaliacoesReviewApi quando loja.fonte_dados='api'
-- -- PR #760), NAO em 'resp-avaliacoes'. E 'resp-avaliacoes'
-- (PainelAvaliacoesConsultor.jsx) le a tabela global `reviews` -- sem
-- tenant_id, RLS ate entao aberta (USING(true) p/ anon) -- exibiria
-- avaliacoes REAIS de clientes da agencia para o analista de homologacao ou
-- prospect da demo [CRITICAL confirmado na revisao do PR #759].
-- Mesmo padrao ja usado em migrations_archive/20260701_003 e 20260701_004:
-- 'resp-avaliacoes' e ferramenta INTERNA do time (piloto Consultor iFood),
-- nao deve ficar habilitada fora do workspace "Consult Delivery" (agencia).
--
-- Idempotente: ON CONFLICT (tenant_id, module_key) DO UPDATE (mesmo padrao
-- da 20260706_002).
--
-- Rollback:
--   UPDATE public.tenant_modules SET enabled = true
--   WHERE module_key = 'resp-avaliacoes'
--     AND tenant_id IN (SELECT id FROM public.tenants WHERE slug IN ('cd-homolog','cd-demo'));
--   UPDATE public.tenant_modules SET enabled = false
--   WHERE module_key = 'avaliacoes'
--     AND tenant_id IN (SELECT id FROM public.tenants WHERE slug IN ('cd-homolog','cd-demo'));

INSERT INTO public.tenant_modules (tenant_id, module_key, enabled)
SELECT t.id, 'avaliacoes', true
FROM public.tenants t
WHERE t.slug IN ('cd-homolog', 'cd-demo')
ON CONFLICT (tenant_id, module_key) DO UPDATE SET enabled = true;

INSERT INTO public.tenant_modules (tenant_id, module_key, enabled)
SELECT t.id, 'resp-avaliacoes', false
FROM public.tenants t
WHERE t.slug IN ('cd-homolog', 'cd-demo')
ON CONFLICT (tenant_id, module_key) DO UPDATE SET enabled = false;
