-- 20260706_018_homolog_demo_financeiro_ifood.sql
-- Allowlist aditiva: habilita o modulo novo 'financeiro-ifood' (tela
-- Financeiro iFood, sprint App 2) nos tenants cd-homolog e cd-demo.
-- module_key = id do item em src/console/moduleCatalog.js.
-- Aditivo e idempotente: so faz upsert enabled=true da key nova, NAO mexe
-- nas demais keys ja habilitadas (ao contrario das migrations 002/006 que
-- redefinem a allowlist inteira via CTE allow + disable-others).
-- Rollback: UPDATE public.tenant_modules SET enabled = false WHERE module_key
--   = 'financeiro-ifood' AND tenant_id IN (SELECT id FROM public.tenants
--   WHERE slug IN ('cd-homolog','cd-demo'));

insert into public.tenant_modules (tenant_id, module_key, enabled)
select t.id, 'financeiro-ifood', true
from public.tenants t
where t.slug in ('cd-homolog', 'cd-demo')
on conflict (tenant_id, module_key) do update set enabled = true;
