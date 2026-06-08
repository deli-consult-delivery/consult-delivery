-- =============================================================
-- PR10 (parte 2) — fila de assinaturas: campos do pagador +
-- INSERT por admin do tenant (tela Clientes grava 'pendente').
-- NÃO APLICAR sem aprovação do Wandson (D5 v2).
-- =============================================================

alter table public.defesa_assinaturas add column if not exists payer_nome text;
alter table public.defesa_assinaturas add column if not exists payer_email text;
alter table public.defesa_assinaturas add column if not exists payer_cpf_cnpj text;

drop policy if exists defesa_assinaturas_insert_admin on public.defesa_assinaturas;
create policy defesa_assinaturas_insert_admin on public.defesa_assinaturas
  for insert with check (public.is_admin_of(tenant_id));
