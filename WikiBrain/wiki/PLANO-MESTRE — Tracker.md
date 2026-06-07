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

_Última sessão: 2026-06-06 (Cowork — sessão 4: fatos + FASE 2 onda 1)_

- **Fatos atualizados (#160 merged, `544a697`):** equipe humana = 1 pessoa (Wandson; Wélida saiu jun/2026) · **DELI = COO digital travado** (RESTRUCTURE.md v1.2 alinhado, 5 menções).
- **CHECKPOINT 1 ✅ go dado pelo Wandson** → 5.3 executada: **PR #161** com 5 migrations da onda 1 + `docs/evonexus-replica/FASE-2-onda1-plano.md` (evidência ao vivo). **NADA aplicado ao banco.**
- **🛑 CHECKPOINT 2 ABERTO:** Wandson revisa o SQL do #161 → aprova → mergeia → aplica manualmente (SQL Editor, ordem 001→005) → validações + smoke test.
- **Achados da verificação ao vivo:** brecha EXTRA em `agents_tenant_isolation` (membro podia ESCREVER agente global — corrigida na 002) · `user_agent_access` tem slugs órfãos (`analista-ifood`→mapeado p/ `analise-ifood`; `main`→**pendência P-1**) · `agent_runs` = 1684 · funções `is_member_of`/`is_admin_of` confirmadas SECURITY DEFINER.
- **⚠️ Ainda trackeados indevidamente:** `WikiBrain/.obsidian/*` e `WikiBrain/log.md` — aguarda ok.

---

## 👉 Próxima ação

1. **Wandson — 🛑 CHECKPOINT 2:** revisar os 5 `.sql` do **PR #161** → aprovar/mergear → **aplicar manualmente** na ordem 001→005 (Supabase SQL Editor; nunca MCP) → rodar validações de cada arquivo + smoke test (painel agentes = 15, chat abre, runs NULL = 0).
2. **Decisão P-1:** grant `agent_name='main'` — mapear p/ `deli` ou aposentar (onda 2).
3. **5.5** — consolidar docs de plano redundantes (Cowork faz direto).
4. **T3** — Wandson revisa mapa de telas v0 → T3(b) protótipo clicável.

---

## 📊 Status por track

| Track | Nome | Status | Última ação |
|-------|------|--------|-------------|
| T1 | Plataforma CD (V1→V3) | 🔄 ~95% | 1A–1G concluídas; DELI Realtime pendente |
| T2 | EvoNexus-replica | 🔄 FASE 2 onda 1 redigida (PR #161) | 🛑 CHECKPOINT 2: aguarda aprovação do SQL pelo Wandson |
| T3 | Visual-First / telas | 🔄 v0 em revisão | Mapa em main; aguarda revisão → T3(b) protótipo |
| T4 | Hermes (copiloto CEO) | 🔄 3A ✅ / 3B bloqueado | kimi-k2.6 rodando; 3B aguarda GATE 0 |
| T5 | Segurança / GATE 0 | 🔄 RLS na onda 1 (PR #161) | + brecha de escrita em agents achada e corrigida no SQL; rotação segue adiada |
| T6 | Agentes IA | 🔄 BomDia/Encerramento/chat ✅ | DELI em andamento; LARA/SOFIA pendentes |
| T7 | Feature PILOTO | 🔄 Ondas 01+02 merged | Onda 03 migration rascunhada, não aplicada |
| T8 | Infra / CI-CD | ⚠️ 2 riscos ativos | CI/CD sobrescreve; VPS branches divergem; stop-hook tsc falso-erro |
| T9 | Negócio | contexto | Primeiro cliente real = PRIORIDADE · equipe humana = 1 (agentes cobrem funções) |

---

## 📋 Log de sessões

### 2026-06-06 (sessão 4 — Cowork: fatos + FASE 2 onda 1)
- **#160 merged** (`544a697`): equipe = 1 pessoa; DELI = COO (RESTRUCTURE v1.2); CHECKPOINT 1 go registrado
- **5.3a:** verificação ao vivo no Supabase (policies DDL, PKs, counts, funções RLS, 7 grants) — output bruto no plano
- **5.3b:** **PR #161** — 5 migrations (`20260607_001..005`) + `FASE-2-onda1-plano.md`; brecha extra de ESCRITA em agents corrigida; pendências P-1..P-4 registradas
- 🛑 CHECKPOINT 2 aberto — aguardando SQL-ok do Wandson; **nada aplicado**

### 2026-06-06 (sessão 3 — Cowork, 5.2 + merges + mandato)
- Conector GitHub com escrita; #156/#152/#158/#159 merged; #155/#157 reconstruídos
- D4 (B) e D5 (mandato) registradas; 5.4 CLAUDE.md; nota Harness Engineering

### 2026-06-06 (sessão 2 — Cowork assume via handoff)
- 5.1 fechado (`52bfa13`); divergências registradas; Tracker atualizado (`9ebf138`)

### 2026-06-06
- PLANO-MESTRE raiz criado; PR #154 merged; Hermes 3A fechado; T3 v0 (32 telas, MVP=14)

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
