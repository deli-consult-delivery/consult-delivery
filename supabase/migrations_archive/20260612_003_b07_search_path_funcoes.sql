-- ============================================================
-- B-07 — Fixa search_path em 17 funções de `public` (advisor WARN)
-- Auditoria: docs/auditoria/AUDITORIA-PLATAFORMA-2026-06.md (item B-07)
-- Data: 2026-06-12 | Mandato D5 v3 (SQL reversível — autonomia)
--
-- Estado antes:
--   17 funções em `public` com search_path mutável (proconfig = null),
--   flagadas pelo Supabase advisor como WARN `function_search_path_mutable`.
--   Sem search_path fixo, a resolução de nomes dentro da função depende do
--   search_path do caller — vetor clássico de hijack via objetos sombreados
--   em schemas graváveis.
--
-- O que muda:
--   `alter function ... set search_path = public, pg_temp;` em cada uma das
--   17 funções. A partir daí a resolução de nomes é determinística,
--   independente do caller.
--
-- O que NÃO muda:
--   Comportamento das funções. Nenhuma usa referência não-qualificada fora
--   de `public` — a única referência cross-schema é `auth.` em log_audit,
--   já schema-qualificada. `pg_temp` por último impede sombreamento via
--   objetos temporários.
--
-- Rollback (se necessário):
--   alter function <assinatura> reset search_path;
--   (para cada uma das 17 funções abaixo — volta proconfig a null)
-- ============================================================

-- 1. Funções com argumentos
alter function public.create_workspace(p_name text, p_slug text, p_segment text, p_emoji text, p_user_id uuid)
  set search_path = public, pg_temp;

alter function public.log_audit(p_tenant_id uuid, p_action text, p_resource text, p_agent_name text, p_metadata jsonb)
  set search_path = public, pg_temp;

alter function public.seed_rbac_system_roles(p_tenant_id uuid)
  set search_path = public, pg_temp;

-- 2. Trigger functions (sem argumentos)
alter function public.fn_conversation_status_changed()
  set search_path = public, pg_temp;

alter function public.fn_log_conversation_status_change()
  set search_path = public, pg_temp;

alter function public.fn_task_done_updates_goal()
  set search_path = public, pg_temp;

alter function public.set_leads_updated_at()
  set search_path = public, pg_temp;

alter function public.set_updated_at()
  set search_path = public, pg_temp;

alter function public.touch_lwv_updated_at()
  set search_path = public, pg_temp;

alter function public.trg_audit_regua()
  set search_path = public, pg_temp;

alter function public.trg_auto_create_loja()
  set search_path = public, pg_temp;

alter function public.trg_fn_conv_department_changed()
  set search_path = public, pg_temp;

alter function public.trg_fn_conv_status_changed()
  set search_path = public, pg_temp;

alter function public.trg_set_updated_at()
  set search_path = public, pg_temp;

alter function public.trg_set_updated_at_campanhas()
  set search_path = public, pg_temp;

alter function public.update_lojas_updated_at()
  set search_path = public, pg_temp;

alter function public.update_prospects_updated_at()
  set search_path = public, pg_temp;
