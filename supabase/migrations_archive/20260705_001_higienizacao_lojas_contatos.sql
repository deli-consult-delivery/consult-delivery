-- ============================================================
-- 20260705_001_higienizacao_lojas_contatos.sql
-- Semana 2 · B3 (docs/estrategia/PLANO-CONTINUIDADE-PLATAFORMA-2026-07.md)
-- ------------------------------------------------------------
-- CAUSA: `lojas` guarda 1.178 linhas (2026-07-05), mas só ~150 têm qualquer
-- sinal de operação de consultoria. As outras ~1.028 são contatos de WhatsApp
-- (pessoas, fornecedores, listas de transmissão) sincronizados na mesma tabela
-- que as lojas reais — mesma causa-raiz do incidente 2026-06-11
-- (20260611_001_lojas_is_consultoria_ativa.sql: "a tabela lojas guarda TODOS
-- os contatos de WhatsApp do Wandson, não só os clientes de consultoria").
--
-- CRITÉRIO (validado com output bruto em prod antes de escrever este arquivo —
-- ver docs/estrategia/HIGIENIZACAO-LOJAS-ANALISE.md §Diagnóstico):
--   Uma linha é "contato" (movida) SOMENTE SE as DUAS condições valem:
--   (1) is_real_business = false  — coluna já populada em prod (2026-06-10,
--       admin-mcp/src/tools/cd_lojas.js), classificação seed/teste vs negócio real.
--       Não tinha migration de origem versionada (gap de processo); esta
--       migration adota a coluna (passo 2 abaixo, NO-OP em prod) para fechar
--       o rastro em git e tornar o arquivo replayável do zero.
--   (2) ZERO sinal de atividade operacional em qualquer tabela/coluna que
--       referencia lojas.id: is_consultoria_ativa, store_tenant_id,
--       ifood_portal_nome, whatsapp_group_jid, skill_criada, loja_metricas,
--       loja_metricas_snapshot, tarefas_loja, loja_gpt_conversations,
--       radar_series, radar_fontes, analises, loja_whatsapp_vinculo,
--       avaliacoes_loja_config.
--
--   A condição (2) é a rede de segurança: 9 linhas com is_real_business=false
--   têm sinal de atividade (3 consultorias ativas mal-marcadas + linhas de
--   teste/smoke internas) e ficam de fora do critério — não são movidas.
--   97 linhas SEM nenhum sinal operacional mas com is_real_business=true
--   (prováveis leads/prospects em pipeline) também ficam de fora — não são
--   contato, só ainda não têm atividade.
--
-- Resultado esperado em prod na data desta migration (recontar antes de
-- aplicar — dado muda todo dia): total=1178, movidas≈1028, mantidas≈150.
--
-- NATUREZA: 100% ADITIVA e REVERSÍVEL.
--   - CREATE TABLE contatos (nova, cópia das linhas classificadas).
--   - ADD COLUMN lojas.is_contato (default false) — só marca, não remove nada.
--   - ZERO DELETE / DROP / TRUNCATE de dados reais. As linhas continuam em
--     `lojas` (qualquer FK existente para lojas.id continua íntegra).
--
-- ROLLBACK:
--   DELETE FROM contatos;
--   DROP TABLE contatos;
--   UPDATE lojas SET is_contato = false;
--   ALTER TABLE lojas DROP COLUMN is_contato;
--
--   ⚠️ is_real_business (passo 2) NÃO entra no rollback acima de forma automática
--   — o comando certo depende do ambiente:
--     • Em PROD: a coluna já existia ANTES desta migration (criada fora de git
--       em 2026-06-10) — o ADD COLUMN daqui foi NO-OP. NÃO fazer
--       DROP COLUMN is_real_business em prod (apagaria dado de 2026-06-10 que
--       não pertence a esta migration e que outras ferramentas — admin-mcp/
--       cd_lojas.js — dependem dele).
--     • Em ambiente fresh (supabase db reset local/CI/staging, onde esta
--       migration É a origem da coluna): opcionalmente
--       `ALTER TABLE lojas DROP COLUMN is_real_business;` — seguro porque
--       nasceu aqui.
--   Na dúvida sobre qual ambiente, deixar a coluna (default false, aditiva) é
--   sempre seguro — só o DROP TABLE contatos e o UPDATE is_contato=false acima
--   já revertem o efeito visível da higienização.
--
-- ⚠️ NÃO APLICAR sem rodar antes o bloco de diagnóstico (read-only) em
-- docs/estrategia/HIGIENIZACAO-LOJAS-ANALISE.md contra o prod e revisar com
-- o Wandson a lista de "candidatos a contato" — o critério pode mudar
-- conforme dado novo (lojas cadastradas desde a análise).
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. Tabela `contatos` — cópia das linhas de `lojas` classificadas como
--    contato de WhatsApp, não lojas reais de consultoria.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.contatos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loja_origem_id  uuid NOT NULL REFERENCES public.lojas(id),
  tenant_id       uuid NOT NULL REFERENCES public.tenants(id),
  nome            text,
  whatsapp        text,
  cidade          text,
  client_id       uuid REFERENCES public.customers(id),
  metadata        jsonb,
  criado_em_lojas timestamptz,
  migrado_em      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.contatos IS
  'Contatos de WhatsApp que estavam misturados na tabela lojas (higienização Semana 2 B3, 2026-07-05). loja_origem_id aponta para a linha original em lojas, que NÃO foi apagada (só marcada is_contato=true).';

CREATE INDEX IF NOT EXISTS idx_contatos_tenant ON public.contatos(tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_contatos_loja_origem ON public.contatos(loja_origem_id);
CREATE INDEX IF NOT EXISTS idx_contatos_client_id ON public.contatos(client_id);

ALTER TABLE public.contatos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS contatos_tenant ON public.contatos;
CREATE POLICY contatos_tenant ON public.contatos FOR ALL TO public
  USING (tenant_id IN (SELECT public.accessible_tenant_ids()))
  WITH CHECK (tenant_id IN (SELECT public.accessible_tenant_ids()));

-- ------------------------------------------------------------
-- 2. Flag em `lojas` — marca (sem apagar) o que foi classificado como contato.
--
-- `is_real_business` já existe em prod desde 2026-06-10 (admin-mcp/cd_lojas),
-- mas nenhuma migration deste repo a criou (gap de processo, ver doc de análise
-- §2). O ADD COLUMN abaixo adota a coluna existente: em prod é NO-OP (coluna já
-- lá, valores intocados); em qualquer ambiente que faça replay do zero
-- (`supabase db reset`, CI, staging) cria a coluna com default `false`, o que
-- torna este arquivo replayável sem depender de estado fora do git.
-- ------------------------------------------------------------
ALTER TABLE public.lojas ADD COLUMN IF NOT EXISTS is_real_business boolean NOT NULL DEFAULT false;
ALTER TABLE public.lojas ADD COLUMN IF NOT EXISTS is_contato boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.lojas.is_contato IS
  'TRUE = linha classificada como contato de WhatsApp (higienização 2026-07-05), copiada para contatos. A linha permanece aqui (nunca DELETE) para não quebrar FK/histórico. Telas de listagem de loja devem filtrar is_contato = false.';

-- ------------------------------------------------------------
-- 3. Classificação (critério documentado acima) + cópia para `contatos`.
-- ------------------------------------------------------------
WITH sinal_real AS (
  SELECT l.id
  FROM public.lojas l
  WHERE l.is_consultoria_ativa
     OR l.store_tenant_id IS NOT NULL
     OR l.ifood_portal_nome IS NOT NULL
     OR l.whatsapp_group_jid IS NOT NULL
     OR l.skill_criada IS TRUE
     OR l.id IN (SELECT loja_id FROM public.loja_metricas)
     OR l.id IN (SELECT loja_id FROM public.loja_metricas_snapshot)
     OR l.id IN (SELECT loja_id FROM public.tarefas_loja)
     OR l.id IN (SELECT loja_id FROM public.loja_gpt_conversations)
     OR l.id IN (SELECT loja_id FROM public.radar_series)
     OR l.id IN (SELECT loja_id FROM public.radar_fontes)
     OR l.id IN (SELECT loja_id FROM public.analises)
     OR l.id IN (SELECT loja_id FROM public.loja_whatsapp_vinculo)
     OR l.id IN (SELECT loja_id FROM public.avaliacoes_loja_config)
),
candidatos AS (
  SELECT l.*
  FROM public.lojas l
  WHERE l.is_real_business = false
    AND l.id NOT IN (SELECT id FROM sinal_real)
)
INSERT INTO public.contatos (loja_origem_id, tenant_id, nome, whatsapp, cidade, client_id, metadata, criado_em_lojas)
SELECT c.id, c.tenant_id, c.nome, c.whatsapp, c.cidade, c.client_id, c.metadata, c.created_at
FROM candidatos c
ON CONFLICT (loja_origem_id) DO NOTHING;

UPDATE public.lojas l
SET is_contato = true
FROM public.contatos c
WHERE c.loja_origem_id = l.id;

COMMIT;
