# PLANO MESTRE — Replicar o EvoNexus nativo na Consult Delivery (multi-tenant)

**Status:** Plano persistido, aguardando 🛑 CHECKPOINT 0 (Wandson revisa antes de qualquer build).
**Origem:** prompt-base completo do Wandson (sessão 2026-06-02, transcript `03a4c779…`, msg verbatim preservada na seção 5).
**Última revisão:** 2026-06-02
**Doc autoritativo do projeto:** `RESTRUCTURE.md` (raiz). Em divergência, **RESTRUCTURE.md vence** — ver seção 1.

> **Por que este doc existe:** instrução literal final do Wandson — *"Coloque tudo no cloude.md para não esquecer na hora de executar O código e para não pular nada."* O CLAUDE.md aponta para cá; este arquivo é o **contrato de completude**. A CHECKLIST MESTRE (seção 5) é a régua: nenhuma tela pode ser pulada em silêncio.

---

## 1. ⚠️ DIVERGÊNCIAS COM A STACK AUTORITATIVA — ✅ DECIDIDO 2026-06-03

O prompt-base foi escrito assumindo um ambiente (VPS Linux) e uma stack que **conflitavam em 3 pontos** com `RESTRUCTURE.md`/`CLAUDE.md`. Por CLAUDE.md+RESTRUCTURE.md §0, o doc autoritativo vence.

> ✅ **DECIDIDO 2026-06-03 pelo Wandson** — ver **`DECISAO-001-runtime-provider-custo.md`** (registro completo: runtime, arquitetura multi-provider BYO-key, fora-de-escopo OAuth, custo por token). Numeração canônica: **D1 = runtime**, **D2 = versão Trigger.dev**, **D3 = ambiente da FASE 0**.

| # | Prompt-base diz | Stack autoritativa diz | Conflito | Resolução proposta (Wandson decide) |
|---|------------------|------------------------|----------|--------------------------------------|
| D1 (runtime) | Runtime = **"Claude Agent SDK nativo"** (`@anthropic-ai/claude-agent-sdk`) | `RESTRUCTURE.md` §3.2 linha 89: runtime oficial = **`@anthropic-ai/sdk`** + `web_search_20250305`. §3.3 linha 100: Agent SDK = **"não funciona em Trigger.dev cloud"** | **REAL e bloqueante.** O Agent SDK precisa do binário `claude`; não roda em Trigger.dev cloud. | ✅ **DECIDIDO (a):** orquestrador usa **`@anthropic-ai/sdk`**; "Oracle" é orquestração nossa em cima dele. Agent SDK fica fora do produto (só Bridge VPS, uso pessoal). **+ camada multi-provider** (Anthropic/Ollama/OpenRouter, BYO-key por tenant via Infisical, roteamento por tarefa, fallback). OAuth-de-assinatura embutido = **fora de escopo** (legal/ToS). Ver `DECISAO-001`. |
| D2 (Trigger) | "Trigger.dev **v3**" | `CLAUDE.md` + `RESTRUCTURE.md` §3.2 linha 88: **v4** (`npx trigger.dev@4.4.6 deploy`) | Menor. Versão errada no prompt. | ✅ **DECIDIDO:** **v4** (a stack já está em v4). Padrões de task/cron/eventos seguem `RESTRUCTURE.md` §7. |
| D3 (ambiente FASE 0) | FASE 0 lê código do EvoNexus em `/root/cd-evonexus-lab` + repo GitHub | Caminhos Linux/VPS **não acessíveis** deste Windows (§3) | Onde rodar a leitura do motor. | ✅ **DECIDIDO:** FASE 0 roda na **VPS** / `cd-evonexus-lab`, não do Windows local. Ver `DECISAO-001` §1. |
| — (proibição) | "Replicar o EvoNexus" | `CLAUDE.md` linha 33 / `RESTRUCTURE.md` §3.3 linha 98: **EvoNexus PROIBIDO** | **Aparente, reconciliável** (não era um bloqueio). A proibição é do **motor/produto** em prod; replicar o **paradigma NATIVO** é permitido (princípio 1). | ✅ **Confirmado, não viola.** EvoNexus = referência, nunca dependência em runtime. Nenhum binário/serviço EvoNexus entra em prod. |

**Regra de ouro:** o que entra em produção é stack CD pura (React+Vite+Supabase+Trigger.dev v4+`@anthropic-ai/sdk`+Bridge:3001). EvoNexus e `cd-evonexus-lab` são **fonte de estudo**, fora do runtime.

---

## 2. GROUND TRUTH — o que já existe na CD (não recriar, ESTENDER via ALTER)

Confirmado no schema real (`docs/deli-memory/recon/schema-inventory.md`, 2026-05-24) e nas migrations.

### 2.1 Tabela `agents` (peça de framework #1 — registro de agentes)
Schema real, após `20260512_003_create_agents.sql` + `20260603_004_agents_custom.sql`:

| Coluna | Tipo | Origem |
|--------|------|--------|
| `id` | text PK (slug) | base |
| `name`, `role`, `letter`, `color` | text | base |
| `category` | text CHECK (`orchestrator`\|`specialist`) | ALTER 005 |
| `default_modo` | text NOT NULL DEFAULT `hibrido` CHECK (`humano`\|`hibrido`\|`ia`) | ALTER 005 |
| `is_custom` | boolean DEFAULT false | ALTER 004 |
| `custom_prompt` | text | ALTER 004 |
| `custom_model` | text DEFAULT `claude-haiku-4-5-20251001` | ALTER 004 |
| `custom_max_tokens` | integer DEFAULT 4096 | ALTER 004 |
| `tenant_id` | uuid REFERENCES tenants(id) ON DELETE CASCADE (NULL = global) | ALTER 004 |

- **RLS já existe** (`agents_tenant_isolation`): global (`tenant_id IS NULL`) visível a todos; custom só ao tenant via `tenant_members`. → multi-tenant do registro **já resolvido**.
- 15 linhas seed (deli=orchestrator; breno/cora/lara/max/sofia/vera/analise-ifood/nova=specialist).
- ⚠️ **Inserir o agent ANTES de `logAgentRun`** (senão FK violation).

### 2.2 Outras tabelas a reusar (já no schema, definidas em `RESTRUCTURE.md` §6 Fase 2)
| Tabela | Estado | Papel no plano |
|--------|--------|----------------|
| `agent_runs` | 12 cols, **171 linhas** ✅ | Log unificado de execução (telas **Atividade** + **Custos**). Estender `logAgentRun` (`trigger/_shared/audit.ts`). |
| `tenant_agent_config` | 5 cols, 0 linhas (TD#42) | Config/modo por tenant+agente. Popular. |
| `tenant_agents` | 6 cols | Habilitação de agente por tenant. |
| `agent_memories` | 9 cols, 0 linhas | Peça #4 (memória por agente/tenant). Nunca populada — ativar. |
| `agent_drafts` | 19 cols, 0 linhas | Fluxo de aprovação (drafts) já existe. |
| `roles` / `role_permissions` / `user_roles` | 0 linhas (TD#50) | RBAC (tela **Papéis** = NATIVO). Schema existe, falta popular. |
| `audit_log` | ✅ | Tela **Auditoria** = NATIVO. Estender ações. |
| `customers` | **1168 linhas** | ⚠️ usar `customers`, **`clientes` não existe**. (`lojas` ≈1172 = lojas iFood, distinto.) |
| `tenants`, `tenant_members`, `lojas` (+filhas) | ✅ | Base do isolamento `tenant_id` → `tenant_members` → `lojas`. |
| `internal_channels` / `channel_messages` / `channel_members` | ✅ | Chat já validado — base da surface **Chat** por agente. |
| pgvector | extensão ativa | Tela **Conhecimento** (RAG) = NATIVO; e MemPalace → usar pgvector. |
| Storage bucket `public` (+policies) | ✅ | Base do **Workspace** (file browser) e **Links compartilhados**. |

---

## 3. AMBIENTE — Windows vs VPS (resolver antes da FASE 0)

O prompt assume caminhos Linux/VPS que **não existem nesta máquina** (Windows 11, cwd `c:\Users\Consult Delivery\consult-delivery`):

- `/root/consult-delivery` → aqui o repo está em `c:\Users\Consult Delivery\consult-delivery`.
- `/root/cd-evonexus-lab` (agentes/skills/KB extraídos) → **não acessível** deste Windows. Necessário rodar a FASE 0 na VPS (`187.127.25.24`) ou copiar o lab pra cá.
- Repo EvoNexus no GitHub (`evolution-foundation/evo-nexus.git`) → clonável, mas é estudo (proibido em runtime — ver D3).
- ⚠️ **Edit tool falha em match multi-linha por CRLF** → para edições programáticas use scripts `.cjs` (projeto é ESM, `"type":"module"`).
- `gh pr merge` local falha (worktree `main` travado em `cd-f3`) mas o merge ocorre no GitHub → verificar com `gh pr view N --json state,mergedAt`.

**Conclusão (✅ DECIDIDO 2026-06-03 — D3):** FASE 0 (ler código do EvoNexus) **roda na VPS** (`187.127.25.24`) / `cd-evonexus-lab` — não deste Windows. Ver `DECISAO-001` §1.

---

## 4. PRINCÍPIOS INQUEBRÁVEIS (do prompt + RESTRUCTURE.md — todos valem)

Do prompt-base:
1. **Re-implementar o paradigma, NÃO copiar o motor** do EvoNexus (licença + single-tenant). Estudar padrões, re-implementar nativo.
2. **Multi-tenant desde o dia 1.** `tenant_id` em cada agente, skill, rotina, memória, execução, arquivo. RLS isola A de B. UM motor serve N tenants.
3. **Fiel ao conjunto de features, adaptado ao stack.** Replicar a CAPACIDADE de cada tela no mecanismo CD; não copiar plumbing single-tenant.
4. **NADA pulado em silêncio.** Toda tela do checklist recebe status. No fim, cruzar build × checklist e listar o que ficou pra depois, com motivo, pro Wandson assinar.
5. **Output bruto vence resumo.** `ls`/`cat`/`git log` cru ao afirmar estado. Nunca "pronto" sem prova.
6. **Schema CD:** `ALTER ADD COLUMN IF NOT EXISTS` (nunca DROP), reusar funções, `customers` não `clientes`, Edge Functions de webhook `verify_jwt=false`, Trigger.dev `additionalFiles` pra `.md`, descriptions ASCII puro, secrets via Infisical.
7. **Pare nos CHECKPOINTS.** Wandson revisa cada um.

Reforçados por `RESTRUCTURE.md` §2 e `CLAUDE.md`: migrations versionadas (mostrar SQL + aprovação antes de aplicar), critério de aceite antes de codar, anti-alucinação (validar API/pacote em `node_modules`/docs), 1 teste manual + 1 automatizado mínimo, RBAC sempre, branch efêmera + PR (nunca commit em `main`), sem n8n/EvoNexus-motor/OpenClaw-novo/Lovable/Vercel/OpenSpec.

---

## 5. CHECKLIST MESTRE — TODO O FEATURE SURFACE (contrato de completude, verbatim)

> Categorias: **CORE** (paradigma, fiel, prioridade) · **NATIVO** (CD já tem, usar o da CD) · **ADAPTA** (mesma capacidade, mecanismo CD) · **DEPOIS** (v2+).
> Nota: onde o prompt diz "Claude Agent SDK" / "Trigger.dev v3", aplicar D1/D2 da seção 1 (`@anthropic-ai/sdk` / Trigger.dev v4).

### PRINCIPAL
| Tela | EvoNexus faz | Cat | Alvo CD + nota multi-tenant |
|------|--------------|-----|------------------------------|
| Visão geral | Dashboard: rotinas exec, custo, nº agentes, integrações, recent reports, quick actions | CORE | Dashboard React por tenant; métricas scoped `tenant_id` |

### OPERAÇÕES
| Tela | EvoNexus faz | Cat | Alvo CD + nota multi-tenant |
|------|--------------|-----|------------------------------|
| Agentes | Catálogo de 39 agentes (16 business/22 eng/1 custom), cards com slug/role, Oracle "START HERE" | CORE | Tabela `agents` (estender ALTER) + markdown; registro scoped `tenant_id`; catálogo por tenant |
| Oracle | Entrevista, mapeia dores→capacidades, gera plano em fases, aciona/cria agentes | CORE | Orquestrador (Node/Trigger.dev) sobre o runtime IA; recebe `tenant_id`; é o centro |
| Habilidades (Skills) | 193 skills / 29 categorias (ai, create, cs, data, db, dev, fin, hr, int, knowledge, mkt, ops, pm, prod, sage, social, etc) | CORE | Registro de skills + módulos; globais vs por-tenant; invocáveis pelo agente |
| Rotinas | 11 rotinas cron (backup, brain-*, eod, morning, weekly, memory, memory-lint), performance/custo | ADAPTA | Trigger.dev v4 (cron), não "make run"; métricas por tenant |
| Tarefas | One-off scheduled actions (pending/running/completed/failed) | ADAPTA | Trigger.dev one-off; scoped tenant |
| Gatilhos (Triggers) | Webhook & event-based reactive triggers | ADAPTA | Edge Functions (webhook, `verify_jwt=false`) + Trigger.dev events; scoped tenant |
| Heartbeats | Agentes proativos (wake/decide/act/sleep), sync de YAML | ADAPTA | Trigger.dev scheduled + prompt de decisão; scoped tenant |
| Atividade | Log de execução unificado (routines/heartbeats/triggers), filtros data/status | CORE | Tabela de runs (estender `logAgentRun`); log scoped tenant |
| Metas | Hierarquia Mission→Project→Goal→Task, status/due | CORE | Tabelas goals; hierarquia scoped tenant |
| Tópicos (Tickets) | Work queue: title/status/priority/assignee, export CSV | CORE | Tabela tickets; fila scoped tenant |
| Modelos (Templates) | Templates reusáveis (dev-*.md, morning-briefing.html, weekly-review.html, end-of-day-log.md) | CORE | Tabela/Storage de templates; globais + por-tenant |

### DADOS
| Tela | EvoNexus faz | Cat | Alvo CD + nota multi-tenant |
|------|--------------|-----|------------------------------|
| Workspace | Explorador de arquivos (ADWs, delivery, development); novo/upload | CORE | Supabase Storage browser; bucket/prefixo por `tenant_id` |
| Links compartilhados | Links públicos com expiração + contagem de views | CORE | Storage signed URLs + tabela shares (expiry, views); scoped tenant |
| Memória | Memória persistente: 14 global (ifood-kb/*) + 5 agentes c/ memória | CORE | Tabelas memory (global + por-agente) por `tenant_id`; portar a KB iFood |
| MemPalace | Busca semântica local (indexa code/docs) | DEPOIS | Usar pgvector (abaixo) em vez de indexador local |
| Conhecimento | Base pgvector multi-conexão (RAG) | NATIVO | Já tem pgvector no Supabase; RAG scoped tenant |
| Custos | Análise de custo IA por dia/agente/rotina/heartbeat | CORE | Custo por run via `logAgentRun`; agregação por tenant |

### SISTEMA
| Tela | EvoNexus faz | Cat | Alvo CD + nota multi-tenant |
|------|--------------|-----|------------------------------|
| Configurações | Workspace/Rotinas/Notificações/Confiança/Referência | ADAPTA | Settings por tenant (nome, fuso, idioma, trustMode) |
| Sistemas | Registro de apps externos (URLs) | DEPOIS | Tabela simples de links por tenant |
| Provedores | 8 provedores IA (Anthropic nativo ATIVO, OpenRouter, OpenAI, etc) | ADAPTA | CD = `@anthropic-ai/sdk` nativo; tela de provider opcional/baixa prio |
| Integrações | 15 core (Omie, Bling, Stripe, Asaas, Todoist, Fathom...) + GitHub Brain Repo | ADAPTA | Catálogo de conectores; CD foca Asaas/Evolution; credenciais por tenant no Infisical |
| MCP Servers | Registrados no ~/.claude.json do CLI | DEPOIS | MCP no contexto do runtime IA; tela depois |
| Serviços | Background services (Scheduler, Dashboard React+Flask) + Canais (Telegram/Discord/iMessage) + 6 rotinas | ADAPTA | Trigger.dev gere agendamento; Canal = Evolution/WhatsApp (não iMessage/Discord) |
| Backups | Local ZIP / S3 / Brain Repo (git auto-versionado memória+workspace) | ADAPTA | Supabase backups + export; opcional git mirror por tenant |
| Plugins | Instalados + Marketplace (plugins comunidade/oficiais) | DEPOIS | v2+; sistema de extensão próprio |

### ADMIN
| Tela | EvoNexus faz | Cat | Alvo CD + nota multi-tenant |
|------|--------------|-----|------------------------------|
| Usuários | User management (email, role, status, last login) | NATIVO | Supabase Auth; CD já tem; multi-tenant via `tenant_members` |
| Papéis | RBAC: admin/operator/viewer, perms resource.action (51/30/18 perms) | NATIVO | CD já tem 7 papéis + `role_permissions`(resource,action); usar o da CD |
| Auditoria | Audit log (share_create, share_view, login, setup_completed, chat_settings_updated): when/user/action/resource/detail/ip | NATIVO | CD já tem `audit_log`; estender ações; scoped tenant |
| Docs | Documentação | DEPOIS | Docs da plataforma CD |

### POR AGENTE (surfaces de interação)
| Surface | EvoNexus faz | Cat | Alvo CD + nota multi-tenant |
|---------|--------------|-----|------------------------------|
| Chat | Conversa com o agente (acesso a workspace tools) | CORE | Componente chat React (já tem chat ao vivo); chama orquestrador c/ `tenant_id` |
| Terminal | Claude Code embutido (CLI v2.1.119) no /workspace | DEPOIS | Surface de dev/operador; cliente usa Chat; Wandson opera via Claude Code |
| Sessions / Profile / Memory (do agente) | Histórico, perfil, memória do agente | CORE | Por agente, scoped tenant |
| Login / Auth | Login multi-usuário (single-workspace) | NATIVO | Supabase Auth + RBAC multi-tenant (MELHOR que o deles) |
| create-agent / create-skill / create-routine / create-goal / create-ticket / create-heartbeat / create-integration | Skills que geram novos recursos guiando o usuário | CORE | Fluxos "create-*" nativos: geram registro + markdown por tenant. É a DX que o Wandson quer. |

---

## 6. A CAMADA DE FRAMEWORK (5 peças, multi-tenant, sobre o stack CD)

Sem elas o runtime IA parece "trabalhoso"; com elas, criar agente = markdown.

1. **Registro de agentes** — `agents` + markdown, scoped `tenant_id`. Schema atual já tem `id`(slug)/`name`/`role`/`letter`/`color`/`category`/`default_modo`/`is_custom`/`custom_*`/`tenant_id` + RLS (ver §2.1) → **confirmar e estender só se faltar campo.** Inserir agent antes de `logAgentRun` (FK).
2. **Sistema de skills** — registro + módulos reutilizáveis; globais vs por-tenant. (Tabela `skills` nova — ALTER/CREATE no CHECKPOINT 2.)
3. **Orquestrador (Oracle da CD)** — recebe `tenant_id`, carrega agente, monta contexto (memória+skills do tenant), executa via runtime IA (`@anthropic-ai/sdk` — ver D1), loga run+custo em `agent_runs`.
4. **Memória por tenant** — global + por-agente + por-loja (Supabase + Storage + pgvector). Reusar `agent_memories` (0 linhas, ativar). Portar a KB iFood de `cd-evonexus-lab`.
5. **Fluxo create-*** — endpoints/UI que geram agente/skill/rotina/meta/ticket por tenant.

---

## 7. FASES (cada uma trava num 🛑 CHECKPOINT — Wandson revisa)

**FASE 0 — Inventário técnico (read-only).** Ler código do EvoNexus (oracle, orquestrador, skills, memória, heartbeats, dashboard); para cada item do checklist, confirmar COMO o EvoNexus implementa. Listar o código CD existente (o que já atende o quê). Saída: `docs/evonexus-replica/inventario-tecnico.md` com output bruto. **⚠️ Depende do lab/VPS (ver §3).** 🛑 CHECKPOINT 0.

**FASE 1 — Mapeamento.** Para CADA linha do checklist, confirmar/ajustar categoria + alvo CD + nota multi-tenant. Nenhuma linha sem destino. 🛑 CHECKPOINT 1.

**FASE 2 — Desenho do framework + schema.** As 5 peças detalhadas + migrations (ALTER only) + contratos (tabelas novas, endpoints do orquestrador, formato do markdown de agente, modelo multi-tenant com RLS). 🛑 CHECKPOINT 2 (mostrar SQL antes de aplicar).

**FASE 3 — Plano faseado + checklist de completude.** Tabela rastreando CADA tela → status (qual fase / pulada+motivo) + critério de validado. CORE primeiro, depois ADAPTA, DEPOIS por último; NATIVO = só wiring. 🛑 CHECKPOINT 3.

**FASE 4 — Build incremental.** Uma feature por vez, na ordem. Migrations ALTER (backup antes). Testar com `tenant_id` real provando isolamento (A não vê B). Output bruto. Ao final: **verificação de completude** — cruzar build × checklist, listar o que ficou pra depois com motivo, pedir sign-off do Wandson.

---

## 8. RASTREADOR DE CHECKPOINTS

| Checkpoint | Gate | Status |
|------------|------|--------|
| Plano persistido | Este doc + ponteiro no CLAUDE.md | ✅ feito (2026-06-02) |
| Decisão D1/D2/D3 | Runtime + multi-provider + ambiente FASE 0 (`DECISAO-001`) | ✅ DECIDIDO (2026-06-03) |
| 🛑 CHECKPOINT 0 | Inventário técnico (FASE 0 na VPS) + sign-off | ⏳ FASE 0 ainda não rodada |
| 🛑 CHECKPOINT 1 | Mapeamento do checklist | — |
| 🛑 CHECKPOINT 2 | Schema + migrations (mostrar SQL) | — |
| 🛑 CHECKPOINT 3 | Plano faseado + checklist completude | — |
| FASE 4 | Build incremental + sign-off final | — |

---

## 9. FORMATO DE TRABALHO
PT-BR, direto, sem yes-man. Output bruto ao afirmar estado. Pare nos checkpoints. Nada de tela pulada em silêncio — a CHECKLIST MESTRE (§5) é o contrato de completude. Não pedir confirmação em ações normais (commit/push/merge/deploy); pedir só nos CHECKPOINTS e antes de aplicar migration.

---

## 10. PROMPT-BASE ORIGINAL (verbatim, para rastreabilidade)

> Capturado da sessão 2026-06-02. ASCII puro como no original. Referências a `/root/...`, "Claude Agent SDK", "Trigger.dev v3" ficam **subordinadas** às resoluções da seção 1 e 3.

```
# PROMPT-BASE COMPLETO — Replicar o EvoNexus na plataforma Consult Delivery (nativo, multi-tenant)

> Cole numa sessao Claude Code rodando no VSCode com acesso a: (a) repo da plataforma Consult Delivery (CONFIRME o caminho certo antes — provavelmente `/root/consult-delivery`), (b) `/root/cd-evonexus-lab` (agentes/skills/KB ja extraidos do EvoNexus), (c) repo EvoNexus no GitHub para estudo (`https://github.com/evolution-foundation/evo-nexus.git`).

## CONTEXTO
Consult Delivery (Wandson, CEO, acompanha pelo VSCode). Objetivo: replicar a EXPERIENCIA e o CONJUNTO DE FEATURES do EvoNexus DENTRO da plataforma propria da CD — nativo, multi-tenant, no stack da CD. O EvoNexus e o laboratorio: o que for validado la, migra pra CD. Por isso o conjunto de features precisa ser fiel.

O coracao do que ele quer: um Oracle (orquestrador) que ele chama e que aciona QUALQUER agente, cria QUALQUER agente, e o conjunto de funcoes de suporte: Habilidades, Rotinas, Tarefas, Gatilhos, Atividade, Metas, Topicos, Modelos, Workspace, Memoria.

Stack CD (alvo): React 18 + Vite + Tailwind (JSX) · Supabase (DB/Auth/RLS/Storage/Edge Functions Deno/pgvector) · Node/Express bridge :3001 · Claude Agent SDK nativo · Trigger.dev v3 · Evolution API (WhatsApp) · Asaas · Infisical. Multi-tenant: tenant_id + RLS via tenant_members->lojas. Tabelas existentes: tenants, customers, lojas (+10 filhas), roles, role_permissions, agents.

## PRINCIPIOS INQUEBRAVEIS
1. Re-implementar o paradigma, NAO copiar o motor do EvoNexus (licenca + single-tenant). Estudar padroes, re-implementar nativo. Agentes/skills/KB em /root/cd-evonexus-lab sao do Wandson -> portar.
2. Multi-tenant desde o dia 1. tenant_id em cada agente, skill, rotina, memoria, execucao, arquivo. RLS isola tenant A de B. UM motor (Agent SDK) serve N tenants. (No EvoNexus tudo e um workspace unico — isso e o que MUDA.)
3. Fiel ao conjunto de features, adaptado ao stack. Replicar a CAPACIDADE de cada tela, no mecanismo da CD. Nao copiar plumbing single-tenant que estaria errado em multi-tenant.
4. NADA pulado em silencio. Toda tela do checklist mestre abaixo recebe um status. Ao final, cruzar o build contra o checklist e listar o que ficou pra depois, com motivo, pro Wandson assinar.
5. Output bruto vence resumo. ls/cat/git log cru ao afirmar estado. Nunca "pronto" sem prova.
6. Schema CD: ALTER ADD COLUMN IF NOT EXISTS (nunca DROP), reusar funcoes existentes, customers nao clientes, Edge Functions de webhook verify_jwt=false, Trigger.dev additionalFiles pra .md, descriptions ASCII puro, secrets via Infisical.
7. Pare nos CHECKPOINTS. Wandson revisa cada um no VSCode.

## CHECKLIST MESTRE — TODO O FEATURE SURFACE DO EVONEXUS
(ver tabelas reproduzidas na secao 5 deste doc — PRINCIPAL / OPERACOES / DADOS / SISTEMA / ADMIN / POR AGENTE)

## A CAMADA DE FRAMEWORK
(ver secao 6 — 5 pecas: registro de agentes / sistema de skills / orquestrador Oracle / memoria por tenant / fluxo create-*)

## FASES
FASE 0 — Inventario tecnico (read-only). Clone o repo EvoNexus e LEIA o codigo do oracle, orquestrador, sistema de skills, memoria, heartbeats, dashboard. Para cada item do checklist mestre, confirme COMO o EvoNexus implementa. Liste o codigo da plataforma CD existente. Saida: inventario-tecnico.md com output bruto. CHECKPOINT 0.
FASE 1 — Mapeamento. Para CADA linha do checklist mestre, confirme/ajuste a categoria e o alvo na CD, e a nota multi-tenant. Nenhuma linha sem destino. CHECKPOINT 1.
FASE 2 — Desenho do framework + schema. As 5 pecas detalhadas + migrations (ALTER only) + contratos. CHECKPOINT 2 (antes de aplicar migration).
FASE 3 — Plano faseado + checklist de completude. Tabela rastreando CADA tela -> status + criterio de validado. As CORE primeiro, depois ADAPTA, DEPOIS por ultimo; NATIVO = so wiring. CHECKPOINT 3.
FASE 4 — Build incremental. Uma feature por vez, na ordem. Migrations ALTER (backup antes). Teste com tenant_id real provando isolamento (A nao ve B). Output bruto. Ao final: verificacao de completude.

## FORMATO
PT-BR, direto, sem yes-man. Output bruto ao afirmar estado. Pare nos checkpoints. Nada de tela pulada em silencio — o checklist mestre acima e o contrato de completude.

Coloque tudo no cloude.md para nao esquecer na hora de executar O codigo e para nao pular nada
```
