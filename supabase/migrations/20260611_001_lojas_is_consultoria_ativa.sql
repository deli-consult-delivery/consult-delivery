-- ============================================================
-- 20260611_001_lojas_is_consultoria_ativa.sql
-- ------------------------------------------------------------
-- CAUSA-RAIZ do incidente 2026-06-11 ("[VERDE] cliente_sumiu_7d: 1000 loja(s)"):
-- a tabela `lojas` guarda TODOS os contatos de WhatsApp do Wandson (1172 ativos:
-- pessoas, fornecedores, leads, listas de transmissão, números crus), não só os
-- clientes de consultoria. Os gatilhos cliente_sumiu_7d e metrica_caiu_20pct
-- iteram `.eq('status','ativo')` sobre TODOS => despejaram ~1000 contatos no feed.
--
-- `status='ativo'` (1172), `data_inicio_consultoria` (1174) e `is_active` (3)
-- NÃO separam consultoria de contato. O ÚNICO sinal confiável é a convenção que
-- o Wandson já usa NO NOME do contato: "CONSULTORIA - X", "CST - X", "CONS. X",
-- e marca pausadas com "🛑 ... SUSPENSA/PAUSADO".
--
-- Esta migration cria o MECANISMO DE MARCAÇÃO explícito que o Wandson pediu:
-- coluna booleana `is_consultoria_ativa`. Os gatilhos passam a filtrar por ela.
-- A marcação fica sob controle do Wandson (toggle no painel / UPDATE), nunca
-- mais dependendo do nome.
--
-- ADITIVA e REVERSÍVEL:
--   - ADD COLUMN ... NOT NULL DEFAULT false  (linhas existentes => false; ninguém
--     é monitorado até ser explicitamente marcado).
--   - Seed inicial APENAS do tenant Consult Delivery, derivado da convenção de
--     nome do próprio Wandson (consultoria ativa, excluindo suspensas/pausadas).
--     O Wandson revisa e corrige a lista antes de religar os gatilhos.
--   - Idempotente (IF NOT EXISTS; seed re-aplicável).
--
-- Reversão: ALTER TABLE lojas DROP COLUMN is_consultoria_ativa;
-- ============================================================

ALTER TABLE lojas
  ADD COLUMN IF NOT EXISTS is_consultoria_ativa boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN lojas.is_consultoria_ativa IS
  'TRUE = consultoria ativa monitorada pelo deli-orchestrator (cliente_sumiu_7d, metrica_caiu_20pct). Controlada manualmente pelo Wandson. Default false: contato comum NÃO é monitorado. Seed 2026-06-11 derivado da convenção de nome (CONSULTORIA -/CST), excluindo suspensas.';

-- Seed: marca como ativa só o que casa a convenção de nome do Wandson,
-- excluindo qualquer marca de suspensão/pausa/cancelamento. Só tenant CD.
UPDATE lojas
SET is_consultoria_ativa = true
WHERE tenant_id = '9079bd4d-4df7-4023-90fb-d79c8ba7e900'
  AND (nome ILIKE 'CONSULTORIA -%' OR nome ILIKE 'CONS.%' OR nome ~* '\mCST\M')
  AND nome !~* '(suspens|pausad|cancelad|encerrad|🛑|❌)';
