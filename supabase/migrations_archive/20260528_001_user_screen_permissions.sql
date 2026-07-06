-- Tabela de permissões explícitas por usuário x tela
CREATE TABLE IF NOT EXISTS public.user_screen_permissions (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id  uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  screen_id  text NOT NULL,
  allowed    boolean NOT NULL,
  granted_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE (user_id, tenant_id, screen_id)
);

ALTER TABLE public.user_screen_permissions ENABLE ROW LEVEL SECURITY;

-- Admin/owner do tenant pode ler permissões de tela do seu tenant
CREATE POLICY "admin_read_screen_perms" ON public.user_screen_permissions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.tenant_members
      WHERE tenant_id = user_screen_permissions.tenant_id
        AND user_id = auth.uid()
        AND role IN ('admin', 'owner')
    )
  );

-- Cada usuário pode ler suas próprias permissões (para o hook usePermissions)
CREATE POLICY "user_read_own_screen_perms" ON public.user_screen_permissions
  FOR SELECT USING (user_id = auth.uid());

-- Escrita apenas via RPCs SECURITY DEFINER

-- RPC: grava ou atualiza permissão de tela para um usuário
CREATE OR REPLACE FUNCTION public.set_user_screen_permission(
  p_tenant_id uuid,
  p_user_id   uuid,
  p_screen_id text,
  p_allowed   boolean
)
RETURNS void
SECURITY DEFINER
SET search_path = public, auth
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.tenant_members
    WHERE tenant_id = p_tenant_id
      AND user_id = auth.uid()
      AND role IN ('admin', 'owner')
  ) THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;

  INSERT INTO public.user_screen_permissions (user_id, tenant_id, screen_id, allowed, granted_by)
  VALUES (p_user_id, p_tenant_id, p_screen_id, p_allowed, auth.uid())
  ON CONFLICT (user_id, tenant_id, screen_id)
  DO UPDATE SET allowed = p_allowed, granted_by = auth.uid(), created_at = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_user_screen_permission(uuid, uuid, text, boolean) TO authenticated;

-- RPC: retorna as permissões explícitas de um usuário (admin vê qualquer um; user vê a si mesmo)
CREATE OR REPLACE FUNCTION public.get_user_screen_permissions(
  p_tenant_id uuid,
  p_user_id   uuid
)
RETURNS TABLE (screen_id text, allowed boolean)
SECURITY DEFINER
SET search_path = public, auth
LANGUAGE plpgsql
AS $$
BEGIN
  IF auth.uid() != p_user_id THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.tenant_members
      WHERE tenant_id = p_tenant_id
        AND user_id = auth.uid()
        AND role IN ('admin', 'owner')
    ) THEN
      RAISE EXCEPTION 'permission_denied';
    END IF;
  END IF;

  RETURN QUERY
    SELECT usp.screen_id, usp.allowed
    FROM public.user_screen_permissions usp
    WHERE usp.tenant_id = p_tenant_id AND usp.user_id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_screen_permissions(uuid, uuid) TO authenticated;
