-- =============================================================
-- Fecha RLS das 3 tabelas com RLS habilitado e ZERO policy (deny-all).
-- APLICADA na noite autônoma 2026-06-08. Todas vazias (0 linhas), aditivo.
-- =============================================================

alter table public.customer_groups add column if not exists tenant_id uuid references public.tenants(id);

drop policy if exists customer_groups_select on public.customer_groups;
create policy customer_groups_select on public.customer_groups
  for select using (tenant_id is not null and public.is_member_of(tenant_id));
drop policy if exists customer_groups_write on public.customer_groups;
create policy customer_groups_write on public.customer_groups
  for all using (tenant_id is not null and public.is_admin_of(tenant_id))
  with check (tenant_id is not null and public.is_admin_of(tenant_id));

drop policy if exists customer_group_members_select on public.customer_group_members;
create policy customer_group_members_select on public.customer_group_members
  for select using (exists (
    select 1 from public.customers c
    where c.id = customer_group_members.customer_id and public.is_member_of(c.tenant_id)
  ));
drop policy if exists customer_group_members_write on public.customer_group_members;
create policy customer_group_members_write on public.customer_group_members
  for all using (exists (
    select 1 from public.customers c
    where c.id = customer_group_members.customer_id and public.is_admin_of(c.tenant_id)
  )) with check (exists (
    select 1 from public.customers c
    where c.id = customer_group_members.customer_id and public.is_admin_of(c.tenant_id)
  ));

drop policy if exists tarefas_analise_select on public.tarefas_analise;
create policy tarefas_analise_select on public.tarefas_analise
  for select using (exists (
    select 1 from public.analises a
    where a.id = tarefas_analise.analise_id and public.is_member_of(a.tenant_id)
  ));
drop policy if exists tarefas_analise_write on public.tarefas_analise;
create policy tarefas_analise_write on public.tarefas_analise
  for all using (exists (
    select 1 from public.analises a
    where a.id = tarefas_analise.analise_id and public.is_member_of(a.tenant_id)
  )) with check (exists (
    select 1 from public.analises a
    where a.id = tarefas_analise.analise_id and public.is_member_of(a.tenant_id)
  ));
