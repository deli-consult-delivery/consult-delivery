-- Tenancy Fase 1b: promover as 16 lojas com consultoria ativa a tenants 'store'
-- filhos da agencia Consult Delivery (9079bd4d-4df7-4023-90fb-d79c8ba7e900).
-- Decisoes aprovadas (Wandson 2026-07-01): A1 (copiar membros da agencia),
-- B (cobrancas/atendimento/nps ficam na agencia), C (slug = slugify(nome)-8charsID), D (Karina fora de escopo).
-- Spec: docs/tenancy-fase1b-lojas-para-tenant-spec.md
-- Aditivo/reversivel. Rollback no fim do spec.

BEGIN;

CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;

-- 0) vinculo loja -> store tenant (nao-destrutivo; lojas.tenant_id permanece = agencia)
ALTER TABLE public.lojas ADD COLUMN IF NOT EXISTS store_tenant_id uuid REFERENCES public.tenants(id);

-- slugify deterministico (minusculo, sem acento, nao-alnum -> '-', colapsa, apara)
CREATE OR REPLACE FUNCTION public._slugify(txt text) RETURNS text AS $$
  SELECT trim(both '-' from regexp_replace(
           lower(extensions.unaccent(coalesce(txt,''))), '[^a-z0-9]+', '-', 'g'));
$$ LANGUAGE sql STABLE;

-- 1) criar 1 tenant store por loja ativa + vincular (idempotente)
DO $$
DECLARE r record; v_slug text; v_tid uuid;
BEGIN
  FOR r IN SELECT id, nome FROM public.lojas WHERE is_consultoria_ativa = true LOOP
    SELECT store_tenant_id INTO v_tid FROM public.lojas WHERE id = r.id;
    IF v_tid IS NULL THEN
      v_slug := left(public._slugify(r.nome),40) || '-' || left(r.id::text,8);
      INSERT INTO public.tenants (name, slug, tenant_type, parent_tenant_id)
      VALUES (r.nome, v_slug, 'store', '9079bd4d-4df7-4023-90fb-d79c8ba7e900')
      ON CONFLICT (slug) DO UPDATE SET slug = EXCLUDED.slug
      RETURNING id INTO v_tid;
      UPDATE public.lojas SET store_tenant_id = v_tid WHERE id = r.id;
    END IF;
  END LOOP;
END $$;

-- 2) migrar dados dependentes: toda tabela com loja_id+tenant_id, so linhas das 16 lojas
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT c1.table_name FROM information_schema.columns c1
           JOIN information_schema.columns c2
             ON c1.table_name=c2.table_name AND c1.table_schema=c2.table_schema
           WHERE c1.table_schema='public' AND c1.column_name='loja_id'
             AND c2.column_name='tenant_id' LOOP
    EXECUTE format(
      'UPDATE public.%I d SET tenant_id = l.store_tenant_id
         FROM public.lojas l
        WHERE d.loja_id = l.id AND l.is_consultoria_ativa = true
          AND l.store_tenant_id IS NOT NULL
          AND d.tenant_id = ''9079bd4d-4df7-4023-90fb-d79c8ba7e900''', t);
  END LOOP;
END $$;

-- 3) Decisao A1: copiar membros da agencia para cada store (mantem visibilidade da consultoria)
INSERT INTO public.tenant_members (tenant_id, user_id, role)
SELECT l.store_tenant_id, m.user_id, m.role
FROM public.tenant_members m
JOIN public.lojas l ON l.is_consultoria_ativa = true AND l.store_tenant_id IS NOT NULL
WHERE m.tenant_id = '9079bd4d-4df7-4023-90fb-d79c8ba7e900'
ON CONFLICT (tenant_id, user_id) DO NOTHING;

COMMIT;
