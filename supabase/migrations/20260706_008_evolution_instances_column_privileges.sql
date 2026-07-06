-- 20260706_008_evolution_instances_column_privileges.sql
--
-- P0 segurança (follow-up PR #761): mesmo com api_key/evolution_url fora do
-- front (bridge-server/routes/evolution-actions.js resolve tudo no servidor
-- com a service role key), o baseline concede `GRANT ALL` em
-- evolution_instances para anon/authenticated — ou seja, qualquer client
-- autenticado ainda consegue extrair a key real via PostgREST
-- (?select=api_key,evolution_url), pois RLS filtra LINHAS, não COLUNAS.
--
-- O front não usa mais essas 2 colunas (confirmado: ChatV2.jsx, ChatScreen.jsx,
-- ChatAoVivoV2.jsx e Grupos.jsx só leem instance_name/status/phone/profile_name).
-- Aditivo e reversível: revoga o SELECT de tabela inteira (que dava acesso
-- irrestrito a toda coluna) e concede de volta SELECT só nas colunas que o
-- Console realmente usa. INSERT/UPDATE/DELETE seguem como estavam (gated por
-- RLS) — não é objetivo desta migration mexer em escrita.
--
-- service_role (usado pelo bridge-server via SUPABASE_SERVICE_ROLE_KEY) não é
-- afetado — mantém GRANT ALL como já estava no baseline.

REVOKE SELECT ON TABLE "public"."evolution_instances" FROM "anon", "authenticated";

GRANT SELECT (
  "id",
  "instance_name",
  "status",
  "phone",
  "profile_name",
  "created_at",
  "updated_at",
  "tenant_id",
  "last_seen"
) ON TABLE "public"."evolution_instances" TO "anon", "authenticated";

-- Rollback manual, se necessário:
-- GRANT SELECT ON TABLE "public"."evolution_instances" TO "anon", "authenticated";
