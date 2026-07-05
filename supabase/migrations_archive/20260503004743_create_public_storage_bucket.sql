-- Cria bucket público no Supabase Storage para fotos de perfil
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('public', 'public', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

-- Policies para permitir upload e leitura pública (idempotente via DO block)
DO $$
BEGIN
  -- Insert policy
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
    AND policyname = 'Allow authenticated uploads on public bucket'
  ) THEN
    CREATE POLICY "Allow authenticated uploads on public bucket"
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'public');
  END IF;

  -- Update policy
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
    AND policyname = 'Allow authenticated updates on public bucket'
  ) THEN
    CREATE POLICY "Allow authenticated updates on public bucket"
    ON storage.objects FOR UPDATE TO authenticated
    USING (bucket_id = 'public');
  END IF;

  -- Select policy
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
    AND policyname = 'Allow public read on public bucket'
  ) THEN
    CREATE POLICY "Allow public read on public bucket"
    ON storage.objects FOR SELECT TO anon, authenticated
    USING (bucket_id = 'public');
  END IF;
END $$;
