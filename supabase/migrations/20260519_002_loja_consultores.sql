-- ============================================================
-- PILOTO Onda 01 — Migration 02
-- Data: 2026-05-19
-- Autor: Wandson via Claude Code
-- Motivo: Tabela N:N entre lojas e consultores
-- Risco: BAIXO (tabela nova, sem conflito)
-- Reversão: DROP TABLE loja_consultores;
--
-- Correção vs doc original:
--   RLS usa tenant_members(tenant_id, user_id) porque
--   user_roles NÃO tem tenant_id no banco real.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS loja_consultores (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  loja_id       uuid        NOT NULL REFERENCES lojas(id) ON DELETE CASCADE,
  user_id       uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  papel         text        NOT NULL DEFAULT 'colaborador'
                            CHECK (papel IN ('principal','colaborador','observador')),
  atribuido_em  timestamptz DEFAULT now(),
  atribuido_por uuid        REFERENCES auth.users(id),
  ativo         boolean     DEFAULT true,

  UNIQUE (loja_id, user_id)
);

-- Apenas 1 consultor principal ativo por loja
CREATE UNIQUE INDEX IF NOT EXISTS idx_loja_consultor_principal_unico
  ON loja_consultores(loja_id)
  WHERE papel = 'principal' AND ativo = true;

CREATE INDEX IF NOT EXISTS idx_loja_consultores_user ON loja_consultores(user_id);
CREATE INDEX IF NOT EXISTS idx_loja_consultores_loja ON loja_consultores(loja_id);

ALTER TABLE loja_consultores ENABLE ROW LEVEL SECURITY;

-- Qualquer membro do tenant pode ver atribuições das lojas do seu tenant
CREATE POLICY "Ver atribuições do próprio tenant"
  ON loja_consultores FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM lojas l
      JOIN tenant_members tm ON tm.tenant_id = l.tenant_id
      WHERE l.id = loja_consultores.loja_id
        AND tm.user_id = auth.uid()
    )
  );

-- Admins e consultores_senior do tenant podem gerenciar atribuições
CREATE POLICY "Admins gerenciam atribuições"
  ON loja_consultores FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM lojas l
      JOIN tenant_members tm ON tm.tenant_id = l.tenant_id
      JOIN user_roles ur ON ur.user_id = tm.user_id
      JOIN roles r ON r.id = ur.role_id AND r.tenant_id = l.tenant_id
      WHERE l.id = loja_consultores.loja_id
        AND tm.user_id = auth.uid()
        AND r.name IN ('admin', 'consultor_senior')
    )
  );

COMMIT;
