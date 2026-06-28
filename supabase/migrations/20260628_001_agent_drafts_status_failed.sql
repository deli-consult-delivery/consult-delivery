-- 20260628_001_agent_drafts_status_failed.sql
-- F2 iFood: adiciona 'failed' ao CHECK de agent_drafts.status.
-- Usado pelo POST /api/ifood/aprovar quando a escrita no iFood falha APÓS a
-- aprovação humana — distingue "execução falhou" de "rejeitado pelo humano"
-- (rejected). Sem esse valor, o PATCH de erro violava o CHECK e mascarava o
-- erro de negócio do iFood, deixando o draft preso em 'pending'.
--
-- ADITIVO/REVERSÍVEL: amplia o conjunto aceito. O ADD CONSTRAINT revalida as
-- linhas existentes — se houver status fora do novo set, a migração ABORTA sem
-- corromper nada (não há DROP de dados).

ALTER TABLE agent_drafts DROP CONSTRAINT IF EXISTS agent_drafts_status_check;
ALTER TABLE agent_drafts ADD CONSTRAINT agent_drafts_status_check
  CHECK (status IN ('pending','approved','rejected','sent','edited','failed'));
