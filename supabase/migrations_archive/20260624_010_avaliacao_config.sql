-- ════════════════════════════════════════════════════════════════════════════
-- avaliacao_config: configuração de mensagens automáticas de avaliação
-- por tenant (templates CSAT e NPS, habilitação, etc.)
--
-- + colunas de rastreio de envio em atendimento_avaliacoes e nps_avaliacoes
-- ════════════════════════════════════════════════════════════════════════════

-- ── Tabela principal ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS avaliacao_config (
  id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- CSAT
  csat_auto_envio          BOOLEAN     NOT NULL DEFAULT true,
  csat_mensagem_template   TEXT        NOT NULL DEFAULT
    'Olá {nome_cliente}! 😊 Seu atendimento foi encerrado. Que tal avaliar como foi? Leva menos de 1 minuto: {link_avaliacao}',

  -- NPS
  nps_auto_envio           BOOLEAN     NOT NULL DEFAULT true,
  nps_mensagem_template    TEXT        NOT NULL DEFAULT
    'Olá {nome_cliente}! Gostaríamos de saber sua opinião sobre a {nome_empresa}. Responda nossa pesquisa rápida: {link_nps}',
  nps_cooldown_dias        SMALLINT    NOT NULL DEFAULT 30,

  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (tenant_id)
);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION fn_avaliacao_config_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_avaliacao_config_updated_at ON avaliacao_config;
CREATE TRIGGER trg_avaliacao_config_updated_at
  BEFORE UPDATE ON avaliacao_config
  FOR EACH ROW EXECUTE FUNCTION fn_avaliacao_config_updated_at();

-- ── RLS ────────────────────────────────────────────────────────────────────────
ALTER TABLE avaliacao_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_member_read_avaliacao_config" ON avaliacao_config
  FOR SELECT USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "tenant_admin_write_avaliacao_config" ON avaliacao_config
  FOR ALL USING (
    tenant_id IN (
      SELECT tm.tenant_id FROM tenant_members tm
      JOIN user_roles ur ON ur.user_id = tm.user_id
      JOIN roles r ON r.id = ur.role_id
      WHERE tm.user_id = auth.uid()
        AND r.name IN ('admin', 'dev')
    )
  );

-- ── Rastreio de envio de mensagem em atendimento_avaliacoes ───────────────────
ALTER TABLE atendimento_avaliacoes
  ADD COLUMN IF NOT EXISTS msg_enviada_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS msg_enviada_status TEXT;   -- 'ok' | 'falhou' | NULL (não tentado)

-- ── Rastreio de envio de mensagem em nps_avaliacoes ──────────────────────────
ALTER TABLE nps_avaliacoes
  ADD COLUMN IF NOT EXISTS msg_enviada_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS msg_enviada_status TEXT;   -- 'ok' | 'falhou' | NULL

-- ── Índices para busca de pendentes de envio ──────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_at_aval_msg_pendente
  ON atendimento_avaliacoes (tenant_id, created_at DESC)
  WHERE msg_enviada_at IS NULL AND status = 'pendente';

CREATE INDEX IF NOT EXISTS idx_nps_aval_msg_pendente
  ON nps_avaliacoes (tenant_id, created_at DESC)
  WHERE msg_enviada_at IS NULL AND status = 'pendente';

-- ── Seed: habilitar avaliacao_config para Karina Doceria ─────────────────────
INSERT INTO avaliacao_config (tenant_id)
VALUES ('e9fdaa66-cbe7-4dff-905b-afc4b10219ff')
ON CONFLICT (tenant_id) DO NOTHING;
