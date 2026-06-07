-- =============================================================
-- F1 Defesa — PR4: seed do agente 'defesa' no catálogo global
-- + habilitação para o tenant consult (fork B / D4).
-- NÃO APLICAR sem aprovação do Wandson (D5 v2). Idempotente.
-- =============================================================

insert into public.agents (id, name, role, letter, color, description, is_active, category, is_custom)
values (
  'defesa',
  'Defesa',
  'Defesa Comercial iFood',
  'D',
  '#B70C00',
  'Vigia cancelamentos e avaliações, prepara contestações e respostas com a melhor chance de vitória e aguarda aprovação humana. Nunca envia nada sozinho.',
  true,
  'operacao',
  false
)
on conflict (id) do nothing;

insert into public.tenant_agents (tenant_id, agent_id)
values ('9079bd4d-4df7-4023-90fb-d79c8ba7e900', 'defesa')
on conflict do nothing;
