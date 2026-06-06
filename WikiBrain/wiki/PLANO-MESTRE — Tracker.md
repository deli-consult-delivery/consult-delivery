# PLANO-MESTRE — Tracker de Sessões

> Fonte de verdade para handoff entre sessões.
> **Antes de trabalhar → leia este arquivo.**
> **Ao terminar → atualize as seções abaixo.**

---

## 🔓 Mandato Cowork (registrado 2026-06-06 — autorização do Wandson na sessão)

> "Você está autorizado por mim, a partir de agora, fazer por aqui mesmo tudo aquilo que você conseguir."

**Liberado sem pedir caso a caso:** ler repo/DB · criar branch · commitar · abrir/atualizar PRs e comentários via API · editar docs/código em branch · atualizar Tracker/PLANO-MESTRE · redigir planos e `.sql` de migration (sem aplicar).

**Continua reservado ao Wandson (protege produção — fora do mandato):**
- Merge em `main` (review humano)
- **Aplicar** migrations — SQL mostrado e aprovado antes; **NUNCA via MCP**
- `DROP`/destrutivo em produção (proibido sempre)
- Mensagens a clientes (fluxo drafts)
- Reabrir decisões travadas · 🛑 CHECKPOINTS de fase
- Credenciais/rotação · comandos na VPS

---

## 🔴 Onde parou

_Última sessão: 2026-06-06 (Cowork — sessão 5.2)_

- **5.2 fechado:** PR **#156** aberto (FASE 0 — a branch `wandson/evonexus-fase0` JÁ estava em origin; o registro anterior de "branch ausente" era fetch local falho no Windows). Reconciliação FASE 0 → FASE 1 commitada na branch do #152 (`0f62ebb`): Passo 0 preenchido a partir do doc da FASE 0, coluna "alvo EvoNexus" preenchida (§2.1), **decisão B registrada** com evidência dos dois lados (§3.1), pendências 1–2 do Passo 5 resolvidas, CHECKPOINT 1 atualizado para go/no-go da FASE 2.
- **Conector GitHub com escrita:** app "Claude Github MCP Connector" instalado + autorizado — Cowork agora cria branch, commita e abre PR via API sozinho (teste: branch `cowork/write-test`, pode deletar).
- **Mandato Cowork registrado** (seção acima + D5 no PLANO-MESTRE).
- 5.1 fechado na sessão anterior (commits `52bfa13` + `9ebf138` na branch do #155).
- **⚠️ Ainda trackeados indevidamente:** `WikiBrain/.obsidian/*` (6 arquivos) e `WikiBrain/log.md` — sugerido `git rm --cached` em commit futuro (aguarda ok).

---

## 👉 Próxima ação

1. **Wandson mergear, nesta ordem:** #155 (Tracker) · #156 (FASE 0) · #152 (FASE 1 reconciliada — depois do #156, pois referencia o doc da FASE 0).
2. **Go do CHECKPOINT 1 → 5.3 / FASE 2 onda 1:** Cowork redige plano + `.sql` versionados — 3 RLS permissivas (`customers_auth_all`, `user_agent_access_manage_admin`, `agents_read_all`), popular `tenant_agents` (tenant consult), `agent_memories.tenant_id SET NOT NULL`, backfill `agent_runs.tenant_id` (383 → consult), redesign `user_agent_access`. **Wandson aprova o SQL antes de aplicar; NUNCA via MCP.**
3. **5.4** — limpeza CLAUDE.md (Eduardo saiu, FASE 0 rodou, DELI COO/CEO alinhar) · **5.5** — consolidar docs de plano.
4. **T3** — Wandson revisa mapa de telas v0 → T3(b) protótipo clicável.

---

## 📊 Status por track

| Track | Nome | Status | Última ação |
|-------|------|--------|-------------|
| T1 | Plataforma CD (V1→V3) | 🔄 ~95% | 1A–1G concluídas; DELI Realtime pendente |
| T2 | EvoNexus-replica | ✅ FASE 0 (PR #156) + FASE 1 reconciliada (#152, B decidido) | Aguarda merges + go CHECKPOINT 1 → FASE 2 onda 1 |
| T3 | Visual-First / telas | 🔄 v0 em revisão | Mapa de telas v0 no repo+Obsidian; aguarda revisão → T3(b) protótipo |
| T4 | Hermes (copiloto CEO) | 🔄 3A ✅ / 3B bloqueado | kimi-k2.6 rodando; 3B aguarda GATE 0 |
| T5 | Segurança / GATE 0 | ⏳ rotação adiada | fail2ban + SSH key-only ✅; 3 RLS permissivas entram na FASE 2 onda 1 |
| T6 | Agentes IA | 🔄 BomDia/Encerramento/chat ✅ | DELI em andamento; LARA/SOFIA pendentes |
| T7 | Feature PILOTO | 🔄 Ondas 01+02 merged | Onda 03 migration rascunhada, não aplicada |
| T8 | Infra / CI-CD | ⚠️ 2 riscos ativos | CI/CD sobrescreve; VPS branches divergem; stop-hook tsc falso-erro |
| T9 | Negócio | contexto | Primeiro cliente real = PRIORIDADE |

---

## 📋 Log de sessões

### 2026-06-06 (sessão 3 — Cowork, 5.2)
- Conector GitHub reautorizado com **escrita** (install + authorize do app "Claude Github MCP Connector"); teste ok (branch `cowork/write-test`)
- Correção de registro: branch `wandson/evonexus-fase0` JÁ estava em origin (fetch local Windows tinha falhado silenciosamente)
- **PR #156 aberto** — FASE 0 (inventário técnico EvoNexus, rodado na VPS)
- **Reconciliação FASE 0 → FASE 1** (`0f62ebb` na branch do #152): Passo 0 preenchido, §2.1 alvo EvoNexus, **decisão B registrada** com evidência dos dois lados, CHECKPOINT 1 → go/no-go FASE 2
- PLANO-MESTRE.md atualizado (B como D4 nas decisões travadas, checkpoints T2, próxima ação)
- **Mandato Cowork registrado** (autorização do Wandson; seção no topo deste Tracker + D5 no PLANO-MESTRE)

### 2026-06-06 (sessão 2 — Cowork assume via handoff)
- Cowork leu Tracker + PLANO-MESTRE + verificou PRs na fonte (GitHub) e branch local
- **5.1 fechado:** `.gitignore` un-ignora `WikiBrain/wiki/` (commit `52bfa13`, pushed por Wandson — git do sandbox sem escrita em `.git/`)
- Divergências registradas: Tracker atrasado vs handoff (FASE 1 rodou, #152) · `.obsidian/*` + `log.md` trackeados indevidamente
- Tracker atualizado com estado verificado (commit `9ebf138`)

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
