-- Ajusta a constraint de role em tenant_members para aceitar os papéis usados pela plataforma
ALTER TABLE public.tenant_members DROP CONSTRAINT IF EXISTS tenant_members_role_check;
ALTER TABLE public.tenant_members ADD CONSTRAINT tenant_members_role_check CHECK (role = ANY (ARRAY['owner'::text, 'admin'::text, 'consultor'::text, 'operador'::text, 'dev'::text]));
