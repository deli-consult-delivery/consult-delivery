-- supabase/migrations/20260520_001_rename_chat_unificado.sql
-- Sprint 1 — Chat Ao Vivo
-- Rastreabilidade histórica da renomeação Chat Unificado → Chat Ao Vivo
-- Verificação em 05/05/2026: nenhum índice ou constraint com 'unificado' existe no schema public.

SELECT 1; -- no-op intencional

-- Os labels visuais foram atualizados diretamente nos componentes React:
--   src/components/Sidebar.jsx  — label 'Chat Unificado' → 'Chat Ao Vivo'
--   src/components/Topbar.jsx   — ROUTE_LABELS.chat = 'Chat Ao Vivo'
-- O identificador de rota interno ('chat') não muda — é um estado JS, não uma URL.
-- Não há índices ou constraints de banco que referenciem o nome da tela.
