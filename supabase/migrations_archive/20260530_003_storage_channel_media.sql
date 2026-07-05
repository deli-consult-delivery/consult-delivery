-- Políticas de storage para upload de mídia nos canais internos.
-- O bucket 'public' existe mas sem policies de INSERT,
-- causando falha silenciosa no upload de áudio/arquivo pelo frontend.

INSERT INTO storage.buckets (id, name, public)
VALUES ('public', 'public', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "authenticated_upload_public" ON storage.objects;
CREATE POLICY "authenticated_upload_public"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'public');

DROP POLICY IF EXISTS "public_read_public" ON storage.objects;
CREATE POLICY "public_read_public"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'public');
