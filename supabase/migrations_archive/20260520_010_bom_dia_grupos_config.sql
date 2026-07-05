-- Migration: 20260520_010_bom_dia_grupos_config.sql
-- Data: 2026-05-20
-- Autor: Wandson (via Claude Code)
-- Motivo: Suporte a grupos salvos + auto-envio no agente BomDia.
--         Cada grupo WhatsApp agora pode ser marcado como destinatário do BomDia
--         (bom_dia_ativo). A tabela bom_dia_config armazena, por tenant, o
--         horário de auto-envio para dias úteis e sábados, evitando hardcode
--         no código do agente Trigger.dev.
-- Risco: Baixo — coluna nova com DEFAULT false (sem impacto em registros existentes)
--         + tabela nova sem dados migrados. A policy UPDATE existente em
--         whatsapp_groups é substituída por uma mais restritiva (admin/marketing),
--         o que pode bloquear roles de menor privilégio que hoje conseguem
--         fazer UPDATE em whatsapp_groups — avaliar se isso é desejado.
-- Reversão: ver bloco DOWN no final deste arquivo

BEGIN;

-- ============================================================
-- 1. COLUNA bom_dia_ativo em whatsapp_groups
-- ============================================================

ALTER TABLE whatsapp_groups
  ADD COLUMN IF NOT EXISTS bom_dia_ativo BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN whatsapp_groups.bom_dia_ativo IS
  'Se true, este grupo recebe a mensagem BomDia automática agendada pelo agente. '
  'Controlado por admin/marketing do tenant.';

-- Índice parcial: só grupos ativos para BomDia são varridos pelo agente scheduler
CREATE INDEX IF NOT EXISTS idx_whatsapp_groups_bom_dia
  ON whatsapp_groups(tenant_id, bom_dia_ativo)
  WHERE bom_dia_ativo = TRUE;

-- ============================================================
-- 2. AJUSTE DA POLICY UPDATE em whatsapp_groups
--    A policy atual ("wa_groups_update_tenant") permite qualquer
--    tenant_member fazer UPDATE. Substituímos por uma restrita a
--    admin e marketing, pois bom_dia_ativo é um campo de configuração
--    sensível ao agendamento do agente.
-- ============================================================

DROP POLICY IF EXISTS "wa_groups_update_tenant" ON whatsapp_groups;

CREATE POLICY "wa_groups_update_admin_marketing" ON whatsapp_groups
  FOR UPDATE USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_members
      WHERE user_id = auth.uid()
        AND role IN ('admin', 'marketing')
    )
  );

COMMENT ON TABLE whatsapp_groups IS
  'Grupos WhatsApp do tenant. evolution_jid: JID do grupo (ex: 5511xxx@g.us). '
  'loja_id: associação ao cliente. bom_dia_ativo: habilita envio automático BomDia.';

-- ============================================================
-- 3. TABELA bom_dia_config — configuração de auto-envio por tenant
-- ============================================================

CREATE TABLE IF NOT EXISTS bom_dia_config (
  tenant_id   UUID        PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  auto_send   BOOLEAN     NOT NULL DEFAULT FALSE,
  hora_semana TIME        NOT NULL DEFAULT '09:00',  -- horário seg-sex (BRT)
  hora_sabado TIME        NOT NULL DEFAULT '08:00',  -- horário sáb (BRT)
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE bom_dia_config IS
  'Configuração do agente BomDia por tenant. Um registro por tenant. '
  'auto_send habilita o disparo automático agendado pelo Trigger.dev. '
  'Horários em BRT — o scheduler converte para UTC antes de agendar.';

COMMENT ON COLUMN bom_dia_config.auto_send IS
  'Se true, o agente BomDia envia automaticamente nos horários configurados. '
  'Se false, apenas gera draft para aprovação manual.';

COMMENT ON COLUMN bom_dia_config.hora_semana IS
  'Horário de envio de segunda a sexta (BRT). Ex: 09:00.';

COMMENT ON COLUMN bom_dia_config.hora_sabado IS
  'Horário de envio aos sábados (BRT). Ex: 08:00. '
  'Domingo não tem envio automático (ajustar no agente se necessário).';

COMMENT ON COLUMN bom_dia_config.updated_at IS
  'Atualizado automaticamente via trigger ou manualmente pelo agente ao salvar config.';

-- ============================================================
-- 4. RLS em bom_dia_config
-- ============================================================

ALTER TABLE bom_dia_config ENABLE ROW LEVEL SECURITY;

-- SELECT: qualquer membro do tenant pode ver a configuração
CREATE POLICY "bom_dia_config_select_tenant" ON bom_dia_config
  FOR SELECT USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid()
    )
  );

-- INSERT: apenas admin ou marketing podem criar a config do tenant
CREATE POLICY "bom_dia_config_insert_admin_marketing" ON bom_dia_config
  FOR INSERT WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM tenant_members
      WHERE user_id = auth.uid()
        AND role IN ('admin', 'marketing')
    )
  );

-- UPDATE: apenas admin ou marketing podem alterar a config do tenant
CREATE POLICY "bom_dia_config_update_admin_marketing" ON bom_dia_config
  FOR UPDATE USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_members
      WHERE user_id = auth.uid()
        AND role IN ('admin', 'marketing')
    )
  );

COMMIT;

-- ============================================================
-- DOWN MIGRATION (não executar automaticamente — copiar e rodar manualmente)
-- ============================================================
--
-- BEGIN;
--
-- -- Remove tabela bom_dia_config
-- DROP TABLE IF EXISTS bom_dia_config;
--
-- -- Restaura policy UPDATE original em whatsapp_groups (qualquer membro do tenant)
-- DROP POLICY IF EXISTS "wa_groups_update_admin_marketing" ON whatsapp_groups;
-- CREATE POLICY "wa_groups_update_tenant" ON whatsapp_groups
--   FOR UPDATE USING (
--     tenant_id IN (SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid())
--   );
--
-- -- Remove índice e coluna bom_dia_ativo
-- DROP INDEX IF EXISTS idx_whatsapp_groups_bom_dia;
-- ALTER TABLE whatsapp_groups DROP COLUMN IF EXISTS bom_dia_ativo;
--
-- COMMIT;
