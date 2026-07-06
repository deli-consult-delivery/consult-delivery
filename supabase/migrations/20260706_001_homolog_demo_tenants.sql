-- Cria 2 tenants (tipo store, filhos da agencia raiz "consult") para o plano
-- de homologacao iFood aprovado 2026-07-06: App 1 = categoria Avaliacoes
-- (Merchant+Review) primeiro. Restringe o Console v2 de cada um via
-- tenant_modules (allowlist ja existente, ConsoleV2.jsx ~712-730 — curadoria
-- por SQL, zero sistema novo).
-- Idempotente: rodavel 2x sem erro (ON CONFLICT em ambos os INSERTs).

insert into public.tenants (slug, name, tenant_type, parent_tenant_id)
values
  ('cd-homolog', 'Homologação iFood', 'store', '9079bd4d-4df7-4023-90fb-d79c8ba7e900'),
  ('cd-demo', 'Demo Consult Delivery', 'store', '9079bd4d-4df7-4023-90fb-d79c8ba7e900')
on conflict (slug) do nothing;

-- T-HOMOLOG: 8 telas, zero branding de agentes (App 1 = Merchant+Review only —
-- ainda sem Catalogo/Financeiro). ponytail: lista pragmatica, ajustar via
-- Clientes -> Telas ou nova migration se o checklist de homologacao pedir mais.
insert into public.tenant_modules (tenant_id, module_key, enabled)
select t.id, m.module_key, true
from public.tenants t
cross join (values
  ('visao'), ('lojas'), ('ativar'),
  ('avaliacoes'), ('resp-avaliacoes'), ('avaliacao-config'), ('csat'), ('nps')
) as m(module_key)
where t.slug = 'cd-homolog'
on conflict (tenant_id, module_key) do nothing;

-- T-DEMO: 17+ telas, snapshot amplo do SaaS p/ prospect (Operacao + Avaliacoes +
-- Agentes IA) — exclui telas de admin/sistema internas. ponytail: lista
-- pragmatica, ajustar via Clientes -> Telas ou nova migration se o pitch mudar.
insert into public.tenant_modules (tenant_id, module_key, enabled)
select t.id, m.module_key, true
from public.tenants t
cross join (values
  ('visao'), ('crm'), ('lojas'), ('chat'), ('respostas-rapidas'), ('cora'),
  ('radar'), ('cardapio-ifood'), ('ativar'), ('campanhas'),
  ('avaliacoes'), ('resp-avaliacoes'), ('avaliacao-config'), ('csat'), ('nps'),
  ('deli'), ('gestor'), ('gestor-dashboard')
) as m(module_key)
where t.slug = 'cd-demo'
on conflict (tenant_id, module_key) do nothing;
