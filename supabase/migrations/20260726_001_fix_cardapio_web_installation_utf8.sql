-- Data: 2026-07-26 | Autor: Wandson | Risco: baixo
-- Motivo: corrigir defaults e registros mojibake da integracao Cardapio Web.
-- Forward-only: reverter restauraria os valores mojibake que esta migration corrige.
BEGIN;

ALTER TABLE public.cardapio_web_installations
  ALTER COLUMN venda_deposito SET DEFAULT
    convert_from(decode('50414452c3834f', 'hex'), 'UTF8'),
  ALTER COLUMN venda_forma_pagamento SET DEFAULT
    convert_from(decode('c380207669737461202d2044696e686569726f', 'hex'), 'UTF8');

UPDATE public.cardapio_web_installations
SET venda_deposito = convert_from(decode('50414452c3834f', 'hex'), 'UTF8')
WHERE encode(convert_to(venda_deposito, 'UTF8'), 'hex') = '50414452c383c6924f';

UPDATE public.cardapio_web_installations
SET venda_forma_pagamento =
  convert_from(decode('c380207669737461202d2044696e686569726f', 'hex'), 'UTF8')
WHERE encode(convert_to(venda_forma_pagamento, 'UTF8'), 'hex') =
  'c383e282ac207669737461202d2044696e686569726f';

COMMIT;
