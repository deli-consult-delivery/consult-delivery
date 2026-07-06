-- ════════════════════════════════════════════════════════════════════════════
-- Ticket do atendimento (Datacrazy) nas avaliações CSAT/NPS.
--
-- O Datacrazy abre um "ticket" (thread) por atendimento; o número visível ao
-- operador no painel é o `code` do thread (ex.: 56382). Persistir esse número
-- permite:
--  • mostrar na notificação de detrator no lugar do id hex da conversa;
--  • exibir na plataforma (Console);
--  • localizar o atendimento no painel do Datacrazy pela busca de ticket.
--
-- O código é capturado do endpoint /messages (campo histories[].thread.code) no
-- momento da finalização (mesma chamada que já resolve atendente/telefone).
--
-- Aditiva/reversível: apenas ADD COLUMN IF NOT EXISTS.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE atendimento_avaliacoes ADD COLUMN IF NOT EXISTS ticket_code integer;
ALTER TABLE nps_avaliacoes         ADD COLUMN IF NOT EXISTS ticket_code integer;

COMMENT ON COLUMN atendimento_avaliacoes.ticket_code IS 'Número do ticket/atendimento no Datacrazy (thread.code). Usado na notificação de detrator e para localizar o atendimento no painel.';
COMMENT ON COLUMN nps_avaliacoes.ticket_code IS 'Número do ticket/atendimento no Datacrazy (thread.code). Usado na notificação de detrator e para localizar o atendimento no painel.';
