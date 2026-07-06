-- 20260701_001_tenancy_hierarchy.sql
-- Fase 0 da arquitetura de tenancy para revenda (Plataforma -> Agencia -> Loja).
-- Aditivo e reversivel. NAO altera RLS, billing nem UI (colunas ignoradas pelo app atual).
-- Decisoes: docs/tenancy-decisoes-discussao.md · SPEC: docs/tenancy-fase0-spec.md
--
-- Estado real conferido em 2026-07-01 (3 tenants):
--   9079bd4d Consult Delivery (slug 'consult')      -> agency (raiz)
--   fd7d9eb9 Cliente Teste Sandbox                  -> store
--   e9fdaa66 Karina Doceria                         -> store
-- (os ~14 clientes de consultoria vivem em `lojas`, nao em `tenants`.)

BEGIN;

-- 1. Colunas de hierarquia (idempotente)
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS parent_tenant_id uuid REFERENCES public.tenants(id);
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS tenant_type text NOT NULL DEFAULT 'store';
ALTER TABLE public.tenants DROP CONSTRAINT IF EXISTS tenants_tenant_type_chk;
ALTER TABLE public.tenants ADD CONSTRAINT tenants_tenant_type_chk
  CHECK (tenant_type IN ('platform','agency','store'));
CREATE INDEX IF NOT EXISTS idx_tenants_parent ON public.tenants(parent_tenant_id);

-- 2. No Plataforma (dono do SaaS) — idempotente por tipo
INSERT INTO public.tenants (name, slug, tenant_type, parent_tenant_id, status)
SELECT 'Plataforma Consult Delivery', 'plataforma', 'platform', NULL, 'active'
WHERE NOT EXISTS (SELECT 1 FROM public.tenants WHERE tenant_type='platform');

-- 3. Promover o tenant "Consult Delivery" existente (slug 'consult') a agencia-raiz
UPDATE public.tenants
SET tenant_type='agency',
    parent_tenant_id=(SELECT id FROM public.tenants WHERE tenant_type='platform' LIMIT 1)
WHERE slug='consult';

-- 4. Demais tenants (que nao sao o no plataforma nem a agencia-raiz) viram store filhos da raiz
UPDATE public.tenants
SET tenant_type='store',
    parent_tenant_id=(SELECT id FROM public.tenants WHERE slug='consult' LIMIT 1)
WHERE slug NOT IN ('plataforma','consult');

-- 5. Trigger de integridade (par tipo-pai x tipo-filho). Criado por ultimo: o estado ja esta consistente.
CREATE OR REPLACE FUNCTION public.validate_tenant_hierarchy() RETURNS trigger AS $$
DECLARE parent_type text;
BEGIN
  IF NEW.tenant_type='platform' THEN
    IF NEW.parent_tenant_id IS NOT NULL THEN RAISE EXCEPTION 'platform nao tem pai'; END IF;
    RETURN NEW;
  END IF;
  IF NEW.parent_tenant_id IS NULL THEN
    RAISE EXCEPTION 'tenant_type % exige parent_tenant_id', NEW.tenant_type;
  END IF;
  SELECT tenant_type INTO parent_type FROM public.tenants WHERE id=NEW.parent_tenant_id;
  IF NEW.tenant_type='agency' AND parent_type<>'platform' THEN
    RAISE EXCEPTION 'agency deve pender de platform (pai e %)', parent_type;
  END IF;
  IF NEW.tenant_type='store' AND parent_type<>'agency' THEN
    RAISE EXCEPTION 'store deve pender de agency (pai e %)', parent_type;
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validate_tenant_hierarchy ON public.tenants;
CREATE TRIGGER trg_validate_tenant_hierarchy
  BEFORE INSERT OR UPDATE OF tenant_type, parent_tenant_id ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.validate_tenant_hierarchy();

COMMIT;

-- Validacao (rodar apos aplicar):
--   SELECT tenant_type, count(*) FROM public.tenants GROUP BY 1 ORDER BY 1;  -- platform=1, agency=1, store=2
--   SELECT count(*) FROM public.tenants WHERE tenant_type='store' AND parent_tenant_id IS NULL;  -- 0
--   INSERT INTO public.tenants(name,slug,tenant_type) VALUES('x','x-test-orfa','store');  -- deve FALHAR
--
-- Rollback:
--   DROP TRIGGER IF EXISTS trg_validate_tenant_hierarchy ON public.tenants;
--   DROP FUNCTION IF EXISTS public.validate_tenant_hierarchy();
--   ALTER TABLE public.tenants DROP COLUMN IF EXISTS parent_tenant_id;
--   ALTER TABLE public.tenants DROP COLUMN IF EXISTS tenant_type;
--   DELETE FROM public.tenants WHERE slug='plataforma';  -- so se sem dados
