-- =============================================================
-- Agentes CARDÁPIO e MULTICANAL — tabela genérica + seed
-- APLICADA na noite autônoma 2026-06-08. Aditivo. Isolamento provado.
-- =============================================================

create table if not exists public.agente_analises (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id),
  agente        text not null,
  loja_id       uuid references public.lojas(id),
  status        text not null default 'pendente' check (status in ('pendente','processado','erro')),
  resultado     jsonb,
  erro_detalhe  text,
  custo_usd     numeric,
  solicitado_por uuid,
  processado_em timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists agente_analises_idx on public.agente_analises (tenant_id, agente, status, created_at desc);

alter table public.agente_analises enable row level security;
drop policy if exists agente_analises_select on public.agente_analises;
create policy agente_analises_select on public.agente_analises for select using (public.is_member_of(tenant_id));
drop policy if exists agente_analises_insert on public.agente_analises;
create policy agente_analises_insert on public.agente_analises for insert with check (public.is_member_of(tenant_id));

insert into public.agents (id, name, role, letter, color, description, is_active, category, is_custom) values
  ('cardapio','Cardápio','Otimizador de cardápio iFood','C','#B70C00','Analisa o funil e os itens do cardápio e sugere nomes, descrições e preços que convertem mais.',true,'specialist',false),
  ('multicanal','Multicanal','Consolidador multicanal','M','#B70C00','Consolida as métricas dos canais de delivery num resumo único e aponta onde focar.',true,'specialist',false)
on conflict (id) do nothing;

insert into public.tenant_agents (tenant_id, agent_id) values
  ('9079bd4d-4df7-4023-90fb-d79c8ba7e900','cardapio'),
  ('9079bd4d-4df7-4023-90fb-d79c8ba7e900','multicanal')
on conflict do nothing;
