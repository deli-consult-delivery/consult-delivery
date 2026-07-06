-- ============================================================
-- MIGRATION: Drafts + DELI — Sistema de aprovação e COO digital
-- Data: 2026-05-04
-- ============================================================

-- ------------------------------------------------------------
-- 1. AGENT_DRAFTS — mensagens aguardando aprovação humana
-- Verde + channel interno → direto; Amarelo/Vermelho → obrigatório
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS agent_drafts (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  agent_name     TEXT NOT NULL,
  channel        TEXT NOT NULL,
  recipient_jid  TEXT,
  loja_id        UUID REFERENCES lojas(id),
  subject        TEXT,
  body           TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','approved','rejected','sent','edited')),
  autonomy_level TEXT NOT NULL DEFAULT 'amarelo'
                   CHECK (autonomy_level IN ('verde','amarelo','vermelho')),
  approved_by    UUID REFERENCES auth.users(id),
  approved_at    TIMESTAMPTZ,
  sent_at        TIMESTAMPTZ,
  metadata       JSONB,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE agent_drafts IS 'Mensagens que agentes querem enviar, aguardando aprovação. channel: whatsapp_group, whatsapp_pv, telegram_interno, painel. Somente channel interno com verde pode ser enviado sem aprovação.';

CREATE INDEX IF NOT EXISTS idx_drafts_tenant_status ON agent_drafts(tenant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_drafts_loja          ON agent_drafts(loja_id);
CREATE INDEX IF NOT EXISTS idx_drafts_pending       ON agent_drafts(tenant_id, created_at DESC) WHERE status = 'pending';

ALTER TABLE agent_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "drafts_select_tenant" ON agent_drafts
  FOR SELECT USING (
    tenant_id IN (SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid())
  );

CREATE POLICY "drafts_insert_tenant" ON agent_drafts
  FOR INSERT WITH CHECK (
    tenant_id IN (SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid())
  );

CREATE POLICY "drafts_update_tenant" ON agent_drafts
  FOR UPDATE USING (
    tenant_id IN (SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid())
  );

-- ------------------------------------------------------------
-- 2. DELI_TRIGGERS — regras que definem quando DELI age
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS deli_triggers (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nome           TEXT NOT NULL,
  descricao      TEXT,
  event_type     TEXT NOT NULL,
  condition_sql  TEXT,
  autonomy_level TEXT NOT NULL DEFAULT 'amarelo'
                   CHECK (autonomy_level IN ('verde','amarelo','vermelho')),
  ativo          BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE deli_triggers IS 'Regras avaliadas pela DELI ao receber eventos do Realtime. event_type: novo_evento_timeline, metrica_caiu, cliente_sumiu, mensagem_recebida, config_alterada. autonomy_level determina o semáforo.';

CREATE INDEX IF NOT EXISTS idx_deli_triggers_tenant ON deli_triggers(tenant_id, ativo);

ALTER TABLE deli_triggers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deli_triggers_select_tenant" ON deli_triggers
  FOR SELECT USING (
    tenant_id IN (SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid())
  );

CREATE POLICY "deli_triggers_manage_admin" ON deli_triggers
  FOR ALL USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid() AND role IN ('admin','deli_owner')
    )
  );

-- ------------------------------------------------------------
-- 3. DELI_PENDING_APPROVALS — aprovações Amarelo/Vermelho
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS deli_pending_approvals (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  draft_id       UUID REFERENCES agent_drafts(id),
  trigger_id     UUID REFERENCES deli_triggers(id),
  autonomy_level TEXT NOT NULL CHECK (autonomy_level IN ('verde','amarelo','vermelho')),
  summary        TEXT NOT NULL,
  context_json   JSONB,
  status         TEXT NOT NULL DEFAULT 'aguardando'
                   CHECK (status IN ('aguardando','aprovado','rejeitado','expirado')),
  resolved_by    UUID REFERENCES auth.users(id),
  resolved_at    TIMESTAMPTZ,
  expires_at     TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE deli_pending_approvals IS 'Aprovações pendentes da DELI. Amarelo: Wandson aprova com ok. Vermelho: aprovação explícita APROVADO VERMELHO apr-xxx.';

CREATE INDEX IF NOT EXISTS idx_deli_approvals_tenant_status ON deli_pending_approvals(tenant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_deli_approvals_pending       ON deli_pending_approvals(tenant_id, created_at DESC) WHERE status = 'aguardando';

ALTER TABLE deli_pending_approvals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deli_approvals_select_tenant" ON deli_pending_approvals
  FOR SELECT USING (
    tenant_id IN (SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid())
  );

CREATE POLICY "deli_approvals_insert_tenant" ON deli_pending_approvals
  FOR INSERT WITH CHECK (
    tenant_id IN (SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid())
  );

CREATE POLICY "deli_approvals_update_deli_owner" ON deli_pending_approvals
  FOR UPDATE USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid() AND role IN ('admin','deli_owner')
    )
  );

-- ------------------------------------------------------------
-- 4. DELI_ACTIONS_LOG — tudo que a DELI fez (append-only)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS deli_actions_log (
  id             BIGSERIAL PRIMARY KEY,
  tenant_id      UUID NOT NULL,
  trigger_id     UUID REFERENCES deli_triggers(id),
  draft_id       UUID REFERENCES agent_drafts(id),
  approval_id    UUID REFERENCES deli_pending_approvals(id),
  action_type    TEXT NOT NULL,
  autonomy_level TEXT CHECK (autonomy_level IN ('verde','amarelo','vermelho')),
  summary        TEXT,
  metadata       JSONB,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE deli_actions_log IS 'Log imutável de todas as ações da DELI. action_type: trigger_fired, draft_created, draft_sent, draft_approved, draft_rejected, trigger_skipped, approval_expired. Append-only: sem UPDATE, sem DELETE.';

CREATE INDEX IF NOT EXISTS idx_deli_log_tenant ON deli_actions_log(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_deli_log_type   ON deli_actions_log(action_type, created_at DESC);

ALTER TABLE deli_actions_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deli_log_select_tenant" ON deli_actions_log
  FOR SELECT USING (
    tenant_id IN (SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid())
  );

CREATE POLICY "deli_log_insert_authenticated" ON deli_actions_log
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
