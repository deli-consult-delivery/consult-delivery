-- Adiciona coluna para persistir URL da foto de perfil do WhatsApp
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS push_photo_url text;
