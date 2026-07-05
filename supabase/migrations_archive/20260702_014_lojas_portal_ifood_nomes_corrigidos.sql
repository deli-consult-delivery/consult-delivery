-- 20260702_014_lojas_portal_ifood_nomes_corrigidos.sql
-- F0 do GESTOR: corrige os `ifood_portal_nome` seedados em 20260702_003 (rotulados como
-- "melhor palpite") contra o nome EXATO confirmado ao vivo via busca no modal "Escolher loja"
-- do Portal do Parceiro (probe read-only supervisionado, 2026-07-02).
--
-- 9 corrigidos (match único e confiável); 3 ficam como estavam (ambíguos — 2+ resultados
-- no portal, sem dado extra pra desambiguar automaticamente: Villas Caldo - C. Jardim,
-- Villas Caldos, Café com Pão); 1 não encontrado (Uraka Burger — 0 resultados na busca).
-- Café Container, Popdi Pizza e Mangiare Pizzaria já estavam com o nome exato.

UPDATE public.lojas SET ifood_portal_nome = 'Churrascaria Cardoso - Marmitas & Espetos' WHERE id = '4df6ce1c-8abc-4788-ada6-f4d2a1961d19';
UPDATE public.lojas SET ifood_portal_nome = 'Delícias Grill - Marmitas & Espetinhos'    WHERE id = '47e34d2e-5fac-47f9-9afd-481179411409';
UPDATE public.lojas SET ifood_portal_nome = 'Marmitaria & Restaurante - Panelada da Tia' WHERE id = 'c2d14f21-d8ab-46e9-bfd0-0107768a224d';
UPDATE public.lojas SET ifood_portal_nome = 'Piazza Navona Pizzaria'                     WHERE id = 'f0fa34d0-601d-422e-b9a9-dd21bd1ba9ec';
UPDATE public.lojas SET ifood_portal_nome = 'Jf Espetaria - Marmitas & Espetos'          WHERE id = 'a6c1d121-b78d-47cd-bbc5-a3f4a738be06';
UPDATE public.lojas SET ifood_portal_nome = 'Pizzaria Lá Mazza - Pizzas e Porções'       WHERE id = '5899c79e-5cbe-4573-9927-1eb590a7dd4b';
UPDATE public.lojas SET ifood_portal_nome = 'Planet Pizza - Parauapebas'                 WHERE id = 'b1349cf5-a9ff-4096-8195-9115bcd20523';
UPDATE public.lojas SET ifood_portal_nome = 'Varanda''s Churrascaria e Pizzaria'         WHERE id = 'fd1a4ac1-fabc-4359-8894-f3add7992a60';
UPDATE public.lojas SET ifood_portal_nome = 'Mikelly Container - Pizzas e Espetos'       WHERE id = '7706639b-2aa4-4e34-a207-b0498a5433aa';

-- NÃO alterados nesta migration (pendência p/ o Wandson confirmar manualmente):
--   daf35575-0376-4f36-8c28-62dfed2956d9 (Villas Caldo - C. Jardim) — ambíguo entre
--     "Villas Caldos da 14 - B. União" e "Villas Caldos - Panelinhas e Petiscos"
--   2d178584-2a43-4fc8-a939-9d26f22debcc (Villas Caldos) — mesmos 2 candidatos acima
--   bc2b56e2-9587-4efd-b034-82e88c9ac1c1 (Café com Pão) — ambíguo entre
--     "Panificadora Café Com Pão Cidade Jardim" e "Panificadora Café Com Pão - Parque dos Carajás"
--   78d3760e-1fe9-4985-b890-546bb095d99e (Uraka Burger) — 0 resultados na busca (nome real
--     desconhecido ou loja fora do escopo de busca do portal nesta conta)
