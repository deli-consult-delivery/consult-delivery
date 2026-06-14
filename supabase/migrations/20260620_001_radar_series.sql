-- Dashboard iFood — Fase 5: série diária de verdade (radar_series)
--
-- Por que: radar_metricas é EAV agregado por período. Onde a fonte do iFood
-- tem grão fino (Operação: colunas por dia; Cancelamentos: 1 linha/cancelamento;
-- Logística: 'DATA E HORA DO PEDIDO') existe série diária real que hoje o parser
-- calcula e DESCARTA (serie(label) em processar-fontes.ts colapsa o vetor por dia).
-- Esta tabela persiste esse grão SEM inflar o metadata jsonb de radar_metricas
-- (colunar, 1 linha/métrica/dia). Vendas/Cardápio/Conciliação continuam SEM série
-- (iFood entrega agregado — fabricar diário seria inventar dado, anti-padrão P1).
--
-- Idempotência: o cron espelha o DELETE-por-fonte_id de radar_metricas antes de
-- reinserir (reprocessar uma fonte recria a série limpa).
--
-- RLS: espelha radar_metricas — select por is_member_of(tenant_id); SEM policy de
-- INSERT por design (escrita vem do cron via service role, que bypassa RLS).
-- Aditivo/reversível: CREATE TABLE IF NOT EXISTS.

create table if not exists public.radar_series (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants(id),
  loja_id    uuid references public.lojas(id),
  fonte_id   uuid references public.radar_fontes(id),
  metrica    text not null,
  dia        date not null,
  valor      numeric,
  metadata   jsonb,
  created_at timestamptz not null default now()
);

-- Lookup do dashboard: filtra por tenant+loja+métrica e ordena por dia.
create index if not exists radar_series_lookup_idx
  on public.radar_series (tenant_id, loja_id, metrica, dia);

-- Idempotência do cron: DELETE-por-fonte_id antes de reinserir.
create index if not exists radar_series_fonte_idx
  on public.radar_series (fonte_id);

alter table public.radar_series enable row level security;

drop policy if exists radar_series_select on public.radar_series;
create policy radar_series_select on public.radar_series
  for select using (public.is_member_of(tenant_id));

-- Sem policy de INSERT por design: a escrita vem do cron (service role, bypassa RLS),
-- igual a radar_metricas (ver 20260613_001_radar_fontes_metricas_captura.sql).

comment on table public.radar_series is
  'Série diária de verdade do Dashboard iFood (Fase 5). Grão fino por dia onde a fonte tem (Operação/Cancelamentos/Logística). Escrita pelo cron radarProcessarFontes via service role.';
