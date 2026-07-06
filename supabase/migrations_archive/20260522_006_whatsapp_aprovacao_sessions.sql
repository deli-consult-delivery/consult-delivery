-- Migration: 20260522_006_whatsapp_aprovacao_sessions.sql
-- Data: 2026-05-22
-- Autor: Wandson (via Claude Code)
-- Motivo: Criar tabela whatsapp_aprovacao_sessions para gerenciar sessões de aprovação
--         de análises via WhatsApp (Onda 04). Cada sessão representa uma conversa ativa
--         aguardando resposta do cliente (sim/não) com TTL de 7 dias.
-- Risco: Baixo — tabela nova, zero impacto em dados existentes.
-- Reversão:
--   DROP TABLE IF EXISTS whatsapp_aprovacao_sessions;

BEGIN;

CREATE TABLE IF NOT EXISTS whatsapp_aprovacao_sessions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analise_id       uuid NOT NULL REFERENCES analises(id) ON DELETE CASCADE,
  loja_id          uuid NOT NULL REFERENCES lojas(id),
  numero_destino   text NOT NULL,
  evolution_instance text NOT NULL,
  status           text CHECK (status IN ('ativa', 'concluida', 'expirada', 'cancelada')) DEFAULT 'ativa',
  expira_em        timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  created_at       timestamptz DEFAULT now()
);

COMMENT ON TABLE whatsapp_aprovacao_sessions IS
  'Sessões de aprovação de análise via WhatsApp (Onda 04). Cada linha é uma conversa ativa aguardando resposta do destinatário. TTL padrão: 7 dias.';

COMMENT ON COLUMN whatsapp_aprovacao_sessions.analise_id IS
  'Análise que gerou esta sessão de aprovação. Cascade delete: se a análise for removida, a sessão some junto.';

COMMENT ON COLUMN whatsapp_aprovacao_sessions.loja_id IS
  'Loja associada à análise. Usada para resolver o tenant_id via JOIN em policies RLS.';

COMMENT ON COLUMN whatsapp_aprovacao_sessions.numero_destino IS
  'Número WhatsApp do destinatário no formato Evolution API (ex: 5511999999999@s.whatsapp.net ou grupo@g.us).';

COMMENT ON COLUMN whatsapp_aprovacao_sessions.evolution_instance IS
  'Nome da instância Evolution API usada para envio (ex: consult-delivery-main).';

COMMENT ON COLUMN whatsapp_aprovacao_sessions.status IS
  'Estado da sessão: ativa (aguardando resposta), concluida (aprovada/rejeitada), expirada (TTL vencido), cancelada (cancelada manualmente).';

COMMENT ON COLUMN whatsapp_aprovacao_sessions.expira_em IS
  'Data/hora de expiração da sessão. Após esse timestamp o status deve ser marcado como expirada por job agendado.';

-- Índice para buscar sessões por loja (dashboard de sessões ativas por loja)
CREATE INDEX idx_was_loja
  ON whatsapp_aprovacao_sessions(loja_id);

-- Índice parcial para buscar sessões ativas por número (receber resposta do webhook)
CREATE INDEX idx_was_numero_ativa
  ON whatsapp_aprovacao_sessions(numero_destino)
  WHERE status = 'ativa';

ALTER TABLE whatsapp_aprovacao_sessions ENABLE ROW LEVEL SECURITY;

-- Policy SELECT: usuários do tenant podem ver sessões das suas lojas
-- Resolve tenant_id via lojas → tenant_members (user_roles não tem tenant_id)
CREATE POLICY "Sessoes do tenant"
  ON whatsapp_aprovacao_sessions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM lojas l
      WHERE l.id = whatsapp_aprovacao_sessions.loja_id
        AND l.tenant_id IN (
          SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid()
        )
    )
  );

COMMIT;
