-- 20260705_003_lojas_fonte_dados.sql
-- Frente A fase 2 (Plano Integração iFood §2 A2): feature flag por loja para
-- migrar gradualmente a leitura de dados iFood do Portal (browser/worker) para
-- a API oficial (client_credentials, lib/ifood.js). Default 'portal': ZERO
-- mudança de comportamento até o Wandson trocar loja a loja.
--
-- SQL ADITIVO/REVERSÍVEL. NÃO aplicar automaticamente (orquestradora aplica
-- conforme mandato D5 v3 — SQL versionado em git antes, 1 arquivo por vez).

ALTER TABLE public.lojas
  ADD COLUMN IF NOT EXISTS fonte_dados text NOT NULL DEFAULT 'portal'
    CHECK (fonte_dados IN ('portal','api'));

COMMENT ON COLUMN public.lojas.fonte_dados IS
  'Fonte de leitura dos dados iFood da loja: portal (worker/browser, padrão) ou api (client oficial, lib/ifood.js). Trocado loja a loja durante a migração gradual (Frente A fase 2), sempre com dupla-checagem antes do corte.';

-- Reversão: ALTER TABLE public.lojas DROP COLUMN fonte_dados;
