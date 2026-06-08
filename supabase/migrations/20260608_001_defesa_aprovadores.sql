-- PR8 (C4) · Allowlist de aprovadores do "@defesa" via WhatsApp
-- Quem pode aprovar/descartar casos com "@defesa ok|descartar" na conversa.
-- Regra de transição: allowlist VAZIA para o tenant = modo aberto (comportamento
-- atual da F1, com rastro). >=1 aprovador ativo = só quem está na lista.

create table if not exists public.defesa_aprovadores (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id),
  loja_id      uuid references public.lojas(id),  -- null = todas as lojas do tenant (escopo por loja: uso futuro)
  telefone_jid text not null,                     -- JID WhatsApp, ex.: 55949XXXXXXX@s.whatsapp.net
  nome         text,
  ativo        boolean not null default true,
  created_at   timestamptz not null default now(),
  created_by   uuid references auth.users(id)
);

create unique index if not exists defesa_aprovadores_uniq
  on public.defesa_aprovadores (tenant_id, telefone_jid, coalesce(loja_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index if not exists defesa_aprovadores_tenant_idx
  on public.defesa_aprovadores (tenant_id) where ativo;

alter table public.defesa_aprovadores enable row level security;

-- Mesmo padrão de defesa_casos: membros do tenant gerem a lista (é config, não auditoria)
drop policy if exists defesa_aprovadores_select on public.defesa_aprovadores;
create policy defesa_aprovadores_select on public.defesa_aprovadores
  for select using (public.is_member_of(tenant_id));

drop policy if exists defesa_aprovadores_insert on public.defesa_aprovadores;
create policy defesa_aprovadores_insert on public.defesa_aprovadores
  for insert with check (public.is_member_of(tenant_id));

drop policy if exists defesa_aprovadores_update on public.defesa_aprovadores;
create policy defesa_aprovadores_update on public.defesa_aprovadores
  for update using (public.is_member_of(tenant_id))
  with check (public.is_member_of(tenant_id));

drop policy if exists defesa_aprovadores_delete on public.defesa_aprovadores;
create policy defesa_aprovadores_delete on public.defesa_aprovadores
  for delete using (public.is_member_of(tenant_id));
