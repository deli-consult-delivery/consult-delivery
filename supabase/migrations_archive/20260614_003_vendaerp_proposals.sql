-- =============================================================
-- VendaERP — Fase 2: propostas de escrita pendentes de confirmação.
--
-- ADITIVO e REVERSÍVEL. Padrão de 20260614_002_vendaerp.sql
-- (tenant_id NOT NULL + RLS por tenant via public.is_member_of).
-- Reverter: drop table public.vendaerp_proposals cascade;
--
-- Uma linha = uma operação de escrita PROPOSTA pelo Hermes, aguardando
-- "sim" do usuário no Telegram. O MCP grava via service_role (bypassa RLS);
-- o Console (futuro) lê via RLS de membro. NENHUM segredo aqui — só o
-- endpoint do Bridge e o payload de negócio.
-- =============================================================

create table if not exists public.vendaerp_proposals (
  id           uuid primary key default gen_random_uuid(),       -- = proposal_id
  tenant_id    uuid not null references public.tenants(id),
  tipo         text not null
    check (tipo in ('oportunidade','lancamento','boleto','nfe','estoque')),
  endpoint     text not null,                                    -- sub-path do Bridge, ex. /oportunidade
  http_method  text not null default 'POST',
  payload      jsonb not null,
  resumo       text not null,                                    -- linha legível mostrada no Telegram
  status       text not null default 'pending'
    check (status in ('pending','confirmed','executed','failed','expired','cancelled')),
  token        text not null,                                    -- gerado no propor (auditoria)
  origin       text not null default 'hermes',
  expires_at   timestamptz not null default (now() + interval '10 minutes'),
  executed_at  timestamptz,
  resultado    jsonb,
  erro         text,
  created_by   text,                                             -- principal do MCP (ceo_agent)
  created_at   timestamptz not null default now()
);

-- Índice parcial: o caminho quente é "propostas pendentes deste tenant".
create index if not exists idx_vendaerp_proposals_pending
  on public.vendaerp_proposals (tenant_id, status)
  where status = 'pending';

alter table public.vendaerp_proposals enable row level security;

drop policy if exists vendaerp_proposals_select on public.vendaerp_proposals;
create policy vendaerp_proposals_select on public.vendaerp_proposals
  for select using (public.is_member_of(tenant_id));
