-- =============================================================
-- LEVA 2 — 3 tabelas que tiram telas do mock hardcoded:
--   1. tenant_provedores  → Console v2 · "Provedores de IA"  (CvNovas.jsx::Provedores)
--   2. tenant_sistemas     → Console v2 · "Sistemas externos" (CvNovas.jsx::Sistemas)
--   3. crm_notas           → CRM · aba "Notas" do cliente     (CRMScreen.jsx::NotesTab)
--
-- ADITIVO e REVERSÍVEL. Segue o padrão de 20260609_001_console_v2_telas_novas.sql
-- (tenant_id NOT NULL + RLS por tenant via public.is_member_of).
-- Reverter: drop das 3 tabelas (drop table ... cascade).
--
-- SEGURANÇA / SECRETS:
--   tenant_provedores e tenant_sistemas são telas de LEITURA — a configuração é
--   feita pela equipe CD (cofre Infisical). Por isso só têm policy de SELECT para
--   membros do tenant; a escrita é feita via service_role (que bypassa RLS).
--   NENHUMA chave de API vai no banco: a coluna chave_ref guarda apenas o NOME da
--   referência no cofre (ex.: 'ANTHROPIC_API_KEY'), nunca o segredo em si.
--
--   crm_notas é conteúdo operacional da equipe do tenant sobre seus clientes →
--   CRUD completo por membro (4 verbos), igual às tabelas do console.
--
-- Próxima ação #2e do Tracker (PLANO-MESTRE · LEVA 2). SQL p/ aprovação do Wandson.
-- =============================================================

-- ---------- 1. Provedores de IA (BYO-key) ------------------------------------
-- Colunas casam com a tela Provedores: Provider · Modelo padrão · Chave · Status.
create table if not exists public.tenant_provedores (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id),
  provider      text not null,                              -- Anthropic | OpenRouter | Ollama Cloud | ...
  modelo_padrao text,                                       -- ex.: claude-sonnet-4-6
  chave_ref     text,                                       -- NOME do secret no cofre Infisical — NUNCA a chave
  status        text not null default 'ativo' check (status in ('ativo','fallback','inativo')),
  ordem         integer not null default 0,                 -- ordenação na tela
  created_at    timestamptz not null default now()
);
create index if not exists tenant_provedores_tenant_idx on public.tenant_provedores (tenant_id, ordem);
alter table public.tenant_provedores enable row level security;
-- Só leitura para membros; escrita = service_role (equipe CD) via bypass de RLS.
drop policy if exists tenant_provedores_select on public.tenant_provedores;
create policy tenant_provedores_select on public.tenant_provedores for select using (public.is_member_of(tenant_id));

-- ---------- 2. Sistemas externos ---------------------------------------------
-- Colunas casam com a tela Sistemas: Sistema · Endereço · Tipo.
create table if not exists public.tenant_sistemas (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants(id),
  nome       text not null,                                 -- Painel iFood | Asaas | ...
  endereco   text,                                          -- portal.ifood.com.br | asaas.com | ...
  tipo       text,                                          -- canal | pagamento | gestao | ...
  ordem      integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists tenant_sistemas_tenant_idx on public.tenant_sistemas (tenant_id, ordem);
alter table public.tenant_sistemas enable row level security;
drop policy if exists tenant_sistemas_select on public.tenant_sistemas;
create policy tenant_sistemas_select on public.tenant_sistemas for select using (public.is_member_of(tenant_id));

-- ---------- 3. Notas internas do CRM -----------------------------------------
-- Aba "Notas" do detalhe do cliente. on delete cascade: nota some com o cliente.
create table if not exists public.crm_notas (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id),
  customer_id uuid not null references public.customers(id) on delete cascade,
  texto       text not null,
  autor_id    uuid,                                          -- auth.uid() de quem escreveu
  autor_nome  text,                                          -- nome p/ exibir sem join
  created_at  timestamptz not null default now()
);
create index if not exists crm_notas_customer_idx on public.crm_notas (tenant_id, customer_id, created_at desc);
alter table public.crm_notas enable row level security;
drop policy if exists crm_notas_select on public.crm_notas;
create policy crm_notas_select on public.crm_notas for select using (public.is_member_of(tenant_id));
drop policy if exists crm_notas_insert on public.crm_notas;
create policy crm_notas_insert on public.crm_notas for insert with check (public.is_member_of(tenant_id));
drop policy if exists crm_notas_update on public.crm_notas;
create policy crm_notas_update on public.crm_notas for update using (public.is_member_of(tenant_id)) with check (public.is_member_of(tenant_id));
drop policy if exists crm_notas_delete on public.crm_notas;
create policy crm_notas_delete on public.crm_notas for delete using (public.is_member_of(tenant_id));
