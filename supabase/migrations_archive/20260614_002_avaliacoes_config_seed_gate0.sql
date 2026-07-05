-- 20260614_002_avaliacoes_config_seed_gate0.sql
-- GATE 0 (Avaliações iFood) — baseline de logística por loja de consultoria.
--
-- Decisão do Wandson (2026-06-14, via AskUserQuestion): default = 'entrega_propria'
-- (loja responde avaliações de LOJA *e* de ENTREGA). Default seguro: nada é
-- auto-silenciado e tudo passa pela aprovação no grupo de WhatsApp antes de postar.
-- As exceções de logística do iFood ('ifood_logistica') serão aplicadas via UPDATE
-- pontual conforme o Wandson indicar quais lojas usam a logística do iFood.
--
-- Aditivo/reversível · idempotente (ON CONFLICT (loja_id) DO NOTHING — não
-- sobrescreve config já existente). Aplicado via execute_sql (DML); arquivado
-- aqui para versionamento em git (Mandato D5 v3).

INSERT INTO avaliacoes_loja_config (tenant_id, loja_id, logistica_tipo)
SELECT l.tenant_id, l.id, 'entrega_propria'
FROM lojas l
WHERE l.is_consultoria_ativa = true
ON CONFLICT (loja_id) DO NOTHING;

-- Reversão (se necessário) — remove apenas as linhas-baseline ainda intocadas
-- (sem tom definido e ainda 'entrega_propria'), preservando edições feitas na UI:
-- DELETE FROM avaliacoes_loja_config
-- WHERE logistica_tipo = 'entrega_propria'
--   AND tom IS NULL AND tom_sugerido_ia IS NULL
--   AND loja_id IN (SELECT id FROM lojas WHERE is_consultoria_ativa = true);
