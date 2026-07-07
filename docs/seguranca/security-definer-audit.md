# Auditoria SECURITY DEFINER (2026-07-07, completa em 2 rodadas)

Levantamento: `grep -rn "SECURITY DEFINER" supabase/migrations/*.sql` (baseline + migrations 07-06). READ-ONLY, nenhuma alteração no banco. **Cobertura: 100% das funções SECURITY DEFINER do schema, lidas linha a linha.**

## 🔴 Achados reais — CORRIGIDOS (migration 20260707_009, aplicada em produção pela orquestradora)

| Função | Problema | Evidência |
|---|---|---|
| `log_audit(p_tenant_id, p_action, p_resource, p_agent_name, p_metadata)` | `p_tenant_id` confiado sem checar se `auth.uid()` é membro dele — qualquer autenticado inseria entrada forjada em `audit_log` de **qualquer outro tenant** (spoofing/poluição de trilha de auditoria) | baseline.sql:426-433 — só `VALUES (p_tenant_id, auth.uid(), ...)`, sem `WHERE`/`EXISTS` checando membership |
| `create_workspace(p_name, p_slug, p_segment, p_emoji, p_user_id)` | `p_user_id` confiado sem forçar `= auth.uid()` — caller podia criar um workspace e tornar **qualquer outro user_id** admin dele | baseline.sql:193-209 — `INSERT INTO tenant_members (..., user_id, role) VALUES (v_tenant_id, p_user_id, 'admin', ...)` sem validar `p_user_id = auth.uid()` |

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

## ✅ Primitivas de RLS — relidas linha a linha nesta rodada 2 (fechando o gap da rodada 1)

| Função | Validação |
|---|---|
| `accessible_tenant_ids()` | zero parâmetros — árvore de tenants inteiramente derivada de `auth.uid()` via `tenant_members` (baseline.sql:84-92). Não há como o caller pedir dados de outro usuário. |
| `accessible_tenant_ids_with_role(_roles)` | mesmo padrão, filtro adicional por role, ainda ancorado em `auth.uid()` (baseline.sql:103-112) |
| `has_rbac_role_in_hierarchy(_tenant, _role_names)` | predicado booleano — responde "auth.uid() tem uma dessas roles em `_tenant` (ou ancestral)?" via `user_roles`/`roles` filtrado por `ur.user_id = auth.uid()` (baseline.sql:374-380). `_tenant` é só o alvo da pergunta, não uma identidade assumida. |
| `has_tenant_access(_tenant)` | `SELECT _tenant IN (SELECT accessible_tenant_ids())` (baseline.sql:390) — mesmo padrão, delega pra `accessible_tenant_ids()` já ancorada em `auth.uid()` |
| `is_admin_of(_tenant)` | árvore de tenants onde `auth.uid()` é owner/admin, checa se `_tenant` está nela (baseline.sql:400-409) |
| `is_member_of(_tenant)` | idêntica a `has_tenant_access` — mesmo corpo (baseline.sql:419), possível duplicata/alias, não é falha de segurança |
| `same_tenant_admin(_target)` | responde "auth.uid() é admin/owner do MESMO tenant que `_target`?" — join `tenant_members` filtrado por `adm.user_id = auth.uid()` (baseline.sql:563-567). `_target` não vira a identidade do caller em nenhum momento, só define de quem se está perguntando. |
| `set_user_screen_permission(p_tenant_id, p_user_id, ...)` | caller precisa ser admin/owner de `p_tenant_id` antes do INSERT/UPDATE (baseline.sql:668-675) — mesmo padrão de `remove_tenant_member`/`update_member_role` |

**Veredito: nenhuma vulnerabilidade nova.** Todas as 8 são predicados booleanos (ou o `set_user_screen_permission`, que já validava) sempre ancorados em `auth.uid()` — o parâmetro de tenant/user é só o *alvo da pergunta*, nunca uma identidade que o código passa a confiar cegamente. Esse é exatamente o padrão correto para uma função usada dentro de `USING (...)` de RLS policy.

## ✅ Trigger functions (baixo risco por construção — não são chamáveis com parâmetro arbitrário, só operam sobre a própria linha que disparou o trigger via caminho já gated por RLS)
`fn_task_done_updates_goal`, `handle_new_user`, `notify_on_channel_message`, `rls_auto_enable`, `trg_auto_create_loja`, `trg_auto_vinculo_grupo`, `trg_fn_conv_gen_avaliacao_token`, `trg_fn_conv_gen_nps_token`.

## Histórico
- Rodada 1 (PR #845): achados reais + 10 funções validadas linha a linha + 8 primitivas sinalizadas como gap.
- Rodada 2 (esta): as 8 primitivas relidas e confirmadas seguras. **Cobertura 100% fechada.**
