# PLANO-MESTRE — Tracker de Sessões

> Fonte de verdade para handoff entre sessões.
> **Antes de trabalhar → leia este arquivo.**
> **Ao terminar → atualize as seções abaixo.**

---

## 🔴 Onde parou

_Última sessão: 2026-06-06 (Cowork — handoff assumido)_

- **5.1 fechado:** `.gitignore` agora un-ignora `WikiBrain/wiki/` explicitamente (commit `52bfa13`, pushed na branch do #155). Tracker + T3 já estavam versionados na branch (force-add anterior) — #155 pronto pra merge.
- **Estado verificado na fonte (GitHub + repo local):** PR #152 (FASE 1 lado CD, doc 371 linhas) ABERTO · #154 merged · #155 aberto · #136 e #129 abertos (fixes bot, fora do plano-mestre).
- **FASE 1 lado CD RODOU** (PR #152) — corrige registro anterior deste Tracker que dizia "ainda não rodada".
- **⚠️ Branch `wandson/evonexus-fase0` NÃO está em origin** (nem local Windows). Se FASE 0 rodou, o output vive só na VPS — push pro origin é pré-requisito do PR da FASE 0 (item 5.2).
- **⚠️ Trackeados indevidamente:** `WikiBrain/.obsidian/*` (6 arquivos, incl. `workspace.json` que o próprio gitignore manda ignorar) e `WikiBrain/log.md` — sugerido `git rm --cached` em commit futuro (não feito, aguarda ok).
- Limites do Cowork registrados: GitHub MCP read-only (403 em escrita) · sandbox sem escrita em `.git/` → Cowork edita arquivos e lê tudo; commit/push são do Wandson.

---

## 👉 Próxima ação

1. **Mergear #155** (Tracker versionado) — Wandson.
2. **Push da branch `wandson/evonexus-fase0` da VPS pro origin** — Wandson (pré-requisito do 5.2 completo).
3. **5.2 — Reconciliar FASE 0 → FASE 1:** abrir PR da FASE 0; atualizar `FASE-1-mapeamento-multitenant.md` (coluna "alvo EvoNexus" + registrar decisão **B** como travada, com evidência dos dois lados). Parte da decisão B dá pra fazer antes do push da VPS.
4. **5.3 — FASE 2 onda 1:** plano de migrations (3 RLS permissivas, popular `tenant_agents`, `agent_memories.tenant_id NOT NULL`, backfill `agent_runs.tenant_id`, redesign `user_agent_access`) — Cowork redige SQL, Wandson aprova, NUNCA aplicar via MCP.
5. **5.4 — Limpeza CLAUDE.md** (Eduardo saiu, FASE 0 rodou, DELI COO/CEO) · **5.5 — consolidar docs de plano**.

---

## 📊 Status por track

| Track | Nome | Status | Última ação |
|-------|------|--------|-------------|
| T1 | Plataforma CD (V1→V3) | 🔄 ~95% | 1A–1G concluídas; DELI Realtime pendente |
| T2 | EvoNexus-replica | 🔄 FASE 1 lado CD ✅ (PR #152) | FASE 0 rodada (VPS, branch a subir); próximo: reconciliar 0→1, FASE 2 |
| T3 | Visual-First / telas | 🔄 v0 em revisão | Mapa de telas v0 no repo+Obsidian; aguarda revisão → T3(b) protótipo |
| T4 | Hermes (copiloto CEO) | 🔄 3A ✅ / 3B bloqueado | kimi-k2.6 rodando; 3B aguarda GATE 0 |
| T5 | Segurança / GATE 0 | ⏳ rotação adiada | fail2ban + SSH key-only ✅; 3 RLS permissivas confirmadas (must-fix pré 2º tenant) |
| T6 | Agentes IA | 🔄 BomDia/Encerramento/chat ✅ | DELI em andamento; LARA/SOFIA pendentes |
| T7 | Feature PILOTO | 🔄 Ondas 01+02 merged | Onda 03 migration rascunhada, não aplicada |
| T8 | Infra / CI-CD | ⚠️ 2 riscos ativos | CI/CD sobrescreve; VPS branches divergem; stop-hook tsc falso-erro |
| T9 | Negócio | contexto | Primeiro cliente real = PRIORIDADE |

---

## 📋 Log de sessões

### 2026-06-06 (sessão 2 — Cowork assume via handoff)
- Cowork leu Tracker + PLANO-MESTRE + verificou PRs na fonte (GitHub) e branch local
- **5.1 fechado:** `.gitignore` un-ignora `WikiBrain/wiki/` (commit `52bfa13`, pushed por Wandson — git do sandbox sem escrita em `.git/`)
- Divergências registradas: Tracker atrasado vs handoff (FASE 1 rodou, #152) · branch `evonexus-fase0` ausente de origin · `.obsidian/*` + `log.md` trackeados indevidamente · GitHub MCP read-only
- Tracker atualizado com estado verificado; próxima: merge #155 + push fase0 (Wandson) → 5.2

### 2026-06-06
- Criou `PLANO-MESTRE.md` raiz (fusão PLANO-MESTRE.md + mapa-vivo.md)
- PR #154 → merged em main
- Hermes 3A fechado com evidência (kimi-k2.6 ✅, Docker ✅, Telegram ✅)
- FASE 1 lado CD aprovada para executar
- **T3 v0:** mapa de telas (console interno) movido de Downloads → `WikiBrain/wiki/T3 — Mapa de Telas (Console Interno).md` (repo + Obsidian). 32 telas inventariadas, shortlist MVP = 14. Próximo: revisão do Wandson → T3(b) protótipo clicável.

---

## 🧱 Regra de atualização (para a sessão de IA)

Ao iniciar qualquer trabalho ligado ao PLANO-MESTRE:
1. Leia este arquivo inteiro
2. Leia `PLANO-MESTRE.md` (raiz do repo) para detalhes
3. Execute o trabalho
4. Ao terminar, volte aqui e:
   - Atualize **"Onde parou"** com data e o que foi feito
   - Atualize **"Próxima ação"** com o passo concreto seguinte
   - Atualize a linha da track afetada em **"Status por track"**
   - Append uma entrada em **"Log de sessões"**
5. Atualize também o `PLANO-MESTRE.md` (marque `[x]`, ajuste status)
6. Commit ambos os arquivos no mesmo PR
