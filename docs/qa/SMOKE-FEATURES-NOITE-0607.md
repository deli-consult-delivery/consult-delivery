# Smoke test — features da noite 06/07 (dado real, READ-ONLY)

Validação via Supabase MCP (`czyanilrverorwenikqw`), 100% leitura (SELECT).
Todos os 5 itens confirmados funcionando com dado real.

---

## (a) `custo_por_tenant_agente(30)` — retorna custo real por tenant

```sql
SELECT * FROM custo_por_tenant_agente(30) ORDER BY custo_total DESC LIMIT 20;
```

**Resultado (amostra, tenant `9079bd4d-4df7-4023-90fb-d79c8ba7e900` = Consult Delivery):**
```json
[
  {"tenant_id":"9079bd4d-...","agent_id":"estudio","execucoes":3,"custo_total":"0.2386","custo_medio":"0.2386"},
  {"tenant_id":"9079bd4d-...","agent_id":"defesa","execucoes":3,"custo_total":"0.0495","custo_medio":"0.0165"},
  {"tenant_id":"9079bd4d-...","agent_id":"analise-loja","execucoes":1,"custo_total":"0.0245","custo_medio":"0.0245"},
  {"tenant_id":"9079bd4d-...","agent_id":"cardapio","execucoes":1,"custo_total":"0.0207","custo_medio":"0.0207"},
  {"tenant_id":"9079bd4d-...","agent_id":"multicanal","execucoes":1,"custo_total":"0.0160","custo_medio":"0.0160"}
]
```
✅ **Confirmado**: retorna linhas com `custo_total > 0` para o tenant com `agent_runs` reais custados (via `chatWithTools`/OpenRouter e Anthropic direto, ver #822/#828). Demais tenants (lojas fictícias/piloto) aparecem com `custo_total=0`/`null` — esperado, execuções deles rodam via Ollama Cloud (sem custo por token, por design, ver #822).

---

## (b) Policies INSERT/UPDATE/DELETE em `tenant_provedores`/`tenant_integracoes`/`tenant_sistemas`

```sql
SELECT tablename, policyname, cmd, roles FROM pg_policies
WHERE tablename IN ('tenant_provedores','tenant_integracoes','tenant_sistemas')
ORDER BY tablename, cmd;
```

**Resultado:** as 3 tabelas têm exatamente 4 policies cada (`SELECT`, `INSERT`, `UPDATE`, `DELETE`), 12 no total.

✅ **Confirmado** — CRUD completo existe pras 3 tabelas (`cvnovas`).

⚠️ **Observação (não bloqueante, fora do escopo desta validação):** as 12 policies têm `roles: {public}` (sem `TO authenticated`). Isso segue o padrão original de várias tabelas do schema, mas diverge do endurecimento feito na auditoria RLS de 2026-07-06 (`docs/seguranca/RLS-AUDIT-2026-07.md`, migrations 013/015-017 — `TO authenticated`, nunca `PUBLIC`/`anon`). Vale avaliar se `tenant_provedores`/`integracoes`/`sistemas` deveriam receber o mesmo tratamento (a policy provavelmente já filtra por `tenant_id`/`is_admin_of`, então `anon` sem JWT não teria `tenant_id` válido pra passar — mas não confirmei a condição exata das 12 policies, só a existência/comando).

---

## (c) Índices de performance existem

```sql
SELECT indexname, tablename, indexdef FROM pg_indexes
WHERE indexname IN ('idx_audit_log_tenant_id_desc','idx_agent_runs_tenant_created_desc','idx_reviews_created_at_desc');
```

**Resultado:**
```json
[
  {"indexname":"idx_agent_runs_tenant_created_desc","tablename":"agent_runs","indexdef":"CREATE INDEX ... USING btree (tenant_id, created_at DESC)"},
  {"indexname":"idx_audit_log_tenant_id_desc","tablename":"audit_log","indexdef":"CREATE INDEX ... USING btree (tenant_id, id DESC)"},
  {"indexname":"idx_reviews_created_at_desc","tablename":"reviews","indexdef":"CREATE INDEX ... USING btree (created_at DESC)"}
]
```
✅ **Confirmado** — os 3 índices existem, aplicados, com a definição esperada.

---

## (d) `remove_tenant_member` — guarda de last_admin

```sql
SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = 'remove_tenant_member';
```

**Trecho relevante da definição:**
```sql
IF v_target_role IN ('admin', 'owner') THEN
  SELECT count(*) INTO v_gestores_restantes
  FROM public.tenant_members
  WHERE tenant_id = p_tenant_id AND role IN ('admin', 'owner') AND user_id <> p_user_id;

  IF v_gestores_restantes = 0 THEN
    RAISE EXCEPTION 'cannot_remove_last_admin';
  END IF;
END IF;
```
✅ **Confirmado** — a guarda existe: se o alvo é `admin`/`owner` e não sobra nenhum outro `admin`/`owner` no tenant, a função lança `cannot_remove_last_admin` e não remove. Bônus (achado incidental, não pedido): a função também guarda `permission_denied` (quem chama precisa ser `admin`/`owner`) e `cannot_remove_self`.

---

## (e) `is_pending_tenant_member` existe

```sql
SELECT proname FROM pg_proc WHERE proname = 'is_pending_tenant_member';
```

**Definição:**
```sql
CREATE OR REPLACE FUNCTION public.is_pending_tenant_member(p_tenant_id uuid, p_email text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tenant_members tm
    JOIN auth.users u ON u.id = tm.user_id
    WHERE tm.tenant_id = p_tenant_id AND lower(u.email) = lower(p_email)
      AND u.last_sign_in_at IS NULL
  );
$$;
```
✅ **Confirmado** — existe, define "pendente" como membro cujo `auth.users.last_sign_in_at IS NULL` (nunca fez login).

---

## Conclusão

**5/5 itens confirmados funcionando com dado real**, todos via SELECT. Nenhum SQL de escrita foi executado nesta validação.
