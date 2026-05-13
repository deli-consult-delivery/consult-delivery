-- Fase 0 | Tarefa 3.3 (revisado)
-- agents já existe — estendemos com category e default_modo
-- Inserimos os 2 agentes faltantes: analise-ifood e nova

ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS category    text CHECK (category IN ('orchestrator', 'specialist')),
  ADD COLUMN IF NOT EXISTS default_modo text NOT NULL DEFAULT 'hibrido'
                                       CHECK (default_modo IN ('humano', 'hibrido', 'ia'));

-- Classificar agentes existentes
UPDATE agents SET category = 'orchestrator' WHERE id = 'deli';
UPDATE agents SET category = 'specialist'   WHERE id IN ('breno','cora','lara','max','sofia','vera');

-- Inserir agentes faltantes (letter/color podem ser ajustados no dashboard depois)
INSERT INTO agents (id, name, role, letter, color, category, default_modo) VALUES
  ('analise-ifood', 'Análise iFood', 'Análise de Loja iFood', 'I', '#FF6B35', 'specialist', 'hibrido'),
  ('nova',          'NOVA',          'Automação IA',           'N', '#8B5CF6', 'specialist', 'hibrido')
ON CONFLICT (id) DO NOTHING;
