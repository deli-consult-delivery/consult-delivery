-- =============================================================
-- Console v2 — 5 telas funcionais (Gatilhos, Tópicos, Tarefas,
-- Links compartilhados, Arquivos). ADITIVO e reversível.
-- Cada tabela: tenant_id NOT NULL + RLS por tenant (is_member_of)
-- nos 4 verbos (select/insert/update/delete) p/ CRUD do console.
-- Segue o padrão de 20260608_008_analise_loja.sql.
-- Próxima ação #1 do Tracker (PLANO-MESTRE). SQL p/ aprovação do Wandson.
-- =============================================================

-- ---------- 1. Gatilhos -------------------------------------------------------
create table if not exists public.tenant_gatilhos (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id),
  nome         text not null,
  fonte        text not null default 'whatsapp',     -- whatsapp | asaas | ifood | manual
  acao         text not null default '',
  ativo        boolean not null default true,
  execucoes_7d integer not null default 0,
  created_by   uuid,
  created_at   timestamptz not null default now()
);
create index if not exists tenant_gatilhos_tenant_idx on public.tenant_gatilhos (tenant_id, created_at desc);
alter table public.tenant_gatilhos enable row level security;
drop policy if exists tenant_gatilhos_select on public.tenant_gatilhos;
create policy tenant_gatilhos_select on public.tenant_gatilhos for select using (public.is_member_of(tenant_id));
drop policy if exists tenant_gatilhos_insert on public.tenant_gatilhos;
create policy tenant_gatilhos_insert on public.tenant_gatilhos for insert with check (public.is_member_of(tenant_id));
drop policy if exists tenant_gatilhos_update on public.tenant_gatilhos;
create policy tenant_gatilhos_update on public.tenant_gatilhos for update using (public.is_member_of(tenant_id)) with check (public.is_member_of(tenant_id));
drop policy if exists tenant_gatilhos_delete on public.tenant_gatilhos;
create policy tenant_gatilhos_delete on public.tenant_gatilhos for delete using (public.is_member_of(tenant_id));

-- ---------- 2. Tópicos --------------------------------------------------------
create table if not exists public.tenant_topicos (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id),
  titulo      text not null,
  prioridade  text not null default 'media' check (prioridade in ('baixa','media','alta','urgente')),
  responsavel text,
  status      text not null default 'aberto' check (status in ('aberto','em_andamento','concluido','arquivado')),
  created_by  uuid,
  created_at  timestamptz not null default now()
);
create index if not exists tenant_topicos_tenant_idx on public.tenant_topicos (tenant_id, status, created_at desc);
alter table public.tenant_topicos enable row level security;
drop policy if exists tenant_topicos_select on public.tenant_topicos;
create policy tenant_topicos_select on public.tenant_topicos for select using (public.is_member_of(tenant_id));
drop policy if exists tenant_topicos_insert on public.tenant_topicos;
create policy tenant_topicos_insert on public.tenant_topicos for insert with check (public.is_member_of(tenant_id));
drop policy if exists tenant_topicos_update on public.tenant_topicos;
create policy tenant_topicos_update on public.tenant_topicos for update using (public.is_member_of(tenant_id)) with check (public.is_member_of(tenant_id));
drop policy if exists tenant_topicos_delete on public.tenant_topicos;
create policy tenant_topicos_delete on public.tenant_topicos for delete using (public.is_member_of(tenant_id));

-- ---------- 3. Tarefas agendadas ---------------------------------------------
create table if not exists public.tenant_tarefas (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants(id),
  titulo     text not null,
  agente     text,
  quando     timestamptz,
  status     text not null default 'agendada' check (status in ('agendada','executando','concluida','cancelada')),
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists tenant_tarefas_tenant_idx on public.tenant_tarefas (tenant_id, quando, status);
alter table public.tenant_tarefas enable row level security;
drop policy if exists tenant_tarefas_select on public.tenant_tarefas;
create policy tenant_tarefas_select on public.tenant_tarefas for select using (public.is_member_of(tenant_id));
drop policy if exists tenant_tarefas_insert on public.tenant_tarefas;
create policy tenant_tarefas_insert on public.tenant_tarefas for insert with check (public.is_member_of(tenant_id));
drop policy if exists tenant_tarefas_update on public.tenant_tarefas;
create policy tenant_tarefas_update on public.tenant_tarefas for update using (public.is_member_of(tenant_id)) with check (public.is_member_of(tenant_id));
drop policy if exists tenant_tarefas_delete on public.tenant_tarefas;
create policy tenant_tarefas_delete on public.tenant_tarefas for delete using (public.is_member_of(tenant_id));

-- ---------- 4. Links compartilhados ------------------------------------------
create table if not exists public.tenant_links (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants(id),
  arquivo    text not null,
  url        text not null,
  expira_em  timestamptz,
  acessos    integer not null default 0,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists tenant_links_tenant_idx on public.tenant_links (tenant_id, created_at desc);
alter table public.tenant_links enable row level security;
drop policy if exists tenant_links_select on public.tenant_links;
create policy tenant_links_select on public.tenant_links for select using (public.is_member_of(tenant_id));
drop policy if exists tenant_links_insert on public.tenant_links;
create policy tenant_links_insert on public.tenant_links for insert with check (public.is_member_of(tenant_id));
drop policy if exists tenant_links_update on public.tenant_links;
create policy tenant_links_update on public.tenant_links for update using (public.is_member_of(tenant_id)) with check (public.is_member_of(tenant_id));
drop policy if exists tenant_links_delete on public.tenant_links;
create policy tenant_links_delete on public.tenant_links for delete using (public.is_member_of(tenant_id));

-- ---------- 5. Arquivos (workspace) ------------------------------------------
-- Colunas casam com o select já existente em CvNovas.jsx::Arquivos.
create table if not exists public.tenant_files (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id),
  name         text not null,
  folder       text not null default '/',
  size_bytes   bigint,
  storage_path text,
  created_by   uuid,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists tenant_files_tenant_idx on public.tenant_files (tenant_id, folder, updated_at desc);
alter table public.tenant_files enable row level security;
drop policy if exists tenant_files_select on public.tenant_files;
create policy tenant_files_select on public.tenant_files for select using (public.is_member_of(tenant_id));
drop policy if exists tenant_files_insert on public.tenant_files;
create policy tenant_files_insert on public.tenant_files for insert with check (public.is_member_of(tenant_id));
drop policy if exists tenant_files_update on public.tenant_files;
create policy tenant_files_update on public.tenant_files for update using (public.is_member_of(tenant_id)) with check (public.is_member_of(tenant_id));
drop policy if exists tenant_files_delete on public.tenant_files;
create policy tenant_files_delete on public.tenant_files for delete using (public.is_member_of(tenant_id));
