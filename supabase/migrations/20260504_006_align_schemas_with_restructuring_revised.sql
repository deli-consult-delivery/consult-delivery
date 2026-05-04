-- ============================================================
-- MIGRATION: Alinhamento de schemas com RESTRUCTURING_REVISED.md
-- Data: 2026-05-04
-- Branch: feature/schema-alignment
--
-- Objetivo: Renomear colunas e adicionar colunas faltando em 12 tabelas
-- para que migrations aplicadas (003, 004, 005) batam com o documento
-- autoritativo docs/RESTRUCTURING_REVISED.md (Seções 6-10).
--
-- Tabelas alteradas: whatsapp_contacts, whatsapp_groups,
--   whatsapp_messages, whatsapp_group_members,
--   lojas, client_facts, client_timeline, loja_metricas,
--   agent_drafts, deli_triggers, deli_pending_approvals, deli_actions_log
--
-- Tabelas NÃO alteradas (RBAC): roles, user_roles, role_permissions,
--   user_agent_access, audit_log — já alinhadas ✅
-- ============================================================

BEGIN;

-- ============================================================
-- SEÇÃO A — WhatsApp (quebrando produção: edge function e frontend)
-- ============================================================

-- ------------------------------------------------------------
-- A1. whatsapp_contacts
-- jid → evolution_jid, nome → display_name, telefone → phone
-- ADD: is_internal, internal_user_id
-- ------------------------------------------------------------

ALTER TABLE whatsapp_contacts RENAME COLUMN jid       TO evolution_jid;
ALTER TABLE whatsapp_contacts RENAME COLUMN nome      TO display_name;
ALTER TABLE whatsapp_contacts RENAME COLUMN telefone  TO phone;

ALTER TABLE whatsapp_contacts ADD COLUMN IF NOT EXISTS is_internal      BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE whatsapp_contacts ADD COLUMN IF NOT EXISTS internal_user_id UUID REFERENCES auth.users(id);

COMMENT ON COLUMN whatsapp_contacts.evolution_jid    IS 'JID do contato no WhatsApp via Evolution API (ex: +5511999@s.whatsapp.net)';
COMMENT ON COLUMN whatsapp_contacts.display_name     IS 'Nome de exibição do contato (pushName ou nome salvo)';
COMMENT ON COLUMN whatsapp_contacts.phone            IS 'Número de telefone limpo (sem JID)';
COMMENT ON COLUMN whatsapp_contacts.is_internal      IS 'TRUE se o contato é membro da equipe Consult Delivery';
COMMENT ON COLUMN whatsapp_contacts.internal_user_id IS 'FK para auth.users se is_internal = TRUE';

-- ------------------------------------------------------------
-- A2. whatsapp_groups
-- group_jid → evolution_jid, nome → group_name (NOT NULL)
-- ------------------------------------------------------------

ALTER TABLE whatsapp_groups RENAME COLUMN group_jid TO evolution_jid;
ALTER TABLE whatsapp_groups RENAME COLUMN nome      TO group_name;

-- Tornar group_name NOT NULL (preenche nulls com fallback antes)
UPDATE whatsapp_groups SET group_name = evolution_jid WHERE group_name IS NULL;
ALTER TABLE whatsapp_groups ALTER COLUMN group_name SET NOT NULL;

COMMENT ON COLUMN whatsapp_groups.evolution_jid IS 'JID do grupo no WhatsApp via Evolution API (ex: 5511xxx@g.us)';
COMMENT ON COLUMN whatsapp_groups.group_name    IS 'Nome do grupo (subject do WhatsApp)';

-- ------------------------------------------------------------
-- A3. whatsapp_messages
-- message_id → evolution_message_id, body → content,
-- media_type → message_type, created_at → ts
-- ADD: sender_contact_id (NOT NULL se tabela vazia), media_metadata
-- ⚠️  Se whatsapp_messages tiver dados, sender_contact_id fica nullable.
-- ------------------------------------------------------------

ALTER TABLE whatsapp_messages RENAME COLUMN message_id  TO evolution_message_id;
ALTER TABLE whatsapp_messages RENAME COLUMN body        TO content;
ALTER TABLE whatsapp_messages RENAME COLUMN media_type  TO message_type;
ALTER TABLE whatsapp_messages RENAME COLUMN created_at  TO ts;

ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS sender_contact_id UUID REFERENCES whatsapp_contacts(id);
ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS media_metadata     JSONB;

-- Aplica NOT NULL em sender_contact_id somente se tabela vazia
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM whatsapp_messages LIMIT 1) THEN
    ALTER TABLE whatsapp_messages ALTER COLUMN sender_contact_id SET NOT NULL;
    RAISE NOTICE 'whatsapp_messages: sender_contact_id definido como NOT NULL (tabela vazia).';
  ELSE
    RAISE WARNING 'whatsapp_messages tem dados existentes — sender_contact_id adicionado como nullable. Preencha e adicione NOT NULL manualmente.';
  END IF;
END $$;

COMMENT ON COLUMN whatsapp_messages.evolution_message_id IS 'ID único da mensagem na Evolution API';
COMMENT ON COLUMN whatsapp_messages.content              IS 'Texto da mensagem ou legenda de mídia';
COMMENT ON COLUMN whatsapp_messages.message_type         IS 'Tipo: text, image, audio, video, document, sticker';
COMMENT ON COLUMN whatsapp_messages.sender_contact_id    IS 'FK para whatsapp_contacts — quem enviou (NOT NULL se tabela estava vazia)';
COMMENT ON COLUMN whatsapp_messages.ts                   IS 'Timestamp da mensagem (do Evolution API)';

-- ------------------------------------------------------------
-- A4. whatsapp_group_members
-- ADD: role_in_group (mantendo is_admin e joined_at)
-- ------------------------------------------------------------

ALTER TABLE whatsapp_group_members ADD COLUMN IF NOT EXISTS role_in_group TEXT;

COMMENT ON COLUMN whatsapp_group_members.role_in_group IS 'Papel no grupo: owner, admin, member, equipe_consult';
COMMENT ON COLUMN whatsapp_group_members.is_admin      IS 'Atalho para admin (mantido por compatibilidade)';

-- ============================================================
-- SEÇÃO B — Memória Central dos Agentes
-- ============================================================

-- ------------------------------------------------------------
-- B1. lojas
-- segmento → nicho, plataformas TEXT[] → plataforma TEXT,
-- ativo BOOLEAN → status TEXT
-- ADD: estado, data_entrada, metadata, client_id
-- ⚠️  plataformas com múltiplos valores: array_to_string (separa com ',')
-- ⚠️  ativo: TRUE → 'ativo', FALSE → 'inativo'
-- ------------------------------------------------------------

ALTER TABLE lojas RENAME COLUMN segmento TO nicho;

-- Converter plataformas TEXT[] → plataforma TEXT
ALTER TABLE lojas RENAME COLUMN plataformas TO _plataformas_arr;
ALTER TABLE lojas ADD COLUMN IF NOT EXISTS plataforma TEXT;
UPDATE lojas SET plataforma = CASE
  WHEN _plataformas_arr IS NULL        THEN NULL
  WHEN array_length(_plataformas_arr, 1) = 1 THEN _plataformas_arr[1]
  ELSE array_to_string(_plataformas_arr, ',')
END;
ALTER TABLE lojas DROP COLUMN _plataformas_arr;

-- Converter ativo BOOLEAN → status TEXT
ALTER TABLE lojas ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'ativo';
UPDATE lojas SET status = CASE WHEN ativo THEN 'ativo' ELSE 'inativo' END;
ALTER TABLE lojas DROP COLUMN ativo;
ALTER TABLE lojas ALTER COLUMN status SET NOT NULL;

-- Adicionar colunas faltando
ALTER TABLE lojas ADD COLUMN IF NOT EXISTS estado       TEXT;
ALTER TABLE lojas ADD COLUMN IF NOT EXISTS data_entrada DATE;
ALTER TABLE lojas ADD COLUMN IF NOT EXISTS metadata     JSONB DEFAULT '{}';
ALTER TABLE lojas ADD COLUMN IF NOT EXISTS client_id    UUID REFERENCES customers(id) ON DELETE SET NULL;

COMMENT ON COLUMN lojas.nicho      IS 'Nicho/segmento da loja (ex: pizza, hamburguer, açaí)';
COMMENT ON COLUMN lojas.plataforma IS 'Plataforma principal (ex: ifood, rappi, ambos)';
COMMENT ON COLUMN lojas.status     IS 'Status da loja: ativo, inativo, pausado';
COMMENT ON COLUMN lojas.estado     IS 'Estado UF (ex: SP, RJ)';
COMMENT ON COLUMN lojas.client_id  IS 'FK para customers — cliente/empresa proprietário da loja';

-- ------------------------------------------------------------
-- B2. client_facts
-- fact TEXT → key TEXT (rename) + ADD value JSONB
-- agent_name → source_agent
-- confidence SMALLINT(0-100) → REAL(0.0-1.0)
-- created_at → ts
-- ⚠️  confidence: divide por 100 (80 → 0.8)
-- ⚠️  fact existente: migrado para value = {"text": "<fact>"}, key = fact
-- ------------------------------------------------------------

ALTER TABLE client_facts RENAME COLUMN fact       TO key;
ALTER TABLE client_facts RENAME COLUMN agent_name TO source_agent;
ALTER TABLE client_facts RENAME COLUMN created_at TO ts;

ALTER TABLE client_facts ADD COLUMN IF NOT EXISTS value JSONB DEFAULT '{}';

-- Migrar fact text para JSONB value (key = label descritivo do fato, value = objeto)
UPDATE client_facts
SET value = jsonb_build_object('text', key)
WHERE value = '{}'::jsonb AND key IS NOT NULL;

-- Converter confidence SMALLINT(0-100) → REAL(0.0-1.0)
ALTER TABLE client_facts ALTER COLUMN confidence TYPE REAL USING (confidence::REAL / 100.0);
ALTER TABLE client_facts ALTER COLUMN confidence SET DEFAULT 1.0;

-- Remover CHECK constraint antiga (0-100 não se aplica mais)
ALTER TABLE client_facts DROP CONSTRAINT IF EXISTS client_facts_confidence_check;

COMMENT ON COLUMN client_facts.key          IS 'Identificador do fato (ex: "preferencia_contato", "ticket_habitual")';
COMMENT ON COLUMN client_facts.value        IS 'Valor JSONB do fato. Para fatos livres: {"text": "..."}';
COMMENT ON COLUMN client_facts.source_agent IS 'Agente que registrou o fato (ex: analista-ifood, deli)';
COMMENT ON COLUMN client_facts.confidence   IS 'Confiança do fato: 0.0 (incerto) a 1.0 (certeza)';
COMMENT ON COLUMN client_facts.ts           IS 'Timestamp de criação do fato';

-- ------------------------------------------------------------
-- B3. client_timeline
-- summary → title, metadata → payload, created_at → ts
-- ADD: description, user_id
-- ------------------------------------------------------------

ALTER TABLE client_timeline RENAME COLUMN summary    TO title;
ALTER TABLE client_timeline RENAME COLUMN metadata   TO payload;
ALTER TABLE client_timeline RENAME COLUMN created_at TO ts;

ALTER TABLE client_timeline ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE client_timeline ADD COLUMN IF NOT EXISTS user_id     UUID REFERENCES auth.users(id);

COMMENT ON COLUMN client_timeline.title       IS 'Título curto do evento (obrigatório)';
COMMENT ON COLUMN client_timeline.description IS 'Descrição expandida do evento (opcional)';
COMMENT ON COLUMN client_timeline.payload     IS 'Dados extras do evento em JSONB';
COMMENT ON COLUMN client_timeline.ts          IS 'Timestamp do evento (imutável)';
COMMENT ON COLUMN client_timeline.user_id     IS 'Usuário humano que originou o evento (se aplicável)';

-- ------------------------------------------------------------
-- B4. loja_metricas
-- data_ref → data
-- ADD: novos_clientes, visitas, conversao_cardapio, conversao_final, tempo_aberto_pct
-- ------------------------------------------------------------

ALTER TABLE loja_metricas RENAME COLUMN data_ref TO data;

ALTER TABLE loja_metricas ADD COLUMN IF NOT EXISTS novos_clientes    INTEGER;
ALTER TABLE loja_metricas ADD COLUMN IF NOT EXISTS visitas           INTEGER;
ALTER TABLE loja_metricas ADD COLUMN IF NOT EXISTS conversao_cardapio REAL;
ALTER TABLE loja_metricas ADD COLUMN IF NOT EXISTS conversao_final    REAL;
ALTER TABLE loja_metricas ADD COLUMN IF NOT EXISTS tempo_aberto_pct   REAL;

COMMENT ON COLUMN loja_metricas.data             IS 'Data de referência da métrica (DATE)';
COMMENT ON COLUMN loja_metricas.novos_clientes   IS 'Novos clientes no período';
COMMENT ON COLUMN loja_metricas.visitas          IS 'Total de visitas/visualizações do cardápio';
COMMENT ON COLUMN loja_metricas.conversao_cardapio IS 'Taxa de conversão: visitas que viraram pedido (0.0-1.0)';
COMMENT ON COLUMN loja_metricas.conversao_final  IS 'Taxa de conversão final incluindo cancelamentos (0.0-1.0)';
COMMENT ON COLUMN loja_metricas.tempo_aberto_pct IS 'Percentual do tempo que a loja ficou aberta no período (0.0-1.0)';

-- ============================================================
-- SEÇÃO C — Drafts
-- ============================================================

-- ------------------------------------------------------------
-- C1. agent_drafts
-- recipient_jid → target_id, body → content,
-- approved_by → reviewer_id, approved_at → reviewed_at
-- ADD: reasoning, edits_made, rejection_reason, expires_at
-- ------------------------------------------------------------

ALTER TABLE agent_drafts RENAME COLUMN recipient_jid TO target_id;
ALTER TABLE agent_drafts RENAME COLUMN body          TO content;
ALTER TABLE agent_drafts RENAME COLUMN approved_by   TO reviewer_id;
ALTER TABLE agent_drafts RENAME COLUMN approved_at   TO reviewed_at;

ALTER TABLE agent_drafts ADD COLUMN IF NOT EXISTS reasoning        TEXT;
ALTER TABLE agent_drafts ADD COLUMN IF NOT EXISTS edits_made       TEXT;
ALTER TABLE agent_drafts ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
ALTER TABLE agent_drafts ADD COLUMN IF NOT EXISTS expires_at       TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '24 hours');

COMMENT ON COLUMN agent_drafts.target_id        IS 'Destino do draft: JID whatsapp, chat_id telegram, ou identificador do painel';
COMMENT ON COLUMN agent_drafts.content          IS 'Corpo da mensagem a ser enviada';
COMMENT ON COLUMN agent_drafts.reviewer_id      IS 'Usuário que aprovou/rejeitou o draft';
COMMENT ON COLUMN agent_drafts.reviewed_at      IS 'Timestamp da decisão (aprovação ou rejeição)';
COMMENT ON COLUMN agent_drafts.reasoning        IS 'Raciocínio do agente ao criar o draft (contexto para o revisor)';
COMMENT ON COLUMN agent_drafts.edits_made       IS 'Resumo das edições feitas pelo revisor antes de aprovar';
COMMENT ON COLUMN agent_drafts.rejection_reason IS 'Motivo da rejeição (feedback para o agente)';
COMMENT ON COLUMN agent_drafts.expires_at       IS 'Draft expira automaticamente após 24h sem decisão';

-- ============================================================
-- SEÇÃO D — DELI
-- ============================================================

-- ------------------------------------------------------------
-- D1. deli_triggers
-- nome → name, condition_sql TEXT → condition_jsonb JSONB, ativo → enabled
-- ADD: proposed_action_jsonb
-- ⚠️  condition_sql não-JSON é encapsulado em {"sql": "..."}
-- ⚠️  Triggers existentes com SQL precisam ser re-semeados como JSONB
-- ------------------------------------------------------------

ALTER TABLE deli_triggers RENAME COLUMN nome          TO name;
ALTER TABLE deli_triggers RENAME COLUMN condition_sql TO condition_jsonb;
ALTER TABLE deli_triggers RENAME COLUMN ativo         TO enabled;

-- Converter condition_jsonb de TEXT para JSONB
-- Strings SQL válidas são encapsuladas: {"sql": "SELECT ..."}
ALTER TABLE deli_triggers
  ALTER COLUMN condition_jsonb TYPE JSONB
  USING (
    CASE
      WHEN condition_jsonb IS NULL OR trim(condition_jsonb) = ''
        THEN NULL
      WHEN trim(condition_jsonb) ~ '^\s*[\[{]'
        THEN condition_jsonb::JSONB
      ELSE
        jsonb_build_object('sql', condition_jsonb)
    END
  );

ALTER TABLE deli_triggers ADD COLUMN IF NOT EXISTS proposed_action_jsonb JSONB;

COMMENT ON TABLE  deli_triggers IS 'Regras da DELI: quando disparar e o que fazer. condition_jsonb: {source_table, event_type, checks:[{field,op,value}]}. proposed_action_jsonb: {type, ...parâmetros}.';
COMMENT ON COLUMN deli_triggers.name                 IS 'Nome do trigger (ex: "Cliente sumiu 7 dias")';
COMMENT ON COLUMN deli_triggers.condition_jsonb      IS 'Condição JSONB: {source_table, event_type, checks:[{field,op,value}]}';
COMMENT ON COLUMN deli_triggers.proposed_action_jsonb IS 'Ação proposta JSONB: {type, title, description, ...} — lida pelo executeVerde/createPendingApproval';
COMMENT ON COLUMN deli_triggers.enabled              IS 'TRUE = trigger ativo e avaliado pelo Bridge Server';

-- ------------------------------------------------------------
-- D2. deli_pending_approvals
-- context_json → context_jsonb, resolved_by → approver_id,
-- resolved_at → approved_at
-- ADD: proposed_action_jsonb, reasoning
-- Status: 'aguardando'→'waiting', 'aprovado'→'approved',
--         'rejeitado'→'rejected', 'expirado'→'expired'
-- ------------------------------------------------------------

ALTER TABLE deli_pending_approvals RENAME COLUMN context_json  TO context_jsonb;
ALTER TABLE deli_pending_approvals RENAME COLUMN resolved_by   TO approver_id;
ALTER TABLE deli_pending_approvals RENAME COLUMN resolved_at   TO approved_at;

ALTER TABLE deli_pending_approvals ADD COLUMN IF NOT EXISTS proposed_action_jsonb JSONB;
ALTER TABLE deli_pending_approvals ADD COLUMN IF NOT EXISTS reasoning             TEXT;

-- Migrar valores de status de PT → EN
-- Requer drop do CHECK constraint existente
ALTER TABLE deli_pending_approvals
  DROP CONSTRAINT IF EXISTS deli_pending_approvals_status_check;

UPDATE deli_pending_approvals SET status = CASE
  WHEN status = 'aguardando' THEN 'waiting'
  WHEN status = 'aprovado'   THEN 'approved'
  WHEN status = 'rejeitado'  THEN 'rejected'
  WHEN status = 'expirado'   THEN 'expired'
  ELSE status
END;

ALTER TABLE deli_pending_approvals
  ADD CONSTRAINT deli_pending_approvals_status_check
  CHECK (status IN ('waiting', 'approved', 'rejected', 'expired', 'failed'));

ALTER TABLE deli_pending_approvals ALTER COLUMN status SET DEFAULT 'waiting';

COMMENT ON COLUMN deli_pending_approvals.context_jsonb         IS 'Contexto do evento que gerou a aprovação (payload do Realtime)';
COMMENT ON COLUMN deli_pending_approvals.proposed_action_jsonb IS 'Ação proposta copiada do trigger (para exibição e execução)';
COMMENT ON COLUMN deli_pending_approvals.reasoning             IS 'Explicação da DELI sobre por que propõe esta ação';
COMMENT ON COLUMN deli_pending_approvals.approver_id           IS 'Usuário que aprovou ou rejeitou';
COMMENT ON COLUMN deli_pending_approvals.approved_at           IS 'Timestamp da decisão final';
COMMENT ON COLUMN deli_pending_approvals.status                IS 'Status: waiting, approved, rejected, expired, failed';

-- ------------------------------------------------------------
-- D3. deli_actions_log
-- created_at → ts, draft_id → related_draft_id
-- ADD: context_jsonb, action_taken_jsonb, result, error_detail
-- DROP: action_type, summary, metadata (após migrar para action_taken_jsonb)
-- ⚠️  Operação irreversível: dados de action_type/summary/metadata
--     são consolidados em action_taken_jsonb antes do DROP
-- ------------------------------------------------------------

ALTER TABLE deli_actions_log RENAME COLUMN created_at TO ts;
ALTER TABLE deli_actions_log RENAME COLUMN draft_id   TO related_draft_id;

ALTER TABLE deli_actions_log ADD COLUMN IF NOT EXISTS context_jsonb      JSONB;
ALTER TABLE deli_actions_log ADD COLUMN IF NOT EXISTS action_taken_jsonb JSONB;
ALTER TABLE deli_actions_log ADD COLUMN IF NOT EXISTS result             TEXT;
ALTER TABLE deli_actions_log ADD COLUMN IF NOT EXISTS error_detail       TEXT;

-- Migrar action_type + summary + metadata → action_taken_jsonb
UPDATE deli_actions_log
SET action_taken_jsonb = jsonb_strip_nulls(jsonb_build_object(
  'action_type', action_type,
  'summary',     summary,
  'metadata',    metadata
))
WHERE action_taken_jsonb IS NULL
  AND (action_type IS NOT NULL OR summary IS NOT NULL OR metadata IS NOT NULL);

-- DROP colunas antigas (dados já migrados acima)
ALTER TABLE deli_actions_log DROP COLUMN IF EXISTS action_type;
ALTER TABLE deli_actions_log DROP COLUMN IF EXISTS summary;
ALTER TABLE deli_actions_log DROP COLUMN IF EXISTS metadata;

COMMENT ON COLUMN deli_actions_log.related_draft_id   IS 'FK para agent_drafts — draft criado ou enviado nesta ação';
COMMENT ON COLUMN deli_actions_log.context_jsonb       IS 'Contexto do evento (payload do Realtime que originou a ação)';
COMMENT ON COLUMN deli_actions_log.action_taken_jsonb  IS 'Ação executada em formato JSONB {type, ...parâmetros}';
COMMENT ON COLUMN deli_actions_log.result              IS 'Resultado: success, loja_id_not_resolved, invoke_failed:NNN, error:...';
COMMENT ON COLUMN deli_actions_log.error_detail        IS 'Detalhe do erro se result começar com "error:"';
COMMENT ON COLUMN deli_actions_log.ts                  IS 'Timestamp da ação executada';

-- ============================================================
-- FIM
-- ============================================================

COMMIT;
