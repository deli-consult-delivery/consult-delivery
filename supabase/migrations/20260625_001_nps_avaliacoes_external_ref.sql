-- Adiciona external_ref em nps_avaliacoes para idempotência do datacrazy-nps-poller
-- external_ref = conversation ID do Datacrazy CRM

ALTER TABLE nps_avaliacoes
  ADD COLUMN IF NOT EXISTS external_ref TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS nps_avaliacoes_external_ref_uniq
  ON nps_avaliacoes (tenant_id, external_ref)
  WHERE external_ref IS NOT NULL;
