# Runbook — Criar usuários admin de `cd-homolog` e `cd-demo`

> **Objetivo:** criar o 1º usuário admin de cada tenant do sprint de homologação iFood
> (`cd-homolog` = T-HOMOLOG, `cd-demo` = T-DEMO), prontos para login e smoke visual.
>
> **Precedente:** `docs/runbooks/onboarding-cliente-avaliacao.md` (mesmo padrão de criação de
> usuário via service-role — este runbook pula os passos 1/2 de lá porque os tenants e a
> allowlist `tenant_modules` **já existem** — PR #757/#759/#767, migrations `20260706_001`,
> `002` e `006`). O passo de RBAC (`seed_rbac_system_roles`) **também já está aplicado**
> (migration `20260706_003`) — este runbook só cria o usuário e atribui o papel `admin`.
>
> **Tempo estimado:** ~2 min por tenant.

---

## ⚠️ Antes de começar

- **SQL via service-role** (MCP `execute_sql` / painel Supabase) — bypassa RLS, necessário para
  criar o 1º membro de um tenant.
- **Output bruto sempre** — guardar o retorno de cada passo.
- **Senhas nunca em git/chat** — os exemplos abaixo usam placeholder (`<SENHA_AQUI>`); definir e
  entregar por canal seguro (Infisical/gerenciador de senhas), nunca neste arquivo.
- **1 passo por vez, parar no 1º erro.**
- Rodar os dois tenants (Passo A e Passo B) de forma independente — nenhum depende do outro.

---

## Passo 0 — Resolver os `tenant_id` (não hardcoded)

```sql
SELECT slug, id FROM public.tenants WHERE slug IN ('cd-homolog', 'cd-demo');
```

➡️ **Guardar os dois `id`** retornados — são `$TENANT_ID_HOMOLOG` e `$TENANT_ID_DEMO` usados
abaixo. Conferir também que a allowlist já está populada (deve ter 8 linhas p/ homolog, 16 p/ demo):

```sql
SELECT t.slug, count(*) AS modulos_habilitados
FROM public.tenant_modules tm
JOIN public.tenants t ON t.id = tm.tenant_id
WHERE t.slug IN ('cd-homolog', 'cd-demo') AND tm.enabled = true
GROUP BY t.slug;
```

---

## Passo A — Usuário admin de `cd-homolog` (T-HOMOLOG)

### A1. Criar o usuário no Supabase Auth

Painel Supabase → **Authentication → Users → Add user** (ou via Admin API):
- **Email:** e-mail do analista/consultor que vai operar a homologação
- **Password:** `<SENHA_AQUI>` (nunca em git/chat)
- **Auto Confirm User:** ✅ (marcar — evita e-mail de convite)

➡️ **Guardar o `user_id` (UUID)** do usuário criado → `$USER_ID_HOMOLOG`.

### A2. Criar o profile e a membership (SQL)

```sql
-- Substituir $USER_ID_HOMOLOG (A1), $TENANT_ID_HOMOLOG (Passo 0) e os dados do admin
INSERT INTO public.profiles (id, full_name, email)
VALUES ('$USER_ID_HOMOLOG', 'Nome do Admin Homolog', 'email-do-admin@consultdelivery.com.br')
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, email = EXCLUDED.email;

INSERT INTO public.tenant_members (tenant_id, user_id, role, semaforo, display_name)
VALUES ('$TENANT_ID_HOMOLOG', '$USER_ID_HOMOLOG', 'admin', 'verde', 'Nome do Admin Homolog')
ON CONFLICT (tenant_id, user_id) DO UPDATE SET role = EXCLUDED.role;
```

### A3. Atribuir o papel RBAC `admin` (roles já semeadas na migration 003 — só falta o vínculo)

```sql
-- Substituir $TENANT_ID_HOMOLOG e $USER_ID_HOMOLOG
INSERT INTO user_roles (user_id, role_id, granted_by)
SELECT '$USER_ID_HOMOLOG', r.id, NULL
FROM roles r
WHERE r.tenant_id = '$TENANT_ID_HOMOLOG'
  AND r.name = 'admin'
ON CONFLICT DO NOTHING;
```

### A4. Conferir (output esperado: 1 linha)

```sql
SELECT ur.user_id, r.name AS role, r.tenant_id, p.email
FROM user_roles ur
JOIN roles r ON r.id = ur.role_id
JOIN public.profiles p ON p.id = ur.user_id
WHERE r.tenant_id = '$TENANT_ID_HOMOLOG';
```

---

## Passo B — Usuário admin de `cd-demo` (T-DEMO)

Idêntico ao Passo A, tenant diferente. Pode ser o **mesmo e-mail/pessoa** do Passo A (se for a
mesma pessoa que opera homologação e demo) ou um e-mail diferente (se for outra pessoa, ex.
alguém do time comercial que apresenta o demo a prospects) — decidir antes de criar o usuário
em A1/B1 para não duplicar um Auth user à toa.

> **Se for a mesma pessoa dos dois tenants:** pule B1 (não crie outro Auth user) e rode só B2/B3
> reaproveitando `$USER_ID_HOMOLOG` no lugar de `$USER_ID_DEMO` (um único login acessa os dois
> tenants pelo switcher do Console — o `tenant_members` vira 2 linhas, 1 por tenant, mesmo
> `user_id`).

### B1. Criar o usuário no Supabase Auth (pular se reaproveitar o da Homolog)

Painel Supabase → **Authentication → Users → Add user**:
- **Email:** e-mail de quem apresenta o demo (comercial/Wandson)
- **Password:** `<SENHA_AQUI>`
- **Auto Confirm User:** ✅

➡️ **Guardar o `user_id`** → `$USER_ID_DEMO`.

### B2. Criar o profile e a membership (SQL)

```sql
-- Substituir $USER_ID_DEMO (B1, ou reaproveitar $USER_ID_HOMOLOG), $TENANT_ID_DEMO (Passo 0)
INSERT INTO public.profiles (id, full_name, email)
VALUES ('$USER_ID_DEMO', 'Nome do Admin Demo', 'email-do-admin-demo@consultdelivery.com.br')
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, email = EXCLUDED.email;

INSERT INTO public.tenant_members (tenant_id, user_id, role, semaforo, display_name)
VALUES ('$TENANT_ID_DEMO', '$USER_ID_DEMO', 'admin', 'verde', 'Nome do Admin Demo')
ON CONFLICT (tenant_id, user_id) DO UPDATE SET role = EXCLUDED.role;
```

### B3. Atribuir o papel RBAC `admin`

```sql
-- Substituir $TENANT_ID_DEMO e $USER_ID_DEMO
INSERT INTO user_roles (user_id, role_id, granted_by)
SELECT '$USER_ID_DEMO', r.id, NULL
FROM roles r
WHERE r.tenant_id = '$TENANT_ID_DEMO'
  AND r.name = 'admin'
ON CONFLICT DO NOTHING;
```

### B4. Conferir (output esperado: 1 linha)

```sql
SELECT ur.user_id, r.name AS role, r.tenant_id, p.email
FROM user_roles ur
JOIN roles r ON r.id = ur.role_id
JOIN public.profiles p ON p.id = ur.user_id
WHERE r.tenant_id = '$TENANT_ID_DEMO';
```

---

## Passo C — Smoke visual (login → menu com as telas da allowlist)

Login em `app.consultdelivery.com.br` com o e-mail/senha criados. Se o usuário está em mais de
um tenant, usar o switcher (topo do Console) para trocar entre eles.

### C1. `cd-homolog` (T-HOMOLOG) — esperado: **8 itens de menu**, sem "Acesso negado"

- [ ] Login com sucesso, cai direto no Console v2 (sem tela de erro)
- [ ] Menu lateral mostra **exatamente**: **Visão Geral** · **Lojas** · **Avaliações Recebidas**
      · **Aprovações** · **Auditoria** · **Notificações** · **Acesso por usuário** ·
      **Configurações**
- [ ] Nenhuma outra tela aparece (ex.: sem "Cobrança", sem "iFood: Dashboard", sem "DELI")
- [ ] Tela **Lojas** abre e mostra a loja "Teste - CONSULT DELIVERY LTDA" (sandbox iFood)
- [ ] Tela **Avaliações Recebidas** abre sem "Acesso negado" (o iFood Merchant/Review sandbox
      pode estar vazio — isso é esperado, não é falha)

### C2. `cd-demo` (T-DEMO) — esperado: **16 itens de menu**, dados fictícios visíveis

- [ ] Login com sucesso (mesmo usuário do C1 se reaproveitado, ou o segundo)
- [ ] Menu lateral mostra **16 itens**: Visão Geral · Lojas · iFood: Dashboard · Avaliações
      Recebidas · iFood: Cardápio · Cobrança · Aprovações · Contratos · Painel Agentes ·
      Config de Agentes · Atividade · Custos de IA · Configurações · Acesso por usuário ·
      Auditoria · Notificações
- [ ] **Visão Geral** mostra o KPI "R$ defendido no mês" com valor > 0 (dado fictício da 005) e
      o alerta "assinatura(s) atrasada(s)" (dado fictício da 010)
- [ ] **Lojas** mostra as 4 lojas fictícias (Pizzaria Bella Vista, Hamburgueria do Zé, Sushi
      Sakura Express, Açaí da Praia)
- [ ] **Avaliações Recebidas** mostra as 10 avaliações fictícias
- [ ] **Contratos** mostra os 3 contratos fictícios
- [ ] **Notificações** mostra as 4 notificações fictícias (broadcast)
- [ ] **Painel Agentes**/**Config de Agentes** mostram deli/cora/lara habilitados
- [ ] **iFood: Dashboard** (`radar`) e **iFood: Cardápio** abrem em estado vazio decente (sem
      erro) — **esperado**, não têm seed (documentado no PR #767: exigem pipeline/merchant real)
- [ ] **Atividade** e **Custos de IA** abrem zerados (0 execuções) — **esperado**, `agent_runs`
      é ledger real, não fabricado
- [ ] **Acesso por usuário** mostra só o admin recém-criado (0 outros membros) — **esperado**

---

## Checklist final

- [ ] Tenants `cd-homolog`/`cd-demo` resolvidos (Passo 0) — `id`s guardados.
- [ ] Admin de `cd-homolog` criado (Passo A) — profile + tenant_member + user_role `admin`.
- [ ] Admin de `cd-demo` criado (Passo B) — profile + tenant_member + user_role `admin`
      (mesmo usuário do A ou outro, conforme decisão).
- [ ] Smoke C1 (T-HOMOLOG, 8 telas) — sem "Acesso negado".
- [ ] Smoke C2 (T-DEMO, 16 telas) — dados fictícios visíveis, telas sem seed em estado vazio
      decente (não erro).
- [ ] Senha(s) entregue(s) por canal seguro (nunca em git/chat).
