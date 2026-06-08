# PLANO-MESTRE — Tracker de Sessões

> Fonte de verdade para handoff entre sessões.
> **Antes de trabalhar → leia este arquivo.**
> **Ao terminar → atualize as seções abaixo.**

---

## 🔓 Mandato Cowork — D5 v2 (alterada pelo Wandson em 2026-06-06)

**Liberado:** ler repo/DB · branch · commit · PR · merge · docs · redigir `.sql` · **aplicar migrations CUJO SQL FOI APROVADO pelo Wandson** (sempre: SQL versionado antes · 1 arquivo por vez · validação com output bruto · parar no 1º erro · teste de isolamento quando tocar RLS).

**Reservado ao Wandson:** aprovar o SQL antes de aplicar · `DROP`/destrutivo · mensagens a clientes (drafts) · reabrir decisões travadas / 🛑 CHECKPOINTS · credenciais/rotação · comandos na VPS.

> **Nota sessão 16 (madrugada 2026-06-08):** o Wandson deu mandato verbal explícito para a sessão autônoma "construir a plataforma completa, não me perguntar nada, se quebrar a gente resolve". A sessão interpretou isso como pré-aprovação de **SQL aditivo e não-destrutivo apenas** (CREATE TABLE IF NOT EXISTS, INSERT ON CONFLICT, ADD COLUMN IF NOT EXISTS), sempre versionado + isolamento provado. Nada destrutivo (DROP/DELETE de dados reais/revogação de acesso) foi feito. Migrations aplicadas: 008, 009 (ver doc de auditoria).

---

## 🔓 D6 — REABERTA pelo Wandson em 2026-06-07 (decisão consciente do fundador)

Com a F1 entregue e aceita no mesmo dia (PR1–PR7, tracker #184), o Wandson decidiu **reabrir a D6 e partir para a plataforma completa** (novos agentes, telas restantes, white-label) **sem aguardar o gate D+90**. A sessão anterior alertou explicitamente que isso colide com a regra anti-dispersão da própria D6; o alerta foi dado e a reabertura é registrada como decisão consciente do fundador — reabrir decisão travada é prerrogativa exclusiva dele (D5 v2).

**D7 (decidida na sessão 13):** plano inicial de cliente novo = **Radar grátis até pagar**; assinatura **R$147/loja/mês SEM taxa de setup** (no beta). Defesa liga/desliga pela assinatura (override manual na tela Clientes). Recusas permanentes (OAuth-de-assinatura · % sobre faturamento) **não** foram reabertas.

Plano da plataforma completa (Consolidação C1–C8 + telas GAP-1..8 + agentes + white-label): redigido na sessão 12. **Etapa A (Consolidação) APROVADA** — PR8 ✅ · PR9 ✅ · PR10 ✅ · **PR11 (S1..S4) ✅**. **GAP-1..8 todos ✅ (sessão 16).**

---

## 🔒 D6 — Direcionamento SaaS (APROVADA pelo Wandson em 2026-06-07)

**F1 = "Defesa Comercial iFood — modo copiloto" a R$147/loja/mês.** Carteira INTOCADA (beta não-pagante; venda só a lojas novas). ROI em cesta "R$ defendido". Métricas do antigo gate D+90 viram painel de acompanhamento (`docs/estrategia/DIRECIONAMENTO-SAAS-2026-06.md` §5). Kill-switch da Cris (§6).

---

## 🔴 Onde parou

_Última sessão: 2026-06-08 (Cowork — **sessão 16 madrugada autônoma: auditoria + plataforma completa**)_

### Sessão 16 — madrugada autônoma (auditoria + GAPs + agente faltante)
- **Auditoria completa** (doc: `docs/auditoria/AUDITORIA-2026-06-08-madrugada.md`): nenhuma tela quebrada (todas as tabelas existem, build 100% verde). Esclarecido o contrato das "32 telas" (maioria já no console clássico; faltavam os 8 GAPs + agentes).
- **Agente Análise de Loja** (#215) — a frente paralela NÃO tinha entregue. Construído: task `analise-loja-processar` (cron 5min, fila) + migration 008 (aplicada, isolamento provado, seed catálogo) + tela. **Provado e2e:** diagnóstico real da Café Container (3 prioridades, "taxas/subsídios R$ 9.997,60") · US$ 0,0245.
- **GAP-2 Config de Agentes · GAP-6 Auditoria · GAP-7 Acesso por usuário** (#216) — sobre tabelas existentes, sem SQL.
- **GAP-5 Habilidades · GAP-8 Templates/Ofertas** (#217) — migration 009 aplicada (isolamento provado).
- **Wiring completo** (#218): 6 telas ligadas, Análise de Loja desbloqueada, grupos reorganizados (Operação/Agentes IA/Dados/Admin). Build verde (bundle `index-DMWiyW36.js`).
- **Sidebar com ícones** (#211) — Wandson apontou que faltava paridade com o MVP; ícones SVG por item (Brand Guard, zero emoji). **PR12c** (#212): diagnóstico semanal do Radar (sino + DELI).
- **Console v2 agora: ~17 telas reais.** GAP-1..8 todos ✅.

### Frente Telas — Etapa B COMPLETA (sessão 15)
- **PR #198 ✅** T1/GAP-4 `CustosIA.jsx` · **#199 ✅** T2/GAP-1+2 `PainelAgentes.jsx` · **#204 ✅** T3 `Execucoes.jsx` · **#205 ✅** T4/GAP-3 `AprovacoesUnificadas.jsx`

### Frente Estúdio — E1..E4 COMPLETO + e2e provado (handoff #188)
- E1 #190 · E2 #191/#194/#195 (slug **`openai/gpt-5.4-image-2`**) · E3 #192 · E4 #208 · **E4b #213** (corrigiu bug pré-existente da tela Aprovações que escondia TODOS os drafts).
- Aceite e2e: arte Brand Guard → bucket → `agent_runs` US$ 0,2386/234s → rascunho → aprovado. ⚠️ imagem real ≈ **US$ 0,24**.

### Frente Segurança — FASE 2 onda 2 COMPLETA (sessão 14 + 15)
- PRs #200–203 merged · migrations 005–007 aplicadas · `runs_sem_tenant=0` · `grants_orfaos=0` ✅
- **Advisors abertos (herdados):** `customer_group_members`, `customer_groups`, `tarefas_analise` — RLS sem policies.

---

## 👉 Próxima ação

1. **Wandson revisa de manhã** (doc `docs/auditoria/AUDITORIA-2026-06-08-madrugada.md` §6): recarregar app → Console v2 → conferir as telas novas (Análise de Loja, Config, Habilidades, Acesso, Auditoria, Templates) e o sidebar com ícones.
2. **Decisões pendentes do Wandson:** (a) advisors abertos — criar policies ou desabilitar RLS em `customer_group_members`/`customer_groups`/`tarefas_analise`; (b) limpar registros de teste (tenant sandbox, assinatura, análises); (c) recalibrar créditos do Estúdio (imagem real ≈ US$ 0,24).
3. **Beta real:** ativar 1 loja real (tela Ativar loja) · vincular grupo · 1 semana de vigia. Ao fechar 1ª loja pagante de fora: `ASAAS_DEFESA_ENVIRONMENT` → production.
4. **Etapa D (white-label)** quando o Wandson priorizar — último item do plano da plataforma completa.
5. Agentes locked restantes (Cardápio, Multicanal) — produtos futuros, sem tela.

---

## 📊 Status por track

| Track | Nome | Status | Última ação |
|-------|------|--------|-------------|
| T1 | Plataforma CD (V1→V3) | 🔄 | Console v2: **~17 telas reais** (GAP-1..8 completos) |
| T2 | EvoNexus-replica | ✅ onda 2 | **FASE 2 onda 2 COMPLETA** — migrations 005–007 aplicadas |
| T3 | Visual-First / telas | ✅ | F1 + Estúdio + GAPs + sidebar com ícones |
| T4 | Hermes | 🔄 | aguarda GATE 0 |
| T5 | Segurança | ✅ | onda 2 fechada; advisors abertos a decidir |
| T6 | Agentes IA | ✅ | DEFESA+VIGIA+ESTÚDIO+**ANÁLISE DE LOJA** em produção |
| T7 | PILOTO | 🔄 | Onda 03 não aplicada |
| T8 | Infra/CI | ✅ | deploy triplo automático confirmado |
| T9 | Negócio | 🔓 D6 reaberta | PLATAFORMA VENDE E COBRA SOZINHA — falta 1º cliente real |

---

## 📋 Log de sessões

### 2026-06-08 (sessão 16 — madrugada autônoma: auditoria + plataforma completa)
- Auditoria das 32 telas (doc próprio). Nada quebrado; contrato esclarecido.
- Agente Análise de Loja #215 (frente que não entregou) — provado e2e. GAP-2/6/7 #216, GAP-5/8 #217, wiring #218. Sidebar ícones #211, Radar semanal #212.
- Migrations 008 (analise_loja) e 009 (skills_templates) aplicadas — aditivas, isolamento provado. GAP-1..8 todos ✅.

### 2026-06-08 (sessão paralela Estúdio — E4 + E4b)
- E4 #208 → agent_drafts. E4b #213: fix tela Aprovações (escondia todos os drafts). Aceite e2e fechado.

### 2026-06-08 (sessão 15 — Frente Telas Etapa B + aprovação Segurança)
- T1-T4 (#198/#199/#204/#205). Migrations 005-007 aplicadas. runs_sem_tenant=0 · grants_orfaos=0.

### 2026-06-08 (sessão 14 — Frente Segurança FASE 2 onda 2)
- P-2/P-3/P-4/P-5 (#200-203). RLS de 7 tabelas verificada; advisors mapeados.

### 2026-06-08 (sessão paralela — ESTÚDIO E1+E2+E3)
- E1 #190 · E2 #191/#194/#195 · E3 #192.

### 2026-06-08 (sessão 13 — PR9 + PR10 — multi-tenant + monetização)
- D7 decidida · PR9 #187 · PR10 #189 · e2e sandbox: ativação automática.

### 2026-06-07/08 (sessão 12 — D6 REABERTA + PR8 #185)
### 2026-06-07 (sessões 9–11) — F1 PR1..PR7 ✅
### 2026-06-07 (sessões 6–8) — benchmark · D6 aprovada · PR1 #169
### 2026-06-06 (sessões 1–5) — protocolo, FASE 0–2 onda 1, D4/D5, protótipo 32 telas

---

## 🧱 Regra de atualização (para a sessão de IA)

1. Leia este arquivo inteiro · 2. Leia `PLANO-MESTRE.md` · 3. Execute · 4. Atualize Onde parou / Próxima ação / Status / Log · 5. Atualize PLANO-MESTRE · 6. Commit no mesmo PR
