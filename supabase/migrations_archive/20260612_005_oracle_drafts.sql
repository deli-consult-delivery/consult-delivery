-- ============================================================
-- Oracle MVP — tabela de drafts de AGENTE proposto pelo Oracle
-- Spec: docs/oracle-cd/SPEC-oracle-cd.md (§2.1) — aprovada em #313
-- Data: 2026-06-12 | Mandato D5 v3 (SQL aditivo — autonomia)
--
-- ⚠️ Nome: a spec propunha `agent_drafts`, mas essa tabela JÁ EXISTE
--    (drafts de MENSAGEM — Hermes/aprovações usam). Tabela nova do
--    Oracle = `oracle_drafts` para não colidir.
--
-- Máquina de estados:
--   pendente → aprovado → aplicado   (só `aplicado` cria linha em agents)
--   pendente → rejeitado
--
-- payload jsonb = proposta estruturada do Oracle:
--   { slug, name, role, letter, color, default_modo, custom_model,
--     custom_prompt, tools[], provider }
--
-- RLS (espelha tenant_agent_config 20260512_004 + agents 20260607_002):
--   SELECT/INSERT → membro do tenant (is_member_of)
--   UPDATE        → só admin/owner do tenant (is_admin_of)
--   DELETE        → ninguém via API (histórico; service_role bypassa)
--
-- Rollback: DROP TABLE oracle_drafts; (não há dados legados)
-- ============================================================

CREATE TABLE IF NOT EXISTS oracle_drafts (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  status        text        NOT NULL DEFAULT 'pendente'
                            CHECK (status IN ('pendente', 'aprovado', 'rejeitado', 'aplicado')),
  proposed_slug text        NOT NULL,
  payload       jsonb       NOT NULL,
  source_chat   jsonb,
  created_by    uuid        NOT NULL,
  reviewed_by   uuid,
  review_note   text,
  agent_id      text        REFERENCES agents(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  reviewed_at   timestamptz
);

COMMENT ON TABLE oracle_drafts IS
  'Drafts de AGENTE propostos pelo Oracle (chat de construção). Não confundir com agent_drafts (drafts de mensagem). Só status=aplicado gera linha em agents.';

CREATE INDEX IF NOT EXISTS idx_oracle_drafts_tenant  ON oracle_drafts (tenant_id);
CREATE INDEX IF NOT EXISTS idx_oracle_drafts_status  ON oracle_drafts (tenant_id, status);

ALTER TABLE oracle_drafts ENABLE ROW LEVEL SECURITY;

-- Membro do tenant vê os drafts do próprio tenant
CREATE POLICY "oracle_drafts_select_member"
  ON oracle_drafts FOR SELECT
  USING (public.is_member_of(tenant_id));

-- Membro do tenant cria draft (sempre como ele mesmo, sempre pendente)
CREATE POLICY "oracle_drafts_insert_member"
  ON oracle_drafts FOR INSERT
  WITH CHECK (
    public.is_member_of(tenant_id)
    AND created_by = auth.uid()
    AND status = 'pendente'
  );

-- Só admin/owner do tenant aprova/rejeita/aplica
CREATE POLICY "oracle_drafts_update_admin"
  ON oracle_drafts FOR UPDATE
  USING (public.is_admin_of(tenant_id))
  WITH CHECK (public.is_admin_of(tenant_id));
