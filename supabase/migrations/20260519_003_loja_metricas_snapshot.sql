-- ============================================================
-- PILOTO Onda 01 — Migration 03
-- Data: 2026-05-19
-- Autor: Wandson via Claude Code
-- Motivo: Snapshots periódicos de métricas iFood por loja
-- Risco: BAIXO (tabela nova — nome distinto de loja_metricas)
-- Reversão: DROP TABLE loja_metricas_snapshot;
--
-- Correção vs doc original:
--   RLS usa tenant_members(tenant_id, user_id) porque
--   user_roles NÃO tem tenant_id no banco real.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS loja_metricas_snapshot (
  id                        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  loja_id                   uuid        NOT NULL REFERENCES lojas(id) ON DELETE CASCADE,
  data                      date        NOT NULL,

  -- Métricas iFood (entrada manual no MVP)
  pedidos_30d               integer,
  pedidos_90d               integer,
  avaliacoes_30d            integer,
  avaliacoes_90d            integer,
  nota_media                numeric(3,2),
  taxa_cancelamento         numeric(5,4),
  taxa_chamados             numeric(5,4),
  tempo_preparo_min         integer,
  tempo_loja_aberta_pct     numeric(5,4),
  tempo_espera_motoboy_min  integer,

  -- Mídia / Marketing
  invest_midia_30d          numeric(10,2),
  custo_por_pedido          numeric(10,2),

  -- Posicionamento
  ticket_medio              numeric(10,2),
  posicao_categoria         text,

  fonte         text        NOT NULL DEFAULT 'manual'
                            CHECK (fonte IN ('manual','api_ifood','print_ocr')),
  capturado_por uuid        REFERENCES auth.users(id),
  created_at    timestamptz DEFAULT now(),

  UNIQUE (loja_id, data)
);

CREATE INDEX IF NOT EXISTS idx_metricas_snapshot_loja_data
  ON loja_metricas_snapshot(loja_id, data DESC);

ALTER TABLE loja_metricas_snapshot ENABLE ROW LEVEL SECURITY;

-- Qualquer membro do tenant pode ler métricas das lojas do seu tenant
CREATE POLICY "Métricas do próprio tenant"
  ON loja_metricas_snapshot FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM lojas l
      JOIN tenant_members tm ON tm.tenant_id = l.tenant_id
      WHERE l.id = loja_metricas_snapshot.loja_id
        AND tm.user_id = auth.uid()
    )
  );

-- Admins, consultores_senior e consultores atribuídos podem escrever métricas
CREATE POLICY "Editar métricas: admins, consultores_senior e consultores atribuídos"
  ON loja_metricas_snapshot FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM lojas l
      JOIN tenant_members tm ON tm.tenant_id = l.tenant_id
      JOIN user_roles ur ON ur.user_id = tm.user_id
      JOIN roles r ON r.id = ur.role_id AND r.tenant_id = l.tenant_id
      WHERE l.id = loja_metricas_snapshot.loja_id
        AND tm.user_id = auth.uid()
        AND r.name IN ('admin', 'consultor_senior')
    )
    OR EXISTS (
      SELECT 1 FROM loja_consultores lc
      WHERE lc.loja_id = loja_metricas_snapshot.loja_id
        AND lc.user_id = auth.uid()
        AND lc.ativo = true
    )
  );

COMMIT;
