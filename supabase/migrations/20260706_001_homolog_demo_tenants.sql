-- 20260706_001_homolog_demo_tenants.sql
-- Cria 2 tenants de suporte à homologação iFood (épico "Consultor de iFood"):
--   T-HOMOLOG  slug=cd-homolog  "Homologação iFood"       — ambiente de homologação
--   T-DEMO     slug=cd-demo     "Demo Consult Delivery"    — ambiente de demonstração
--
-- Ambos são tenant_type='store', filhos da agência raiz (slug 'consult'), como exige
-- o trigger validate_tenant_hierarchy (store deve pender de agency). A agência é
-- resolvida por slug (não UUID cravado) — self-documenting e portável.
--
-- Aditivo/reversível e idempotente: ON CONFLICT (slug) DO NOTHING → rodável 2x sem efeito.
-- Não altera nenhum tenant existente.
--
-- Rollback:
--   DELETE FROM public.tenants WHERE slug IN ('cd-homolog','cd-demo');

INSERT INTO public.tenants (slug, name, tenant_type, parent_tenant_id, plan, status, emoji, segment)
SELECT v.slug, v.name, 'store', a.id, 'pro', 'active', v.emoji, 'homologacao'
FROM (VALUES
  ('cd-homolog', 'Homologação iFood',     '🧪'),
  ('cd-demo',    'Demo Consult Delivery',  '🎬')
) AS v(slug, name, emoji)
CROSS JOIN (
  SELECT id FROM public.tenants WHERE slug = 'consult' AND tenant_type = 'agency'
) AS a
ON CONFLICT (slug) DO NOTHING;
