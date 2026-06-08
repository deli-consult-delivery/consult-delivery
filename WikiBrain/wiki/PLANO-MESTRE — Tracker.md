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

_Última sessão: 2026-06-08 (Cowork — sessão 14: **FASE 2 onda 2 COMPLETA — PR S1..S4 merged, migrations 005–007 aplicadas**)_

- **PR S1 ✅ merged (#200)** — P-2: `audit.ts` com `CONSULT_TENANT_ID`. Migration 005: `agent_runs.tenant_id` NOT NULL, policy `authenticated_view_global_runs` removida.
- **PR S2 ✅ merged (#201)** — P-3: `usePermissions.js` dual-key (agent_id + agent_name). Dedup P-1 aplicado (DELETE `agent_name='main'` com RETURNING *, output registrado no PR). Migration 006: NOT NULL + UNIQUE `(tenant_id, user_id, agent_id)`.
- **PR S3 ✅ merged (#202)** — P-4: helper `getTenantAgentConfig`. P-5: migration 007 grants órfãos revogados (Eduardo 1 linha + Wellida 2 linhas, `grants_orfaos_restantes=0`).
- **PR S4 ✅ merged (#203)** — `qa-knowledge.md` com P7/P8 + 3 casos onda 2 + Schema Reference + advisors abertos mapeados.
- **Advisors abertos (fora do escopo desta frente):** `customer_group_members`, `customer_groups`, `tarefas_analise` — RLS habilitado sem policies. Incluir em próxima frente.
- **Lição onda 2:** remoção de membro de `tenant_members` NÃO cascateia em `user_agent_access`. Adicionar ON DELETE CASCADE ou trigger em futura onda.

---

## 👉 Próxima ação

1. **PR12 (C3):** Radar real — decidir fonte de dados com o Wandson.
2. **E4 (Estúdio):** botão "Enviar como rascunho de campanha" → `agent_drafts` (sessão paralela).
3. **Beta real:** ativar 1 loja real (tela Ativar loja) · vincular grupo · 1 semana de vigia · registrar ganho/perdido. Quando fechar 1ª loja pagante de fora: trocar `ASAAS_DEFESA_ENVIRONMENT` para production.
4. Limpeza registros de teste (tenant sandbox + assinatura) quando Wandson autorizar.
5. Advisors abertos: `customer_group_members`, `customer_groups`, `tarefas_analise` — policies ou desabilitar RLS.

---

## 📊 Status por track

| Track | Nome | Status | Última ação |
|-------|------|--------|-------------|
| T1 | Plataforma CD (V1→V3) | 🔄 | Console v2: 5 telas reais + Clientes/paywall (PR9/PR10) |
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

### 2026-06-08 (sessão 14 — Cowork: Frente Segurança FASE 2 onda 2 COMPLETA)
- Leu handoffs + CLAUDE.md + Tracker + migrations 001–004 + audit.ts + usePermissions.js + bom-dia/envio-agendado + backup-supabase-diario
- **P-2:** `CONSULT_TENANT_ID` em audit.ts (default centralizado, zero tasks alteradas)
- **P-3:** usePermissions dual-key; dedup `agent_name='main'` (RETURNING * registrado no PR #201)
- **P-4:** helper `getTenantAgentConfig` (soft-fail, service_role)
- **P-5:** Eduardo (1) + Wellida (2 incl. can_approve_drafts=true no lara) — 3 grants deletados
- **S4:** RLS de 7 tabelas verificada OK; advisors abertos mapeados
- Migrations 005/006/007 aprovadas e aplicadas; 4 PRs (#200–203) merged
- **Lição extra:** onda 1 criou duplicata `agent_name='main'`+`'deli'` → mesmo `agent_id='deli'`; dedup necessário antes do contrato UNIQUE

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
