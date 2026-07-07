-- 20260706_002_homolog_demo_tenant_modules.sql
-- Allowlist de módulos (tenant_modules) dos tenants T-HOMOLOG e T-DEMO.
--
-- Modelo de gating (ver runbook onboarding-cliente-avaliacao.md): tenant SEM linhas
-- em tenant_modules vê tudo; COM linhas vê SÓ os module_key enabled=true. Aqui damos a
-- ambos a superfície da homologação "App Avaliações" (iFood), que é o app em homologação:
--   visao           — Visão Geral (landing do guard de allowlist)
--   avaliacoes      — Avaliações Recebidas
--   resp-avaliacoes — Avaliações iFood (respostas de avaliação)
--
-- Desbloqueio progressivo de mais módulos é SQL aditivo depois (sem deploy) — inserir a
-- linha do module_key. module_key = id do item de menu em src/console/moduleCatalog.js.
--
-- Tenants resolvidos por slug (dependem da 20260706_001 já aplicada).
-- Aditivo/reversível e idempotente: ON CONFLICT (tenant_id, module_key) DO NOTHING.
--
-- Rollback:
--   DELETE FROM public.tenant_modules
--   WHERE tenant_id IN (SELECT id FROM public.tenants WHERE slug IN ('cd-homolog','cd-demo'));

INSERT INTO public.tenant_modules (tenant_id, module_key, enabled)
SELECT t.id, m.module_key, true
FROM public.tenants t
CROSS JOIN (VALUES ('visao'), ('avaliacoes'), ('resp-avaliacoes')) AS m(module_key)
WHERE t.slug IN ('cd-homolog', 'cd-demo')
ON CONFLICT (tenant_id, module_key) DO NOTHING;
