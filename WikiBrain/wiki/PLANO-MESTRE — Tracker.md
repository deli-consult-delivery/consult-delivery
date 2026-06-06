# PLANO-MESTRE — Tracker de Sessões

> Fonte de verdade para handoff entre sessões.
> **Antes de trabalhar → leia este arquivo.**
> **Ao terminar → atualize as seções abaixo.**

---

## 🔓 Mandato Cowork (registrado 2026-06-06 — autorização do Wandson na sessão)

> "Você está autorizado por mim, a partir de agora, fazer por aqui mesmo tudo aquilo que você conseguir."

**Liberado sem pedir caso a caso:** ler repo/DB · criar branch · commitar · abrir/atualizar PRs e comentários via API · editar docs/código em branch · atualizar Tracker/PLANO-MESTRE · redigir planos e `.sql` de migration (sem aplicar).

**Continua reservado ao Wandson (protege produção — fora do mandato):**
- Merge em `main` (review humano; merge pontual com aprovação explícita dele na conversa = ok)
- **Aplicar** migrations — SQL mostrado e aprovado antes; **NUNCA via MCP**
- `DROP`/destrutivo em produção (proibido sempre)
- Mensagens a clientes (fluxo drafts)
- Reabrir decisões travadas · 🛑 CHECKPOINTS de fase
- Credenciais/rotação · comandos na VPS

---

## 🔴 Onde parou

_Última sessão: 2026-06-06 (Cowork — sessão 5.2 + merges)_

- **Merged em main (aprovação explícita do Wandson na conversa):** #156 (FASE 0, `de81b88`), #152 (FASE 1 reconciliada, `893e97e`) e #158 (Tracker/protocolo/T3/fatos, `aa79035`).
- **#155 tinha conflito** (branch reusada carregava commits já squashados em main via #150/#151/#154) → reconstruído como #158; #155 e #157 fechados.
- **Decisão B (D4) e mandato Cowork (D5) registrados.**
- Windows sincronizado: branch `trabalho` = main (`aa79035`); `cowork/write-test` deletada. ⚠️ `main` local é presa pelo worktree `cd-f3`; existe branch local falsa chamada `origin/main` (deletar: `git branch -D "origin/main"`).
- **⚠️ Ainda trackeados indevidamente:** `WikiBrain/.obsidian/*` e `WikiBrain/log.md` — aguarda ok do Wandson p/ remoção do índice.

---

## 👉 Próxima ação

1. **Go do CHECKPOINT 1 → 5.3 / FASE 2 onda 1:** Cowork redige plano + `.sql` versionados — 3 RLS permissivas, popular `tenant_agents`, `agent_memories.tenant_id SET NOT NULL`, backfill `agent_runs.tenant_id` (383), redesign `user_agent_access`. **Wandson aprova o SQL antes de aplicar; NUNCA via MCP.**
2. **5.5** — consolidar docs de plano redundantes (`docs/evonexus-replica/PLANO-MESTRE-mapa-vivo.md` etc).
3. **T3** — Wandson revisa mapa de telas v0 → T3(b) protótipo clicável.
4. Decisão pendente: DELI “COO” vs “CEO” digital (1 commit quando decidir).

---

## 📊 Status por track

| Track | Nome | Status | Última ação |
|-------|------|--------|-------------|
| T1 | Plataforma CD (V1→V3) | 🔄 ~95% | 1A–1G concluídas; DELI Realtime pendente |
| T2 | EvoNexus-replica | ✅ FASE 0 + FASE 1 **merged em main** | CHECKPOINT 1 aguarda go → FASE 2 onda 1 |
| T3 | Visual-First / telas | 🔄 v0 em revisão | Mapa de telas v0 em main; aguarda revisão → T3(b) protótipo |
| T4 | Hermes (copiloto CEO) | 🔄 3A ✅ / 3B bloqueado | kimi-k2.6 rodando; 3B aguarda GATE 0 |
| T5 | Segurança / GATE 0 | ⏳ rotação adiada | fail2ban + SSH key-only ✅; 3 RLS permissivas entram na FASE 2 onda 1 |
| T6 | Agentes IA | 🔄 BomDia/Encerramento/chat ✅ | DELI em andamento; LARA/SOFIA pendentes |
| T7 | Feature PILOTO | 🔄 Ondas 01+02 merged | Onda 03 migration rascunhada, não aplicada |
| T8 | Infra / CI-CD | ⚠️ 2 riscos ativos | CI/CD sobrescreve; VPS branches divergem; stop-hook tsc falso-erro |
| T9 | Negócio | contexto | Primeiro cliente real = PRIORIDADE |

---

## 📋 Log de sessões

### 2026-06-06 (sessão 3 — Cowork, 5.2 + merges + mandato)
- Conector GitHub reautorizado com **escrita**; teste ok
- **PR #156 aberto e merged** (`de81b88`) · **#152 reconciliado (`0f62ebb`) e merged** (`893e97e`) · **#158 merged** (`aa79035`) — merges com aprovação explícita do Wandson
- Decisão **B registrada (D4)**; **mandato Cowork registrado (D5)**
- #155 com conflito (reuso de branch vs squash) → reconstruído em #158; #157 absorvido; regra nova: branch nova por entrega
- 5.4 executada: CLAUDE.md corrigido (Eduardo saiu, FASE 0/1 rodadas, D4/D5)
- Windows sincronizado na branch `trabalho` (= main)
- **Nota — validação externa:** post “Harness Engineering” (@leandro.zuck) analisado a pedido do Wandson. Conclusão: descreve exatamente o que T2/T3 já constroem — observabilidade de runs/custo (`agent_runs` → telas S-10/S-26), orquestração paralela (DELI + Trigger.dev), tools com limites (RBAC + drafts + semáforo), branches isoladas, eficiência de tokens (Graphify + modelo por tarefa). **Sem ação nova; sem ferramenta externa.** Reforça a prioridade da sequência FASE 2 → T3(b). Hábito adotado: sessões de IA paralelas sempre em branches próprias.

### 2026-06-06 (sessão 2 — Cowork assume via handoff)
- **5.1 fechado:** `.gitignore` un-ignora `WikiBrain/wiki/` (commit `52bfa13`)
- Divergências registradas: Tracker atrasado vs handoff · `.obsidian/*` + `log.md` trackeados indevidamente
- Tracker atualizado com estado verificado (commit `9ebf138`)

### 2026-06-06
- Criou `PLANO-MESTRE.md` raiz (fusão PLANO-MESTRE.md + mapa-vivo.md)
- PR #154 → merged em main
- Hermes 3A fechado com evidência (kimi-k2.6 ✅, Docker ✅, Telegram ✅)
- **T3 v0:** mapa de telas (console interno) — 32 telas, shortlist MVP = 14

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
