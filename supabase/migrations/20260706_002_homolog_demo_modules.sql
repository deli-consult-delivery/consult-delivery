-- 20260706_002_homolog_demo_modules.sql
-- Allowlist de telas (tenant_modules) dos tenants cd-homolog e cd-demo criados
-- na 20260706_001. Padrao da 20260622_010 (tenant_modules) e do precedente
-- 20260630_001_karina_enable_admin_modules.sql.
-- module_key = id do item em src/console/moduleCatalog.js.
-- Cada statement usa UMA lista por tenant (CTE allow) como fonte unica: upsert
-- enabled=true das keys da allowlist e enabled=false das demais no mesmo comando.
-- Idempotente: rodavel 2x (ON CONFLICT ... DO UPDATE SET enabled = true).
-- Nota: uma versao preliminar desta allowlist ja foi aplicada no banco em
-- 2026-07-06 com listas diferentes; o UPDATE desabilita as keys residuais
-- fora da allowlist aprovada (reversivel — enabled=false, linha preservada).
-- Rollback: DELETE FROM public.tenant_modules WHERE tenant_id IN
--   (SELECT id FROM public.tenants WHERE slug IN ('cd-homolog','cd-demo'));

-- T-HOMOLOG: 8 telas — homologacao iFood App 1 (Avaliacoes Merchant+Review)
with allow(module_key) as (
  values
    ('visao'), ('lojas'), ('resp-avaliacoes'), ('aprovacoes'),
    ('auditoria'), ('notificacoes'), ('acesso'), ('configsys')
),
t as (
  select id from public.tenants where slug = 'cd-homolog'
),
ins as (
  insert into public.tenant_modules (tenant_id, module_key, enabled)
  select t.id, a.module_key, true from t cross join allow a
  on conflict (tenant_id, module_key) do update set enabled = true
)
update public.tenant_modules tm
set enabled = false
from t
where tm.tenant_id = t.id
  and tm.module_key not in (select module_key from allow);

-- T-DEMO: 16 telas — snapshot do SaaS p/ demo a prospects
with allow(module_key) as (
  values
    ('visao'), ('lojas'), ('radar'), ('resp-avaliacoes'), ('cardapio-ifood'),
    ('cora'), ('aprovacoes'), ('contratos'), ('hub'), ('config'),
    ('atividade'), ('custos'), ('configsys'), ('acesso'), ('auditoria'),
    ('notificacoes')
),
t as (
  select id from public.tenants where slug = 'cd-demo'
),
ins as (
  insert into public.tenant_modules (tenant_id, module_key, enabled)
  select t.id, a.module_key, true from t cross join allow a
  on conflict (tenant_id, module_key) do update set enabled = true
)
update public.tenant_modules tm
set enabled = false
from t
where tm.tenant_id = t.id
  and tm.module_key not in (select module_key from allow);
