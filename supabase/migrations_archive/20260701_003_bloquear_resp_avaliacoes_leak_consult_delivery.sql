-- 20260701_003_bloquear_resp_avaliacoes_leak_consult_delivery.sql
-- Bloqueia o vazamento cross-tenant achado na auditoria de go-live da Karina Doceria.
--
-- Contexto: PainelAvaliacoesConsultor.jsx (tela "Resp. Avaliações" / módulo
-- 'resp-avaliacoes') usa um client Supabase paralelo com anon key hardcoded e
-- consulta a tabela `reviews` SEM filtro de tenant_id, sobre uma lista fixa de
-- 14 lojas (ferramenta piloto do Consultor de iFood / Café Container).
--
-- O tenant "Consult Delivery" (9079bd4d-4df7-4023-90fb-d79c8ba7e900) — workspace
-- interno usado pelo Wandson/equipe no dia a dia — NÃO tem nenhuma linha em
-- tenant_modules hoje, ou seja, roda em modo "sem allowlist = todos os módulos
-- liberados" (semântica de 20260622_010_tenant_modules.sql). Isso inclui
-- 'resp-avaliacoes', expondo dados de 14 lojas-cliente para quem abrir esse
-- workspace.
--
-- Fix: liga a allowlist para este tenant, habilitando (enabled=true) TODOS os
-- module_key do catálogo atual (src/console/moduleCatalog.js, 2026-07-01) —
-- replicando exatamente o comportamento "tudo liberado" de hoje — EXCETO
-- 'resp-avaliacoes', que fica enabled=false. Isso corrige o vazamento pela UI
-- sem tocar na query/lógica do painel (que segue precisando de correção à
-- parte, com mais tempo, por ser ferramenta ao vivo do piloto iFood).
--
-- Aditivo/reversível e idempotente (ON CONFLICT DO UPDATE).
--
-- Rollback (volta ao modo "sem allowlist = tudo liberado"):
--   DELETE FROM public.tenant_modules
--   WHERE tenant_id = '9079bd4d-4df7-4023-90fb-d79c8ba7e900';

BEGIN;

INSERT INTO public.tenant_modules (tenant_id, module_key, enabled)
SELECT '9079bd4d-4df7-4023-90fb-d79c8ba7e900', module_key, enabled
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
