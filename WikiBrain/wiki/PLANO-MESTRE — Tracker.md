# PLANO-MESTRE — Tracker de Sessões

> Fonte de verdade para handoff entre sessões.
> **Antes de trabalhar → leia este arquivo.**
> **Ao terminar → atualize as seções abaixo.**

---

## 🔓 Mandato Cowork — D5 v2 (alterada pelo Wandson em 2026-06-06)

**Liberado:** ler repo/DB · branch · commit · PR · merge · docs · redigir `.sql` · **aplicar migrations CUJO SQL FOI APROVADO pelo Wandson** (sempre: SQL versionado antes · 1 arquivo por vez · validação com output bruto · parar no 1º erro · teste de isolamento quando tocar RLS).

**Reservado ao Wandson:** aprovar o SQL antes de aplicar · `DROP`/destrutivo · mensagens a clientes (drafts) · reabrir decisões travadas / 🛑 CHECKPOINTS · credenciais/rotação · comandos na VPS.

---

## 🔒 D6 — Direcionamento SaaS (APROVADA pelo Wandson em 2026-06-07)

**F1 = "Defesa Comercial iFood — modo copiloto" a R$147/loja/mês.** Carteira de consultoria INTOCADA (beta não-pagante; venda só a lojas novas). ROI em cesta "R$ defendido". **Gate D+90** (metas em `docs/estrategia/DIRECIONAMENTO-SAAS-2026-06.md` §5) antes de qualquer F2 (Análise/Cardápio/Keeta/99Food/white-label). **Regra anti-dispersão aprovada.** Kill-switch da Cris pré-escrito (§6). Início do build: **imediato** (2026-06-07). Plano de PRs: `docs/estrategia/F1-BUILD-PLAN.md`.
*Pendência de registro: gravar D6 também na seção de decisões do `PLANO-MESTRE.md` (raiz) na próxima sessão.*

---

## 🔴 Onde parou

_Última sessão: 2026-06-07 (Cowork — sessão 9: build F1 PR2→PR5, agente Defesa VIVO em produção)_

- **PR2 ✅ (#171 + fix #173):** Visão Geral com dados reais (`agent_runs`/`tenant_agents`). Bug achado pelo Wandson (números não batiam) → causa provada: **cap de 1.000 linhas do PostgREST** (não era RLS — impersonação provou 1.704 visíveis) → fix com counts exatos → **padrão P6** registrado no `scripts/qa-knowledge.md` (#174). Aceite: tela = SQL (1.704 · 1.677 ok · 27 falhas · US$0,0811 · 15 agentes).
- **PR3 ✅ aplicado (migration 20260607_006):** `defesa_casos` (estados rascunho→aguardando_ok→aprovado→enviado→ganho/perdido/descartado, centavos, sem DELETE) + view `defesa_metricas_mensal`. **Isolamento provado** (membro 1/1 · intruso 0/0). ⚠️ Lição: impersonação RLS exige `BEGIN; SET LOCAL role/claims` — set_config em CTE dá falso positivo.
- **PR4 ✅ (#175 + seed 007 aplicada/#176):** agente **`defesa-analisar-caso`** (Trigger.dev, sonnet-4-6, custo real no log). **Teste ponta-a-ponta em produção:** run Completed 23s · caso `51b31690` gravado `aguardando_ok` · chance alta · recomendação contestar · custo US$0,0139. Seed: nota — `agents.category` só aceita orchestrator|specialist.
- **PR5 ✅ (#177):** tela Defesa = **FILA REAL** (Aprovar/Editar/Descartar sob RLS) · Visão Geral com "R$ defendido" e "aguardando OK" reais (view) · agente cria draft oficial (`agent_drafts` canal painel) + sino + feed DELI. **Aceite fechado:** Wandson aprovou o caso de R$ 89 na tela → banco gravou `aprovado_por=wandson@` + `aprovado_em=20:05 UTC`.
- Sessões 6-8 (mesmo dia): benchmark #167 · direcionamento adversarial #168 · D6 aprovada · PR1 #169.
- **⚠️ Pendentes antigos:** `.obsidian/*`/`log.md` trackeados · grants órfãos P-5 · rotação credenciais · 2 ajustes do protótipo Claude Design.

---

## 👉 Próxima ação

1. **PR5b:** reply-loop de OK pelo WhatsApp (webhook Evolution + `parse-resposta-cliente`) — aprovar respondendo "ok".
2. **PR6:** Radar real (rotina semanal Trigger.dev `schedules` + tela) e transição enviado→ganho/perdido (registrar `resultado_valor_centavos` → alimenta "R$ defendido").
3. **PR7:** onboarding self-service + qualificação por volume. Em paralelo: entrada de casos automática (webhook/forward) — hoje o caso entra por trigger manual.
4. Docs: registrar D6 no `PLANO-MESTRE.md` · 5.5 consolidar docs · FASE 2 onda 2 (P-2/P-3/P-5).

---

## 📊 Status por track

| Track | Nome | Status | Última ação |
|-------|------|--------|-------------|
| T1 | Plataforma CD (V1→V3) | 🔄 | Console v2: Visão Geral + Defesa REAIS (#171-#177) |
| T2 | EvoNexus-replica | ✅ onda 1 aplicada | onda 2 a redigir |
| T3 | Visual-First / telas | ✅ | F1: 5 de 7 PRs entregues no design definitivo |
| T4 | Hermes | 🔄 3A ✅ / 3B bloqueado | aguarda GATE 0 |
| T5 | Segurança | ✅ | defesa_casos com RLS provada (membro 1 / intruso 0) |
| T6 | Agentes IA | 🔄 | **DEFESA vivo em produção** (16º agente; US$0,0139/caso) |
| T7 | PILOTO | 🔄 | Onda 03 não aplicada |
| T8 | Infra/CI | ⚠️ 2 riscos | deploy-trigger automático validado na prática |
| T9 | Negócio | 🔒 D6 travada | produto F1 operável ponta-a-ponta (falta entrada automática de casos) |

---

## 📋 Log de sessões

### 2026-06-07 (sessão 9 — Cowork: build F1 PR2→PR5)
- PR2 #171 dados reais + bug do cap-1000 (achado pelo Wandson) → fix #173 + padrão P6 no qa-knowledge #174
- PR3 migration 006 aplicada (defesa_casos + view; isolamento provado); PR4 #175 agente defesa-analisar-caso + seed 007 (#176); teste ponta-a-ponta: 23s, US$0,0139, caso aguardando_ok
- PR5 #177 fila real + draft oficial/sino/feed DELI; aceite: aprovação do Wandson gravada no banco (20:05 UTC)
- Aprovações do Wandson na sessão: PR3 SQL · seed 007 · D6 segue travada

### 2026-06-07 (sessões 6-8 — Cowork: benchmark → D6 → build F1 PR1)
- Benchmark BR+exterior (#167) + Gemini Deep Research; tese do quadrante vazio confirmada
- Método adversarial (estrategista × advogado do diabo × síntese) → DIRECIONAMENTO-SAAS (#168)
- **D6 aprovada pelo Wandson:** F1 Defesa copiloto R$147 · carteira intocada · gate D+90 · anti-dispersão · início imediato
- **PR1 #169 merged e EM PRODUÇÃO:** Console v2 (rota isolada) + 3 telas F1 + F1-BUILD-PLAN.md

### 2026-06-06 (sessão 5 — Cowork: T3 revisão + protótipo console v2)
- Mapa v1 (#163); decisão Wandson: escopo total 32 telas; **protótipo entregue (#164)**

### 2026-06-06 (sessão 4 — fatos + FASE 2 onda 1 redigida E APLICADA)
- #160/#161/#162; 4 brechas RLS corrigidas; isolamento provado (intruso 0/0/0); D5 v2; P-1 main→deli

### 2026-06-06 (sessão 3) — conector GitHub escrita; #156/#152/#158/#159; D4+D5; 5.4
### 2026-06-06 (sessão 2) — 5.1 fechado; divergências registradas
### 2026-06-06 (sessão 1) — PLANO-MESTRE raiz; #154; Hermes 3A; T3 v0

---

## 🧱 Regra de atualização (para a sessão de IA)

1. Leia este arquivo inteiro · 2. Leia `PLANO-MESTRE.md` · 3. Execute · 4. Atualize Onde parou / Próxima ação / Status / Log · 5. Atualize PLANO-MESTRE · 6. Commit no mesmo PR
