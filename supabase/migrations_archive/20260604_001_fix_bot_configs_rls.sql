-- Fix: adicionar WITH CHECK explícito na política de escrita do bot_configs
-- Sem WITH CHECK, o upsert via INSERT...ON CONFLICT falha com RLS mesmo para roles válidos
DROP POLICY IF EXISTS "admin and dev can write bot_config" ON bot_configs;

CREATE POLICY "admin and dev can write bot_config" ON bot_configs
  FOR ALL
  USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_members
      WHERE user_id = auth.uid() AND role IN ('admin', 'dev')
    )
  )
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM tenant_members
      WHERE user_id = auth.uid() AND role IN ('admin', 'dev')
    )
  );
