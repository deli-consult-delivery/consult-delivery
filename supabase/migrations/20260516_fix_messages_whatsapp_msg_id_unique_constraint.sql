-- Fix: replace partial unique index with a proper unique constraint on messages.whatsapp_msg_id.
--
-- The partial index (WHERE whatsapp_msg_id IS NOT NULL) created by migration
-- 20260530_004 is not usable by PostgreSQL's ON CONFLICT clause without specifying
-- the predicate. Supabase PostgREST generates plain ON CONFLICT (whatsapp_msg_id)
-- which requires a full constraint, so every inbound upsert was failing silently
-- and inbound messages were never written to the messages table.
--
-- PostgreSQL UNIQUE constraints allow multiple NULLs (NULL != NULL), so outbound
-- messages with whatsapp_msg_id = NULL are unaffected.
DROP INDEX IF EXISTS messages_whatsapp_msg_id_unique;
ALTER TABLE messages
  ADD CONSTRAINT messages_whatsapp_msg_id_unique UNIQUE (whatsapp_msg_id);
