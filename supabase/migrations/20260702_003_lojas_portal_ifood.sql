-- 20260702_003_lojas_portal_ifood.sql
-- F0 do GESTOR: mapeia cada loja ao nome exibido no switcher do Portal do Parceiro
-- e ao grupo de WhatsApp onde relatórios do consultor devem ser postados.

ALTER TABLE public.lojas
  ADD COLUMN IF NOT EXISTS ifood_portal_nome text,
  ADD COLUMN IF NOT EXISTS whatsapp_group_jid text;

COMMENT ON COLUMN public.lojas.ifood_portal_nome IS
  'Nome exato da loja como aparece no switcher/modal "Escolher loja" do Portal do Parceiro iFood — usado por garantirLoja() para localizar/confirmar a loja certa.';
COMMENT ON COLUMN public.lojas.whatsapp_group_jid IS
  'JID do grupo de WhatsApp da loja para onde o GESTOR posta relatórios/alertas.';

-- Seed: mapeamento provisório — será validado na sessão de probe supervisionada com o Wandson
-- (nomes sem os prefixos internos "CONSULTORIA - "/"CST - " e sem emojis; melhor palpite).
UPDATE public.lojas SET ifood_portal_nome = 'Café Container - Lanches e Salgados' WHERE id = '8434cea4-b9c8-41ea-b366-57e8398aad0b';
UPDATE public.lojas SET ifood_portal_nome = 'Cardoso Churrascaria'                WHERE id = '4df6ce1c-8abc-4788-ada6-f4d2a1961d19';
UPDATE public.lojas SET ifood_portal_nome = 'Delícias Grill'                      WHERE id = '47e34d2e-5fac-47f9-9afd-481179411409';
UPDATE public.lojas SET ifood_portal_nome = 'Panelada da Tia'                     WHERE id = 'c2d14f21-d8ab-46e9-bfd0-0107768a224d';
UPDATE public.lojas SET ifood_portal_nome = 'Piazza'                              WHERE id = 'f0fa34d0-601d-422e-b9a9-dd21bd1ba9ec';
UPDATE public.lojas SET ifood_portal_nome = 'Popdi Pizza'                         WHERE id = '70f38835-d505-4e31-9ca3-38a415bb7818';
UPDATE public.lojas SET ifood_portal_nome = 'Varandas'                            WHERE id = 'fd1a4ac1-fabc-4359-8894-f3add7992a60';
UPDATE public.lojas SET ifood_portal_nome = 'Villas Caldo - C. Jardim'            WHERE id = 'daf35575-0376-4f36-8c28-62dfed2956d9';
UPDATE public.lojas SET ifood_portal_nome = 'Villas Caldos'                       WHERE id = '2d178584-2a43-4fc8-a939-9d26f22debcc';
UPDATE public.lojas SET ifood_portal_nome = 'Mikelly Container'                   WHERE id = '7706639b-2aa4-4e34-a207-b0498a5433aa';
UPDATE public.lojas SET ifood_portal_nome = 'Café com Pão'                        WHERE id = 'bc2b56e2-9587-4efd-b034-82e88c9ac1c1';
UPDATE public.lojas SET ifood_portal_nome = 'JF Espetaria'                        WHERE id = 'a6c1d121-b78d-47cd-bbc5-a3f4a738be06';
UPDATE public.lojas SET ifood_portal_nome = 'Mangiare Pizzaria - Forno a Lenha'   WHERE id = '2d46d7b1-a0f5-4539-b2a2-d1d587d2ee76';
UPDATE public.lojas SET ifood_portal_nome = 'Pizzaria Lá Mazza'                   WHERE id = '5899c79e-5cbe-4573-9927-1eb590a7dd4b';
UPDATE public.lojas SET ifood_portal_nome = 'Planet Pizza'                        WHERE id = 'b1349cf5-a9ff-4096-8195-9115bcd20523';
UPDATE public.lojas SET ifood_portal_nome = 'Uraka Burger'                        WHERE id = '78d3760e-1fe9-4985-b890-546bb095d99e';
