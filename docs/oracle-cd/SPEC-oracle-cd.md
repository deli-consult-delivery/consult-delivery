# SPEC — Oracle da CD (agente que cria agentes, multi-tenant)

> **Status:** RASCUNHO PARA APROVAÇÃO · **Data:** 2026-06-11 · **Tipo:** Especificação (doc). **Nenhuma implementação, nenhuma migration aplicada.**
> **Autor:** sessão Cowork (worktree isolado, branch `wandson/spec-oracle-cd`).
> **Regra de evidência:** cada afirmação técnica aponta para `arquivo:linha` ou query SQL ao vivo. O que não foi possível verificar está marcado como **LACUNA**.

---

## 0. Para o leitor leigo — o que é isto em uma frase

Hoje, para nascer um agente novo na plataforma (um "LARA", um "CORA"), alguém edita banco de dados na mão. O **Oracle da CD** é um **chat dentro do console** onde o operador escreve *"cria um agente especialista em recuperação de clientes inativos"* e o sistema **monta o agente sozinho** (texto-base/prompt, função, ferramentas que ele pode usar, modo de operação, modelo de IA), **mostra um rascunho para um humano aprovar**, e só depois liga o agente. É inspirado no "Oracle" do EvoNexus (FASE 0), mas **nativo da CD e multi-tenant** (cada cliente tem os seus agentes, sem misturar).

---

## 1. CONCEITO

### 1.1 Como o EvoNexus faz (o paradigma de origem)

No EvoNexus, um agente é **um arquivo**: `.claude/agents/{nome}.md`, Markdown com *frontmatter* YAML (`name`, `description`, `model`, `color`, `memory`, `tools`) — evidência em `docs/evonexus-replica/FASE-0-inventario-evonexus.md:57-85`. O agente é **carregado pelo nome do arquivo**, sem banco e sem noção de tenant: `runner.py` usa `--agent {name}` (FASE-0:320-334) e `chat-bridge.js` usa `loadAgentFile(agentName, cwd)` (FASE-0:343-367). A skill `create-agent` é justamente o que cria esse arquivo (FASE-0:115). Conclusão da FASE 0: o EvoNexus é **single-tenant** — o "tenant" é o workspace inteiro (FASE-0:386-390, 93).

### 1.2 Como a CD traduz o paradigma (o que muda)

A CD **não é file-based**. Um agente na CD é **uma LINHA na tabela `agents`** (catálogo), e a habilitação por cliente é **uma linha em `tenant_agents`**. Isso é a **Decisão B** já travada: catálogo global + habilitação por tenant (`docs/evonexus-replica/FASE-1-mapeamento-multitenant.md:351-357`; `CLAUDE.md` raiz §EVONEXUS-REPLICA "(D4) ... = B ✅ DECIDIDO").

| Conceito EvoNexus (file-based) | Tradução nativa CD (DB-based) | Evidência |
|---|---|---|
| Arquivo `.claude/agents/{nome}.md` | **Linha em `agents`** (PK `id text` = slug) | FASE-1:66; query ao vivo §3.1 abaixo |
| `frontmatter.name` / `description` / `model` | colunas `name`, `description`, `custom_model` | FASE-1:66 |
| Agente existe no workspace = todos veem | **`tenant_agents(tenant_id, agent_id, enabled)`** habilita por cliente | `supabase/migrations/20260512_004_create_tenant_agent_config.sql` + populate `20260607_001_tenant_agents_populate.sql:10-14` |
| `frontmatter.tools` (lista livre) | **allow-list validada na nossa camada** (não existe coluna ainda — §3.3, precisa criar) | claude-runner não passa `tools` hoje (§3.4) |
| skill `create-agent` (gera o `.md`) | **Oracle = construtor** que faz INSERT em `agents` + `tenant_agents` após aprovação | esta spec |
| `model: sonnet\|opus\|haiku` | `custom_model` (default `claude-haiku-4-5-20251001`) | `20260603_004_agents_custom.sql:7` |
| `color` no frontmatter | coluna `color` (NOT NULL) | §3.1 |

**O fluxo-alvo do Oracle:**

```
Operador (no console) ──► chat "cria um agente que faz X"
        │
        ▼
Oracle (LLM via Messages API)  ──► PROPÕE um draft estruturado:
        │                           { slug, name, role, letter, color,
        │                             default_modo, custom_model,
        │                             custom_prompt, tools[] (allow-list),
        │                             provider }
        ▼
DRAFT gravado (NÃO em `agents` ainda) ──► humano revisa na fila de aprovação
        │
        ├─ rejeita ──► draft arquivado, nada criado
        │
        └─ aprova ──► (1) INSERT em `agents` (is_custom=true, tenant_id=<tenant>)
                      (2) INSERT em `tenant_agents` (enabled=true)
                      (3) audit_log
                      ► agente vivo e habilitado para aquele tenant
```

### 1.3 Já existe meio caminho andado (e está QUEBRADO) — usar como base, não recomeçar

Há **um construtor de agentes parcial já no código** (`src/screens/AgentBuilderScreen.jsx` + `bridge-server/routes/agent-builder.js`). O Oracle deve **evoluir** isso, não duplicar. **Porém, hoje ele não funciona** — provado ao vivo: **`SELECT count(*) FROM agents WHERE is_custom=true` = 0** (nunca criou um agente). As causas são bugs reais que esta spec usa como requisitos de guard-rail (§3):

- O `POST /api/agent-builder/agents` insere a coluna **`display_name`**, que **não existe** em `agents` (`agent-builder.js:100`; query ao vivo: `has_display_name_col = 0`). → INSERT 400/falha.
- O mesmo POST **nunca preenche `role`**, que é **NOT NULL** (`agent-builder.js:98-110`; `role_is_notnull = 1`). → INSERT viola NOT NULL.
- O `invoke` grava **`tokens_used`** em `agent_runs`, coluna que **não existe** (`agent-builder.js:284`; `has_tokens_used_col = 0`) — é o anti-padrão **P1** do `CLAUDE.md` (`.select`/insert de coluna inexistente). → erro silenciado.

> **Conclusão:** o "esqueleto" (UI modal + rotas REST + RBAC por tenant via `requireJwt`/`getTenantId`) é reaproveitável; a **camada de persistência precisa ser corrigida** e o **fluxo propõe-e-aprova precisa ser adicionado** (hoje o builder grava direto, sem draft).

---

## 2. FLUXO PROPÕE-E-APROVA

Princípio da casa: **nenhum agente vivo sem aprovação humana** (`CLAUDE.md` raiz §DRAFTS; §SEMÁFORO DELI). O builder atual viola isso porque grava direto em `agents` no POST (`agent-builder.js:98-112`). O Oracle **conserta isso**: o construtor **só PROPÕE**; quem ATIVA é o humano.

### 2.1 Onde mora o draft (tabela proposta — **precisa criar**)

Não há tabela de draft de agente hoje. Proposta: **`agent_drafts`** (multi-tenant desde o dia 1, padrão `roles`/`audit_log`):

```
agent_drafts
  id            uuid    PK default gen_random_uuid()
  tenant_id     uuid    NOT NULL REFERENCES tenants(id) ON DELETE CASCADE
  status        text    NOT NULL DEFAULT 'pendente'
                        CHECK (status IN ('pendente','aprovado','rejeitado','aplicado'))
  proposed_slug text    NOT NULL          -- vira agents.id ao aprovar
  payload       jsonb   NOT NULL          -- { name, role, letter, color, default_modo,
                                          --   custom_model, custom_prompt, tools[], provider }
  source_chat   jsonb                     -- transcript Oracle↔operador (auditoria)
  created_by    uuid    NOT NULL          -- quem pediu
  reviewed_by   uuid                      -- quem aprovou/rejeitou
  review_note   text
  agent_id      text    REFERENCES agents(id)  -- preenchido no aplicar
  created_at    timestamptz NOT NULL DEFAULT now()
  reviewed_at   timestamptz
  -- RLS: SELECT/INSERT por membro do tenant; UPDATE(aprovar/aplicar) só admin/owner
  --      (espelhar tenant_agent_config policy: 20260512_004:19-29)
```

> **Por que `jsonb payload` e não colunas espelhando `agents`?** O draft é um documento mutável em revisão; só vira linha tipada em `agents` no momento do "aplicar". Mantém a tabela `agents` limpa (sem linhas "fantasma" pendentes que a RLS de gating `agent_enabled_for_user` poderia vazar — `20260607_002_agents_rls_gating.sql:16-29`).

### 2.2 Reuso da fila única de aprovação

O T3 já prevê **GAP-3: fila única de aprovação** que funde Approvals + DraftsPendentes + AgentInbox + sugestões MIA (`WikiBrain/wiki/T3 — Mapa de Telas (Console Interno).md:26,45`). O draft de agente **entra nessa mesma fila** como mais uma origem (`origem = 'oracle'`), não cria fila nova. Aprovar/rejeitar reusa a infraestrutura de `audit_log` já usada em `deli-approvals.js:50,92`.

### 2.3 Máquina de estados

`pendente` → (humano aprova) → `aprovado` → (sistema executa INSERTs) → `aplicado` ·· ou `pendente` → (humano rejeita) → `rejeitado` (nada criado). **`aplicado` é o único estado que produz linha em `agents`.**

---

## 3. GUARD-RAILS

### 3.1 NOT NULL reais de `agents` (validar ANTES de qualquer INSERT)

Query ao vivo (`information_schema.columns`, Supabase `czyanilrverorwenikqw`, 2026-06-11):

| coluna | tipo | nullable | default | obrigatório no INSERT? |
|---|---|---|---|---|
| `id` | text (PK = slug) | **NO** | — | **SIM** (o Oracle gera o slug) |
| `name` | text | **NO** | — | **SIM** |
| `role` | text | **NO** | — | **SIM** ← *o builder atual esquece — bug* |
| `letter` | text | **NO** | — | **SIM** |
| `color` | text | **NO** | — | **SIM** |
| `default_modo` | text | NO | `'hibrido'` | opcional (tem default; CHECK `humano\|hibrido\|ia` — `20260512_003:7-8`) |
| `is_active` | bool | NO | `true` | opcional |
| `created_at` | timestamptz | NO | `now()` | opcional |
| `description` | text | YES | — | opcional |
| `category` | text | YES | — | opcional (CHECK `orchestrator\|specialist` — `20260512_003:6`) |
| `is_custom` | bool | YES | `false` | **setar `true`** |
| `custom_prompt` | text | YES | — | opcional |
| `custom_model` | text | YES | `'claude-haiku-4-5-20251001'` | opcional |
| `custom_max_tokens` | int | YES | `4096` | opcional |
| `tenant_id` | uuid | YES | — | **setar = tenant do operador** |

> **NÃO existe coluna `display_name`** (query: `has_display_name_col = 0`). O builder e a UI usam `display_name` (`agent-builder.js:100`, `AgentBuilderScreen.jsx:172`) — ou se mapeia para `name`, ou se cria a coluna. **Decisão a confirmar com o Wandson**; recomendação: mapear `display_name` → `name` e usar `role` para a descrição curta da função (evita migration).

**Regra de aceite:** o construtor **DEVE** preencher os 5 NOT NULL sem default (`id`, `name`, `role`, `letter`, `color`) + `is_custom=true` + `tenant_id`. Validação por **Zod** (padrão `CLAUDE.md`), na camada do bridge, **antes** do INSERT.

### 3.2 RBAC — quem pode criar/aprovar

- **Criar/propor (rodar o Oracle):** papel com permissão sobre agentes. A RLS de escrita em `agents` já exige **admin do tenant**: `agents_insert_admin_custom ... WITH CHECK (is_custom AND tenant_id IS NOT NULL AND public.is_admin_of(tenant_id))` (`20260607_002_agents_rls_gating.sql:43-45`). Logo, **propor** pode ser papel mais amplo, mas **aplicar** (que faz o INSERT) **exige admin/owner do tenant**.
- **Frontend:** envolver a tela do Oracle em `<RequireRole resource="agents" action="create">` (componente real: `src/components/auth/RequireRole.jsx`; padrão `CLAUDE.md` §RBAC).
- **Bridge:** o construtor reusa `requireJwt` + `getTenantId` (já em `agent-builder.js:11-17,83-87`). Para **aplicar**, adicionar checagem de papel admin/owner (hoje o POST não checa papel — só tenant). A RLS de `agent_drafts` (§2.1) faz o enforcement final.
- **Toda ação logada em `audit_log`** (`tenant_id NOT NULL` — FASE-1:73), com `action` ∈ `oracle.draft_criado`, `oracle.draft_aprovado`, `oracle.agente_aplicado`. Padrão de insert: `deli-approvals.js:50,92`.

### 3.3 Allow-list de tools (enforcement na NOSSA camada, NUNCA no prompt)

**Estado atual:** `agents` **não tem coluna de tools**; o runner (`bridge-server/services/claude-runner.js`) **não passa `tools`** para `client.messages.create` hoje — só `model`, `max_tokens`, `messages`, `system` (`claude-runner.js:67-71`). Ou seja, um agente criado hoje **não tem ferramentas** além do texto.

**Requisito:** quando o Oracle der "tools" a um agente, a permissão **vive em dados nossos e é validada no servidor** — nunca confiando no texto do prompt (um prompt pode pedir tool que não deve existir). Proposta mínima:

- **Coluna nova `agents.allowed_tools text[]`** (ou `tenant_agent_config.config.allowed_tools` — reusa jsonb existente, `20260512_004:10`). **Recomendação MVP:** usar `tenant_agent_config.config.allowed_tools` (zero migration) e, se virar de 1ª classe, promover a coluna depois.
- **Registry de tools permitidas** (constante no bridge, fonte única da verdade): ex. `['web_search_20250305']` no MVP (web search é o runtime aprovado — `CLAUDE.md` raiz Stack "Runtime agente: @anthropic-ai/sdk + web_search_20250305").
- **Enforcement:** no momento de invocar, o bridge **interseca** `allowed_tools` ∩ `REGISTRY` e só passa essas para `messages.create({ tools })`. Tool fora do registry é **descartada silenciosamente** (e logada). O LLM nunca recebe uma tool que o registry não autoriza, independentemente do que o `custom_prompt` peça.

> **Por que assim:** segue o anti-padrão nº 7 do `CLAUDE.md` (agente fora da stack é proibido) e a regra de que controle de acesso é da plataforma, não do modelo. O Oracle **propõe** tools; o **registry decide** o que é instalável.

### 3.4 Ordem de INSERT e FK (agent ANTES de qualquer log)

`agent_runs.agent_id → agents.id` com `SET NULL` (FASE-1:341) e **`agent_runs.tenant_id` é NOT NULL** (query ao vivo). Então, ao "aplicar" um draft:

1. **INSERT `agents`** (cria o slug) — primeiro, sempre.
2. **INSERT `tenant_agents`** (habilita) — depende de (1) por FK `CASCADE` (FASE-1:344).
3. Só **depois** qualquer `agent_runs`/`logAgentRun` pode referenciar o slug (senão FK falha ou vira NULL órfão).

**Bug a corrigir junto:** o `invoke` insere `tokens_used` inexistente em `agent_runs` (`agent-builder.js:284`; `has_tokens_used_col=0`) — remover esse campo ou criar a coluna. Sem isso, o custo do "testar agente" não é gravado (P1).

### 3.5 Custo (provider/modelo default por tenant)

- **Modelo default** do agente custom = `claude-haiku-4-5-20251001` (mais barato; default real da coluna `custom_model` — `20260603_004:7`). O Oracle só sobe para sonnet/opus se justificado.
- **Provider:** Decisão D1 = `@anthropic-ai/sdk` (Messages API) + camada multi-provider BYO-key por tenant via Infisical (`CLAUDE.md` raiz §EVONEXUS-REPLICA D1). No MVP o provider é **Anthropic fixo**; o campo `provider` no draft fica registrado para o v2.
- **Teto de custo por tenant:** registrar `max_tokens` (coluna `custom_max_tokens`, default 4096) e expor o custo no GAP-4 (Custos) do T3, que agrega `agent_runs.cost_usd` (`T3:46`). LACUNA: não há hoje coluna de "limite de gasto por tenant" — fora do escopo do MVP, anotar para v2.

---

## 4. SKILLS — como o agente criado ganha habilidades

### 4.1 O conceito no EvoNexus

Skill = diretório `.claude/skills/{slug}/SKILL.md` (frontmatter `name`/`description` + corpo Markdown). Duas categorias: **doc-driven** (só Markdown, o agente lê e segue) e **turnkey** (`SKILL.md` + `scripts/` Python, invocado via Bash) — `FASE-0:97-119`. Skills são **globais ao workspace, sem tenant** (`FASE-0:133`).

### 4.2 Tradução para a CD (mínimo viável)

A CD roda via **Messages API**, não via Claude Code CLI com filesystem de skills. Então "skill" mapeia para **skill-as-tool**: uma habilidade é **uma tool registrada** que o agente pode receber (mesma allow-list do §3.3). Não precisamos replicar o sistema de `SKILL.md` no MVP.

| Tipo de skill EvoNexus | Equivalente CD | MVP? |
|---|---|---|
| **doc-driven** (instruções em Markdown) | **bloco de instruções no `custom_prompt`** do agente — o Oracle redige | ✅ MVP (zero infra) |
| **turnkey** (script Python via Bash) | **tool registrada** no registry do §3.3, passada a `messages.create({tools})` | 🟡 v2 (precisa o runner passar `tools` — não passa hoje, `claude-runner.js:67-71`) |
| catálogo de ~200 skills | **tabela `skills`** já prevista como nova na FASE 2 (`FASE-1:308`) + T3 **GAP-5** (lista+editor, "markdown-as-tool") `T3:47` | 🟡 v2 |

**Proposta MVP:** skill = trecho de prompt + (opcionalmente) `web_search`. Sem tabela `skills`. **Proposta v2:** introduzir a tabela `skills` (multi-tenant, `FASE-1:308`) e o registry de tools, fechando paridade com GAP-5.

---

## 5. TELAS — encaixe no mapa T3

> **Nota de evidência:** o mapa T3 **não está em `docs/ux/T3-mapa-de-telas-console-interno.md`** (caminho do enunciado **não existe** — verificado). A fonte real é **`WikiBrain/wiki/T3 — Mapa de Telas (Console Interno).md`** (também presente em `origin/cowork/t3-mapa-v1`). Toda referência abaixo é a esse arquivo.

| Tela T3 | Já existe? | Papel do Oracle | Evidência |
|---|---|---|---|
| **S-08 Agentes / DELI Hub** (`AgentsPage`) | ✅ existe; GAP-1 = toggle de habilitação por tenant (`tenant_agents`) | ponto de entrada: botão "Criar agente com o Oracle"; o toggle GAP-1 é o passo "habilitar" do §1.2 | `T3:23,43` |
| **S-09 Agente config** (`AgentBuilderScreen`) | ✅ existe (mas quebrado, §1.3); GAP-2 = modo/provider/custo | tela onde o draft aprovado é revisado/ajustado e onde modo/provider/custo são definidos | `T3:24,44`; `src/screens/AgentBuilderScreen.jsx` |
| **Chat de construção do Oracle** | 🆕 **NOVA** | o chat conversacional onde o operador pede o agente e o Oracle propõe o draft. **Não existe equivalente** no app | esta spec |
| **S-11 / GAP-3 Fila única de aprovação** | 🔧 parcial | o draft de agente (`agent_drafts`) aparece aqui como origem `oracle` | `T3:26,45` |
| **GAP-4 Custos** | 🟡 | mostra o custo dos agentes criados (`agent_runs.cost_usd`) | `T3:46` |
| **GAP-5 Skills** | 🟡 NOVA | só relevante no v2 (skill-as-tool, §4) | `T3:47` |

**Conclusão de telas:** o Oracle reaproveita **S-08** (entrada + habilitação), **S-09** (revisão/config do draft) e a **fila GAP-3** (aprovação). A **única tela nova obrigatória do MVP é o "Chat de construção do Oracle"** — um painel conversacional, no visual do DELI Hub (dark, sidebar, cards — `T3:52`).

---

## 6. FASES DE ENTREGA

### MVP — "criar agente de chat/consulta"

Operador conversa com o Oracle → Oracle propõe draft (slug, name, role, letter, color, default_modo, custom_model, custom_prompt, tools básicas) → humano aprova na fila → sistema cria a linha em `agents` + habilita em `tenant_agents` → agente responde no "testar agente" (Messages API).

**Escopo técnico:**
- Tela nova: **Chat de construção do Oracle**.
- Tabela nova: **`agent_drafts`** (§2.1) + RLS.
- **Corrigir os 3 bugs** do builder atual (§1.3 / §3.1 / §3.4): `display_name` inexistente, `role` NOT NULL não preenchido, `tokens_used` inexistente.
- Tools no MVP = só prompt (doc-driven) + opcional `web_search`; allow-list via `tenant_agent_config.config.allowed_tools` (sem migration nova).
- RBAC: propor = papel sobre agentes; aplicar = admin/owner do tenant; tudo em `audit_log`.

**Critérios de aceite (MVP):**
1. `SELECT count(*) FROM agents WHERE is_custom=true` **> 0** com um agente criado **via Oracle** (hoje é 0 — output bruto obrigatório).
2. INSERT respeita os 5 NOT NULL (`id,name,role,letter,color`) + `is_custom=true` + `tenant_id` — provado por linha real.
3. Nenhuma linha em `agents` antes da aprovação (estado `pendente` não cria agente).
4. Ordem INSERT respeitada: `agents` → `tenant_agents` → `agent_runs` (FK não falha).
5. Teste de isolamento RLS: operador do tenant A **não vê nem aplica** draft/agente do tenant B (padrão `CLAUDE.md` §MIGRATION).
6. `audit_log` registra `draft_criado`, `draft_aprovado`, `agente_aplicado`.

### v2 — skills, rotinas, WhatsApp

**Escopo:**
- **Skills-as-tool reais:** tabela `skills` (`FASE-1:308`) + registry de tools + runner passando `tools` para `messages.create` (não passa hoje — `claude-runner.js:67-71`). Fecha **GAP-5**.
- **Rotinas:** o Oracle pode propor que o agente rode em cron (Trigger.dev — `FASE-1:415`), com `agent_runs` para custo.
- **Multi-provider** (D1): campo `provider` do draft passa a valer (Anthropic/Ollama/OpenRouter, BYO-key por tenant via Infisical).
- **WhatsApp:** agente criado pode atuar em canal Evolution, **sempre via draft→aprovação** (`CLAUDE.md` §DRAFTS — nenhum agente fala com cliente sem aprovação).
- **Teto de gasto por tenant** (LACUNA do §3.5).

**Critérios de aceite (v2):**
1. Um agente criado pelo Oracle recebe `web_search` (ou tool do registry) e a usa — com a tool **vindo do registry**, não do prompt (provar que tool fora do registry é descartada).
2. Skill listada/editável na tela GAP-5, escopada por tenant.
3. Agente custom agendado dispara via Trigger.dev e loga custo em `agent_runs`.
4. Mensagem a cliente por agente criado **só sai após aprovação** (draft em `channel != telegram_interno/painel`).

---

## 7. LACUNAS / BLOQUEIOS DE EVIDÊNCIA

1. **CREATE TABLE de `agents` e `tenant_agents` não está versionado** em `supabase/migrations/` (grep não encontrou nenhum `CREATE TABLE agents`/`tenant_agents` — só `ALTER`/`INSERT`/RLS). Estrutura foi levantada **ao vivo** (`information_schema`) e via migrations de ALTER. As tabelas foram criadas fora do versionamento (provavelmente dashboard/MCP). **Não bloqueia a spec** (schema confirmado ao vivo), mas é dívida de versionamento.
2. **Caminho do mapa T3 no enunciado (`docs/ux/T3-...`) não existe.** Fonte real: `WikiBrain/wiki/T3 — Mapa de Telas (Console Interno).md`. Usada essa.
3. **`display_name`**: UI/bridge usam, coluna não existe. Decisão (mapear→`name` vs criar coluna) é do Wandson — recomendação: mapear, sem migration.
4. **Teto de gasto por tenant**: não há coluna/mecanismo hoje. Fora do MVP.
5. **Definição de `is_member_of`/`is_admin_of`/`agent_enabled_for_user`**: usadas nas RLS (`20260607_002:16,38,45`), assumidas SECURITY DEFINER corretas (FASE-1:390 já marca como "confirmar"). Não re-verificadas nesta sessão.
6. **`role` vs `display_name` semântica**: o builder trata `role` como "função" e `display_name` como "nome amigável"; como `display_name` não existe e `name` é NOT NULL, a spec recomenda `name`=amigável e `role`=função curta. Confirmar.

---

## 8. RESUMO DE MIGRATIONS PROPOSTAS (NÃO aplicadas — só especificadas)

| # | O quê | Tipo | Destrutivo? |
|---|---|---|---|
| M1 | `CREATE TABLE agent_drafts` (+ RLS espelhando `tenant_agent_config`) | aditiva | não |
| M2 | corrigir builder: remover `display_name` do INSERT, preencher `role`, remover `tokens_used` do `agent_runs` insert | código (bridge), não-DDL | não |
| M3 (v2) | `CREATE TABLE skills` (multi-tenant) + registry de tools | aditiva | não |
| M4 (opcional) | `agents.allowed_tools text[]` se promover de `tenant_agent_config.config` | aditiva | não |

> Todas aditivas/reversíveis → aplicáveis com autonomia (D5 v3) **quando virar implementação**, 1 arquivo por vez, output bruto, teste de isolamento ao tocar RLS. **Esta spec não aplica nenhuma.**
