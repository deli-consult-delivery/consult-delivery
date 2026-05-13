-- Fase 0 | Tarefa 3.2
-- Adiciona modo_padrao em tenants: controla autonomia dos agentes IA por tenant

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS modo_padrao text NOT NULL DEFAULT 'hibrido'
  CHECK (modo_padrao IN ('humano', 'hibrido', 'ia'));

COMMENT ON COLUMN tenants.modo_padrao IS
  'humano = agentes só sugerem; hibrido = agentes agem em tarefas seguras; ia = agentes agem sozinhos';
