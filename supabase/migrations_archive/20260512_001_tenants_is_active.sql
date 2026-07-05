-- Fase 0 | Tarefa 3.1
-- Adiciona is_active em tenants para suportar desativação sem deleção

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN tenants.is_active IS 'false = tenant desativado (sem acesso, dados preservados)';
