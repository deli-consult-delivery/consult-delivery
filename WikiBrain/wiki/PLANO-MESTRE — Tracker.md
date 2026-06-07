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

**F1 = "Defesa Comercial iFood — modo copiloto" a R$147/loja/mês.** Carteira de consultoria INTOCADA (beta não-pagante; venda só a lojas novas). ROI em cesta "R$ defendido". **Gate D+90** (metas em `docs/estrategia/DIRECIONAMENTO-SAAS-2026-06.md` §5) antes de qualquer F2 (Análise/Cardápio/Keeta/99Food/white-label). **Regra anti-dispersão aprovada.** Kill-switch da Cris pré-escrito (§6). Início do build: **imediato** (2026-06-07), usando o design do Claude Design Web como referência. Plano de PRs: `docs/estrategia/F1-BUILD-PLAN.md`.
*Pendência de registro: gravar D6 também na seção de decisões do `PLANO-MESTRE.md` (raiz) na próxima sessão.*

---

## 🔴 Onde parou

_Última sessão: 2026-06-07 (Cowork — sessões 6-8: benchmark + direcionamento adversarial + D6 + PR1 do build F1)_

- **Benchmark de mercado ✅ (#167):** `docs/benchmark/benchmark-mercado-2026-06.md` — 19 buscas; quadrante "executa por você" vazio confirmado; + relatório complementar do Gemini Deep Research.
- **Direcionamento adversarial ✅ (#168):** estrategista vs advogado do diabo (agentes Opus) → `docs/estrategia/DIRECIONAMENTO-SAAS-2026-06.md` (proposta D6). 3 golpes absorvidos: ROI em cesta (não por contestação) · modo copiloto assumido · carteira intocada.
- **D6 APROVADA pelo Wandson** (direção + anti-dispersão + início imediato).
- **PR1 do build F1 ✅ EM PRODUÇÃO (#169, `cdb271c`):** rota isolada `console-v2` (admin) — shell com design system oficial + 3 telas (Visão Geral, Defesa copiloto com fila Aprovar/Editar/Descartar, Radar). Dados de exemplo rotulados. **QA com output bruto:** bundle publicado `index-tsB3h_qx.js` contém `console-v2` e `Defesa Comercial` → build verde, deploy live, zero impacto nas rotas atuais.
- **⚠️ Pendentes antigos:** `.obsidian/*` e `log.md` trackeados · grants órfãos P-5 · rotação credenciais · 2 ajustes do protótipo no Claude Design (preview antes de enviar + eventos finalizada/reaberta).

---

## 👉 Próxima ação

1. **Wandson:** `git pull` → abrir app.consultdelivery.com.br → menu Início → **Console v2 · F1** → validar visual e fluxo da fila de Defesa (é com dados de exemplo).
2. **PR2 (próxima sessão de build):** ligar Visão Geral aos dados reais de `agent_runs` (critério: números batem com SQL direto). Plano completo: `docs/estrategia/F1-BUILD-PLAN.md` (PR2→PR7).
3. **PR3:** redigir migrations `defesa_casos`/`defesa_metricas` → SQL ao Wandson p/ aprovação → aplicar (D5 v2).
4. Paralelo: FASE 2 onda 2 (P-2/P-3/P-5) · 5.5 consolidar docs · registrar D6 no PLANO-MESTRE.md.

---

## 📊 Status por track

| Track | Nome | Status | Última ação |
|-------|------|--------|-------------|
| T1 | Plataforma CD (V1→V3) | 🔄 | Console v2 F1 nasceu como rota isolada (#169) |
| T2 | EvoNexus-replica | ✅ onda 1 aplicada | onda 2 a redigir |
| T3 | Visual-First / telas | ✅ design definitivo (Claude Design Web) | build real começou pela F1 (D6) |
| T4 | Hermes | 🔄 3A ✅ / 3B bloqueado | aguarda GATE 0 |
| T5 | Segurança | ✅ 4 brechas RLS corrigidas | rotação adiada |
| T6 | Agentes IA | 🔄 | próximo agente novo = Defesa (PR4) |
| T7 | PILOTO | 🔄 | Onda 03 não aplicada |
| T8 | Infra/CI | ⚠️ 2 riscos | — |
| T9 | Negócio | **🔒 D6 travada** | F1 Defesa R$147 · gate D+90 · benchmark #167 + direcionamento #168 |

---

## 📋 Log de sessões

### 2026-06-07 (sessões 6-8 — Cowork: benchmark → D6 → build F1 PR1)
- Benchmark BR+exterior (#167) + Gemini Deep Research; tese do quadrante vazio confirmada
- Método adversarial (estrategista × advogado do diabo × síntese) → DIRECIONAMENTO-SAAS (#168)
- **D6 aprovada pelo Wandson:** F1 Defesa copiloto R$147 · carteira intocada · gate D+90 · anti-dispersão · início imediato
- **PR1 #169 merged e EM PRODUÇÃO:** Console v2 (rota isolada) + 3 telas F1 + F1-BUILD-PLAN.md; QA: bundle live contém o código novo

### 2026-06-06 (sessão 5 — Cowork: T3 revisão + protótipo console v2)
- Mapa v1 (#163): app real já cobre ~70% do v0; gaps reais = GAP-1..8; divergência NOVA/MAX registrada
- Decisão Wandson: escopo total (32 telas, design EvoNexus, redesign da plataforma)
- **Protótipo entregue (#164):** `docs/prototipo/console-v2.html` — interativo, multi-tenant demonstrado

### 2026-06-06 (sessão 4 — fatos + FASE 2 onda 1 redigida E APLICADA)
- #160/#161/#162; 4 brechas RLS corrigidas; isolamento provado (intruso 0/0/0); D5 v2; P-1 main→deli

### 2026-06-06 (sessão 3) — conector GitHub escrita; #156/#152/#158/#159; D4+D5; 5.4
### 2026-06-06 (sessão 2) — 5.1 fechado; divergências registradas
### 2026-06-06 (sessão 1) — PLANO-MESTRE raiz; #154; Hermes 3A; T3 v0

---

## 🧱 Regra de atualização (para a sessão de IA)

1. Leia este arquivo inteiro · 2. Leia `PLANO-MESTRE.md` · 3. Execute · 4. Atualize Onde parou / Próxima ação / Status / Log · 5. Atualize PLANO-MESTRE · 6. Commit no mesmo PR
