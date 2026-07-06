-- 20260706_002_homolog_demo_modules.sql
-- Allowlist de telas (tenant_modules) dos tenants cd-homolog e cd-demo criados
-- na 20260706_001. Padrao da 20260622_010 (tenant_modules) e do precedente
-- 20260630_001_karina_enable_admin_modules.sql.
-- module_key = id do item em src/console/moduleCatalog.js.
-- Idempotente: rodavel 2x (ON CONFLICT ... DO UPDATE SET enabled = true).
-- Nota: uma versao preliminar desta allowlist ja foi aplicada no banco em
-- 2026-07-06 com listas diferentes; o UPDATE final abaixo desabilita as keys
-- fora da allowlist aprovada (reversivel — enabled=false, linha preservada).
-- Rollback: DELETE FROM public.tenant_modules WHERE tenant_id IN
--   (SELECT id FROM public.tenants WHERE slug IN ('cd-homolog','cd-demo'));

-- T-HOMOLOG: 8 telas — homologacao iFood App 1 (Avaliacoes Merchant+Review)
insert into public.tenant_modules (tenant_id, module_key, enabled)
select t.id, m.module_key, true
from public.tenants t
cross join (values
  ('visao'), ('lojas'), ('resp-avaliacoes'), ('aprovacoes'),
  ('auditoria'), ('notificacoes'), ('acesso'), ('configsys')
) as m(module_key)
where t.slug = 'cd-homolog'
on conflict (tenant_id, module_key) do update set enabled = true;

-- T-DEMO: 16 telas — snapshot do SaaS p/ demo a prospects
insert into public.tenant_modules (tenant_id, module_key, enabled)
select t.id, m.module_key, true
from public.tenants t
cross join (values
  ('visao'), ('lojas'), ('radar'), ('resp-avaliacoes'), ('cardapio-ifood'),
  ('cora'), ('aprovacoes'), ('contratos'), ('hub'), ('config'),
  ('atividade'), ('custos'), ('configsys'), ('acesso'), ('auditoria'),
  ('notificacoes')
) as m(module_key)
where t.slug = 'cd-demo'
on conflict (tenant_id, module_key) do update set enabled = true;

-- Desliga keys residuais da versao preliminar (fora da allowlist aprovada).
update public.tenant_modules tm
set enabled = false
from public.tenants t
where tm.tenant_id = t.id
  and t.slug = 'cd-homolog'
  and tm.module_key not in
    ('visao','lojas','resp-avaliacoes','aprovacoes',
     'auditoria','notificacoes','acesso','configsys');

update public.tenant_modules tm
set enabled = false
from public.tenants t
where tm.tenant_id = t.id
  and t.slug = 'cd-demo'
  and tm.module_key not in
    ('visao','lojas','radar','resp-avaliacoes','cardapio-ifood',
     'cora','aprovacoes','contratos','hub','config',
     'atividade','custos','configsys','acesso','auditoria','notificacoes');
