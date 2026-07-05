-- PRÉ-BUILD AI-First: fechar RLS residual
-- Data: 2026-06-24
-- Autor: Claude Cowork (sessão implantacao-agentes)
-- Status: 🛑 GATE — NÃO APLICAR sem revisão do Wandson
--
-- CONTEXTO:
-- A auditoria de 2026-06-12 (AUDITORIA-PLATAFORMA-2026-06.md §B-02) identificou
-- 6 policies com USING (true) que expõem dados sem isolamento por tenant.
-- B-02 (evolution_instances) já foi fechado via 20260612_001_b02_rls_evolution_instances.sql.
-- Esta migration fecha as 5 restantes.
--
-- TABELAS AFETADAS:
--   1. channel_members      — allow_all_channel_members   (ALL, USING+CHECK true)
--   2. channel_messages     — allow_all_channel_messages  (ALL, USING+CHECK true)
--   3. internal_channels    — allow_all_internal_channels (ALL, USING+CHECK true)
--   4. messages             — messages_auth_all            (ALL, USING+CHECK true)
--   5. deli_agenda          — "service role can insert..." (INSERT, CHECK true) [MANTER — service_role é seguro]
--
-- RISCO REAL (conforme auditoria):
--   As de channel_* e messages são canais internos da equipe (1-2 humanos hoje).
--   Em cenário multi-tenant real, qualquer autenticado de outro tenant
--   poderia ler/escrever nesses canais. Com 1 tenant ativo, impacto prático é baixo.
--   Melhor fechar agora antes de abrir mais tenants.
--
-- ⚠️ ANTES DE APLICAR: Wandson deve verificar:
--   1. As tabelas channel_members, channel_messages, internal_channels têm tenant_id?
--      (Verificar: SELECT column_name FROM information_schema.columns WHERE table_name IN (...))
--   2. A tabela messages é a de canais internos ou outra?
--      (Verificar: \dt messages; SELECT column_name FROM information_schema.columns WHERE table_name='messages')
--   3. Confirmar que service_role ainda pode ler/escrever após as mudanças
--      (service_role bypassa RLS por padrão no Supabase)
--
-- REVERSÃO (se algo quebrar):
--   Copiar os DROPs de policies e recriar as políticas removidas com USING (true).
--   Cada DROP abaixo tem seu inverso comentado.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. channel_members
-- ─────────────────────────────────────────────────────────────────────────────
-- Remove policy ampla
DROP POLICY IF EXISTS "allow_all_channel_members" ON public.channel_members;

-- Substitui por isolamento via tenant_members
-- (assume que channel_members tem channel_id → internal_channels.tenant_id)
CREATE POLICY "channel_members_tenant_isolation"
  ON public.channel_members
  FOR ALL
  TO authenticated
  USING (
    channel_id IN (
      SELECT id FROM public.internal_channels ic
      WHERE ic.tenant_id IN (
        SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid()
      )
    )
  )
  WITH CHECK (
    channel_id IN (
      SELECT id FROM public.internal_channels ic
      WHERE ic.tenant_id IN (
        SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid()
      )
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. channel_messages
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "allow_all_channel_messages" ON public.channel_messages;

CREATE POLICY "channel_messages_tenant_isolation"
  ON public.channel_messages
  FOR ALL
  TO authenticated
  USING (
    channel_id IN (
      SELECT id FROM public.internal_channels ic
      WHERE ic.tenant_id IN (
        SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid()
      )
    )
  )
  WITH CHECK (
    channel_id IN (
      SELECT id FROM public.internal_channels ic
      WHERE ic.tenant_id IN (
        SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid()
      )
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. internal_channels
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "allow_all_internal_channels" ON public.internal_channels;

-- Assume que internal_channels tem coluna tenant_id diretamente
CREATE POLICY "internal_channels_tenant_isolation"
  ON public.internal_channels
  FOR ALL
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid()
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. messages — messages_auth_all
-- ─────────────────────────────────────────────────────────────────────────────
-- ⚠️ ATENÇÃO: verificar schema da tabela antes de aplicar.
-- Se messages NÃO tem tenant_id, a policy de substituição abaixo falhará.
-- Nesse caso, usar: service_role only (linhas comentadas abaixo).
DROP POLICY IF EXISTS "messages_auth_all" ON public.messages;

-- Opção A: messages tem tenant_id (recomendado se confirmado)
CREATE POLICY "messages_tenant_isolation"
  ON public.messages
  FOR ALL
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid()
    )
  );

-- Opção B (alternativa se messages não tem tenant_id): deixar só service_role
-- DROP POLICY IF EXISTS "messages_tenant_isolation" ON public.messages;
-- CREATE POLICY "messages_service_role_only"
--   ON public.messages FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. deli_agenda — NÃO TOCADO
-- ─────────────────────────────────────────────────────────────────────────────
-- "service role can insert deli_agenda" (INSERT, CHECK true) é seguro:
-- service_role não é um usuário externo, é o backend interno.
-- A policy atual em 20260529_001_deli_agenda.sql já está correta — manter.

COMMIT;
