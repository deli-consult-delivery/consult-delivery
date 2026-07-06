-- =========================================================
-- MIA-01: Schema completo do Monitor IA de Conversas
-- Arquivo: 20260603_008_mia_schema_full.sql
-- Autor: Claude Code (Wandson/MIA-01)
--
-- Cria:
--   1. loja_whatsapp_vinculo — vínculo grupo/contato → loja
--   2. sugestoes_ia          — caixa de sugestões geradas pela IA
--   3. mia_audit_log         — audit do worker (privacidade)
--   4. ALTER tarefas_loja    — adiciona criado_por_ia boolean
--
-- RLS: sempre via tenant_members(user_id, tenant_id)
-- Idempotente: IF NOT EXISTS / OR REPLACE em tudo
-- =========================================================

-- ─── 1. Vínculo grupo WhatsApp / contato privado → loja ─────────────────────
CREATE TABLE IF NOT EXISTS loja_whatsapp_vinculo (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  loja_id       uuid        NOT NULL REFERENCES lojas(id) ON DELETE CASCADE,
  remote_jid    text        NOT NULL,
  tipo          text        NOT NULL CHECK (tipo IN ('grupo', 'privado')),
  monitorar     boolean     NOT NULL DEFAULT true,
  ultimo_run_em timestamptz,
  criado_por    uuid,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, remote_jid)
);

CREATE INDEX IF NOT EXISTS idx_lwv_tenant_loja
  ON loja_whatsapp_vinculo(tenant_id, loja_id);

CREATE INDEX IF NOT EXISTS idx_lwv_monitorar
  ON loja_whatsapp_vinculo(tenant_id)
  WHERE monitorar = true;

ALTER TABLE loja_whatsapp_vinculo ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lwv_tenant_isolation" ON loja_whatsapp_vinculo
  FOR ALL USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid()
    )
  );

-- Trigger updated_at no vínculo
CREATE OR REPLACE FUNCTION touch_lwv_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_lwv_touch ON loja_whatsapp_vinculo;
CREATE TRIGGER trg_lwv_touch
  BEFORE UPDATE ON loja_whatsapp_vinculo
  FOR EACH ROW EXECUTE FUNCTION touch_lwv_updated_at();

-- ─── 2. Caixa de sugestões geradas pela IA ───────────────────────────────────
CREATE TABLE IF NOT EXISTS sugestoes_ia (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  loja_id       uuid        NOT NULL REFERENCES lojas(id) ON DELETE CASCADE,
  conversa_id   uuid        REFERENCES conversations(id) ON DELETE SET NULL,
  tipo          text        NOT NULL CHECK (tipo IN ('fact', 'tarefa')),
  conteudo      text        NOT NULL,
  evidencia     jsonb,
  confianca     text        NOT NULL CHECK (confianca IN ('alta', 'media', 'baixa')),
  status        text        NOT NULL DEFAULT 'pendente'
                            CHECK (status IN ('pendente', 'aprovada', 'rejeitada', 'editada')),
  criada_em     timestamptz NOT NULL DEFAULT now(),
  decidida_em   timestamptz,
  decidida_por  uuid,
  resultado_id  uuid,
  modelo_usado  text,
  run_id        text
);

CREATE INDEX IF NOT EXISTS idx_sugestoes_inbox
  ON sugestoes_ia(tenant_id, loja_id, status)
  WHERE status = 'pendente';

CREATE INDEX IF NOT EXISTS idx_sugestoes_criada_em
  ON sugestoes_ia(tenant_id, criada_em DESC);

ALTER TABLE sugestoes_ia ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sugestoes_tenant_isolation" ON sugestoes_ia
  FOR ALL USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid()
    )
  );

-- ─── 3. Audit do worker MIA ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS mia_audit_log (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  loja_id             uuid        REFERENCES lojas(id) ON DELETE SET NULL,
  vinculo_id          uuid        REFERENCES loja_whatsapp_vinculo(id) ON DELETE SET NULL,
  remote_jid          text,
  msg_count           integer     NOT NULL DEFAULT 0,
  modelo_usado        text        NOT NULL DEFAULT 'kimi-k2.6:cloud',
  latencia_ms         integer,
  tokens_in           integer,
  tokens_out          integer,
  sugestoes_geradas   integer     NOT NULL DEFAULT 0,
  erro                text,
  run_id              text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mia_audit_tenant_data
  ON mia_audit_log(tenant_id, created_at DESC);

ALTER TABLE mia_audit_log ENABLE ROW LEVEL SECURITY;

-- Audit: leitura apenas (escrita via service key no worker)
CREATE POLICY "mia_audit_tenant_isolation" ON mia_audit_log
  FOR SELECT USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid()
    )
  );

-- ─── 4. ALTER tarefas_loja: adicionar criado_por_ia ─────────────────────────
ALTER TABLE tarefas_loja
  ADD COLUMN IF NOT EXISTS criado_por_ia boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN tarefas_loja.criado_por_ia IS
  'true quando a tarefa foi criada via aprovação de sugestão do MIA (Monitor IA).';
