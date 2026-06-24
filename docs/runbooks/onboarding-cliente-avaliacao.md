# Runbook — Onboarding de cliente restrito a Avaliação (CSAT/NPS)

> **Objetivo:** provisionar um cliente novo que enxerga **apenas** os módulos de Avaliação
> (Visão Geral + CSAT + NPS) no Console v2, com **desbloqueio progressivo** de mais módulos depois.
>
> **Pré-requisitos:** migration `20260622_010_tenant_modules.sql` aplicada (tabela `tenant_modules`),
> Console v2 já filtrando o menu por `tenant_modules` (PR desta sessão).
>
> **Modelo de gating (decisão de design):**
> - Tenant **sem nenhuma linha** em `tenant_modules` → vê **todos** os módulos (backward-compatible).
> - Tenant **com linhas** → vê **somente** os `module_key` com `enabled = true` (allowlist).
>
> `module_key` = o `id` do item de menu em `GRUPOS` (`src/console/ConsoleV2.jsx`).
> Hoje os módulos de Avaliação são: `visao`, `csat`, `nps`.

---

## ⚠️ Antes de começar

- **SQL via service-role** (MCP `execute_sql` / painel Supabase) — bypassa RLS, necessário para criar o 1º membro.
- **Output bruto sempre** — guardar o retorno de cada passo (regra QA do projeto).
- **Senhas nunca em git/chat** — definidas pelo cliente ou via canal seguro/Infisical. Os exemplos abaixo
  usam placeholders (`<SENHA_DEFINIDA_PELO_CLIENTE>`).
- **1 passo por vez**, parar no 1º erro.

---

## Passo 1 — Criar o tenant (branding do cliente)

O branding (`name`, `color`, `theme_color`, `logo_url`) é o mesmo já consumido pelas páginas públicas
de avaliação (`/avaliacao/`, `/nps/`).

```sql
INSERT INTO public.tenants (name, slug, color, theme_color, logo_url, segment, phone, city, plan, status)
VALUES (
  'Nome do Cliente LTDA',          -- name (exibido no console)
  'nome-do-cliente',               -- slug (único, kebab-case, usado em URLs)
  '#B70C00',                       -- color (cor primária do menu)
  '#B70C00',                       -- theme_color (cor das páginas públicas)
  'https://.../logo.png',          -- logo_url (ou NULL)
  'food service',                  -- segment (ou NULL)
  '5599999999999',                 -- phone (ou NULL)
  'Cidade/UF',                     -- city (ou NULL)
  'pro',                           -- plan
  'active'                         -- status
)
RETURNING id, slug, name;
```

➡️ **Guardar o `id` retornado** (é o `tenant_id` usado em todos os passos seguintes).

---

## Passo 2 — Ligar os módulos de Avaliação (allowlist)

Cria a allowlist do tenant. A partir daqui ele passa a ver **só** estes módulos no Console v2.

```sql
-- Substituir $TENANT_ID pelo id do Passo 1
INSERT INTO public.tenant_modules (tenant_id, module_key, enabled)
VALUES
  ('$TENANT_ID', 'visao', true),
  ('$TENANT_ID', 'csat',  true),
  ('$TENANT_ID', 'nps',   true)
ON CONFLICT (tenant_id, module_key) DO UPDATE SET enabled = EXCLUDED.enabled;
```

Conferir:

```sql
SELECT module_key, enabled
FROM public.tenant_modules
WHERE tenant_id = '$TENANT_ID'
ORDER BY module_key;
```

---

## Passo 3 — Criar o 1º usuário (admin do cliente) via service-role

> **Por que não usar a edge function `manage-users` aqui?**
> Ela exige que o *caller* já seja `owner`/`admin` do tenant
> (`supabase/functions/manage-users/index.ts:71-81`). Um tenant recém-criado **não tem membros ainda**,
> então o 1º admin precisa ser semeado via service-role.

### 3a. Criar o usuário no Supabase Auth

Painel Supabase → **Authentication → Users → Add user** (ou via Admin API), com:
- **Email:** email do admin do cliente
- **Password:** `<SENHA_DEFINIDA_PELO_CLIENTE>` (nunca em git/chat)
- **Auto Confirm User:** ✅ (marcar — evita e-mail de convite)

➡️ **Guardar o `user_id` (UUID)** do usuário criado.

### 3b. Criar o profile e a membership (SQL)

```sql
-- Substituir $USER_ID (Passo 3a), $TENANT_ID (Passo 1) e os dados do admin
INSERT INTO public.profiles (id, full_name, email)
VALUES ('$USER_ID', 'Nome do Admin', 'admin@cliente.com')
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, email = EXCLUDED.email;

INSERT INTO public.tenant_members (tenant_id, user_id, role, semaforo, display_name)
VALUES ('$TENANT_ID', '$USER_ID', 'admin', 'verde', 'Nome do Admin')
ON CONFLICT (tenant_id, user_id) DO UPDATE SET role = EXCLUDED.role;
```

Conferir:

```sql
SELECT tm.role, tm.display_name, p.email
FROM public.tenant_members tm
JOIN public.profiles p ON p.id = tm.user_id
WHERE tm.tenant_id = '$TENANT_ID';
```

---

## Passo 3c — Semear papéis RBAC do tenant + atribuir admin ⚠️ obrigatório

> **Por que é necessário?** O Console v2 usa `<RequireRole>` para proteger as telas de CSAT e NPS.
> A tabela `tenant_members.role` é apenas metadado de membership — o sistema de permissões lê
> `user_roles` (ligado a `roles`). Um tenant recém-criado **não tem papéis** até este passo,
> então `hasRole('admin') = false` e as telas retornam "Acesso negado".

```sql
-- Substituir $TENANT_ID (Passo 1) e $USER_ID (Passo 3a)

-- 3c.1 — criar os 7 papéis-sistema do tenant (idempotente)
SELECT public.seed_rbac_system_roles('$TENANT_ID');

-- 3c.2 — atribuir role admin ao usuário
INSERT INTO user_roles (user_id, role_id, granted_by)
SELECT '$USER_ID', r.id, NULL
FROM roles r
WHERE r.tenant_id = '$TENANT_ID'
  AND r.name = 'admin'
ON CONFLICT DO NOTHING;
```

Conferir:

```sql
-- deve retornar ao menos a linha do admin
SELECT ur.user_id, r.name AS role, r.tenant_id
FROM user_roles ur
JOIN roles r ON r.id = ur.role_id
WHERE r.tenant_id = '$TENANT_ID';
```

➡️ **Validar no browser:** logar com esse usuário → deve cair no Console v2 vendo **só**
Visão Geral, CSAT e NPS — **sem a tela vermelha de "Acesso negado"**.

---

## Passo 4 — Usuários adicionais (opcional, depois)

Com um admin já existente no tenant, novos usuários podem ser criados pela própria UI/edge function
`manage-users` (não precisa de SQL):

- **`create`** — cria auth user + profile + membership de uma vez.
- **`adopt`** — adiciona um auth user **já existente** a este tenant.

Payload (POST para a edge function `manage-users`, com JWT de um admin/owner do tenant):

```json
{
  "action": "create",
  "tenant_id": "$TENANT_ID",
  "email": "operador@cliente.com",
  "password": "<SENHA_DEFINIDA_PELO_CLIENTE>",
  "name": "Nome do Operador",
  "role": "operador"
}
```

Roles aceitas: ver `supabase/migrations/20260504_001_rbac.sql`
(`admin`, `dev`, `marketing`, `atendimento`, `financeiro`, `viewer`, `operador`).

---

## Passo 5 — Desbloqueio progressivo de módulos (futuro)

Para liberar mais um módulo ao cliente, basta inserir/ativar a linha — **sem deploy**:

```sql
-- Ex.: liberar o módulo de conversas (module_key = 'conversas')
INSERT INTO public.tenant_modules (tenant_id, module_key, enabled)
VALUES ('$TENANT_ID', 'conversas', true)
ON CONFLICT (tenant_id, module_key) DO UPDATE SET enabled = true;
```

Para **revogar** um módulo (sem apagar a linha, mantendo histórico):

```sql
UPDATE public.tenant_modules
SET enabled = false
WHERE tenant_id = '$TENANT_ID' AND module_key = 'conversas';
```

O cliente vê a mudança ao recarregar o Console v2.

> ℹ️ Os `module_key` válidos são os `id` dos itens em `GRUPOS` no
> `src/console/ConsoleV2.jsx`. Consultar essa lista antes de liberar um módulo novo.

---

## Checklist final do onboarding

- [ ] Tenant criado (Passo 1) — `id` guardado.
- [ ] Módulos `visao`, `csat`, `nps` ligados (Passo 2) — `SELECT` confirma 3 linhas `enabled = true`.
- [ ] Admin do cliente criado (Passo 3) — profile + tenant_member criados.
- [ ] Papéis RBAC semeados + admin atribuído (Passo 3c) — `SELECT user_roles` confirma linha; login no browser mostra só os 3 módulos **sem "Acesso negado"**.
- [ ] Branding (logo/cor) aparece no console e nas páginas públicas.
- [ ] Senha entregue ao cliente por canal seguro (nunca em git/chat).
