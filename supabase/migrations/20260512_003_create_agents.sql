-- Fase 0 | Tarefa 3.3
-- Catálogo de agentes IA disponíveis na plataforma

CREATE TABLE IF NOT EXISTS agents (
  slug          text        PRIMARY KEY,
  display_name  text        NOT NULL,
  category      text        CHECK (category IN ('orchestrator', 'specialist')),
  is_active     boolean     NOT NULL DEFAULT true,
  default_modo  text        NOT NULL DEFAULT 'hibrido'
                            CHECK (default_modo IN ('humano', 'hibrido', 'ia')),
  created_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE agents IS 'Catálogo global de agentes IA. Um agente por slug.';

-- Seed inicial — agentes aprovados no RESTRUCTURE.md
INSERT INTO agents (slug, display_name, category, is_active, default_modo) VALUES
  ('deli',          'DELI · COO Digital',        'orchestrator', true,  'hibrido'),
  ('analise-ifood', 'Análise iFood',              'specialist',   true,  'hibrido'),
  ('lara',          'LARA · Marketing',           'specialist',   true,  'humano'),
  ('cora',          'CORA · Cobrança',            'specialist',   false, 'hibrido'),
  ('max',           'MAX · Suporte',              'specialist',   false, 'hibrido'),
  ('nova',          'NOVA · Automação',           'specialist',   false, 'hibrido'),
  ('breno',         'BRENO · Atendimento',        'specialist',   false, 'hibrido'),
  ('sofia',         'SOFIA · SDR',                'specialist',   false, 'hibrido'),
  ('vera',          'VERA · BI & Relatórios',     'specialist',   false, 'hibrido')
ON CONFLICT (slug) DO NOTHING;
