-- 20260630_003_admin_tenant_modules_rpc.sql
-- Permite ao operador da plataforma (admin/owner do tenant Consult Delivery)
-- ler e configurar os módulos visíveis (tenant_modules) de QUALQUER tenant,
-- a partir da tela "Clientes (plataforma)" — sem precisar ser membro de cada tenant.
--
-- Semântica de tenant_modules (ver 20260622_010): tenant sem linhas = vê tudo;
-- com linhas = allowlist (só module_key enabled=true). A UI grava o estado explícito
-- de TODOS os módulos do catálogo de uma vez, evitando o footgun de "1 linha esconde o resto".
--
-- Aditivo/reversível. Autorização server-side (defense-in-depth) além do RLS de menu.
-- Plataforma = Consult Delivery (id fixo abaixo; muda raramente).
--
-- Rollback:
--   DROP FUNCTION IF EXISTS public.admin_set_tenant_modules(uuid, jsonb);
--   DROP FUNCTION IF EXISTS public.admin_get_tenant_modules(uuid);

CREATE OR REPLACE FUNCTION public.admin_is_platform_operator()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tenant_members
    WHERE user_id = auth.uid()
      AND tenant_id = '9079bd4d-4df7-4023-90fb-d79c8ba7e900'  -- Consult Delivery
      AND role IN ('owner', 'admin')
  );
$$;

CREATE OR REPLACE FUNCTION public.admin_get_tenant_modules(p_tenant_id uuid)
RETURNS TABLE (module_key text, enabled boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.admin_is_platform_operator() THEN
    RAISE EXCEPTION 'not authorized: platform operator only';
  END IF;
  RETURN QUERY
    SELECT tm.module_key, tm.enabled
    FROM public.tenant_modules tm
    WHERE tm.tenant_id = p_tenant_id
    ORDER BY tm.module_key;
END;
$$;

-- p_modules = jsonb array: [{"module_key":"visao","enabled":true}, ...]
CREATE OR REPLACE FUNCTION public.admin_set_tenant_modules(p_tenant_id uuid, p_modules jsonb)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.admin_is_platform_operator() THEN
    RAISE EXCEPTION 'not authorized: platform operator only';
  END IF;
  IF jsonb_typeof(p_modules) <> 'array' THEN
    RAISE EXCEPTION 'p_modules must be a jsonb array';
  END IF;

  INSERT INTO public.tenant_modules (tenant_id, module_key, enabled)
  SELECT p_tenant_id, (m->>'module_key')::text, (m->>'enabled')::boolean
  FROM jsonb_array_elements(p_modules) m
  WHERE m->>'module_key' IS NOT NULL
  ON CONFLICT (tenant_id, module_key) DO UPDATE SET enabled = EXCLUDED.enabled;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_tenant_modules(uuid) FROM public;
REVOKE ALL ON FUNCTION public.admin_set_tenant_modules(uuid, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_get_tenant_modules(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_tenant_modules(uuid, jsonb) TO authenticated;
