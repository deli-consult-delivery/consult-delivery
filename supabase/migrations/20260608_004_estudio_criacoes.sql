-- =============================================================
-- E1 — Estúdio de Conteúdo: tabela de criações + bucket + seed
-- NÃO APLICAR sem aprovação do Wandson (D5 v2).
-- Padrão de disparo do app (PR10): tela grava status='fila' →
-- task cron 'estudio-gerar' processa → 'pronto' | 'erro'.
-- ('rascunho' do handoff = 'pronto' aqui: gerado, aguardando uso.)
-- =============================================================

create table if not exists public.estudio_criacoes (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id),
  loja_id         uuid references public.lojas(id),
  tipo            text not null check (tipo in
                    ('post_instagram','story_vaga','capa_youtube','oferta_whatsapp','cardapio_copy','calendario_mes')),
  formato         text not null default '1:1' check (formato in ('1:1','9:16','16:9','texto')),
  brief           text not null,
  tom             text,
  usar_identidade boolean not null default false,
  texto_gerado    text,
  imagem_url      text,
  custo_usd       numeric(10,6) not null default 0,
  status          text not null default 'fila' check (status in ('fila','gerando','pronto','erro','aprovado')),
  erro_msg        text,
  criado_por      uuid references auth.users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists estudio_criacoes_tenant_idx on public.estudio_criacoes (tenant_id, created_at desc);
create index if not exists estudio_criacoes_fila_idx on public.estudio_criacoes (status) where status = 'fila';

alter table public.estudio_criacoes enable row level security;

-- Membro do tenant lê e cria pedidos (sempre entrando na fila); worker escreve via service role
drop policy if exists estudio_criacoes_select on public.estudio_criacoes;
create policy estudio_criacoes_select on public.estudio_criacoes
  for select using (public.is_member_of(tenant_id));

drop policy if exists estudio_criacoes_insert on public.estudio_criacoes;
create policy estudio_criacoes_insert on public.estudio_criacoes
  for insert with check (public.is_member_of(tenant_id) and status = 'fila');

-- Membro só transita pronto→aprovado (aprovação humana); demais transições = worker (service role)
drop policy if exists estudio_criacoes_update on public.estudio_criacoes;
create policy estudio_criacoes_update on public.estudio_criacoes
  for update using (public.is_member_of(tenant_id) and status = 'pronto')
  with check (public.is_member_of(tenant_id) and status = 'aprovado');

-- Sem DELETE (auditoria/custos); limpeza futura via service role se precisar.

-- Bucket dedicado para os PNGs (leitura pública para usar a arte fora do app)
insert into storage.buckets (id, name, public)
values ('estudio', 'estudio', true)
on conflict (id) do nothing;

-- Seed do agente no catálogo global (fork B / D4) + habilitação só p/ consult
insert into public.agents (id, name, role, letter, color, description, is_active, category, is_custom)
values (
  'estudio',
  'Estúdio',
  'Criação de conteúdo com IA',
  'E',
  '#B70C00',
  'Cria artes e textos no padrão da marca: posts, stories de vaga, capas de YouTube, ofertas de WhatsApp, copy de cardápio e calendário editorial. Tudo nasce como rascunho — nada é publicado sem aprovação humana.',
  true,
  'specialist',
  false
)
on conflict (id) do nothing;

insert into public.tenant_agents (tenant_id, agent_id)
values ('9079bd4d-4df7-4023-90fb-d79c8ba7e900', 'estudio')
on conflict do nothing;
