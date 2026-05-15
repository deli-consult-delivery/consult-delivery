-- Migration: 20260601_002_seed_agent_bom_dia.sql
-- Data: 2026-06-01
-- Motivo: Registrar agente Bom Dia (gerador de artes motivacionais diárias) na tabela agents.
-- Reversão: DELETE FROM public.agents WHERE id = 'bom-dia';

BEGIN;

INSERT INTO public.agents (id, name, role, letter, color, category, default_modo)
VALUES ('bom-dia', 'Imagens Bom Dia', 'Conteúdo motivacional diário', 'B', '#F59E0B', 'specialist', 'ia')
ON CONFLICT (id) DO NOTHING;

COMMIT;
