-- ============================================================
-- 20260611_002_whatsapp_groups_monitorar_inatividade.sql
-- ------------------------------------------------------------
-- O Wandson pensa em GRUPOS de WhatsApp (tabela whatsapp_groups: 69 grupos
-- limpos), não na tabela `lojas` (agenda inteira: 1172 contatos crus). E o
-- ÚNICO sinal de atividade VIVO é whatsapp_messages.ts por group_id
-- (client_timeline está morto: 1 linha). Logo a régua "cliente sumiu há 7 dias"
-- passa a operar sobre GRUPOS marcados, lendo mensagens reais — não sobre lojas
-- contra um sinal morto (causa dos falsos "sumiu" do incidente 2026-06-11).
--
-- Esta migration cria o INTERRUPTOR que o Wandson liga na tela "Grupos
-- WhatsApp": coluna booleana `monitorar_inatividade`. Só grupos com TRUE
-- entram na régua cliente_sumiu_7d do deli-orchestrator.
--
-- ADITIVA e REVERSÍVEL:
--   - ADD COLUMN ... NOT NULL DEFAULT false  => ninguém é monitorado até o
--     Wandson ligar a chave manualmente (zero risco de spam ou falso positivo).
--   - Idempotente (IF NOT EXISTS). SEM seed automático: o Wandson liga grupo a
--     grupo na tela, porque só ele sabe quais grupos são consultoria ativa.
--
-- Reversão: ALTER TABLE whatsapp_groups DROP COLUMN monitorar_inatividade;
-- ============================================================

ALTER TABLE whatsapp_groups
  ADD COLUMN IF NOT EXISTS monitorar_inatividade boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN whatsapp_groups.monitorar_inatividade IS
  'TRUE = grupo monitorado pela régua cliente_sumiu_7d do deli-orchestrator: alerta no Telegram interno se o grupo ficar 7+ dias sem mensagem em whatsapp_messages. Controlada manualmente pelo Wandson na tela Grupos WhatsApp. Default false: grupo NÃO é monitorado.';
