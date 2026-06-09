# 🗺️ PLANO-MESTRE — Consult Delivery (Mapa Vivo)

> **Versão 2** (2026-06-06) — fusão do `PLANO-MESTRE.md` (EvoNexus-replica, 2026-06-02) com o `PLANO-MESTRE-mapa-vivo.md` (versão-semente, 2026-06-06). Doc autoritativo do projeto: `RESTRUCTURE.md` (raiz) — em divergência, RESTRUCTURE.md vence.

---

## 0. Como usar este documento

- **Fonte única da verdade.** Toda sessão (chat ou Claude Code) **lê isto PRIMEIRO** e **atualiza por ÚLTIMO**.
- Nunca apagar item concluído — marca `[x]` e mantém o histórico.
- Status só vira ✅ **com evidência** (commit hash, output bruto, teste). Sem evidência = `(memória·confirmar)`.
- Se uma sessão de IA propuser algo, ela diz **em qual track/item** entra — pra você nunca perder o fio.

**Legenda:** ✅ feito · 🔄 em andamento · ⏳ pendente · 🔒 bloqueado · 👉 próximo · ⚠️ risco/atenção

---

## 👉 PRÓXIMA AÇÃO (retomar aqui)

1. **T3 — Wandson revisa o mapa de telas v0** (`WikiBrain/wiki/T3 — Mapa de Telas (Console Interno).md`) → Cowork constrói o **protótipo clicável** das 14 telas do MVP (React, dados fake). (Track T3)
2. **FASE 2 onda 2** — Cowork redige, Wandson aprova SQL, Cowork aplica (D5 v2): P-2 cutover `logAgentRun` + `agent_runs.tenant_id SET NOT NULL` · P-3 contract `user_agent_access` · P-4 `tenant_agent_config` · P-5 aposentar 3 grants órfãos de ex-membros · limpar 5 tenants seed. (Tracks T2 + T5 + T8)
3. **5.5** — consolidar docs de plano redundantes. (Track T2)

---

## 📌 Fatos canônicos (corrigem valores antigos em circulação)

- **Empresa:** Parauapebas-PA *(não Imperatriz-MA)*.
- **Equipe humana = 1 pessoa: Wandson.** Os agentes IA cobrem as demais funções da empresa. Wélida saiu (jun/2026); Eduardo saiu (jun/2026); Yasmin saiu (mai/2026 — branch `yasmin/dev` pode ser deletada).
- **VPS:** `187.127.25.24` *(a antiga `45.39.210.183` não é mais usada)*.
- **Supabase:** ref `czyanilrverorwenikqw` · tenant `consult` = `9079bd4d-4df7-4023-90fb-d79c8ba7e900`.
- **Engine de agente:** `@anthropic-ai/sdk` via **Messages API** *(não OpenClaw/Agent SDK como motor)*.
- **Trigger.dev:** v4 cloud · `proj_slexhoelcjwgbopmbzzr`.
- **Repo:** `deli-consult-delivery/consult-delivery` (privado) · **Domínio:** `app.consultdelivery.com.br`.

---

## 🔒 Decisões travadas (não rediscutir sem motivo novo)

- [x] Replicar o **paradigma** do EvoNexus, **não copiar o motor**.
- [x] Agente nativo via **Messages API** + tools de domínio + enforcement na nossa camada (RBAC), não no frontmatter.
- [x] **Recusa permanente:** OAuth-de-assinatura (circumvenção). Provedores só via API key.
- [x] **Hermes** = copiloto pessoal do CEO + referência MIT. **NÃO** é o motor da plataforma (seria mono-tenant).
- [x] **FASE 1:** escopo do *mapa* = tudo (CORE + operacional + ADAPTA). *Implementação* fatiada: CORE → operacional → ADAPTA.
- [x] Tabelas que a CD já tem: re-desenhar o schema-**alvo** onde precisa, via **migração não-destrutiva** (expand/contract). **Nunca DROP em produção.**
- [x] Toda mudança de schema = **migration versionada** em Git.
- [x] **DELI** = nome travado do orquestrador; título **COO digital** ✅ travado 2026-06-06 (RESTRUCTURE.md alinhado). Copy: usar **"oferta"**, nunca "promoção".
- [x] **D1 (runtime):** `@anthropic-ai/sdk` (não Agent SDK — não roda em Trigger.dev cloud) + camada multi-provider (Anthropic/Ollama/OpenRouter, BYO-key por tenant via Infisical). ✅ 2026-06-03 — ver `docs/evonexus-replica/DECISAO-001-runtime-provider-custo.md`.
- [x] **D2 (Trigger.dev):** v4 (`npx trigger.dev@4.4.6 deploy`), não v3. ✅ 2026-06-03.
- [x] **D3 (ambiente FASE 0):** FASE 0 roda na **VPS** (`187.127.25.24`) / `cd-evonexus-lab`, não do Windows. ✅ 2026-06-03.
- [x] **D4 (fork A vs B em `agents`): B** — catálogo global + habilitação por tenant via `tenant_agents`/`tenant_agent_config`. ✅ 2026-06-06 — evidência em `docs/evonexus-replica/FASE-1-mapeamento-multitenant.md` §3.1. **Cabeado em produção na onda 1 (2026-06-06).**
- [x] **D6 (direcionamento SaaS, aprovada pelo Wandson em 2026-06-07):** F1 = "Defesa Comercial iFood — modo copiloto" a R$147/loja/mês · carteira intocada · gate D+90 · anti-dispersão. Doc: `docs/estrategia/DIRECIONAMENTO-SAAS-2026-06.md` + `F1-BUILD-PLAN.md`. **F1 entregue (PR1–PR7) em 2026-06-07.** ⚠️ **REABERTA pelo Wandson em 2026-06-07** (mesmo dia, pós-entrega da F1): partir para a plataforma completa sem aguardar o gate D+90 — decisão consciente do fundador, alertado sobre a colisão com a regra anti-dispersão. Detalhe no Tracker (`WikiBrain/wiki/PLANO-MESTRE — Tracker.md`).
- [x] **D5 v2 (mandato Cowork, alterada pelo Wandson em 2026-06-06):** Cowork executa direto tudo que conseguir — incluindo **merge de PRs** e **aplicar migrations cujo SQL foi aprovado pelo Wandson** (sempre: SQL versionado antes · 1 arquivo por vez · validação com output bruto · parar no 1º erro · teste de isolamento quando tocar RLS). **Reservado ao Wandson:** aprovar o SQL antes da aplicação · `DROP`/destrutivo · mensagens a clientes (drafts) · reabrir decisões travadas / 🛑 CHECKPOINTS · credenciais e VPS. (v1 em 2026-06-06: tudo exceto merge/aplicação; v2 no mesmo dia liberou ambos.)

---

## 🧱 Regras duras (disciplina de execução)

- Output **bruto** sempre (SQL/JSON/commit) — resumo confiante não substitui evidência.
- Nunca confiar em "está pronto" sem validar com output real.
- Antes de mexer em branch da VPS: `git log` + `diff origin` (branches divergem de origin).
- Smoke test via endpoint HTTP, nunca INSERT SQL direto.
- Doc autoritativo / DB / código **vence** memória — e a divergência é registrada.
- **Edit tool falha em match multi-linha por CRLF** → para edições programáticas usar scripts `.cjs`.
- `gh pr merge` local pode falhar (worktree `main` travado) → verificar com `gh pr view N --json state,mergedAt`.
- **Não reusar branch que já entrou em main por squash** — gera conflito fantasma (caso #155). Branch nova por entrega.
- **Migration aplicada = 1 arquivo por vez + validação + teste de isolamento (RLS)** — padrão da onda 1.

---

## T1 — Plataforma CD (V1 → V3)

**V1 (~95%)** `(memória·confirmar contra repo)`
- [x] 1A–1F concluídas `(memória·confirmar)`
- [x] 1G — AgentsPage real + Notificações `(memória·confirmar)`
- [ ] 🔄 1E — DELI Realtime: finalizar triggers

**V2 (jun–jul/2026)**
- [ ] ⏳ Custom fields, automations, dashboards, CRM
- [ ] ⏳ Ativar SOFIA / LARA / CORA

**V3 (ago/2026+)**
- [ ] ⏳ Onboarding self-service, billing, white-label, marketplace de agentes

---

## T2 — EvoNexus-replica (multi-tenant)

### Status das fases

| Checkpoint | Gate | Status |
|------------|------|--------|
| Plano persistido | Este doc + ponteiro no CLAUDE.md | ✅ feito (2026-06-02) |
| Decisão D1/D2/D3 | Runtime + multi-provider + ambiente FASE 0 (`DECISAO-001`) | ✅ DECIDIDO (2026-06-03) |
| 🛑 CHECKPOINT 0 | Inventário técnico (FASE 0 na VPS) + sign-off | ✅ FASE 0 merged em main (#156) |
| 🛑 CHECKPOINT 1 | Mapeamento do checklist | ✅ GO dado (2026-06-06) — FASE 1 merged (#152; B decidido) |
| 🛑 CHECKPOINT 2 | Schema + migrations (SQL aprovado antes de aplicar) | ✅ **onda 1 APLICADA** (2026-06-06): SQL aprovado pelo Wandson (#161) → aplicada pelo Cowork (D5 v2) → validações 15/0/0 + isolamento (intruso 0/0/0). Ondas seguintes reabrem o gate. |
| 🛑 CHECKPOINT 3 | Plano faseado + checklist de completude | — |
| FASE 4 | Build incremental + sign-off final | — |

### Próximos itens

- [x] FASE 0 ✅ (#156) · FASE 1 ✅ (#152) · CHECKPOINTs 0–1 ✅
- [x] **FASE 2 onda 1 ✅ APLICADA** (2026-06-06): `tenant_agents` populado (15) · 4 brechas RLS corrigidas · backfill 383 runs · `user_agent_access` expandida (P-1 `main`→`deli`). Migrations `20260607_001..005` + `docs/evonexus-replica/FASE-2-onda1-plano.md`.
- [ ] 👉 **FASE 2 onda 2** — P-2 cutover `logAgentRun` + NOT NULL · P-3 contract `user_agent_access` · P-4 `tenant_agent_config` · P-5 grants órfãos · tenants seed
- [ ] ⏳ FASE 2 — desenho das 5 peças do framework + tabelas novas (skills, goals, tickets, templates, shares)

### Ground truth — o que já existe na CD (estender, não recriar)

Confirmado no schema real, nas migrations e na extração ao vivo (2026-06-06 pós-onda-1: `agents` 15 · `agent_runs` 1686 todos com tenant · `tenant_agents` 15 · `lojas` 1173 · `customers` 1169).

**Tabela `agents`:** id text PK (slug) · `tenant_id` nullable (NULL = global) · RLS pós-onda-1: `agents_select_gated` (custom do tenant OU habilitado via `tenant_agents`) + escrita só admin/custom. Catálogo global gerido por migrations/service_role. ⚠️ Inserir o agent ANTES de `logAgentRun` (FK).

**Outras tabelas a reusar:**

| Tabela | Estado | Papel |
|--------|--------|-------|
| `agent_runs` | 1686 linhas, 100% com tenant ✅ | Log unificado (Atividade + Custos) |
| `tenant_agents` | **15 linhas ✅ (cabeada onda 1)** | Habilitação por tenant (D4/B) |
| `tenant_agent_config` | 0 linhas (P-4 onda 2) | Config/modo por tenant+agente |
| `agent_memories` | 0 linhas, `tenant_id NOT NULL` ✅ | Memória por agente/tenant — ativar |
| `agent_drafts` | 19 cols, 0 linhas | Fluxo de aprovação já existe |
| `roles` / `role_permissions` / `user_roles` | 9 / 112 / 4 | RBAC parcial |
| `user_agent_access` | 7 linhas, `tenant_id`+`agent_id` FK ✅ (contract na onda 2) | Acesso por usuário+agente |
| `audit_log` | ✅ | Auditoria — estender ações |
| `customers` | 1169 · só `customers_member_all` ✅ | ⚠️ usar `customers`, `clientes` não existe |
| `tenants`, `tenant_members`, `lojas` (+filhas) | ✅ | Base do isolamento |
| pgvector · Storage `public` · `internal_channels` | ✅ | RAG · Workspace · Chat |

### Checklist Mestre — feature surface completo

> Mapeamento completo linha a linha: `docs/evonexus-replica/FASE-1-mapeamento-multitenant.md` §2.1 + `FASE-0-inventario-evonexus.md` §6. (Tabela detalhada nas versões ≤ v2.4 deste doc — histórico git — e nos docs da FASE 0/1; removida daqui para evitar tripla manutenção.)

Resumo de categorias: **CORE** dashboard/agentes/oracle→DELI/skills/atividade/metas/tickets/templates/workspace/links/memória/custos/chat/create-* · **NATIVO** auth/RBAC/auditoria/pgvector · **ADAPTA** rotinas/tarefas/gatilhos/heartbeats/config/provedores/integrações/serviços/backups · **DEPOIS** MemPalace/MCP/terminal/plugins/docs/sistemas.

### Camada de Framework (5 peças, multi-tenant)

1. **Registro de agentes** — `agents` + `tenant_agents` ✅ cabeado (onda 1).
2. **Sistema de skills** — tabela `skills` nova (CHECKPOINT 2 / onda futura).
3. **Orquestrador (Oracle da CD)** — recebe `tenant_id`, carrega agente, monta contexto, executa via `@anthropic-ai/sdk`, loga em `agent_runs`.
4. **Memória por tenant** — reusar `agent_memories` (NOT NULL ✅); portar KB iFood.
5. **Fluxo create-*** — endpoints/UI por tenant.

### Fases detalhadas

- **FASE 0** ✅ MERGED (#156). **CHECKPOINT 0 ✅.**
- **FASE 1** ✅ MERGED (#152). **CHECKPOINT 1 ✅ go 2026-06-06.**
- **FASE 2** — 🔄 **onda 1 ✅ APLICADA** (segurança + cabear B). Próximas ondas: contract/cutover (onda 2) → tabelas novas do framework. **🛑 CHECKPOINT 2 reabre por onda** (SQL aprovado antes de aplicar).
- **FASE 3** — plano faseado + checklist de completude. **🛑 CHECKPOINT 3.**
- **FASE 4** — build incremental; isolamento A-não-vê-B com tenant real; sign-off final.

---

## T3 — Visão Visual-First do MVP (telas novas)

- [x] **(a) Mapa de telas** — v0 em main (32 telas, MVP = 14) — 👉 aguarda revisão do Wandson
- [ ] ⏳ **(b) Protótipo clicável** (React, dados fake) — Cowork constrói após revisão do mapa
- [ ] ⏳ Travar inventário de telas + fluxos → só então código/DB
- [x] **Série LEVA ✅ (sessão 30, 2026-06-09):** todas as telas de referência do Console v2 saíram do mock e leem do Supabase. LEVA 1 (CRM/customers) · LEVA 2 (`tenant_provedores`/`tenant_sistemas`/`crm_notas`, migration `20260609_003`) · LEVA 3 (`tenant_integracoes`, migration `20260609_004` aplicada + RLS E2E membro=4/não-membro=0 + seed 4 reais, PR #275 `f2dde20`). Padrão: tabela `tenant_id NOT NULL` + RLS SELECT-only via `is_member_of`, escrita por service_role (equipe CD), zero segredo no banco.

---

## T4 — Hermes (copiloto CEO)

- [x] **3A — instalar isolado na VPS** ✅ (kimi-k2.6 · Docker · Telegram allowlist Wandson)
- [ ] ⏳ **3B — acesso à CD via admin MCP** — bloqueado por: 🔒 GATE 0 rotação (Wandson) · [x] ✅ **admin MCP desenhado** (`docs/infra/admin-mcp-design.md` — `ceo_agent` escopado, read amplo + write só propõe-e-aprova via drafts, auditado) · [x] ✅ **runbook do Wandson** consolidado (`docs/infra/RUNBOOK-WANDSON.md` — ordem GATE 0 → `claudedev` → decisão+`ok` SQL `ceo_agent`) · ⏳ gateway root→usuário dedicado (Wandson) · 🛑 decisão: `ceo_agent` vê todos os tenants ou só pagantes. **Não fecha sem GATE 0.**

---

## T5 — Segurança / GATE 0

- [x] fail2ban ✅ · SSH key-only ✅ · Deploy key dedicada ✅
- [x] **4 brechas RLS corrigidas EM PRODUÇÃO (onda 1, 2026-06-06):** `customers_auth_all` · `user_agent_access_manage_admin` sem escopo · `agents_read_all` · escrita em agents globais por membro. Isolamento provado por impersonação (intruso = 0/0/0).
- [ ] ⏳ **Rotação de credenciais** (adiado): 4 PATs GitHub · `DASHBOARD_API_TOKEN` · token Telegram · limpar cópias na VPS
- [ ] ⏳ Hardening: gateway root→usuário · remover `claude-debug` key · fail2ban `bantime.increment`

---

## T6 — Agentes IA

**Produção** `(confirmar status atual)`
- [x] BomDia · Encerramento · chat ao vivo
- [ ] 🔄 DELI (orquestrador) · [ ] CORA — confirmar · [ ] Analista iFood / loja-gpt — confirmar

**MIA:** spec completa (`docs/mia/MIA-PLANO-COMPLETO.md`) · ⏳ implementação
**Planejados:** LARA (spec feita) · SOFIA (ICP definido) · BRENO off-hours · MAX · VERA

---

## T7 — Feature PILOTO

- [x] Ondas 01+02 merged · [x] ✅ **Onda 03 (Loja-GPT) EM PROD desde 2026-05-22** (verificado 2026-06-09: tabelas `loja_gpt_conversations`/`loja_gpt_messages`, 9 conv/16 msg; task `loja-gpt-responder`; 5 endpoints Bridge; `TabIaEspecialista`; ver `docs/piloto/PILOTO-03-LOJA-GPT.md`) · [ ] 🔄 Onda 04 (WhatsApp + Loom) — **iniciada**: [x] Tarefa 7 ✅ parser `parseRespostaCliente` em prod no `main` (`c5f3afc`, 18 testes verdes, verificado 2026-06-09); resto bloqueado por Wandson (Evolution + cliente real + migrations gated) → `docs/infra/RUNBOOK-WANDSON.md`

---

## T8 — Infra / CI-CD / Manutenção

- [ ] ⚠️ CI/CD: auto-deploy de `main` sobrescreve deploys manuais · [ ] ⚠️ Branches VPS divergem de origin
- [ ] ⏳ Limpar 5 tenants seed (entra na onda 2) · [ ] ⏳ `is_active` em `tenants` · [ ] ⏳ Deletar `yasmin/dev`
- [ ] ⏳ **Onboardar primeiro cliente real** (PRIORIDADE de negócio)

---

## T9 — Negócio (contexto, não-build)

- Roadmap 90 dias: **S1 Fundação · S2 Combustível · S3 Pivotagem**
- Metas: reduzir churn (~33% mensal) · migrar mix pró-automação IA · rumo a SaaS multi-tenant
- Tiers: Light R$500 · Performance R$500+12% · Enterprise R$1.200 · Automação IA: R$2.500 setup + R$1.500/mês

---

### Histórico de atualizações

- 2026-06-08 (v2.6) — **D6 gravada nas Decisões Travadas** (aprovada 2026-06-07 + **reaberta pelo Wandson 2026-06-07** pós-F1; detalhe no Tracker). Fecha pendência da sessão 11.
- 2026-06-06 (v2.5) — **FASE 2 onda 1 APLICADA** (SQL aprovado #161 → aplicada via D5 v2; validações + teste de isolamento). **D5 v2:** Wandson liberou merge + aplicação de migrations aprovadas pelo Cowork. Checklist mestre detalhado movido para os docs da FASE 0/1 (histórico git ≤ v2.4).
- 2026-06-06 (v2.4) — equipe = 1 pessoa; DELI = COO travado; CHECKPOINT 1 go.
- 2026-06-06 (v2.3) — #156 e #152 merged; #155/#157 → #158; regra "branch nova por entrega".
- 2026-06-06 (v2.2) — D5 v1 registrada.
- 2026-06-06 (v2.1) — FASE 0 publicada (#156); FASE 1 reconciliada (D4/B, `0f62ebb`).
- 2026-06-06 (v2) — fusão PLANO-MESTRE + mapa-vivo na raiz.
- 2026-06-03 — D1/D2/D3 decididos. · 2026-06-02 — plano persistido.
