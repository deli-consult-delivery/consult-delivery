-- 20260622_003_cora_fk_indexes.sql
-- Faxina aditiva: índices nas 4 FKs single-column das tabelas CORA que o advisor
-- (get_advisors → unindexed_foreign_keys) apontava sem índice de cobertura.
--
-- Contexto: durante a investigação da tela preta "Nenhum workspace" (#482/#485) o
-- advisor listou 134 FKs sem índice no projeto inteiro. Aqui mexemos SÓ nas 4 das
-- tabelas CORA — escopo mínimo, aditivo e reversível. NÃO recriamos índices já
-- existentes (verificado em pg_indexes: nenhum tem a coluna da FK como líder).
--
-- Tabelas são pequenas hoje (33 / 58 / 1 / 245 linhas), então o ganho imediato em
-- SELECT é marginal; o benefício real é: (a) zerar o lint do advisor, (b) acelerar a
-- checagem de integridade da FK quando a linha-pai é deletada/atualizada (hoje seq
-- scan no filho), (c) future-proofing conforme as tabelas crescem.
--
-- Plain CREATE INDEX (não CONCURRENTLY): nas tabelas atuais o lock ACCESS EXCLUSIVE
-- dura ~1ms, imperceptível, e permite migration transacional. IF NOT EXISTS torna
-- idempotente. Reversão: DROP INDEX dos 4 nomes idx_* abaixo.
--
-- Convenção de nome: idx_<tabela>_<coluna> (mesma de idx_cobrancas_tenant_id etc).
-- Colunas reais confirmadas no pg_catalog (a constraint agent_drafts_approved_by_fkey
-- indexa a coluna reviewer_id, NÃO approved_by).

CREATE INDEX IF NOT EXISTS idx_agent_drafts_reviewer_id
  ON public.agent_drafts (reviewer_id);

CREATE INDEX IF NOT EXISTS idx_cora_acoes_agent_run_id
  ON public.cora_acoes (agent_run_id);

CREATE INDEX IF NOT EXISTS idx_cora_cobrancas_regua_id
  ON public.cora_cobrancas (regua_id);

CREATE INDEX IF NOT EXISTS idx_internal_notifications_recipient_user_id
  ON public.internal_notifications (recipient_user_id);
