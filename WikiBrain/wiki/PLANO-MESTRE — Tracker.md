# PLANO-MESTRE — Tracker de Sessões

> Fonte de verdade para handoff entre sessões.
> **Antes de trabalhar → leia este arquivo.**
> **Ao terminar → atualize as seções abaixo.**

---

## 🔓 Mandato Cowork — D5 v2 (alterada pelo Wandson em 2026-06-06)

> v1: "Você está autorizado, a partir de agora, a fazer por aqui mesmo tudo aquilo que você conseguir."
> v2 (mesmo dia): "Você aplica a partir de agora… você faz os testes…" — **aplicação de migrations liberada para o Cowork**.

**Liberado:** ler repo/DB · branch · commit · PR · merge · docs · redigir `.sql` · **aplicar migrations CUJO SQL FOI APROVADO pelo Wandson** (sempre: SQL versionado em git antes · 1 arquivo por vez · validação com output bruto após cada um · parar no 1º erro · teste de isolamento quando tocar RLS).

**Continua reservado ao Wandson:** aprovar o SQL antes de aplicar · `DROP`/destrutivo em produção (proibido sempre) · mensagens a clientes (drafts) · reabrir decisões travadas / 🛑 CHECKPOINTS · credenciais/rotação · comandos na VPS.

---

## 🔴 Onde parou

_Última sessão: 2026-06-06 (Cowork — sessão 4: FASE 2 onda 1 APLICADA)_

- **🛑 CHECKPOINT 2 ✅ FECHADO:** Wandson aprovou o SQL do #161 ("aprovo o SQL do 161") + decidiu P-1 (`main`→`deli`) + alterou a regra de aplicação (D5 v2). PR #161 merged (`979220f`) com P-1 incorporado.
- **Onda 1 APLICADA pelo Cowork via `apply_migration`** (5/5, sem erro). **Evidência bruta:**
  - `tenant_agents` = **15** · `agent_runs` tenant NULL = **0** (total 1686) · grants sem mapa/tenant = **0/0**
  - Policies: `agents` = 4 novas (select gated + insert/update/delete admin-custom); `customers_auth_all` e `user_agent_access_manage_admin` antigas **removidas**; `agents_read_all` + `agents_tenant_isolation` **removidas**
  - **Teste de isolamento (impersonação):** admin (718e256d…) vê 15 agents / 1169 customers / 4 grants · **intruso autenticado sem tenant vê 0 / 0 / 0** ✅
- Funções novas: `agent_enabled_for_user`, `same_tenant_admin` (SECURITY DEFINER, search_path=public).
- **Achado p/ onda 2:** 3 grants em `user_agent_access` pertencem a contas fora de `tenant_members` (ex-membros: 14904752…, cba66f88…) — invisíveis via RLS (correto), aposentar na onda 2 (P-5).
- **⚠️ Ainda trackeados indevidamente:** `WikiBrain/.obsidian/*` e `WikiBrain/log.md` — aguarda ok.

---

## 👉 Próxima ação

1. **T3** — Wandson revisa mapa de telas v0 → Cowork faz T3(b) protótipo clicável (14 telas MVP, dados fake).
2. **FASE 2 onda 2** (Cowork redige → Wandson aprova SQL): P-2 cutover `logAgentRun`→`tenant_id` obrigatório + `SET NOT NULL` · P-3 contract `user_agent_access` (PK nova, aposentar `agent_name`) · P-4 `tenant_agent_config` · P-5 aposentar 3 grants órfãos · limpar 5 tenants seed (T8).
3. **5.5** — consolidar docs de plano redundantes (Cowork faz direto).
4. Smoke test visual do app pelo Wandson quando usar (painel agentes = 15; chat abre) — RLS já validada por impersonação.

---

## 📊 Status por track

| Track | Nome | Status | Última ação |
|-------|------|--------|-------------|
| T1 | Plataforma CD (V1→V3) | 🔄 ~95% | 1A–1G concluídas; DELI Realtime pendente |
| T2 | EvoNexus-replica | ✅ FASE 2 onda 1 APLICADA | B cabeado (`tenant_agents` 15); CHECKPOINT 2 fechado; onda 2 a redigir |
| T3 | Visual-First / telas | 👉 v0 aguarda revisão do Wandson | → T3(b) protótipo clicável |
| T4 | Hermes (copiloto CEO) | 🔄 3A ✅ / 3B bloqueado | kimi-k2.6 rodando; 3B aguarda GATE 0 |
| T5 | Segurança / GATE 0 | ✅ 4 brechas RLS corrigidas EM PRODUÇÃO | isolamento provado (intruso = 0/0/0); rotação de credenciais segue adiada |
| T6 | Agentes IA | 🔄 BomDia/Encerramento/chat ✅ | DELI em andamento; LARA/SOFIA pendentes |
| T7 | Feature PILOTO | 🔄 Ondas 01+02 merged | Onda 03 migration rascunhada, não aplicada |
| T8 | Infra / CI-CD | ⚠️ 2 riscos ativos | CI/CD sobrescreve; VPS branches divergem; stop-hook tsc falso-erro |
| T9 | Negócio | contexto | Primeiro cliente real = PRIORIDADE · equipe humana = 1 (agentes cobrem funções) |

---

## 📋 Log de sessões

### 2026-06-06 (sessão 4 — Cowork: fatos + FASE 2 onda 1 redigida E APLICADA)
- **#160 merged**: equipe = 1 pessoa; DELI = COO (RESTRUCTURE v1.2); CHECKPOINT 1 go
- **5.3a:** verificação ao vivo (achou 4ª brecha: escrita em agents globais por qualquer membro)
- **5.3b:** PR #161 — 5 migrations + plano; **aprovado pelo Wandson** ("aprovo o SQL do 161"); P-1 `main`→`deli` decidido e incorporado; merged (`979220f`)
- **D5 v2:** Wandson liberou aplicação de migrations pelo Cowork (após SQL aprovado)
- **Onda 1 aplicada via `apply_migration` (5/5)** — validações: 15/0/0/0; teste de impersonação: admin 15/1169/4, intruso 0/0/0 ✅
- Achado p/ onda 2: 3 grants órfãos de ex-membros (P-5)

### 2026-06-06 (sessão 3 — Cowork, 5.2 + merges + mandato)
- Conector GitHub com escrita; #156/#152/#158/#159 merged; #155/#157 reconstruídos; D4 + D5 registradas; 5.4 CLAUDE.md; nota Harness

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
