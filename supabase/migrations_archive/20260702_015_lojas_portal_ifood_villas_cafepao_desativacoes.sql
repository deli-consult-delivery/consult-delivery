-- 20260702_015_lojas_portal_ifood_villas_cafepao_desativacoes.sql
-- F0 do GESTOR: resolve as 3 pendências ambíguas deixadas por 20260702_014 + 2 desativações
-- confirmadas pelo Wandson (lista definitiva das 14 lojas ativas na consultoria).
--
-- 1) Villas Caldo/Caldos: desambiguado por ENDEREÇO lido no modal "Escolher loja" (probe
--    read-only, 2026-07-02) — confirma a hipótese, sem contradição:
--      "Villas Caldos - Panelinhas e Petiscos" -> Avenida G, 19, Rua A10, S/N, CIDADE JARDIM,
--        PARAUAPEBAS, PA, BR (ID 2282890)  => bate com o seed "VILLAS CALDO - C. JARDIM"
--      "Villas Caldos da 14 - B. União"     -> RUA 14, 210, UNIAO, PARAUAPEBAS, PA, BR
--        (ID 2237814)                       => bate com o seed "VILLAS CALDOS" (sem sufixo)
-- 2) Café com Pão: confirmado pelo Wandson = "Panificadora Café Com Pão Cidade Jardim"
--    (dos 2 candidatos do probe anterior; o outro, "Parque dos Carajás", não é a loja da CD).
-- 3) Uraka Burger e Mikelly Container: fora da lista definitiva de 14 lojas ativas na
--    consultoria confirmada pelo Wandson -> is_consultoria_ativa = false.

UPDATE public.lojas SET ifood_portal_nome = 'Villas Caldos - Panelinhas e Petiscos' WHERE id = 'daf35575-0376-4f36-8c28-62dfed2956d9';
UPDATE public.lojas SET ifood_portal_nome = 'Villas Caldos da 14 - B. União'        WHERE id = '2d178584-2a43-4fc8-a939-9d26f22debcc';
UPDATE public.lojas SET ifood_portal_nome = 'Panificadora Café Com Pão Cidade Jardim' WHERE id = 'bc2b56e2-9587-4efd-b034-82e88c9ac1c1';

UPDATE public.lojas SET is_consultoria_ativa = false WHERE id = '78d3760e-1fe9-4985-b890-546bb095d99e'; -- Uraka Burger
UPDATE public.lojas SET is_consultoria_ativa = false WHERE id = '7706639b-2aa4-4e34-a207-b0498a5433aa'; -- Mikelly Container
