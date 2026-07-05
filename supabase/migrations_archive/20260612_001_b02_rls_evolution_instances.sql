-- B-02 (auditoria M1 / plano M2 semana 1): apertar RLS de evolution_instances.
--
-- PROBLEMA: a policy "authenticated users can manage instances" (ALL, USING true,
-- WITH CHECK true) expõe a config do WhatsApp — incluindo api_key da Evolution —
-- a QUALQUER usuário autenticado, mesmo sem role/membership em tenant nenhum.
-- Teste de isolamento 2026-06-12 (antes): user fake sem role viu 1/1 linha.
--
-- O acesso legítimo já é coberto pelas policies que permanecem:
--   - evolution_instances_select_own_tenant  (SELECT via user_roles/roles)
--   - evolution_instances_select_tenant      (SELECT via conversations do tenant)
--   - evolution_instances_manage_admin       (ALL para admin do tenant)
-- Frontend só faz SELECT (7 usos, 0 escritas); bridge/trigger/edge usam service_role.
--
-- REVERSÃO (se algo quebrar):
--   create policy "authenticated users can manage instances" on evolution_instances
--     for all to authenticated using (true) with check (true);

drop policy if exists "authenticated users can manage instances" on public.evolution_instances;
