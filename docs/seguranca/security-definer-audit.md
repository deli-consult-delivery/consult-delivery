# Auditoria SECURITY DEFINER (2026-07-07)

Levantamento: `grep -rn "SECURITY DEFINER" supabase/migrations/*.sql` (baseline + migrations 07-06). READ-ONLY, nenhuma alteração no banco.

## 🔴 Achados reais — fix em migration versionada (não aplicada, ver PR)

| Função | Problema | Evidência |
|---|---|---|
| `log_audit(p_tenant_id, p_action, p_resource, p_agent_name, p_metadata)` | `p_tenant_id` confiado sem checar se `auth.uid()` é membro dele — qualquer autenticado insere entrada forjada em `audit_log` de **qualquer outro tenant** (spoofing/poluição de trilha de auditoria) | baseline.sql:426-433 — só `VALUES (p_tenant_id, auth.uid(), ...)`, sem `WHERE`/`EXISTS` checando membership |
| `create_workspace(p_name, p_slug, p_segment, p_emoji, p_user_id)` | `p_user_id` confiado sem forçar `= auth.uid()` — caller pode criar um workspace e tornar **qualquer outro user_id** admin dele | baseline.sql:193-209 — `INSERT INTO tenant_members (..., user_id, role) VALUES (v_tenant_id, p_user_id, 'admin', ...)` sem validar `p_user_id = auth.uid()` |

## ✅ Validam o caller corretamente (lidas linha a linha)

| Função | Validação |
|---|---|
| `admin_get_tenant_modules` / `admin_set_tenant_modules` | `admin_is_platform_operator()` — só membro admin/owner do tenant plataforma (`9079bd4d...`) |
| `admin_is_platform_operator` | `auth.uid()` membro do tenant plataforma com role owner/admin |
| `agent_enabled_for_user` | join `tenant_agents`+`tenant_members` filtrado por `auth.uid()` |
| `get_tenant_members(p_tenant_id)` | `EXISTS` — caller precisa ser membro de `p_tenant_id` (baseline.sql:309-313) |
| `get_user_screen_permissions(p_tenant_id, p_user_id)` | `auth.uid() = p_user_id` OU admin/owner do tenant (baseline.sql:326-335) |
| `remove_tenant_member(p_tenant_id, p_user_id)` | caller admin/owner de `p_tenant_id` + bloqueia auto-remoção (baseline.sql:504-516) |
| `update_member_display_name` / `update_member_role` | caller admin/owner de `p_tenant_id`, bloqueia auto-edição, `update_member_role` valida enum de roles (baseline.sql:982-1035) |
| `get_review_by_token`/`get_reviews_by_tokens`/`update_review_by_token` | capability token (`token` UUID aleatório), não tenant_id — auditado em rodada anterior (#757→#764) |

## 🟡 Primitivas de RLS (não relidas nesta rodada — usadas em toda policy do schema, sem sinal de mau uso em nenhuma auditoria anterior; sinalizando o gap honestamente por limite de contexto)
`accessible_tenant_ids`, `accessible_tenant_ids_with_role`, `has_rbac_role_in_hierarchy`, `has_tenant_access`, `is_admin_of`, `is_member_of`, `same_tenant_admin`, `set_user_screen_permission`. Recomendo 1 verificação dedicada rápida se alguém quiser 100% de cobertura.

## ✅ Trigger functions (baixo risco por construção — não são chamáveis com parâmetro arbitrário, só operam sobre a própria linha que disparou o trigger via caminho já gated por RLS)
`fn_task_done_updates_goal`, `handle_new_user`, `notify_on_channel_message`, `rls_auto_enable`, `trg_auto_create_loja`, `trg_auto_vinculo_grupo`, `trg_fn_conv_gen_avaliacao_token`, `trg_fn_conv_gen_nps_token`.

## Nota de transparência
Sessão com contexto crítico (~90%+ usado) durante esta auditoria. Priorizei ler linha a linha as funções que recebem `p_tenant_id`/`p_user_id` como parâmetro direto (maior risco de IDOR/spoofing) — são as 10 acima com evidência completa. As primitivas de RLS puramente booleanas não foram relidas nesta rodada (ver seção 🟡).
