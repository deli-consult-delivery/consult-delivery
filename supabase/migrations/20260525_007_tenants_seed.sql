-- Seed idempotente do tenant principal para testes locais (G06.4)
-- Usar ON CONFLICT para ser seguro em re-execuções

INSERT INTO tenants (id, slug, name, created_at)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'consult',
  'Consult Delivery (tenant principal)',
  now()
)
ON CONFLICT (slug) DO NOTHING;

-- tenant_members: executar manualmente após confirmar user_id do Wandson
-- INSERT INTO tenant_members (tenant_id, user_id, role)
-- VALUES ('00000000-0000-0000-0000-000000000001', '<auth.users.id>', 'admin');
