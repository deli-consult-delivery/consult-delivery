-- =============================================================
-- F1 Defesa Comercial (D6) — PR3: tabela de casos + view de métricas
-- Estados: rascunho → aguardando_ok → aprovado → enviado → ganho|perdido (ou descartado)
-- Valores em CENTAVOS (int) para evitar erro de float.
-- NÃO APLICAR sem aprovação do Wandson (D5 v2).
-- =============================================================

create table if not exists public.defesa_casos (
  id                       uuid primary key default gen_random_uuid(),
  tenant_id                uuid not null references public.tenants(id),
  loja_id                  uuid references public.lojas(id),
  canal                    text not null default 'ifood',
  tipo                     text not null check (tipo in ('cancelamento','avaliacao')),
  pedido_ref               text,
  valor_centavos           integer not null default 0,
  motivo                   text,
  analise                  jsonb,            -- raciocínio do agente (chance de vitória, evidências)
  draft_resposta           text,             -- contestação/resposta preparada
  status                   text not null default 'aguardando_ok'
                           check (status in ('rascunho','aguardando_ok','aprovado','enviado','ganho','perdido','descartado')),
  resultado_valor_centavos integer,          -- R$ efetivamente defendido (quando ganho)
  criado_por_agente        text not null default 'defesa',
  aprovado_por             uuid,             -- auth.users.id de quem deu o OK
  aprovado_em              timestamptz,
  enviado_em               timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index if not exists defesa_casos_tenant_status_idx on public.defesa_casos (tenant_id, status);
create index if not exists defesa_casos_tenant_created_idx on public.defesa_casos (tenant_id, created_at desc);

alter table public.defesa_casos enable row level security;

-- Leitura: membros do tenant
drop policy if exists defesa_casos_select on public.defesa_casos;
create policy defesa_casos_select on public.defesa_casos
  for select using (public.is_member_of(tenant_id));

-- Escrita: membros do tenant (aprovar/descartar); agente grava via service role (bypassa RLS)
drop policy if exists defesa_casos_insert on public.defesa_casos;
create policy defesa_casos_insert on public.defesa_casos
  for insert with check (public.is_member_of(tenant_id));

drop policy if exists defesa_casos_update on public.defesa_casos;
create policy defesa_casos_update on public.defesa_casos
  for update using (public.is_member_of(tenant_id))
  with check (public.is_member_of(tenant_id));

-- Sem policy de DELETE: caso não se apaga, se descarta (auditoria).

-- Métricas “R$ defendido” por tenant/mês (view simples; RLS da tabela se aplica)
create or replace view public.defesa_metricas_mensal
with (security_invoker = true) as
select
  tenant_id,
  date_trunc('month', created_at) as mes,
  count(*)                                              as casos_total,
  count(*) filter (where status = 'aguardando_ok')      as aguardando_ok,
  count(*) filter (where status = 'ganho')              as ganhos,
  count(*) filter (where status in ('enviado','aprovado')) as em_andamento,
  coalesce(sum(resultado_valor_centavos) filter (where status = 'ganho'), 0) as defendido_centavos
from public.defesa_casos
group by tenant_id, date_trunc('month', created_at);
