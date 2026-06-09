-- =============================================================
-- LEVA 3 — 1 tabela que tira tela do mock hardcoded:
--   1. tenant_integracoes → Console v2 · "Integrações" (CvNovas.jsx::Integracoes)
--
-- ADITIVO e REVERSÍVEL. Segue o padrão de 20260609_003_leva2_provedores_sistemas_crm_notas.sql
-- (tenant_id NOT NULL + RLS por tenant via public.is_member_of).
-- Reverter: drop table public.tenant_integracoes cascade.
--
-- SEGURANÇA / SECRETS:
--   tenant_integracoes é tela de LEITURA — igual a tenant_provedores e tenant_sistemas.
--   A configuração das integrações (WhatsApp/Evolution, Asaas, iFood, Telegram) é feita
--   pela equipe CD (cofre Infisical). Por isso só tem policy de SELECT para membros do
--   tenant; a escrita é feita via service_role (que bypassa RLS).
--   NENHUMA chave de API, token ou segredo vai no banco: a tabela guarda apenas o NOME
--   da integração, seu status de conexão e quais agentes a usam (texto de exibição).
--
-- Próxima ação do Tracker (PLANO-MESTRE · LEVA 3). SQL p/ aprovação do Wandson.
-- =============================================================

-- ---------- 1. Integrações ---------------------------------------------------
-- Colunas casam com a tela Integracoes: Integração · Status · Usada por.
create table if not exists public.tenant_integracoes (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants(id),
  nome       text not null,                                 -- WhatsApp (Evolution) | Asaas | iFood (planilhas) | Telegram interno
  status     text not null default 'conectada' check (status in ('conectada','pendente','desconectada')),
  usada_por  text,                                          -- agentes que usam, p/ exibir — ex.: 'BRENO · MIA · Bom Dia'
  ordem      integer not null default 0,                    -- ordenação na tela
  created_at timestamptz not null default now()
);
create index if not exists tenant_integracoes_tenant_idx on public.tenant_integracoes (tenant_id, ordem);
alter table public.tenant_integracoes enable row level security;
-- Só leitura para membros; escrita = service_role (equipe CD) via bypass de RLS.
drop policy if exists tenant_integracoes_select on public.tenant_integracoes;
create policy tenant_integracoes_select on public.tenant_integracoes for select using (public.is_member_of(tenant_id));
