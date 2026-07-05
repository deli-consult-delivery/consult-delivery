-- ============================================================
-- B-09 — Views de `public` para security_invoker (advisor ERROR)
-- Auditoria: docs/auditoria/AUDITORIA-PLATAFORMA-2026-06.md (item B-09)
-- Data: 2026-06-12 | Mandato D5 v3 (SQL reversível — autonomia)
--
-- Estado antes:
--   5 views em `public` flagadas pelo Supabase advisor como ERROR
--   `security_definer_view`: owner `postgres` e reloptions sem
--   `security_invoker` (default = comportamento definer-like).
--   Na prática, qualquer caller que consulta a view bypassa a RLS
--   das tabelas-base — leitura cross-tenant possível por authenticated.
--
-- O que muda:
--   `alter view ... set (security_invoker = true);` em cada uma das
--   5 views. A partir daí a RLS das tabelas-base é avaliada com os
--   privilégios de quem consulta a view (fecha leitura cross-tenant).
--
-- O que NÃO muda:
--   Nenhum consumidor quebra. Análise de consumo:
--   - `v_dashboard_kpis` e `v_chart_7d`: frontend (src/lib/db.js,
--     src/lib/api.js) como authenticated, sempre com .eq('tenant_id', ...)
--     — coberto pelas policies de SELECT por tenant já existentes
--     (daily_kpis_member_select, tenant_members_view_own_runs,
--     conversations_select_tenant, wa_messages_select_tenant,
--     prospects_select_tenant_roles).
--   - `view_metricas_agentes_dia`, `view_metricas_conversas_dia`,
--     `view_metricas_negocio_dia`: consumidas só pela task Trigger
--     trigger/vera/snapshot-diario.ts via service-role (bypassrls)
--     — invoker não afeta.
--   O DEFINER não era intencional — era só o default das views.
--
-- Rollback (se necessário):
--   alter view public.v_dashboard_kpis set (security_invoker = false);
--   alter view public.v_chart_7d set (security_invoker = false);
--   alter view public.view_metricas_agentes_dia set (security_invoker = false);
--   alter view public.view_metricas_conversas_dia set (security_invoker = false);
--   alter view public.view_metricas_negocio_dia set (security_invoker = false);
-- ============================================================

alter view public.v_dashboard_kpis set (security_invoker = true);
alter view public.v_chart_7d set (security_invoker = true);
alter view public.view_metricas_agentes_dia set (security_invoker = true);
alter view public.view_metricas_conversas_dia set (security_invoker = true);
alter view public.view_metricas_negocio_dia set (security_invoker = true);
