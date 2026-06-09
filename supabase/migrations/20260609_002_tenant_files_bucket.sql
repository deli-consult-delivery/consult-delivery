-- ============================================================
-- Console v2 · Arquivos: bucket privado + RLS por tenant em storage.objects.
-- A tabela public.tenant_files já existe (20260609_001). Aqui falta só o
-- storage real para a tela "Arquivos" enviar/baixar de verdade.
--
-- ADITIVO e REVERSÍVEL: cria um bucket NOVO ('tenant-files') e policies
-- escopadas SÓ a ele. Não toca em buckets nem policies existentes.
-- Reverter: drop das 4 policies + delete from storage.buckets where id='tenant-files'.
--
-- Convenção de path:  '<tenant_id>/<uuid>-<arquivo>'
--   → (storage.foldername(name))[1] = '<tenant_id>'  (1º segmento)
--
-- Segurança do cast: comparamos tenant_members.tenant_id::text contra o 1º
-- segmento do path (texto). NUNCA fazemos cast text→uuid sobre o nome do
-- objeto, então nenhum objeto de outro bucket com path não-uuid pode quebrar
-- a avaliação da policy (sem risco de erro de cast em scans amplos).
-- Equivale a public.is_member_of(...) mas cast-safe.
-- ============================================================

insert into storage.buckets (id, name, public, file_size_limit)
values ('tenant-files', 'tenant-files', false, 52428800)   -- privado · 50 MB
on conflict (id) do nothing;

-- SELECT — membro do tenant lê os próprios arquivos
drop policy if exists tenant_files_obj_select on storage.objects;
create policy tenant_files_obj_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'tenant-files'
    and exists (
      select 1 from public.tenant_members tm
      where tm.tenant_id::text = (storage.foldername(name))[1]
        and tm.user_id = auth.uid()
    )
  );

-- INSERT — membro do tenant envia para a própria pasta
drop policy if exists tenant_files_obj_insert on storage.objects;
create policy tenant_files_obj_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'tenant-files'
    and exists (
      select 1 from public.tenant_members tm
      where tm.tenant_id::text = (storage.foldername(name))[1]
        and tm.user_id = auth.uid()
    )
  );

-- UPDATE — upsert/move dentro do próprio tenant
drop policy if exists tenant_files_obj_update on storage.objects;
create policy tenant_files_obj_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'tenant-files'
    and exists (
      select 1 from public.tenant_members tm
      where tm.tenant_id::text = (storage.foldername(name))[1]
        and tm.user_id = auth.uid()
    )
  )
  with check (
    bucket_id = 'tenant-files'
    and exists (
      select 1 from public.tenant_members tm
      where tm.tenant_id::text = (storage.foldername(name))[1]
        and tm.user_id = auth.uid()
    )
  );

-- DELETE — membro do tenant remove os próprios arquivos
drop policy if exists tenant_files_obj_delete on storage.objects;
create policy tenant_files_obj_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'tenant-files'
    and exists (
      select 1 from public.tenant_members tm
      where tm.tenant_id::text = (storage.foldername(name))[1]
        and tm.user_id = auth.uid()
    )
  );
