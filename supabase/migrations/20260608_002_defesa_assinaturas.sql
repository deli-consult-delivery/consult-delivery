-- =============================================================
-- PR10 — assinaturas da Defesa (R$147/loja/mês, sem setup — D7)
-- APROVADA pelo Wandson e APLICADA em 2026-06-08.
-- =============================================================

create table if not exists public.defesa_assinaturas (
  id                     uuid primary key default gen_random_uuid(),
  tenant_id              uuid not null references public.tenants(id),
  asaas_customer_id      text,
  asaas_subscription_id  text unique,
  status                 text not null default 'pendente'
                         check (status in ('pendente','ativa','atrasada','cancelada')),
  valor_centavos         integer not null default 14700,
  ciclo                  text not null default 'MONTHLY',
  ultima_cobranca_status text,
  link_pagamento         text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create index if not exists defesa_assinaturas_tenant_idx on public.defesa_assinaturas (tenant_id);

alter table public.defesa_assinaturas enable row level security;

-- Membro do tenant LÊ a própria assinatura; escrita só via service role (worker)
drop policy if exists defesa_assinaturas_select on public.defesa_assinaturas;
create policy defesa_assinaturas_select on public.defesa_assinaturas
  for select using (public.is_member_of(tenant_id));
