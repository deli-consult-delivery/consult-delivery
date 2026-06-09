# 🗺️ PLANO-MESTRE — Consult Delivery (Mapa Vivo)

> **Versão-semente** (2026-06-06). Reconciliar com o `PLANO-MESTRE.md` que já existe no repo — pode haver itens/seções que eu não enxergo daqui. Itens marcados `(memória·confirmar)` precisam ser validados contra repo/DB **antes** de virar ✅.

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
2. **Visual-first / Mapa de telas** — primeira entrega da nova track de design (a que você pediu: ver as telas antes de codar). (Track T3)
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

---

## 🧱 Regras duras (disciplina de execução)

- Output **bruto** sempre (SQL/JSON/commit) — resumo confiante não substitui evidência.
- Nunca confiar em "está pronto" sem validar com output real.
- Antes de mexer em branch da VPS: `git log` + `diff origin` (branches divergem de origin).
- Smoke test via endpoint HTTP, nunca INSERT SQL direto.
- Doc autoritativo / DB / código **vence** memória — e a divergência é registrada.

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

- [x] CHECKPOINT 0 — reconciliação analítica (convergência das leituras) ✅
- [ ] ⏳ Commitar a versão atualizada do CHECKPOINT 0 (3 adjudicações) — via Claude Code
- [ ] 🔒 **FASE 0** — inventário EvoNexus: bloqueado fora da VPS (`/root/cd-evonexus-lab`)
- [ ] 🔄 **FASE 1 — mapeamento multi-tenant**
  - [ ] Lado CD (Passos 1–4): aprovado pra executar, com trava de output bruto
  - [ ] 👉 Lado EvoNexus (Passo 0): pendente sessão VPS — sem preencher de memória
  - Branch: `wandson/evonexus-fase1-mapeamento` → PR (sem merge automático)
- [ ] ⏳ FASE 2 — migrations versionadas (só depois do go no CHECKPOINT 1)

---

## T3 — Visão Visual-First do MVP (telas novas) 🆕

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
  - [x] ✅ Desenhar o admin MCP (principal `ceo_agent` escopado + tools de leitura + escrita propõe-e-aprova) — `docs/infra/admin-mcp-design.md` (sessão 30, 2026-06-09)
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
- [x] ✅ Onda 03 (Loja-GPT) — **em prod desde 2026-05-22** (`loja_gpt_conversations`/`loja_gpt_messages`, 9 conv/16 msg verificadas em 2026-06-09). O "não aplicada" era stale.
- [ ] 🔄 Onda 04 (WhatsApp + Loom) — **iniciada**: Tarefa 7 ✅ parser `parseRespostaCliente` em prod no `main` (`c5f3afc`, 18 testes verdes, verificado 2026-06-09). Resto bloqueado por Wandson (Evolution + cliente real + migrations gated) → runbook em `docs/infra/RUNBOOK-WANDSON.md`.

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
- 2026-06-06 — versão-semente criada; Hermes 3A fechado com evidência; FASE 1 lado CD aprovada pra executar.
