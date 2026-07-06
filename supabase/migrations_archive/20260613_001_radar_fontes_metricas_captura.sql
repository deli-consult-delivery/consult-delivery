-- =============================================================
-- RADAR — captura versionada de radar_fontes + radar_metricas (aditivo, idempotente)
-- O schema JÁ EXISTE em produção (aplicado em 2026-06-08, version 20260608043442
-- "radar_fontes_metricas"), mas nunca foi versionado como arquivo .sql no repo (drift).
-- Esta migration captura o DDL real de prod 1:1 para o git — todos os objetos com
-- IF NOT EXISTS / drop-create, logo é no-op sobre prod e reprodutível em ambiente novo.
-- Pipeline: Importar relatórios -> bucket 'radar' -> radar_fontes (pendente)
--   -> cron radar-processar-fontes -> radar_metricas (EAV) -> dashboard RadarReal.
-- =============================================================

-- ---------- radar_fontes: 1 linha por relatório enviado ----------
create table if not exists public.radar_fontes (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants(id),
  loja_id        uuid references public.lojas(id),
  tipo_relatorio text,
  origem         text not null default 'planilha' check (origem in ('planilha','print')),
  arquivo_path   text not null,
  arquivo_nome   text,
  periodo_inicio date,
  periodo_fim    date,
  status         text not null default 'pendente' check (status in ('pendente','processado','erro')),
  erro_detalhe   text,
  resumo         jsonb,
  custo_usd      numeric,
  enviado_por    uuid,
  processado_em  timestamptz,
  created_at     timestamptz not null default now()
);
create index if not exists radar_fontes_tenant_idx on public.radar_fontes (tenant_id, status);

alter table public.radar_fontes enable row level security;

drop policy if exists radar_fontes_select on public.radar_fontes;
create policy radar_fontes_select on public.radar_fontes for select using (public.is_member_of(tenant_id));
drop policy if exists radar_fontes_insert on public.radar_fontes;
create policy radar_fontes_insert on public.radar_fontes for insert with check (public.is_member_of(tenant_id));

-- ---------- radar_metricas: EAV — N métricas por fonte ----------
-- Sem policy de INSERT por design: a escrita vem do cron (service role, bypassa RLS).
create table if not exists public.radar_metricas (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants(id),
  loja_id        uuid references public.lojas(id),
  fonte_id       uuid references public.radar_fontes(id),
  metrica        text not null,
  valor          numeric,
  valor_texto    text,
  periodo_inicio date,
  periodo_fim    date,
  metadata       jsonb,
  created_at     timestamptz not null default now()
);
create index if not exists radar_metricas_tenant_metrica_idx on public.radar_metricas (tenant_id, metrica, periodo_fim desc);

alter table public.radar_metricas enable row level security;

drop policy if exists radar_metricas_select on public.radar_metricas;
create policy radar_metricas_select on public.radar_metricas for select using (public.is_member_of(tenant_id));
