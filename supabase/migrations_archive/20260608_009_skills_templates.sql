-- =============================================================
-- GAP-5 Habilidades (skills) + GAP-8 Templates (ofertas)
-- APLICADA pela sessão principal em 2026-06-08 (plataforma completa).
-- Aditivo. Isolamento provado (intruso 0/0).
-- =============================================================

create table if not exists public.agent_skills (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid references public.tenants(id),
  nome        text not null,
  descricao   text,
  conteudo    text,
  ativo       boolean not null default true,
  created_by  uuid,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists agent_skills_tenant_idx on public.agent_skills (tenant_id);
alter table public.agent_skills enable row level security;
drop policy if exists agent_skills_select on public.agent_skills;
create policy agent_skills_select on public.agent_skills for select
  using (tenant_id is null or public.is_member_of(tenant_id));
drop policy if exists agent_skills_write on public.agent_skills;
create policy agent_skills_write on public.agent_skills for all
  using (tenant_id is not null and public.is_admin_of(tenant_id))
  with check (tenant_id is not null and public.is_admin_of(tenant_id));

create table if not exists public.templates (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id),
  tipo        text not null default 'mensagem' check (tipo in ('mensagem','oferta')),
  nome        text not null,
  conteudo    text,
  ativo       boolean not null default true,
  created_by  uuid,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists templates_tenant_idx on public.templates (tenant_id, tipo);
alter table public.templates enable row level security;
drop policy if exists templates_select on public.templates;
create policy templates_select on public.templates for select using (public.is_member_of(tenant_id));
drop policy if exists templates_write on public.templates;
create policy templates_write on public.templates for all
  using (public.is_admin_of(tenant_id)) with check (public.is_admin_of(tenant_id));
