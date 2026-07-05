-- Bucket Storage privado para backups diários independentes do Supabase
-- Acessível apenas via service_role key (Trigger.dev). Limite 500 MB por arquivo.
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('backups', 'backups', false, 524288000)
ON CONFLICT (id) DO NOTHING;
