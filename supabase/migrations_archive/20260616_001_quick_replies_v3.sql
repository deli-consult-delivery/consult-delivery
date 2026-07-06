-- Respostas Rápidas v3: upload de arquivo + grupo + visibilidade por atendente/departamento
-- Aditivo: apenas ADD COLUMN IF NOT EXISTS, sem DROP, sem alterar RLS existente

ALTER TABLE quick_replies
  ADD COLUMN IF NOT EXISTS group_name        text,
  ADD COLUMN IF NOT EXISTS file_path         text,
  ADD COLUMN IF NOT EXISTS visible_user_ids  uuid[],
  ADD COLUMN IF NOT EXISTS visible_dept_ids  uuid[];

COMMENT ON COLUMN quick_replies.file_path         IS 'Caminho no bucket Storage public (quick-replies/{tenant_id}/{uuid}.ext)';
COMMENT ON COLUMN quick_replies.group_name         IS 'Categoria/grupo da resposta rápida (ex: Cobrança, Boas-vindas)';
COMMENT ON COLUMN quick_replies.visible_user_ids   IS 'NULL = visível para todos; array de user_ids restringe a atendentes específicos';
COMMENT ON COLUMN quick_replies.visible_dept_ids   IS 'NULL = todos os departamentos; array de department_ids restringe por depto';

-- Habilitar audio no bucket public (imagens já estavam permitidas)
UPDATE storage.buckets
SET allowed_mime_types = array_cat(
      allowed_mime_types,
      ARRAY['audio/ogg', 'audio/webm', 'audio/mp4']
    )
WHERE id = 'public'
  AND NOT (allowed_mime_types @> ARRAY['audio/webm']);
