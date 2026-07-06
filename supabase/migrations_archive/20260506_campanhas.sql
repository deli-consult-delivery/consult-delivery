-- ============================================================
-- Módulo Campanhas — Tabelas lojas e campanhas
-- ============================================================

-- Tabela de lojas cadastradas para campanhas
CREATE TABLE IF NOT EXISTS lojas (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  nome          text NOT NULL,
  slug          text UNIQUE NOT NULL,
  tipo          text NOT NULL,
  whatsapp      text,
  status        text DEFAULT 'ativa',
  skill_criada  boolean DEFAULT false,
  skill_path    text,
  logo_url      text,
  dados_skill   jsonb NOT NULL DEFAULT '{}',
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

-- Tabela de campanhas geradas
CREATE TABLE IF NOT EXISTS campanhas (
  id                 uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  loja_id            uuid REFERENCES lojas(id) ON DELETE CASCADE NOT NULL,
  tipo               text NOT NULL,
  classificacao      text,
  oferta             text,
  cupom              text,
  canal              text,
  contexto           text,
  imagem_url         text,
  status             text DEFAULT 'gerando',
  variacao_a         jsonb,
  variacao_b         jsonb,
  variacao_c         jsonb,
  regua_json         jsonb,
  variacao_escolhida text,
  texto_final        text,
  log_evonexus       text,
  erro_msg           text,
  criado_por         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  aprovado_por       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  criado_em          timestamptz DEFAULT now(),
  aprovado_em        timestamptz
);

-- Triggers updated_at para lojas
CREATE OR REPLACE FUNCTION update_lojas_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_lojas_updated_at ON lojas;
CREATE TRIGGER trg_lojas_updated_at
  BEFORE UPDATE ON lojas
  FOR EACH ROW
  EXECUTE FUNCTION update_lojas_updated_at();

-- Índices
CREATE INDEX IF NOT EXISTS idx_campanhas_loja_id ON campanhas(loja_id);
CREATE INDEX IF NOT EXISTS idx_campanhas_status ON campanhas(status);
CREATE INDEX IF NOT EXISTS idx_campanhas_criado_em ON campanhas(criado_em);

-- RLS
ALTER TABLE lojas     ENABLE ROW LEVEL SECURITY;
ALTER TABLE campanhas ENABLE ROW LEVEL SECURITY;

-- Política: usuários autenticados podem tudo (ajustar conforme RBAC futuro)
CREATE POLICY "auth_all_lojas" ON lojas
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "auth_all_campanhas" ON campanhas
  FOR ALL USING (auth.role() = 'authenticated');

-- Realtime: habilitar para campanhas
BEGIN;
  -- Garante que a tabela campanhas está no publication
  DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'campanhas'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE campanhas;
    END IF;
  END $$;
COMMIT;
