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

1. **FASE 1 / lado CD** — rodar Passos 1–4 na instância Claude Code, com a trava: todo count/DDL no doc vem com **output bruto colado**. (Track T2)
2. **Visual-first / Mapa de telas** — primeira entrega da nova track de design (ver as telas antes de codar). (Track T3)
3. **Sessão VPS** — FASE 0 (inventário EvoNexus em `/root/cd-evonexus-lab`) + rotação de credenciais do GATE 0. (Tracks T2 + T5)

---

## 📌 Fatos canônicos (corrigem valores antigos em circulação)

- **Empresa:** Parauapebas-PA *(não Imperatriz-MA)*.
- **Equipe:** Wandson + Wélida (2 pessoas). Eduardo saiu (jun/2026); Yasmin saiu (mai/2026 — branch `yasmin/dev` pode ser deletada).
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
- [x] **DELI** = nome travado do orquestrador. Copy: usar **"oferta"**, nunca "promoção".
- [x] **D1 (runtime):** `@anthropic-ai/sdk` (não Agent SDK — não roda em Trigger.dev cloud) + camada multi-provider (Anthropic/Ollama/OpenRouter, BYO-key por tenant via Infisical). ✅ 2026-06-03 — ver `docs/evonexus-replica/DECISAO-001-runtime-provider-custo.md`.
- [x] **D2 (Trigger.dev):** v4 (`npx trigger.dev@4.4.6 deploy`), não v3. ✅ 2026-06-03.
- [x] **D3 (ambiente FASE 0):** FASE 0 roda na **VPS** (`187.127.25.24`) / `cd-evonexus-lab`, não do Windows. ✅ 2026-06-03.

---

## 🧱 Regras duras (disciplina de execução)

- Output **bruto** sempre (SQL/JSON/commit) — resumo confiante não substitui evidência.
- Nunca confiar em "está pronto" sem validar com output real.
- Antes de mexer em branch da VPS: `git log` + `diff origin` (branches divergem de origin).
- Smoke test via endpoint HTTP, nunca INSERT SQL direto.
- Doc autoritativo / DB / código **vence** memória — e a divergência é registrada.
- **Edit tool falha em match multi-linha por CRLF** → para edições programáticas usar scripts `.cjs`.
- `gh pr merge` local pode falhar (worktree `main` travado) → verificar com `gh pr view N --json state,mergedAt`.

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
| 🛑 CHECKPOINT 0 | Inventário técnico (FASE 0 na VPS) + sign-off | ⏳ FASE 0 ainda não rodada |
| 🛑 CHECKPOINT 1 | Mapeamento do checklist | — |
| 🛑 CHECKPOINT 2 | Schema + migrations (mostrar SQL antes de aplicar) | — |
| 🛑 CHECKPOINT 3 | Plano faseado + checklist de completude | — |
| FASE 4 | Build incremental + sign-off final | — |

### Próximos itens

- [x] CHECKPOINT 0 — reconciliação analítica (convergência das leituras) ✅
- [ ] ⏳ Commitar a versão atualizada do CHECKPOINT 0 (3 adjudicações) — via Claude Code
- [ ] 🔒 **FASE 0** — inventário EvoNexus: bloqueado fora da VPS (`/root/cd-evonexus-lab`)
- [ ] 🔄 **FASE 1 — mapeamento multi-tenant**
  - [x] Lado CD (Passos 1–4): ✅ rodado — PR #152 aberto (`docs/evonexus-replica/FASE-1-mapeamento-multitenant.md`, 371 linhas, output bruto colado)
  - [ ] 👉 Lado EvoNexus (Passo 0): pendente sessão VPS — sem preencher de memória
  - Branch: `wandson/evonexus-fase1-mapeamento` → PR (sem merge automático)
- [ ] ⏳ FASE 2 — migrations versionadas (só depois do go no CHECKPOINT 1)

### Ground truth — o que já existe na CD (estender, não recriar)

Confirmado no schema real (`docs/deli-memory/recon/schema-inventory.md`, 2026-05-24) e nas migrations.

**Tabela `agents`** (após `20260512_003_create_agents.sql` + `20260603_004_agents_custom.sql`):

| Coluna | Tipo | Origem |
|--------|------|--------|
| `id` | text PK (slug) | base |
| `name`, `role`, `letter`, `color` | text | base |
| `category` | text CHECK (`orchestrator`\|`specialist`) | ALTER 005 |
| `default_modo` | text NOT NULL DEFAULT `hibrido` | ALTER 005 |
| `is_custom` | boolean DEFAULT false | ALTER 004 |
| `custom_prompt`, `custom_model`, `custom_max_tokens` | text/int | ALTER 004 |
| `tenant_id` | uuid REFERENCES tenants(id) (NULL = global) | ALTER 004 |

RLS `agents_tenant_isolation`: global visível a todos; custom só ao tenant via `tenant_members`. Multi-tenant do registro **já resolvido**. ⚠️ Inserir o agent ANTES de `logAgentRun` (FK).

**Outras tabelas a reusar:**

| Tabela | Estado | Papel |
|--------|--------|-------|
| `agent_runs` | 12 cols, 171 linhas ✅ | Log unificado de execução (Atividade + Custos) |
| `tenant_agent_config` | 5 cols, 0 linhas (TD#42) | Config/modo por tenant+agente |
| `tenant_agents` | 6 cols | Habilitação de agente por tenant |
| `agent_memories` | 9 cols, 0 linhas | Memória por agente/tenant — ativar |
| `agent_drafts` | 19 cols, 0 linhas | Fluxo de aprovação já existe |
| `roles` / `role_permissions` / `user_roles` | 0 linhas (TD#50) | RBAC — schema existe, falta popular |
| `audit_log` | ✅ | Auditoria — estender ações |
| `customers` | 1168 linhas | ⚠️ usar `customers`, **`clientes` não existe** |
| `tenants`, `tenant_members`, `lojas` (+filhas) | ✅ | Base do isolamento multi-tenant |
| `internal_channels` / `channel_messages` | ✅ | Chat por agente |
| pgvector | extensão ativa | RAG (Conhecimento) e MemPalace |
| Storage bucket `public` | ✅ | Workspace (file browser) + Links compartilhados |

### Checklist Mestre — feature surface completo

> **CORE** = paradigma, fiel, prioridade · **NATIVO** = CD já tem, usar o da CD · **ADAPTA** = mesma capacidade, mecanismo CD · **DEPOIS** = v2+

#### PRINCIPAL
| Tela | EvoNexus faz | Cat | Alvo CD |
|------|--------------|-----|---------|
| Visão geral | Dashboard: rotinas exec, custo, nº agentes, integrações, recent reports | CORE | Dashboard React por tenant; métricas scoped `tenant_id` |

#### OPERAÇÕES
| Tela | EvoNexus faz | Cat | Alvo CD |
|------|--------------|-----|---------|
| Agentes | Catálogo 39 agentes, cards slug/role, Oracle "START HERE" | CORE | Tabela `agents` + markdown; registro scoped `tenant_id` |
| Oracle | Entrevista, mapeia dores→capacidades, gera plano, aciona agentes | CORE | Orquestrador Trigger.dev sobre `@anthropic-ai/sdk`; recebe `tenant_id` |
| Habilidades (Skills) | 193 skills / 29 categorias | CORE | Registro de skills + módulos; globais vs por-tenant |
| Rotinas | 11 rotinas cron (backup, brain-*, eod, morning, weekly, memory) | ADAPTA | Trigger.dev v4 cron; métricas por tenant |
| Tarefas | One-off scheduled actions (pending/running/completed/failed) | ADAPTA | Trigger.dev one-off; scoped tenant |
| Gatilhos (Triggers) | Webhook & event-based reactive triggers | ADAPTA | Edge Functions (`verify_jwt=false`) + Trigger.dev events |
| Heartbeats | Agentes proativos (wake/decide/act/sleep) | ADAPTA | Trigger.dev scheduled + prompt de decisão; scoped tenant |
| Atividade | Log de execução unificado, filtros data/status | CORE | Estender `logAgentRun`; log scoped tenant |
| Metas | Hierarquia Mission→Project→Goal→Task, status/due | CORE | Tabelas goals; hierarquia scoped tenant |
| Tópicos (Tickets) | Work queue: title/status/priority/assignee, export CSV | CORE | Tabela tickets; fila scoped tenant |
| Modelos (Templates) | Templates reusáveis (dev-*.md, morning-briefing.html, etc) | CORE | Tabela/Storage de templates; globais + por-tenant |

#### DADOS
| Tela | EvoNexus faz | Cat | Alvo CD |
|------|--------------|-----|---------|
| Workspace | Explorador de arquivos; novo/upload | CORE | Supabase Storage browser; bucket/prefixo por `tenant_id` |
| Links compartilhados | Links públicos com expiração + views | CORE | Storage signed URLs + tabela shares; scoped tenant |
| Memória | 14 global (ifood-kb/*) + 5 agentes c/ memória | CORE | Tabelas memory global + por-agente por `tenant_id`; portar KB iFood |
| MemPalace | Busca semântica local (indexa code/docs) | DEPOIS | Usar pgvector |
| Conhecimento | Base pgvector multi-conexão (RAG) | NATIVO | pgvector já no Supabase; RAG scoped tenant |
| Custos | Análise de custo IA por dia/agente/rotina/heartbeat | CORE | Custo por run via `logAgentRun`; agregação por tenant |

#### SISTEMA
| Tela | EvoNexus faz | Cat | Alvo CD |
|------|--------------|-----|---------|
| Configurações | Workspace/Rotinas/Notificações/Confiança/Referência | ADAPTA | Settings por tenant (nome, fuso, idioma, trustMode) |
| Sistemas | Registro de apps externos (URLs) | DEPOIS | Tabela simples de links por tenant |
| Provedores | 8 provedores IA (Anthropic nativo ATIVO, OpenRouter, OpenAI, etc) | ADAPTA | CD = `@anthropic-ai/sdk` nativo; tela de provider opcional/baixa prio |
| Integrações | 15 core (Omie, Bling, Stripe, Asaas, Todoist, Fathom...) | ADAPTA | Catálogo de conectores; CD foca Asaas/Evolution; credenciais por tenant no Infisical |
| MCP Servers | Registrados no ~/.claude.json | DEPOIS | MCP no contexto do runtime IA; tela depois |
| Serviços | Background services + Canais (Telegram/Discord/iMessage) | ADAPTA | Trigger.dev gere agendamento; Canal = Evolution/WhatsApp |
| Backups | Local ZIP / S3 / Brain Repo | ADAPTA | Supabase backups + export; opcional git mirror por tenant |
| Plugins | Instalados + Marketplace | DEPOIS | v2+; sistema de extensão próprio |

#### ADMIN
| Tela | EvoNexus faz | Cat | Alvo CD |
|------|--------------|-----|---------|
| Usuários | User management (email, role, status, last login) | NATIVO | Supabase Auth; multi-tenant via `tenant_members` |
| Papéis | RBAC: admin/operator/viewer, 51/30/18 perms | NATIVO | CD já tem 7 papéis + `role_permissions`; usar o da CD |
| Auditoria | Audit log (share_create, login, etc): when/user/action/resource/detail/ip | NATIVO | CD já tem `audit_log`; estender ações; scoped tenant |
| Docs | Documentação | DEPOIS | Docs da plataforma CD |

#### POR AGENTE
| Surface | EvoNexus faz | Cat | Alvo CD |
|---------|--------------|-----|---------|
| Chat | Conversa com o agente (acesso a workspace tools) | CORE | Componente chat React (já tem chat ao vivo); chama orquestrador c/ `tenant_id` |
| Terminal | Claude Code embutido no /workspace | DEPOIS | Surface de dev/operador; Wandson opera via Claude Code |
| Sessions / Profile / Memory | Histórico, perfil, memória do agente | CORE | Por agente, scoped tenant |
| Login / Auth | Login multi-usuário | NATIVO | Supabase Auth + RBAC multi-tenant (melhor que o deles) |
| create-agent / create-skill / create-routine / create-goal / create-ticket / create-heartbeat / create-integration | Skills que geram novos recursos guiando o usuário | CORE | Fluxos "create-*" nativos: geram registro + markdown por tenant |

### Camada de Framework (5 peças, multi-tenant)

1. **Registro de agentes** — `agents` + markdown, scoped `tenant_id`. Schema atual já resolvido (ver Ground truth §acima). Estender só se faltar campo.
2. **Sistema de skills** — registro + módulos reutilizáveis; globais vs por-tenant. (Tabela `skills` nova — ALTER/CREATE no CHECKPOINT 2.)
3. **Orquestrador (Oracle da CD)** — recebe `tenant_id`, carrega agente, monta contexto (memória+skills do tenant), executa via `@anthropic-ai/sdk`, loga run+custo em `agent_runs`.
4. **Memória por tenant** — global + por-agente + por-loja (Supabase + Storage + pgvector). Reusar `agent_memories` (0 linhas, ativar). Portar KB iFood de `cd-evonexus-lab`.
5. **Fluxo create-*** — endpoints/UI que geram agente/skill/rotina/meta/ticket por tenant.

### Fases detalhadas

- **FASE 0** — Inventário técnico (read-only). Ler código do EvoNexus (oracle, orquestrador, skills, memória, heartbeats, dashboard). Para cada item do checklist, confirmar COMO o EvoNexus implementa. Listar código CD existente. Saída: `docs/evonexus-replica/inventario-tecnico.md` com output bruto. ⚠️ Depende da VPS (D3). **🛑 CHECKPOINT 0.**
- **FASE 1** — Mapeamento. Para CADA linha do checklist, confirmar/ajustar categoria + alvo CD + nota multi-tenant. Nenhuma linha sem destino. **🛑 CHECKPOINT 1.**
- **FASE 2** — Desenho do framework + schema. As 5 peças detalhadas + migrations (ALTER only) + contratos. **🛑 CHECKPOINT 2** (mostrar SQL antes de aplicar).
- **FASE 3** — Plano faseado + checklist de completude. Tabela rastreando CADA tela → status + critério de validado. CORE primeiro, ADAPTA depois, DEPOIS por último; NATIVO = só wiring. **🛑 CHECKPOINT 3.**
- **FASE 4** — Build incremental. Uma feature por vez, na ordem. Migrations ALTER (backup antes). Testar com `tenant_id` real provando isolamento (A não vê B). Output bruto. Ao final: verificação de completude — cruzar build × checklist, listar o que ficou pra depois com motivo, pedir sign-off do Wandson.

---

## T3 — Visão Visual-First do MVP (telas novas)

> A track que você pediu: ver/ajustar as telas **antes** de codar ou mexer no banco.

- [ ] ⏳ **(a) Mapa de telas** — cada tela, função, elementos-chave, fluxo entre telas
- [ ] ⏳ **(b) Protótipo clicável** (React, dados fake, sem backend) — navegar, mudar cor/botão/layout, aprovar
- [ ] ⏳ Travar inventário de telas + fluxos — só então parte pra código/DB

---

## T4 — Hermes (copiloto CEO)

- [x] **3A — instalar isolado na VPS** ✅
  - [x] Gateway + Telegram, allowlist só Wandson (`8745522380`)
  - [x] Modelo confirmado: `kimi-k2.6` via Ollama Cloud (teste 47×18=846 ✅)
  - [x] Terminal backend = Docker (isolamento na VPS compartilhada)
- [ ] ⏳ **3B — acesso à CD via admin MCP** — bloqueado por:
  - [ ] 🔒 GATE 0 rotação de credenciais (ver T5)
  - [ ] ⏳ Desenhar o admin MCP (principal `ceo_agent` escopado + tools de leitura + escrita propõe-e-aprova)
  - [ ] ⏳ Gateway de root → usuário dedicado

---

## T5 — Segurança / GATE 0

- [x] fail2ban ativo (jail sshd) ✅
- [x] SSH key-only (`PasswordAuthentication no`) ✅
- [x] Deploy key SSH dedicada — PAT fora do caminho do git ✅
- [ ] ⏳ **Rotação de credenciais** (adiado):
  - [ ] Revogar 4 PATs GitHub (deli-agent-vps, Nexus, claude-code, Claude IA)
  - [ ] Rotacionar `DASHBOARD_API_TOKEN` (EvoNexus)
  - [ ] Rotacionar token Telegram (BotFather)
  - [ ] Limpar cópias em texto na VPS (`.git-credentials`, history, `.claude/*.jsonl`)
- [ ] ⏳ Hardening: gateway root → usuário dedicado · remover `claude-debug` key · fail2ban `bantime.increment`

---

## T6 — Agentes IA

**Produção** `(confirmar status atual)`
- [x] BomDia · Encerramento · chat ao vivo
- [ ] 🔄 DELI (orquestrador)
- [ ] CORA (cobrança) — confirmar status
- [ ] Analista iFood / loja-gpt — confirmar status

**MIA — Monitor IA de Conversas**
- [x] Spec completa (`docs/mia/MIA-PLANO-COMPLETO.md`)
- [ ] ⏳ Implementação (batch 15min via Trigger.dev, aprovação humana via `sugestoes_ia`)

**Planejados**
- [ ] ⏳ LARA (CRM/drip 90 dias) — spec feita, não implementada
- [ ] ⏳ SOFIA (prospecção) — ICP definido, scrapers Apify aprovados, não implementada
- [ ] ⏳ BRENO (atendimento off-hours) · MAX · VERA

---

## T7 — Feature PILOTO

- [x] Onda 01 (Fundação) + Onda 02 (Pipeline de Tarefas) — merged
- [ ] 🔄 Onda 03 (Loja-GPT) — migration SQL rascunhada, **não aplicada**
- [ ] ⏳ Onda 04 (WhatsApp + Loom) — não iniciada

---

## T8 — Infra / CI-CD / Manutenção

- [ ] ⚠️ CI/CD: auto-deploy no push de `main` sobrescreve deploys manuais de feature branch — fix arquitetural pendente
- [ ] ⚠️ Branches da VPS divergem de origin (commits diretos sem push) — backup em `backup/vps-bomdia-encerramento-2026-05-22`
- [ ] ⏳ Limpar 5 tenants seed (pizza-joao, burger, acai, sushi, tapioca)
- [ ] ⏳ Adicionar `is_active` na tabela `tenants`
- [ ] ⏳ Deletar branch `yasmin/dev`
- [ ] ⏳ **Onboardar primeiro cliente real** (PRIORIDADE de negócio)

---

## T9 — Negócio (contexto, não-build)

- Roadmap 90 dias: **S1 Fundação · S2 Combustível · S3 Pivotagem**
- Metas: reduzir churn (~33% mensal) · migrar mix pró-automação IA (alto valor) · rumo a SaaS multi-tenant
- Tiers consultoria: Light R$500 · Performance R$500+12% · Enterprise R$1.200 · Automação IA: R$2.500 setup + R$1.500/mês

---

### Histórico de atualizações

- 2026-06-06 (v2) — fusão PLANO-MESTRE.md (EvoNexus-replica) + mapa-vivo; arquivo movido para raiz; antigo `docs/evonexus-replica/PLANO-MESTRE.md` tombstonado.
- 2026-06-06 (v1-semente) — mapa-vivo criado; Hermes 3A fechado com evidência; FASE 1 lado CD aprovada pra executar.
- 2026-06-03 — D1/D2/D3 decididos (`DECISAO-001-runtime-provider-custo.md`).
- 2026-06-02 — plano persistido (prompt-base verbatim preservado em `docs/evonexus-replica/PLANO-MESTRE-legado.md`).
