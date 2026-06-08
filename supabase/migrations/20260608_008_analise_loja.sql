-- =============================================================
-- Agente ANÁLISE DE LOJA — fila + resultado (aditivo, não-destrutivo)
-- APLICADA pela sessão principal em 2026-06-08 (mandato plataforma completa).
-- Isolamento provado (intruso 0). Seed do agente no catálogo.
-- =============================================================

create table if not exists public.analise_loja (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id),
  loja_id       uuid references public.lojas(id),
  status        text not null default 'pendente' check (status in ('pendente','processado','erro')),
  diagnostico   jsonb,
  erro_detalhe  text,
  custo_usd     numeric,
  solicitado_por uuid,
  processado_em timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists analise_loja_tenant_idx on public.analise_loja (tenant_id, status, created_at desc);

alter table public.analise_loja enable row level security;

drop policy if exists analise_loja_select on public.analise_loja;
create policy analise_loja_select on public.analise_loja for select using (public.is_member_of(tenant_id));
drop policy if exists analise_loja_insert on public.analise_loja;
create policy analise_loja_insert on public.analise_loja for insert with check (public.is_member_of(tenant_id));

insert into public.agents (id, name, role, letter, color, description, is_active, category, is_custom)
values ('analise-loja','Análise de Loja','Consultor de performance iFood','A','#B70C00',
        'Analisa os relatórios da loja (vendas, taxas, cancelamentos, cardápio) e entrega um diagnóstico com prioridades e plano de ação.',
        true,'specialist',false)
on conflict (id) do nothing;

insert into public.tenant_agents (tenant_id, agent_id)
values ('9079bd4d-4df7-4023-90fb-d79c8ba7e900','analise-loja')
on conflict do nothing;
