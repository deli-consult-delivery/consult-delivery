-- chat_tasks: add loja_id + new statuses (blocked, ai_suggestion)

ALTER TABLE chat_tasks
  ADD COLUMN IF NOT EXISTS loja_id uuid REFERENCES lojas(id) ON DELETE SET NULL;

ALTER TABLE chat_tasks
  DROP CONSTRAINT IF EXISTS chat_tasks_status_check;

ALTER TABLE chat_tasks
  ADD CONSTRAINT chat_tasks_status_check
  CHECK (status IN ('ai_suggestion','todo','doing','waiting','blocked','canceled','done'));

CREATE INDEX IF NOT EXISTS idx_chat_tasks_loja
  ON chat_tasks(tenant_id, loja_id, status);
