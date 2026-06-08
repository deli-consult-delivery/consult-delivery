# PLANO-MESTRE — Tracker de Sessões

> Fonte de verdade para handoff entre sessões.
> **Antes de trabalhar → leia este arquivo.**
> **Ao terminar → atualize as seções abaixo.**

---

## 🔓 Mandato Cowork — D5 v2 (alterada pelo Wandson em 2026-06-06)

**Liberado:** ler repo/DB · branch · commit · PR · merge · docs · redigir `.sql` · **aplicar migrations CUJO SQL FOI APROVADO pelo Wandson** (sempre: SQL versionado antes · 1 arquivo por vez · validação com output bruto · parar no 1º erro · teste de isolamento quando tocar RLS).

**Reservado ao Wandson:** aprovar o SQL antes de aplicar · `DROP`/destrutivo · mensagens a clientes (drafts) · reabrir decisões travadas / 🛑 CHECKPOINTS · credenciais/rotação · comandos na VPS.

---

## 🔓 D6 — REABERTA pelo Wandson em 2026-06-07 (decisão consciente do fundador)

Com a F1 entregue e aceita no mesmo dia (PR1–PR7, tracker #184), o Wandson decidiu **reabrir a D6 e partir para a plataforma completa** (novos agentes, telas restantes, white-label) **sem aguardar o gate D+90**. A sessão anterior alertou explicitamente que isso colide com a regra anti-dispersão da própria D6; o alerta foi dado e a reabertura é registrada como decisão consciente do fundador — reabrir decisão travada é prerrogativa exclusiva dele (D5 v2).

**D7 (decidida na sessão 13):** plano inicial de cliente novo = **Radar grátis até pagar**; assinatura **R$147/loja/mês SEM taxa de setup** (no beta). Defesa liga/desliga pela assinatura (override manual na tela Clientes). Recusas permanentes (OAuth-de-assinatura · % sobre faturamento) **não** foram reabertas.

Plano da plataforma completa (Consolidação C1–C8 + telas GAP-1..8 + agentes + white-label): redigido na sessão 12. **Etapa A (Consolidação) APROVADA** — PR8 ✅ · PR9 ✅ · PR10 ✅ · **PR11 (S1..S4) ✅**.

---

## 🔒 D6 — Direcionamento SaaS (APROVADA pelo Wandson em 2026-06-07)

**F1 = "Defesa Comercial iFood — modo copiloto" a R$147/loja/mês.** Carteira INTOCADA (beta não-pagante; venda só a lojas novas). ROI em cesta "R$ defendido". Métricas do antigo gate D+90 viram painel de acompanhamento (`docs/estrategia/DIRECIONAMENTO-SAAS-2026-06.md` §5). Kill-switch da Cris (§6).

---

## 🔴 Onde parou

_Última sessão: 2026-06-08 (Cowork — sessão 15 continuação: **Frente Segurança PRs mergeados + migrations aplicadas**)_

### Frente Telas — Etapa B COMPLETA (sessão 15)
- **PR #198 ✅ merged** — T1/GAP-4: `CustosIA.jsx` (custo por agente/dia, alerta pico)
- **PR #199 ✅ merged** — T2/GAP-1+2: `PainelAgentes.jsx` (toggle ativo + config model/prompt/tokens)
- **PR #204 ✅ merged** — T3: `Execucoes.jsx` (log agent_runs, filtros, expand JSONB)
- **PR #205 ✅ merged** — T4/GAP-3: `AprovacoesUnificadas.jsx` (agent_drafts + defesa_casos)
- Console v2 sidebar: **9 telas reais** (visao, defesa, radar, ativar, execucoes, aprovacoes, agentes, estudio, custos)

### Frente Segurança — FASE 2 onda 2 COMPLETA (sessão 14 + aprovação sessão 15)
- **PR #200 ✅ merged** — S1/P-2: `audit.ts` com `CONSULT_TENANT_ID`. Migration 005 aplicada.
- **PR #201 ✅ merged** — S2/P-3: `usePermissions.js` dual-key. Migration 006 aplicada.
- **PR #202 ✅ merged** — S3/P-4+P-5: helper `getTenantAgentConfig` + grants órfãos revogados. Migration 007 aplicada.
- **PR #203 ✅ merged** — S4: `qa-knowledge.md` varredura final.
- **Validações pós-migration:** `runs_sem_tenant=0` · `grants_orfaos=0` ✅
- **Advisors abertos (fora do escopo):** `customer_group_members`, `customer_groups`, `tarefas_analise` — RLS habilitado sem policies.

---

## 👉 Próxima ação

1. **PR12 (C3):** Radar real — decidir fonte de dados com o Wandson.
2. **E4 (Estúdio):** botão "Enviar como rascunho de campanha" → `agent_drafts`.
3. **Beta real:** ativar 1 loja real (tela Ativar loja) · vincular grupo · 1 semana de vigia · registrar ganho/perdido. Quando fechar 1ª loja pagante de fora: trocar `ASAAS_DEFESA_ENVIRONMENT` para production.
4. Limpeza registros de teste (tenant sandbox + assinatura) quando Wandson autorizar.
5. Advisors abertos: `customer_group_members`, `customer_groups`, `tarefas_analise` — policies ou desabilitar RLS.

---

## 📊 Status por track

| Track | Nome | Status | Última ação |
|-------|------|--------|-------------|
| T1 | Plataforma CD (V1→V3) | 🔄 | Console v2: **9 telas reais** (Etapa B completa) |
| T2 | EvoNexus-replica | ✅ onda 2 | **FASE 2 onda 2 COMPLETA** — migrations 005–007 aplicadas |
| T3 | Visual-First / telas | ✅ | F1 + Estúdio entregues no design definitivo |
| T4 | Hermes | 🔄 | aguarda GATE 0 |
| T5 | Segurança | ✅ | **onda 2 fechada**: NOT NULL + grants revogados + RLS verificada |
| T6 | Agentes IA | ✅ | DEFESA+VIGIA+allowlist ativos; ESTÚDIO em produção |
| T7 | PILOTO | 🔄 | Onda 03 não aplicada |
| T8 | Infra/CI | ✅ | deploy triplo automático confirmado |
| T9 | Negócio | 🔓 D6 reaberta | PLATAFORMA VENDE E COBRA SOZINHA (sandbox provado) — falta 1º cliente real |

---

## 📋 Log de sessões

### 2026-06-08 (sessão 15 continuação — aprovação Frente Segurança + execução)
- Wandson: "Já aprovei na Frente Segurança"
- Mergeados PRs #200, #201, #202, #203 (squash → main)
- Migration 005 aplicada: `agent_runs.tenant_id NOT NULL`, policy `authenticated_view_global_runs` removida, backfill idempotente
- Migration 006 aplicada: `user_agent_access` NOT NULL (tenant_id + agent_id) — constraint UNIQUE já existia da onda 1
- Migration 007 aplicada: 3 grants órfãos deletados (Eduardo 1 + Wellida 2 incl. `can_approve_drafts=true` no lara)
- Validação: `runs_sem_tenant=0` · `grants_orfaos=0` ✅

### 2026-06-08 (sessão 15 — Cowork: Frente Telas Etapa B — 4 telas Console v2)
- Leu COORDENACAO-MULTI-SESSAO.md + HANDOFF-FRENTE-TELAS.md
- **T1/GAP-4 PR #198:** `CustosIA.jsx` — KPIs custo total/execuções/avg, tabela por agente/dia, alerta pico (>2× média)
- **T2/GAP-1+2 PR #199:** `PainelAgentes.jsx` — toggle tenant_agents, ConfigPanel (model/max_tokens/prompt), métricas 30d
- **T3 PR #204:** `Execucoes.jsx` — log agent_runs com filtros agente/status/janela, expand JSONB collapsível
- **T4/GAP-3 PR #205:** `AprovacoesUnificadas.jsx` — fila unificada agent_drafts (canais não-diretos) + defesa_casos
- Zona Compartilhada: ConsoleV2.jsx editado 4× (SHA fresco a cada PR); sidebar final com 9 telas reais
- ConsoleV2.jsx squash SHA final: `5207ae09`

### 2026-06-08 (sessão 14 — Cowork: Frente Segurança FASE 2 onda 2)
- Leu handoffs + CLAUDE.md + Tracker + migrations 001–004 + audit.ts + usePermissions.js
- **P-2:** `CONSULT_TENANT_ID` em audit.ts (default centralizado, zero tasks alteradas)
- **P-3:** usePermissions dual-key; dedup `agent_name='main'` (RETURNING * registrado no PR #201)
- **P-4:** helper `getTenantAgentConfig` (soft-fail, service_role)
- **P-5:** Eduardo (1) + Wellida (2 incl. can_approve_drafts=true no lara) — 3 grants revogados
- **S4:** RLS de 7 tabelas verificada OK; advisors abertos mapeados
- PRs #200–203 criados (aprovação pendente → executada na sessão 15)

### 2026-06-08 (sessão paralela — ESTÚDIO DE CONTEÚDO: E1+E2+E3 + aceite e2e)
- E1 #190 (migration 004, RLS provada) · E2 #191+fixes E2b #194+E2c #195 · E3 #192 (tela fiel). Aceite e2e: brief→arte Brand Guard→bucket US$0,2386/234s. Resta E4.

### 2026-06-08 (sessão 13 — Cowork: PR9 + PR10 — multi-tenant + monetização)
- D7 decidida · PR9 #187 (Clientes + gating D7) · PR10 #189 (assinaturas Asaas)
- Migrations 008/009 aplicadas · e2e sandbox: link 68s, ativação automática 03:30

### 2026-06-07/08 (sessão 12 — Cowork: D6 REABERTA + Etapa A aprovada + PR8)
- D6 reaberta (consciente) · PR8 #185 merged (allowlist @defesa + UI Aprovadores)

### 2026-06-07 (sessões 9–11) — F1 PR1..PR7 ✅ — ciclo completo, custo US$≈0,014/caso
### 2026-06-07 (sessões 6–8) — benchmark · D6 aprovada · PR1 #169
### 2026-06-06 (sessões 1–5) — protocolo, FASE 0–2 onda 1, D4/D5, protótipo 32 telas

---

## 🧱 Regra de atualização (para a sessão de IA)

1. Leia este arquivo inteiro · 2. Leia `PLANO-MESTRE.md` · 3. Execute · 4. Atualize Onde parou / Próxima ação / Status / Log · 5. Atualize PLANO-MESTRE · 6. Commit no mesmo PR
