-- 20260610_001_rbac_seed_system_roles.sql
-- Versiona o seed dos 7 papéis SYSTEM do RBAC como função idempotente, reproduzível por tenant.
-- Extraído FIELMENTE de produção (tenant 9079bd4d, 90 permissões) em 2026-06-10.
--   → re-rodar no tenant atual é NO-OP (ON CONFLICT DO NOTHING; dados idênticos).
--   → para um tenant novo, basta: SELECT public.seed_rbac_system_roles('<novo-tenant-uuid>');
-- Aditivo/reversível: nunca remove papéis nem permissões existentes.
-- NÃO inclui os papéis custom (consultor, consultor_senior) — são específicos do tenant DELI,
-- não fazem parte do conjunto SYSTEM canônico.
-- Rollback: DROP FUNCTION IF EXISTS public.seed_rbac_system_roles(uuid);

create or replace function public.seed_rbac_system_roles(p_tenant_id uuid)
returns void
language plpgsql
as $$
begin
  -- 1) papéis system (upsert idempotente pela unique (tenant_id, name))
  insert into roles (tenant_id, name, description, is_system)
  values
    (p_tenant_id, 'admin',       'Acesso total',                              true),
    (p_tenant_id, 'atendimento', 'Atendimento e suporte — sem financeiro',    true),
    (p_tenant_id, 'deli_owner',  'COO digital — invoke agentes e aprovações', true),
    (p_tenant_id, 'dev',         'Dev frontend — sem financeiro',             true),
    (p_tenant_id, 'financeiro',  'Cobrança e inadimplência — restrito',       true),
    (p_tenant_id, 'marketing',   'Marketing e CRM — sem financeiro',          true),
    (p_tenant_id, 'viewer',      'Somente visualização',                      true)
  on conflict (tenant_id, name) do nothing;

  -- 2) permissões (resolve role_id pelo nome dentro do tenant; idempotente pela PK)
  insert into role_permissions (role_id, resource, action)
  select r.id, p.resource, p.action
  from (values
    -- admin (39) — acesso total
    ('admin','agents_panel','execute'),
    ('admin','agents_panel','view'),
    ('admin','analise_ifood','execute'),
    ('admin','analise_ifood','view'),
    ('admin','approve_drafts','approve'),
    ('admin','chat','create'),
    ('admin','chat','view'),
    ('admin','cobranca','approve'),
    ('admin','cobranca','create'),
    ('admin','cobranca','edit'),
    ('admin','cobranca','execute'),
    ('admin','cobranca','view'),
    ('admin','crm','create'),
    ('admin','crm','delete'),
    ('admin','crm','edit'),
    ('admin','crm','view'),
    ('admin','deli','approve'),
    ('admin','deli','execute'),
    ('admin','deli','view'),
    ('admin','departments','create'),
    ('admin','departments','delete'),
    ('admin','departments','edit'),
    ('admin','departments','view'),
    ('admin','financeiro','create'),
    ('admin','financeiro','delete'),
    ('admin','financeiro','edit'),
    ('admin','financeiro','view'),
    ('admin','grupos_whatsapp','create'),
    ('admin','grupos_whatsapp','view'),
    ('admin','kanban','create'),
    ('admin','kanban','delete'),
    ('admin','kanban','edit'),
    ('admin','kanban','view'),
    ('admin','lara','approve'),
    ('admin','lara','execute'),
    ('admin','reports','create'),
    ('admin','reports','view'),
    ('admin','tenant_admin','edit'),
    ('admin','tenant_admin','view'),
    -- atendimento (10) — sem financeiro
    ('atendimento','agents_panel','view'),
    ('atendimento','analise_ifood','view'),
    ('atendimento','chat','create'),
    ('atendimento','chat','view'),
    ('atendimento','departments','view'),
    ('atendimento','grupos_whatsapp','create'),
    ('atendimento','grupos_whatsapp','view'),
    ('atendimento','kanban','create'),
    ('atendimento','kanban','edit'),
    ('atendimento','kanban','view'),
    -- deli_owner (6) — COO digital
    ('deli_owner','agents_panel','execute'),
    ('deli_owner','agents_panel','view'),
    ('deli_owner','approve_drafts','approve'),
    ('deli_owner','deli','approve'),
    ('deli_owner','deli','execute'),
    ('deli_owner','deli','view'),
    -- dev (11) — sem financeiro
    ('dev','agents_panel','view'),
    ('dev','analise_ifood','execute'),
    ('dev','analise_ifood','view'),
    ('dev','chat','create'),
    ('dev','chat','view'),
    ('dev','crm','view'),
    ('dev','departments','view'),
    ('dev','kanban','create'),
    ('dev','kanban','edit'),
    ('dev','kanban','view'),
    ('dev','reports','view'),
    -- financeiro (9) — restrito a cobrança/inadimplência
    ('financeiro','agents_panel','view'),
    ('financeiro','cobranca','create'),
    ('financeiro','cobranca','edit'),
    ('financeiro','cobranca','execute'),
    ('financeiro','cobranca','view'),
    ('financeiro','departments','view'),
    ('financeiro','financeiro','create'),
    ('financeiro','financeiro','edit'),
    ('financeiro','financeiro','view'),
    -- marketing (13) — CRM/LARA, sem financeiro
    ('marketing','agents_panel','view'),
    ('marketing','chat','create'),
    ('marketing','chat','view'),
    ('marketing','crm','create'),
    ('marketing','crm','edit'),
    ('marketing','crm','view'),
    ('marketing','departments','view'),
    ('marketing','kanban','create'),
    ('marketing','kanban','edit'),
    ('marketing','kanban','view'),
    ('marketing','lara','approve'),
    ('marketing','lara','execute'),
    ('marketing','reports','view'),
    -- viewer (2) — somente visualização
    ('viewer','kanban','view'),
    ('viewer','reports','view')
  ) as p(role_name, resource, action)
  join roles r on r.tenant_id = p_tenant_id and r.name = p.role_name
  on conflict (role_id, resource, action) do nothing;
end;
$$;

-- aplica ao tenant atual (NO-OP: já populado em prod desde a configuração manual do RBAC)
select public.seed_rbac_system_roles('9079bd4d-4df7-4023-90fb-d79c8ba7e900');
