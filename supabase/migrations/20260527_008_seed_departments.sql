-- supabase/migrations/20260527_008_seed_departments.sql
-- Sprint 2 — Chat Ao Vivo
-- Seed: 5 departamentos para o tenant consult
-- Tenant ID: 9079bd4d-4df7-4023-90fb-d79c8ba7e900

INSERT INTO public.departments (tenant_id, name, description, color, is_active)
VALUES
  ('9079bd4d-4df7-4023-90fb-d79c8ba7e900', 'Atendimento', 'Suporte e atendimento ao cliente', '#3B82F6', true),
  ('9079bd4d-4df7-4023-90fb-d79c8ba7e900', 'Marketing',   'Campanhas, conteúdo e promoções',  '#8B5CF6', true),
  ('9079bd4d-4df7-4023-90fb-d79c8ba7e900', 'Vendas',      'Prospecção e fechamento',          '#10B981', true),
  ('9079bd4d-4df7-4023-90fb-d79c8ba7e900', 'Financeiro',  'Cobranças, pagamentos e inadimplência', '#F59E0B', true),
  ('9079bd4d-4df7-4023-90fb-d79c8ba7e900', 'Suporte',     'Suporte técnico e pós-venda',      '#EF4444', true)
ON CONFLICT (tenant_id, name) DO NOTHING;
