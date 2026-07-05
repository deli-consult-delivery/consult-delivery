-- G03 — Supabase Storage bucket para PDFs/HTMLs de contratos (público)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('contratos', 'contratos', true, 5242880, ARRAY['text/html','application/pdf'])
ON CONFLICT (id) DO NOTHING;
