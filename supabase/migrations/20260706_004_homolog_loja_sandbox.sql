-- 20260706_004_homolog_loja_sandbox.sql
-- Loja sandbox no T-HOMOLOG (cd-homolog): fonte_dados='api', vinculada ao
-- merchant sandbox do iFood 92a0ec17-6951-4a9b-9c02-ee12963be5f1 (validado
-- live 2026-07-05, ver memoria project_ifood_api_sandbox.md).
--
-- Resolucao loja -> merchant (bridge-server/routes/ifood-api.js,
-- resolveLojaGated): busca ifood_merchants WHERE tenant_id = lojas.tenant_id.
-- Por isso a loja e o vinculo ifood_merchants usam o MESMO tenant_id -- o do
-- proprio cd-homolog -- e nao `store_tenant_id` (esse padrao e exclusivo das
-- 16 lojas reais da agencia, ver migrations_archive/20260701_010). As telas
-- do Console v2 (lojas, resp-avaliacoes) tambem filtram lojas por
-- tenant_id = tenant atual (src/console/PainelAvaliacoesConsultor.jsx).
--
-- Idempotente: WHERE NOT EXISTS na lojas (sem unique key natural alem da PK)
-- e ON CONFLICT no ifood_merchants (existe UNIQUE(tenant_id, merchant_id) --
-- indice "ifood_merchants_tenant_merchant" no baseline).
--
-- Rollback:
--   DELETE FROM public.ifood_merchants WHERE tenant_id = (SELECT id FROM public.tenants WHERE slug = 'cd-homolog');
--   DELETE FROM public.lojas WHERE tenant_id = (SELECT id FROM public.tenants WHERE slug = 'cd-homolog');

INSERT INTO public.lojas (tenant_id, nome, fonte_dados, ifood_merchant_id, status)
SELECT t.id, 'Teste - CONSULT DELIVERY LTDA', 'api', '92a0ec17-6951-4a9b-9c02-ee12963be5f1', 'ativo'
FROM public.tenants t
WHERE t.slug = 'cd-homolog'
  AND NOT EXISTS (
    SELECT 1 FROM public.lojas l
    WHERE l.tenant_id = t.id AND l.nome = 'Teste - CONSULT DELIVERY LTDA'
  );

INSERT INTO public.ifood_merchants (tenant_id, merchant_id, nome, status)
SELECT t.id, '92a0ec17-6951-4a9b-9c02-ee12963be5f1', 'Teste - CONSULT DELIVERY LTDA', 'connected'
FROM public.tenants t
WHERE t.slug = 'cd-homolog'
ON CONFLICT (tenant_id, merchant_id) DO NOTHING;
