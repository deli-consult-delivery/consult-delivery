-- Adiciona telefone real do cliente (WhatsApp) às avaliações CSAT/NPS.
--
-- contact_identifier, quando a avaliação vem do Datacrazy (origem='crm_externo'),
-- guarda o ID interno da conversa no Datacrazy (ex: "697bcc47ff7b5e20aef4d733"),
-- NÃO um telefone. Isso impedia contatar o cliente pelo WhatsApp a partir da
-- notificação de detrator e das telas de CSAT/NPS no Console.
--
-- contact_phone guarda o telefone (com DDI, ex: "5594984367456"), extraído do
-- campo contact.phoneNumber das mensagens do Datacrazy quando disponível.

alter table atendimento_avaliacoes add column if not exists contact_phone text;
alter table nps_avaliacoes         add column if not exists contact_phone text;
