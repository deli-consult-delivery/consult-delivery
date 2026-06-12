-- ============================================================
-- B-03 — Aperta policies amplas do bucket `public` em storage.objects
-- Auditoria: docs/auditoria/AUDITORIA-PLATAFORMA-2026-06.md (item B-03)
-- Data: 2026-06-12 | Mandato D5 v3 (SQL reversível — autonomia)
--
-- Estado antes (5 policies no bucket `public`):
--   "Allow public read on public bucket"          SELECT {authenticated,anon}
--   "public_read_public"                          SELECT (public/todos)      ← duplicata
--   "Allow authenticated uploads on public bucket" INSERT {authenticated}
--   "authenticated_upload_public"                 INSERT {authenticated}     ← duplicata
--   "Allow authenticated updates on public bucket" UPDATE {authenticated}
--
-- O que muda:
--   1. Remove as 2 duplicatas (public_read_public, authenticated_upload_public)
--   2. Listagem/search via API (SELECT) restrita a `authenticated` — anon não
--      enumera mais os arquivos do bucket
--
-- O que NÃO muda:
--   - Download por URL pública continua funcionando: o bucket tem public=true
--     e getPublicUrl() não passa por RLS (usado em ChatScreen.jsx,
--     trigger/bom-dia/gerar-imagem.ts, trigger/encerramento/gerar-imagem.ts)
--   - Upload do ChatScreen (sessão authenticated) e das tasks Trigger
--     (service-role, bypassa RLS) seguem intactos
--
-- Rollback (se necessário):
--   drop policy "Allow authenticated read on public bucket" on storage.objects;
--   create policy "Allow public read on public bucket" on storage.objects
--     for select to authenticated, anon using (bucket_id = 'public');
-- ============================================================

-- 1. Duplicatas
drop policy if exists "public_read_public" on storage.objects;
drop policy if exists "authenticated_upload_public" on storage.objects;

-- 2. SELECT (list/search via API) só para authenticated
drop policy if exists "Allow public read on public bucket" on storage.objects;

create policy "Allow authenticated read on public bucket"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'public');
