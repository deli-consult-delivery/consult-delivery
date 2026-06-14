-- =============================================================
-- VendaERP — integração (Fase 1, MVP read-only)
--
-- ADITIVO e REVERSÍVEL. Segue o padrão de 20260609_004_leva3_integracoes.sql
-- (tenant_id NOT NULL + RLS por tenant via public.is_member_of).
-- Reverter: drop table public.vendaerp_instances cascade;
--           delete from public.tenant_integracoes where nome = 'VendaERP';
--
-- SEGURANÇA / SECRETS:
--   vendaerp_instances guarda o ENDEREÇO da instância e quem a usa — NÃO é a
--   fonte de credencial na Fase 1. Na Fase 1 a credencial (3 headers) vive SÓ no
--   env do Bridge (Infisical: VENDAERP_TOKEN/USER/APP). Esta tabela fica pronta
--   para a Fase 3 (multi-tenant): aí o token será cifrado (Supabase Vault), nunca
--   em texto puro. Por isso só há policy de SELECT para membros; a escrita é via
--   service_role (equipe CD) que bypassa RLS.
--   NENHUM segredo em texto puro deve ir aqui na Fase 1.
-- =============================================================

-- ---------- 1. Instâncias VendaERP por tenant (pronta p/ Fase 3) --------------
create table if not exists public.vendaerp_instances (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id),
  base_url      text not null default 'https://cw.vendaerp.com.br',
  -- Fase 1: credencial vem do env do Bridge. Estes campos ficam NULL até a Fase 3,
  -- quando passam a guardar referência cifrada (Vault), nunca o token puro.
  token_ref     text,                                       -- ref/segredo cifrado (Fase 3)
  user_ref      text,
  app_ref       text,
  status        text not null default 'pendente' check (status in ('conectada','pendente','desconectada')),
  last_check_at timestamptz,
  created_at    timestamptz not null default now(),
  unique (tenant_id)
);
create index if not exists vendaerp_instances_tenant_idx on public.vendaerp_instances (tenant_id);
alter table public.vendaerp_instances enable row level security;
drop policy if exists vendaerp_instances_select on public.vendaerp_instances;
create policy vendaerp_instances_select on public.vendaerp_instances
  for select using (public.is_member_of(tenant_id));

-- ---------- 2. Linha na tela de Integrações ----------------------------------
-- Aparece em Console v2 · "Integrações". Idempotente: só insere se não existir.
insert into public.tenant_integracoes (tenant_id, nome, status, usada_por, ordem)
select t.id, 'VendaERP', 'conectada', 'Hermes · Console', 50
from public.tenants t
where not exists (
  select 1 from public.tenant_integracoes ti
  where ti.tenant_id = t.id and ti.nome = 'VendaERP'
);
