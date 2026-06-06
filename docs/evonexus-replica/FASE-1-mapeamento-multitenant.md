# FASE 1 — Mapeamento Multi-Tenant

> **Status:** COMPLETO — lado CD / Supabase (Passos 1–5, extração ao vivo 2026-06-06) + **lado
> EvoNexus (Passo 0) preenchido em 2026-06-06** a partir da FASE 0 rodada na VPS
> (`docs/evonexus-replica/FASE-0-inventario-evonexus.md`, branch `wandson/evonexus-fase0`, PR #156).
> **Data da extração:** 2026-06-06 | **Branch:** `wandson/evonexus-fase1-mapeamento`
> **Banco:** Supabase `czyanilrverorwenikqw` (extração ao vivo via MCP `execute_sql`, **read-only**).
> **🛑 CHECKPOINT 1** ao final — go/no-go do Wandson.

## Regras desta fase (cumpridas)

- **READ-ONLY nos dois bancos.** Nenhum INSERT/UPDATE/DELETE/DROP/ALTER. Nenhuma migration `.sql`.
- **Output bruto sempre.** Todo count e todo DDL abaixo vem com **a query + o resultado** colados.
- **Não inventar.** O que não foi lido está marcado "não acessível — pendente VPS", sem preencher de memória.
- **Doc vence memória.** Onde a extração ao vivo divergiu do que estava anotado, a extração venceu (ver §Divergências).
- **Mudança de schema = estratégia** (expand/contract). O `.sql` só vem na FASE 2.

---

## Divergências encontradas (extração ao vivo × notas anteriores)

| # | Item | Nota anterior | Extração ao vivo 2026-06-06 | Ação |
|---|------|---------------|------------------------------|------|
| D-1 | `agent_runs` count | 1.637 | **1.677** | ~~1.637~~ → **1.677** (dado vivo cresceu; query em §Passo 1.4) |
| D-2 | Cascata de `agents.id` | "2 FKs: agent_runs, agent_memories" | **8 FKs** dependentes | Passo 3 corrigido (§3.1) |
| D-3 | Multi-tenancy de `agents` | "já tem tenant_id + RLS" | coluna existe mas **as 15 linhas têm `tenant_id NULL`**; existem `tenant_agents` + `tenant_agent_config` | Passo 3 reinterpretado (§3.1) |

---

## Passo 0 — Inventário EvoNexus (✅ CONCLUÍDO — FASE 0 rodada na VPS, 2026-06-06)

> **Fonte:** `docs/evonexus-replica/FASE-0-inventario-evonexus.md` (branch `wandson/evonexus-fase0`,
> PR #156). Produzido read-only na VPS: lab `/root/cd-evonexus-lab/` + container `8ff65637fbfb`
> via `docker exec`. Nada abaixo foi preenchido de memória — cada item referencia a seção do
> doc-fonte, que carrega a evidência arquivo:linha.

- [x] **Entidades file-based** (FASE 0 §1): **agents** — 40 arquivos `.claude/agents/{name}.md`, frontmatter `name/description/model/color/memory/tools`, sem tenant; **skills** — ~200 diretórios `SKILL.md` (doc-driven vs turnkey), sem tenant; **memória** — global `/workspace/memory/` (ifood-kb + lojas/) + por-agente `.claude/agent-memory/{agent}/`, sem tenant; **templates** — `.claude/templates/html/` com placeholders `{{X}}`; **rotinas** — ADWs Python + `scheduler.py`; **providers** — `config/providers.json` (anthropic ativo); **custos** — `ADWs/logs/metrics.json` + `heartbeat_runs`. **Premissa single-tenant confirmada em todas: isolamento = workspace inteiro.**
- [x] **Tabelas operacionais:** 21 tabelas SQLite levantadas via `models.py` (FASE 0 §2). Nota: `sqlite3 .tables` não rodou — binário ausente no host e `.db` só existe no container; o levantamento via `models.py` (inventário canônico 2026-06-03) é a fonte.
- [x] **ADAPTA:** `plugin_scan_cache` / `plugin_audit_log` **não aparecem** como classes SQLAlchemy explícitas — registrados como gap aceito, baixa prioridade (FASE 0 §3 e §7).
- [x] **Mapa entidade EvoNexus → alvo CD:** FASE 0 §6 — 22 entidades mapeadas com nota multi-tenant cada.
- [x] **Coluna "alvo EvoNexus"** da tabela de classificação: preenchida em **§Passo 2.1** abaixo.

---

## Passo 1 — Inventário CD / Supabase (DDL + counts REAIS)

Escopo: 18 tabelas do núcleo agentes/RBAC/memória/lojas/customers/tenancy.

### 1.1 — Colunas (todas as 18 tabelas)

**Query:**
```sql
SELECT table_name, ordinal_position, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema='public'
AND table_name IN (
 'agents','agent_runs','agent_memories','roles','role_permissions','user_roles',
 'user_agent_access','audit_log','lojas','customers','tenant_members','tenants',
 'loja_consultores','loja_gpt_conversations','loja_gpt_messages','loja_metricas',
 'loja_metricas_snapshot','loja_whatsapp_vinculo')
ORDER BY table_name, ordinal_position;
```

**Resultado (bruto, resumido por tabela — foco em `id`, `tenant_id`, PKs):**

- **`agents`** (15 cols): `id text NOT NULL` (PK, slug), `name`, `role`, `letter`, `color`, `description`, `is_active bool`, `created_at`, `category`, `default_modo text`, `is_custom bool`, `custom_prompt`, `custom_model text` default `'claude-haiku-4-5-20251001'`, `custom_max_tokens int`, **`tenant_id uuid YES` (nullable)**.
- **`agent_runs`** (12 cols): `id uuid NOT NULL` (PK), **`tenant_id uuid YES`**, `agent_id text YES`, `triggered_by uuid`, `trigger_dev_run_id text` (UNIQUE), `status text NOT NULL`, `input/output jsonb`, `cost_usd numeric`, `duration_ms int`, `created_at`, `completed_at`.
- **`agent_memories`** (9 cols): `id uuid NOT NULL` (PK), `agent_id text NOT NULL`, **`tenant_id uuid YES`**, `user_id uuid`, `kind text`, `content text`, `importance int`, `created_at`, `expires_at`.
- **`roles`** (6 cols): `id uuid NOT NULL` (PK), **`tenant_id uuid NOT NULL`**, `name text NOT NULL`, `description`, `is_system bool`, `created_at`. ← **padrão de referência**.
- **`role_permissions`** (3 cols): `role_id uuid NOT NULL`, `resource text NOT NULL`, `action text NOT NULL` (PK composta). **Sem `tenant_id`** — isola via `role_id → roles.tenant_id`.
- **`user_roles`** (4 cols): `user_id uuid NOT NULL`, `role_id uuid NOT NULL` (PK composta), `granted_at`, `granted_by`. **Sem `tenant_id`** — isola via `role_id → roles`.
- **`user_agent_access`** (7 cols): `user_id uuid NOT NULL`, `agent_name text NOT NULL` (PK composta), `can_invoke bool`, `can_view_history bool`, `can_approve_drafts bool`, `granted_at`, `granted_by`. **Sem `tenant_id`. `agent_name` é texto livre, não FK.** ← redesign (§3.2).
- **`audit_log`** (10 cols): `id bigint NOT NULL` (PK, seq), **`tenant_id uuid NOT NULL`**, `user_id`, `agent_name text`, `action`, `resource`, `metadata jsonb`, `ip_address inet`, `user_agent`, `created_at`.
- **`customers`** (17 cols): `id uuid NOT NULL` (PK), **`tenant_id uuid NOT NULL`**, `name`, `avatar`, `phone`, `email`, `is_vip`, `tags text[]`, `metadata jsonb`, `created_at`, `updated_at`, `status`, `whatsapp_name`, `last_message_at`, `assigned_to`, `segment`, `phone_normalized`.
- **`lojas`** (34 cols; posições 5 e 7 ausentes = colunas droppadas): `id uuid NOT NULL` (PK), **`tenant_id uuid NOT NULL`**, `nome`, `nicho`, `cidade`, `created_at`, `plataforma`, `status`, `estado`, `client_id uuid` (FK→customers), `slug`, `ifood_merchant_id`, …, `is_active bool`, `is_real_business bool`.
- **`tenant_members`** (6 cols): `tenant_id uuid NOT NULL`, `user_id uuid NOT NULL` (PK composta), `role text NOT NULL`, `created_at`, `semaforo text`, `display_name`.
- **`tenants`** (17 cols): `id uuid NOT NULL` (PK), `slug text NOT NULL` (UNIQUE), `name`, `emoji`, `color`, `status`, `plan`, `metadata`, `created_at`, `updated_at`, `logo_url`, `segment`, `phone`, `city`, `theme_color`, `is_active`, `modo_padrao`. ← **é a tabela-tenant**.
- **`loja_consultores`** (7 cols): `id uuid` (PK), `loja_id uuid NOT NULL`, `user_id uuid NOT NULL`, `papel text`, `atribuido_em`, `atribuido_por`, `ativo bool`. **Sem `tenant_id`** — isola via `loja_id → lojas.tenant_id`.
- **`loja_gpt_conversations`** (11 cols): `id uuid` (PK), `loja_id uuid NOT NULL`, `iniciada_por`, `titulo`, `resumo_curto`, `total_messages`, `ultima_message_em`, `custo_total_usd`, `arquivada`, `created_at`, `updated_at`. **Sem `tenant_id`** — isola via `loja_id`.
- **`loja_gpt_messages`** (13 cols): `id uuid` (PK), `conversation_id uuid NOT NULL`, `role`, `conteudo`, `fontes_consultadas jsonb`, `contexto_loja_snapshot`, `tokens_input/output`, `custo_usd`, `duracao_ms`, `modelo`, `autor_user_id`, `created_at`. **Sem `tenant_id`** — isola via `conversation_id → loja_gpt_conversations → loja`.
- **`loja_metricas`** (17 cols): `id uuid` (PK), `loja_id uuid NOT NULL`, **`tenant_id uuid NOT NULL`**, `data date`, `faturamento`, `pedidos`, `ticket_medio`, … `fonte text`.
- **`loja_metricas_snapshot`** (20 cols): `id uuid` (PK), `loja_id uuid NOT NULL`, `data date`, `pedidos_30d`, … `fonte text`, `capturado_por`, `created_at`. **Sem `tenant_id`** — isola via `loja_id`.
- **`loja_whatsapp_vinculo`** (10 cols): `id uuid` (PK), **`tenant_id uuid NOT NULL`**, `loja_id uuid NOT NULL`, `remote_jid text`, `tipo`, `monitorar`, `ultimo_run_em`, `criado_por`, `created_at`, `updated_at`.

### 1.2 — PK e UNIQUE

**Query:**
```sql
SELECT tc.table_name, tc.constraint_type, tc.constraint_name,
       string_agg(kcu.column_name, ', ' ORDER BY kcu.ordinal_position) AS cols
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
WHERE tc.table_schema='public'
AND tc.constraint_type IN ('PRIMARY KEY','UNIQUE')
AND tc.table_name IN (<as 18 tabelas>)
GROUP BY tc.table_name, tc.constraint_type, tc.constraint_name
ORDER BY tc.table_name, tc.constraint_type;
```

**Resultado (bruto):**
```
agent_memories         PK      id
agent_runs             PK      id
agent_runs             UNIQUE  trigger_dev_run_id
agents                 PK      id
audit_log              PK      id
customers              PK      id
loja_consultores       PK      id
loja_consultores       UNIQUE  loja_id, user_id
loja_gpt_conversations PK      id
loja_gpt_messages      PK      id
loja_metricas          PK      id
loja_metricas          UNIQUE  loja_id, data, fonte
loja_metricas_snapshot PK      id
loja_metricas_snapshot UNIQUE  loja_id, data
loja_whatsapp_vinculo  PK      id
loja_whatsapp_vinculo  UNIQUE  tenant_id, remote_jid
lojas                  PK      id
role_permissions       PK      role_id, resource, action
roles                  PK      id
roles                  UNIQUE  tenant_id, name          ← padrão de referência
tenant_members         PK      tenant_id, user_id
tenants                PK      id
tenants                UNIQUE  slug
user_agent_access      PK      user_id, agent_name      ← agent_name é texto, não FK
user_roles             PK      user_id, role_id
```

### 1.3 — RLS policies

**Query:**
```sql
SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled,
       p.polname AS policy_name, p.polcmd AS cmd,
       pg_get_expr(p.polqual, p.polrelid) AS using_expr,
       pg_get_expr(p.polwithcheck, p.polrelid) AS withcheck_expr
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_policy p ON p.polrelid = c.oid
WHERE n.nspname='public' AND c.relname IN (<as 18 tabelas>)
ORDER BY c.relname, p.polname;
```

**Resultado (bruto) — RLS habilitado em TODAS as 18; policies por tabela:**

| Tabela | Policy | cmd | Predicado (resumo do `using`/`withcheck`) |
|--------|--------|-----|-------------------------------------------|
| agent_memories | service_role_manage_memories | ALL | `auth.role()='service_role'` |
| agent_memories | tenant_members_view_memories | SELECT | `tenant_id IN (SELECT tenant_id FROM tenant_members WHERE user_id=auth.uid())` |
| agent_runs | authenticated_view_global_runs | SELECT | `auth.uid() IS NOT NULL AND tenant_id IS NULL` |
| agent_runs | service_role_manage_runs | ALL | `auth.role()='service_role'` |
| agent_runs | tenant_members_view_own_runs | SELECT | `tenant_id IN (membership)` |
| **agents** | **agents_read_all** | SELECT | **`true`** (lê tudo, global) |
| **agents** | **agents_tenant_isolation** | ALL | `tenant_id IS NULL OR tenant_id = (membership LIMIT 1)` |
| audit_log | audit_log_insert_authenticated | INSERT | check `auth.uid() IS NOT NULL` |
| audit_log | audit_log_select_admin | SELECT | `tenant_id IN (membership WHERE role='admin')` |
| customers | customers_auth_all | ALL | `true` / check `true` ← **permissiva (revisar)** |
| customers | customers_member_all | ALL | `is_member_of(tenant_id)` |
| loja_consultores | Admins gerenciam atribuições | ALL | join lojas+tenant_members+user_roles+roles, role∈(admin,consultor_senior) |
| loja_consultores | Ver atribuições do próprio tenant | SELECT | via `loja_id → lojas.tenant_id` membership |
| loja_gpt_conversations | lgc_insert/select/update | a/r/w | via `loja_id → lojas` membership (+`iniciada_por`) |
| loja_gpt_messages | lgm_select | SELECT | via `conversation_id → conversations → loja → tenant` |
| loja_metricas | *_select/insert/update/delete | r/a/w/d | `tenant_id IN (membership)` (delete só admin) |
| loja_metricas_snapshot | (edição) / (própria) | ALL/SELECT | via `loja_id` + loja_consultores ativo |
| loja_whatsapp_vinculo | lwv_tenant_isolation | ALL | `tenant_id IN (membership)` |
| lojas | lojas_select/insert/update/delete | r/a/w/d | `tenant_id IN (membership)` (delete só admin) |
| role_permissions | *_select / *_manage_admin | r / ALL | via `role_id → roles.tenant_id` membership (manage só admin) |
| roles | roles_select/insert/update/delete | r/a/w/d | `tenant_id IN (membership)` (CUD só admin; delete exige `is_system=false`) |
| tenant_members | *_select/insert/update/delete | r/a/w/d | `is_admin_of()` / self-insert `user_id=auth.uid()` |
| tenants | *_select/insert/update/delete | r/a/w/d | `is_member_of(id)` / `is_admin_of(id)` |
| user_agent_access | user_agent_access_self | SELECT | `user_id=auth.uid()` |
| user_agent_access | user_agent_access_manage_admin | ALL | `EXISTS tenant_members tm WHERE tm.user_id=auth.uid() AND tm.role='admin'` ← **admin de QUALQUER tenant** (sem escopo de tenant — ver §3.2) |
| user_roles | *_select / *_manage_admin | r / ALL | via `role_id → roles.tenant_id` membership |

> Funções RLS usadas: `is_member_of(tenant_id)`, `is_admin_of(tenant_id)` (SECURITY DEFINER, presumidas — confirmar definição na FASE 2).

### 1.4 — Row counts (output bruto)

**Query:**
```sql
SELECT 'agents' AS t, count(*) AS n FROM agents
UNION ALL SELECT 'agent_runs', count(*) FROM agent_runs
UNION ALL SELECT 'agent_memories', count(*) FROM agent_memories
UNION ALL SELECT 'roles', count(*) FROM roles
UNION ALL SELECT 'role_permissions', count(*) FROM role_permissions
UNION ALL SELECT 'user_roles', count(*) FROM user_roles
UNION ALL SELECT 'user_agent_access', count(*) FROM user_agent_access
UNION ALL SELECT 'audit_log', count(*) FROM audit_log
UNION ALL SELECT 'lojas', count(*) FROM lojas
UNION ALL SELECT 'customers', count(*) FROM customers
UNION ALL SELECT 'tenant_members', count(*) FROM tenant_members
UNION ALL SELECT 'tenants', count(*) FROM tenants
UNION ALL SELECT 'loja_consultores', count(*) FROM loja_consultores
UNION ALL SELECT 'loja_gpt_conversations', count(*) FROM loja_gpt_conversations
UNION ALL SELECT 'loja_gpt_messages', count(*) FROM loja_gpt_messages
UNION ALL SELECT 'loja_metricas', count(*) FROM loja_metricas
UNION ALL SELECT 'loja_metricas_snapshot', count(*) FROM loja_metricas_snapshot
UNION ALL SELECT 'loja_whatsapp_vinculo', count(*) FROM loja_whatsapp_vinculo
ORDER BY t;
```

**Resultado (bruto):**
```
agent_memories            0
agent_runs             1677   ← (D-1: nota anterior dizia 1.637)
agents                   15
audit_log                98
customers              1169
loja_consultores          0
loja_gpt_conversations    9
loja_gpt_messages        16
loja_metricas             1
loja_metricas_snapshot    1
loja_whatsapp_vinculo     3
lojas                  1173
role_permissions        112
roles                     9
tenant_members            2
tenants                   1
user_agent_access         7
user_roles                4
```

### 1.5 — Distribuição de `tenant_id` nas tabelas tenant-opcionais (informa backfill)

**Query:**
```sql
SELECT 'agents' AS t,
       count(*) FILTER (WHERE tenant_id IS NULL) AS null_tenant,
       count(*) FILTER (WHERE tenant_id IS NOT NULL) AS with_tenant
FROM agents
UNION ALL SELECT 'agent_runs',
       count(*) FILTER (WHERE tenant_id IS NULL),
       count(*) FILTER (WHERE tenant_id IS NOT NULL) FROM agent_runs
UNION ALL SELECT 'agent_memories',
       count(*) FILTER (WHERE tenant_id IS NULL),
       count(*) FILTER (WHERE tenant_id IS NOT NULL) FROM agent_memories;
```

**Resultado (bruto):**
```
agents          null_tenant=15    with_tenant=0     ← TODOS globais
agent_runs      null_tenant=383   with_tenant=1294  (=1677)
agent_memories  null_tenant=0     with_tenant=0     (tabela vazia)
```

### 1.6 — Tenant de referência (backfill) confirmado

**Query:**
```sql
SELECT id, slug, name, status FROM tenants WHERE id = '9079bd4d-4df7-4023-90fb-d79c8ba7e900';
```
**Resultado (bruto):**
```
id=9079bd4d-4df7-4023-90fb-d79c8ba7e900  slug=consult  name=Consult Delivery  status=active
```
> É o **único** tenant existente (`tenants` count = 1). Todo backfill de `tenant_id` aponta para ele.

---

## Passo 2 — Classificação multi-tenant

Padrão de referência = **`roles`**: PK uuid + `tenant_id NOT NULL` + `UNIQUE(tenant_id, name)` + RLS por membership/admin.

| Tabela | Estado de tenancy hoje | Como isola | Evidência | Classe |
|--------|------------------------|-----------|-----------|--------|
| `tenants` | é a tabela-tenant | — | PK id, UNIQUE slug, count=1 | ✅ N/A |
| `tenant_members` | tenant na PK | `tenant_id` (PK) | RLS `is_admin_of`/self | ✅ correto |
| `roles` | `tenant_id NOT NULL` | direto | UNIQUE(tenant_id,name) | ✅ **referência** |
| `role_permissions` | sem coluna | via `role_id→roles` | RLS join roles | ✅ correto (cadeia FK) |
| `user_roles` | sem coluna | via `role_id→roles` | RLS join roles | ✅ correto (cadeia FK) |
| `audit_log` | `tenant_id NOT NULL` | direto | RLS admin por tenant | ✅ correto |
| `customers` | `tenant_id NOT NULL` | direto | RLS `is_member_of` **+ policy `customers_auth_all` (true)** | ⚠️ correto mas com policy permissiva a revisar |
| `lojas` | `tenant_id NOT NULL` | direto | RLS membership | ✅ correto |
| `loja_metricas` | `tenant_id NOT NULL` | direto | RLS membership | ✅ correto |
| `loja_whatsapp_vinculo` | `tenant_id NOT NULL` | direto | UNIQUE(tenant_id,remote_jid) | ✅ correto |
| `loja_consultores` | sem coluna | via `loja_id→lojas` | RLS join lojas | ✅ correto (cadeia FK) |
| `loja_gpt_conversations` | sem coluna | via `loja_id→lojas` | RLS join lojas | ✅ correto (cadeia FK) |
| `loja_gpt_messages` | sem coluna | via `conversation_id→…→loja` | RLS join | ✅ correto (cadeia FK) |
| `loja_metricas_snapshot` | sem coluna | via `loja_id→lojas` | RLS join lojas | ✅ correto (cadeia FK) |
| `agents` | `tenant_id` **nullable, 15/15 NULL** | RLS OR `IS NULL` | catálogo global hoje | ❗ **redesign (§3.1)** — ✅ **B decidido** |
| `agent_runs` | `tenant_id` nullable, 383 NULL | RLS por tenant + view global p/ NULL | dados de produção | ⚠️ backfill (§4) |
| `agent_memories` | `tenant_id` nullable, 0 linhas | RLS por tenant | tabela vazia | ⚠️ apertar NOT NULL barato (§4) |
| `user_agent_access` | **sem `tenant_id`, PK (user_id, agent_name text)** | nenhuma cadeia FK | `agent_name` texto livre | ❗ **redesign (§3.2)** |
| **alvo EvoNexus** (todas) | — | — | — | ✅ **preenchido (§2.1)** |

### 2.1 — Alvo EvoNexus por tabela CD (preenchido a partir da FASE 0)

> Mapeamento reverso da FASE 0 §6 (entidade EvoNexus → alvo CD), com a referência da evidência.
> No EvoNexus o tenant é **implícito** (workspace inteiro = 1 cliente); a coluna "nota" indica o
> que a CD adiciona para o mundo multi-tenant.

| Tabela CD | Equivalente EvoNexus | Evidência (FASE 0) | Nota multi-tenant CD |
|-----------|---------------------|--------------------|-----------------------|
| `agents` | `.claude/agents/{name}.md` — catálogo file-based global (40 agentes), carregado por nome | §1.1, §4.1–4.2 | catálogo global (`tenant_id NULL`) + custom por tenant; habilitação via `tenant_agents` |
| `tenant_agents` / `tenant_agent_config` | **sem equivalente** — no EvoNexus basta o arquivo existir no workspace | §5 ("o que o EvoNexus NÃO tem") | é o gap que a CD cobre para multi-tenant; cabear na FASE 2 |
| `agent_runs` | `ADWs/logs/metrics.json` (rotinas) + `heartbeat_runs` (SQLite) | §1.8, §2 | log unificado com `tenant_id`; custo agregado por tenant |
| `agent_memories` | `memory/` global (ifood-kb, lojas/) + `.claude/agent-memory/{agent}/` | §1.3 | memória por agente+tenant; KB iFood portada como global |
| `roles` / `role_permissions` / `user_roles` | `roles` SQLite (permissions_json + agent_access_json + workspace_folders_json) | §2 | CD normaliza em 3 tabelas relacionais, scoped por tenant via `roles.tenant_id` |
| `user_agent_access` | `role.agent_access_json` — filtro por camada/lista de slugs por papel | §5 (evidência 4) | CD dá acesso por usuário; redesign §3.2 adiciona tenant + FK real |
| `audit_log` | `audit_log` SQLite (user_id, action, resource, detail, ip) | §2 | NATIVO na CD; estender ações, scoped tenant |
| `customers` / `lojas` | `memory/lojas/{loja}/` (perfil.md, analises/, inputs/) — "loja" é diretório de memória | §1.3 | CD tem entidade relacional com `tenant_id NOT NULL` (mais forte) |
| `tenants` / `tenant_members` | **sem equivalente** — single-tenant implícito (workspace = o tenant) | §5 (evidência 5) | base do isolamento CD; já correta |
| `loja_gpt_conversations` / `loja_gpt_messages` | path CHAT: `chat-bridge.js` (sessões de chat por agente, `loadAgentFile` + systemPrompt preset) | §4.2 | CD persiste em tabelas com cadeia FK → loja → tenant |
| `loja_metricas` / `loja_metricas_snapshot` | outputs de rotinas ADW (relatórios em `plans/delivery/{loja}/`) | §1.4–1.5 | CD estrutura em tabelas; scoped tenant/loja |
| `loja_whatsapp_vinculo` | canais (Telegram/Discord/iMessage via background services) | §2 / checklist SISTEMA | CD usa Evolution/WhatsApp; vínculo por `tenant_id` + `remote_jid` |
| *(FASE 2 — novas)* `skills`, `goals`, `tickets`, `templates`, `shares` | `.claude/skills/{slug}/SKILL.md` · `missions/projects/goals/goal_tasks` · `tickets/ticket_comments/ticket_activity` · `.claude/templates/html/` · `file_shares` | §1.2, §1.4, §2 | tabelas novas na FASE 2, todas com `tenant_id` desde o dia 1 |

---

## Passo 3 — Casos de redesign de PK/constraint (por que `ADD COLUMN` não basta)

### 3.1 — `agents` (PK text slug, catálogo global)

**Fato:** `agents.id` é `text` (slug global, ex.: `deli`, `lara`). As 15 linhas têm `tenant_id NULL` (§1.5) → hoje **o catálogo de agentes é 100% global**, não por-tenant. A RLS `agents_read_all (true)` faz OR sobre `agents_tenant_isolation`, então qualquer um lê todos.

**Cascata real — `agents.id` é referenciado por 8 tabelas (D-2):**

**Query:**
```sql
SELECT tc.table_name AS from_table, kcu.column_name AS from_col,
       ccu.table_name AS to_table, ccu.column_name AS to_col,
       rc.delete_rule, tc.constraint_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu ON tc.constraint_name=kcu.constraint_name AND tc.table_schema=kcu.table_schema
JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name=ccu.constraint_name AND tc.table_schema=ccu.table_schema
JOIN information_schema.referential_constraints rc ON tc.constraint_name=rc.constraint_name
WHERE tc.table_schema='public' AND tc.constraint_type='FOREIGN KEY'
AND (ccu.table_name IN ('agents','lojas','roles','tenants','customers')
     OR tc.table_name IN ('agents','agent_runs','agent_memories','user_agent_access'))
ORDER BY ccu.table_name, tc.table_name;
```

**Resultado (bruto — FKs → `agents.id`):**
```
agent_actions.agent_id        → agents.id   NO ACTION
agent_memories.agent_id       → agents.id   CASCADE
agent_runs.agent_id           → agents.id   SET NULL
conversations.agent_id        → agents.id   SET NULL
messages.sender_agent_id      → agents.id   SET NULL
tasks.agent_id                → agents.id   SET NULL
tenant_agent_config.agent_id  → agents.id   CASCADE
tenant_agents.agent_id        → agents.id   CASCADE
```

**Interpretação:** existem **duas arquiteturas possíveis** e o DB já tem peças da segunda:
- **(A) Agente por-tenant:** trocar PK por uuid surrogate + `UNIQUE(tenant_id, slug)` (espelhando `roles`), tornar `tenant_id NOT NULL`, e propagar a nova PK uuid nas 8 FKs. Caro: 8 FKs, sendo 2 de produção viva (`agent_runs` 1677, `agent_memories` 0).
- **(B) Catálogo global + habilitação por-tenant:** manter `agents` global e usar `tenant_agents` / `tenant_agent_config` (que **já existem**, CASCADE em tenants) para escopar quais agentes cada tenant vê/configura. Muito mais barato; nenhuma troca de PK.

> **✅ DECIDIDO (2026-06-06): B — catálogo global + habilitação por tenant.** Evidência dos dois lados:
>
> - **Lado EvoNexus (FASE 0 §4–§5):** agentes são file-based e carregados **por nome** nos dois paths — `runner.py` (`--agent {name}`, linhas 130–143) e `chat-bridge.js` (`loadAgentFile(agentName, cwd)`, linhas 47–57). Frontmatter sem `tenant_id`/`owner`/`scope`; custom separado por prefixo `custom-`, não por tenant. O paradigma é **catálogo global com tenant implícito** (workspace = 1 cliente).
> - **Lado CD (§1.5 + acima):** 15/15 agentes com `tenant_id NULL`; `tenant_agents` e `tenant_agent_config` **já existem** com estrutura certa + RLS (0 linhas — escafoldado, não cabeado).
> - **Custo:** B **não troca a PK** de `agents` e **não mexe nas 8 FKs** (incl. `agent_runs` com 1.677 linhas de produção).
>
> O que o EvoNexus não tem e a CD precisa — "habilitar agente X para tenant Y" — é exatamente o que `tenant_agents` cobre (FASE 0 §5). **FASE 2 cabeia:** popular `tenant_agents` para o tenant `consult` + substituir `agents_read_all (true)` por gating via `tenant_agents.enabled`.

### 3.2 — `user_agent_access` (PK composta com texto, sem tenant)

**Fato:** PK = `(user_id, agent_name text)`. `agent_name` é **texto livre, não-FK**; **não há `tenant_id`** nem cadeia FK para tenant. A RLS `user_agent_access_manage_admin` concede a **admin de qualquer tenant** (`EXISTS tenant_members WHERE role='admin'`, sem casar tenant) → vazamento cross-tenant potencial num mundo multi-tenant.

**Redesign:** adicionar `tenant_id`, trocar `agent_name text` por FK ao `agents` — com B decidido (§3.1), a FK é direta ao slug `agents.id` — e reescrever a policy admin para casar o tenant. Não é `ADD COLUMN` simples — muda a PK e a semântica da policy.

### 3.3 — Tabelas que isolam só por cadeia de FK (confirmar na origem)

`role_permissions`, `user_roles` (via `roles`), `loja_consultores`, `loja_gpt_conversations`, `loja_gpt_messages`, `loja_metricas_snapshot` (via `lojas`/`conversation`). Hoje **corretas** porque a raiz da cadeia (`roles`/`lojas`) tem `tenant_id NOT NULL`. **Não exigem redesign**, mas qualquer desnormalização futura de `tenant_id` nelas deve preservar a cadeia.

---

## Passo 4 — Estratégia de migração não-destrutiva (expand / contract)

Princípio: **expand** (coluna nullable nova / tabela v2 paralela) → **backfill** (`tenant_id = consult`) → **cutover** (app passa a escrever/ler pelo novo) → **contract** (aposentar o antigo). **NUNCA `DROP` em produção** com dado vivo. DDL real só na FASE 2.

| Caso | Expand | Backfill | Cutover | Contract |
|------|--------|----------|---------|----------|
| `agent_runs.tenant_id` (383 NULL) | já existe nullable | `UPDATE … SET tenant_id=consult WHERE tenant_id IS NULL` (383 linhas) | manter view global p/ runs de sistema OU migrar policy | depois: `SET NOT NULL` (se decidir) |
| `agent_memories.tenant_id` | já existe nullable; **tabela vazia** | nada a backfillar | — | `SET NOT NULL` barato (0 linhas) |
| `agents` (§3.1) | **✅ B decidido** — PK e FKs intactas | popular `tenant_agents` para o tenant `consult` (habilitar os agentes certos) | RLS: trocar `agents_read_all (true)` por gating via `tenant_agents.enabled` | aposentar `agents_read_all` |
| `user_agent_access` (§3.2) | `ADD tenant_id` nullable + FK real ao agente (slug, dado B) | backfill `tenant_id=consult` nas 7 linhas | nova PK paralela + policy admin com escopo de tenant | aposentar PK antiga `(user_id, agent_name)` |

**Dados vivos a preservar:** `lojas` 1173, `customers` 1169, `agent_runs` 1677, `role_permissions` 112, `audit_log` 98. Nenhuma estratégia acima destrói linhas.

---

## Passo 5 — Evidência faltante / pendências (para o CHECKPOINT)

1. ~~**Todo o lado EvoNexus (Passo 0)** — não acessível deste Windows; pendente leitura na VPS.~~ → ✅ **RESOLVIDO (2026-06-06):** FASE 0 rodada na VPS (`FASE-0-inventario-evonexus.md`, PR #156); Passo 0 e §2.1 preenchidos.
2. ~~**Decisão A vs B em `agents`** (§3.1) — não tomada de propósito.~~ → ✅ **RESOLVIDO (2026-06-06): B decidido** com evidência dos dois lados (§3.1).
3. **Definição das funções `is_member_of` / `is_admin_of`** não foi extraída (presumida SECURITY DEFINER) — confirmar na FASE 2.
4. **Policy `customers_auth_all (true)`** e **`user_agent_access_manage_admin` sem escopo de tenant** — possíveis vazamentos cross-tenant; corrigir na FASE 2 onda 1 (junto com `agents_read_all`).
5. Tabelas fora do escopo das 18 que também referenciam `lojas`/`customers`/`tenants` (vistas na §3.1) **não foram inventariadas individualmente** — só suas FKs. Inventário completo se/quando o redesign as tocar.

---

## 🛑 CHECKPOINT 1 — go/no-go

**Os dois lados mapeados com output bruto:** lado CD (Passos 1–5, extração ao vivo) + lado EvoNexus (Passo 0 via FASE 0/PR #156). Fork A vs B: **✅ B decidido** (§3.1). Nenhuma migration escrita, nada tocou produção.

**Aguardando go do Wandson para a FASE 2 (onda 1):** plano de migrations versionadas — corrigir as 3 RLS permissivas (`customers_auth_all`, `user_agent_access_manage_admin`, `agents_read_all`), popular `tenant_agents` para o tenant `consult`, `agent_memories.tenant_id SET NOT NULL`, backfill `agent_runs.tenant_id` (383 → consult), redesign `user_agent_access` (§3.2). SQL mostrado e aprovado antes de aplicar; **nunca via MCP**.
