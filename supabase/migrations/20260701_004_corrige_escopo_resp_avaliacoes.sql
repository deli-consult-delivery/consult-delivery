-- 20260701_004_corrige_escopo_resp_avaliacoes.sql
-- Corrige o escopo da migration anterior (20260701_003).
--
-- Contexto: 'resp-avaliacoes' (PainelAvaliacoesConsultor.jsx) é a ferramenta
-- INTERNA do time (Consultor de iFood / piloto Café Container), operada pelo
-- workspace "Consult Delivery". Ela deve continuar habilitada lá — o vazamento
-- real é essa tela (que mostra dados de 14 lojas sem filtro de tenant) estar
-- acessível também a partir de QUALQUER OUTRO tenant que rode sem allowlist em
-- tenant_modules (semântica "sem linhas = tudo liberado").
--
-- (1) Reverte a 20260701_003 no que toca 'resp-avaliacoes' para o tenant
--     Consult Delivery (9079bd4d-4df7-4023-90fb-d79c8ba7e900): volta a true.
--     As outras ~69 linhas populadas por aquela migration continuam corretas
--     (replicam o "tudo liberado" que já era o comportamento real).
--
-- (2) Fecha a mesma exposição no tenant "Cliente Teste Sandbox"
--     (fd7d9eb9-f49d-441a-b6b7-9ff600de849f), que também roda hoje sem
--     allowlist: popula o catálogo completo com enabled=true, exceto
--     'resp-avaliacoes'=false.
--
-- Aditivo/reversível e idempotente.
--
-- Rollback:
--   UPDATE public.tenant_modules SET enabled = false
--   WHERE tenant_id = '9079bd4d-4df7-4023-90fb-d79c8ba7e900' AND module_key = 'resp-avaliacoes';
--   DELETE FROM public.tenant_modules
--   WHERE tenant_id = 'fd7d9eb9-f49d-441a-b6b7-9ff600de849f';

BEGIN;

-- (1) Consult Delivery: resp-avaliacoes volta a true (é a ferramenta interna do time)
UPDATE public.tenant_modules
SET enabled = true
WHERE tenant_id = '9079bd4d-4df7-4023-90fb-d79c8ba7e900'
  AND module_key = 'resp-avaliacoes';

-- (2) Cliente Teste Sandbox: liga a allowlist, tudo true exceto resp-avaliacoes
INSERT INTO public.tenant_modules (tenant_id, module_key, enabled)
SELECT 'fd7d9eb9-f49d-441a-b6b7-9ff600de849f', module_key, enabled
FROM (VALUES
  ('visao', true), ('deli', true),
  ('crm', true), ('lojas', true), ('chat', true), ('chat-legado', true),
  ('respostas-rapidas', true), ('mia', true), ('aprovacoes', true),
  ('recontratacao', true), ('sofia', true), ('disparos', true), ('cora', true),
  ('defesa', true), ('radar', true), ('cardapio-ifood', true), ('espacos', true),
  ('ativar', true), ('campanhas', true), ('grupos', true), ('contratos', true),
  ('avaliacoes', true), ('resp-avaliacoes', false), ('csat', true), ('nps', true),
  ('controle-atendimentos', true), ('avaliacao-config', true),
  ('hub', true), ('catalogo', true), ('estudio', true), ('lara-editorial', true),
  ('lara', true), ('tarefas-globais', true), ('automacoes', true),
  ('habilidades', true), ('analise', true), ('cardapio', true),
  ('multicanal', true), ('construtor', true), ('oracle', true), ('inbox', true),
  ('tarefas', true), ('gatilhos', true), ('heartbeats', true), ('atividade', true),
  ('metas', true), ('topicos', true), ('modelos', true), ('config', true),
  ('arquivos', true), ('links', true), ('memoria', true), ('conhecimento', true),
  ('custos', true), ('importar', true), ('relatorios', true),
  ('usuarios', true), ('configsys', true), ('clientesplat', true), ('marca', true),
  ('provedores', true), ('integracoes', true), ('vendaerp', true),
  ('sistemas', true), ('onboarding', true), ('acesso', true), ('auditoria', true),
  ('notificacoes', true), ('monitor', true), ('pipeline', true)
) AS v(module_key, enabled)
ON CONFLICT (tenant_id, module_key) DO UPDATE SET enabled = EXCLUDED.enabled;

COMMIT;
