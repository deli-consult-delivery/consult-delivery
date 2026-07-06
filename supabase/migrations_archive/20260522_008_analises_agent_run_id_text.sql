-- agent_run_id stores Trigger.dev run IDs (e.g. run_cmphjxthc00aa0holsstiegf9),
-- which are NOT UUIDs. Drop the FK that assumed uuid, then widen to text.
ALTER TABLE analises DROP CONSTRAINT IF EXISTS analises_agent_run_id_fkey;
ALTER TABLE analises ALTER COLUMN agent_run_id TYPE text;
