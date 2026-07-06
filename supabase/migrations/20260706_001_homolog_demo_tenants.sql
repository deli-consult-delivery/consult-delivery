-- 20260706_001_homolog_demo_tenants.sql
-- Cria 2 tenants (tipo store, filhos da agencia raiz Consult Delivery) para o
-- plano de homologacao iFood aprovado 2026-07-06: App 1 = categoria Avaliacoes
-- (Merchant+Review) primeiro.
--   T-HOMOLOG (cd-homolog) — ambiente enxuto p/ o processo de homologacao iFood
--   T-DEMO    (cd-demo)    — snapshot amplo do SaaS p/ demo a prospects
-- Allowlist de telas via tenant_modules na migration 20260706_002 (par desta).
-- Idempotente: rodavel 2x sem erro (ON CONFLICT no slug).
-- Rollback: DELETE FROM public.tenants WHERE slug IN ('cd-homolog','cd-demo');

insert into public.tenants (slug, name, tenant_type, parent_tenant_id)
values
  ('cd-homolog', 'Homologação iFood', 'store', '9079bd4d-4df7-4023-90fb-d79c8ba7e900'),
  ('cd-demo', 'Demo Consult Delivery', 'store', '9079bd4d-4df7-4023-90fb-d79c8ba7e900')
on conflict (slug) do nothing;
