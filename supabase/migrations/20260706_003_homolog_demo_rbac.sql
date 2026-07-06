-- 20260706_003_homolog_demo_rbac.sql
-- Semeia os 7 papeis-sistema (seed_rbac_system_roles) para os tenants
-- cd-homolog e cd-demo (criados na 20260706_001). SEM criar usuarios nem
-- atribuir role a usuario nenhum -- login/senha e gate do Wandson.
-- Precedente: supabase/migrations_archive/20260624_001_rbac_seed_karina_tenant.sql
--
-- Idempotente: seed_rbac_system_roles() faz "on conflict (tenant_id, name)
-- do nothing" internamente -- rodavel 2x sem erro/duplicar.
--
-- Rollback (cascade limpa role_permissions via FK em role_id):
--   DELETE FROM public.roles WHERE tenant_id IN
--     (SELECT id FROM public.tenants WHERE slug IN ('cd-homolog','cd-demo'));

SELECT public.seed_rbac_system_roles(t.id) FROM public.tenants t WHERE t.slug = 'cd-homolog';
SELECT public.seed_rbac_system_roles(t.id) FROM public.tenants t WHERE t.slug = 'cd-demo';
