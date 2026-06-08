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

Plano da plataforma completa (Consolidação C1–C8 + telas GAP-1..8 + agentes + white-label): redigido na sessão 12. **Etapa A (Consolidação) APROVADA** — PR8 ✅ · PR9 ✅ · PR10 ✅.

---

## 🔒 D6 — Direcionamento SaaS (APROVADA pelo Wandson em 2026-06-07)

**F1 = "Defesa Comercial iFood — modo copiloto" a R$147/loja/mês.** Carteira INTOCADA (beta não-pagante; venda só a lojas novas). ROI em cesta "R$ defendido". Métricas do antigo gate D+90 viram painel de acompanhamento (`docs/estrategia/DIRECIONAMENTO-SAAS-2026-06.md` §5). Kill-switch da Cris (§6).

---

## 🔴 Onde parou

_Última sessão: 2026-06-08 (Cowork — sessão 14: **Frente Segurança FASE 2 onda 2 — PR S1..S4 abertos, aguardando aprovação SQL**)_

- **PR S1 ✅ aberto (#200) — P-2:** `trigger/_shared/audit.ts` adiciona `CONSULT_TENANT_ID` e troca `?? null` por `?? CONSULT_TENANT_ID`. Zero alterações nas tasks individuais. Migration `20260608_005_p2_agent_runs_not_null.sql` versionada — **aguarda aprovação Wandson para aplicar**.
- **PR S2 ✅ aberto (#201) — P-3:** `src/hooks/usePermissions.js` passa a indexar `agentMap` por `agent_id` (canonical) + `agent_name` (legado), backward compat. Migration `20260608_006_p3_user_agent_access_contract.sql` versionada — **aguarda aprovação Wandson**.
- **PR S3 ✅ aberto (#202) — P-4+P-5:** Novo helper `trigger/_shared/tenant-agent-config.ts` (getTenantAgentConfig, soft-fail). Migration P-5 `20260608_007_p5_revoke_orphan_grants.sql` — **aguarda OK explícito do Wandson** (ver grants órfãos abaixo).
- **PR S4 ✅ aberto (#203) — Varredura final:** `scripts/qa-knowledge.md` atualizado com P7/P8 + 3 casos onda 2 + Schema Reference completo. RLS estudio_*/defesa_* verificada e OK. Advisors abertos mapeados (customer_groups, tarefas_analise — fora do escopo desta frente).
- **Grants órfãos P-5 identificados (SELECT confirmado em prod):**
  - `eduardo@consultdelivery.com.br` (`cba66f88-...`): 1 grant — `analise-ifood` (can_invoke=true)
  - `wellida@consultdelivery.com.br` (`14904752-...`): 2 grants — `analise-ifood` + `lara` (**can_approve_drafts=true** ⚠️)
  - Yasmin: não está no auth.users, sem grants

---

## 👉 Próxima ação

**🛑 CHECKPOINT — Wandson precisa aprovar para avançar:**

1. **Aprovar migration 005** (P-2 — `agent_runs.tenant_id SET NOT NULL`): está em `supabase/migrations/20260608_005_p2_agent_runs_not_null.sql` (PR #200)
2. **Aprovar migration 006** (P-3 — `user_agent_access` NOT NULL + UNIQUE): está em `supabase/migrations/20260608_006_p3_user_agent_access_contract.sql` (PR #201)
3. **Confirmar revogação P-5**: Wellida tinha `can_approve_drafts=true` no agente Lara. OK para DELETE? Migration 007 pronta em PR #202.
4. Depois das aprovações: **merge PR S1→S2→S3→S4** (nessa ordem) + aplicar migrations uma a uma com validação de output bruto.
5. Após S1..S4: PR12 (C3: Radar real — decidir fonte de dados) · E4 (Estúdio — botão "Enviar como rascunho") · beta real com 1ª loja.

---

## 📊 Status por track

| Track | Nome | Status | Última ação |
|-------|------|--------|-------------|
| T1 | Plataforma CD (V1→V3) | 🔄 | Console v2: 5 telas reais + Clientes/paywall (PR9/PR10) |
| T2 | EvoNexus-replica | 🟡 aguard. aprovação | PR S1..S4 abertos — **migrations pendentes de OK Wandson** |
| T3 | Visual-First / telas | ✅ | F1 + Estúdio entregues no design definitivo |
| T4 | Hermes | 🔄 | aguarda GATE 0 |
| T5 | Segurança | 🟡 aguard. aprovação | PR S1..S4 abertos — RLS verificada OK, grants mapeados |
| T6 | Agentes IA | ✅ | DEFESA+VIGIA+allowlist ativos; **ESTÚDIO em produção (e2e provado)** |
| T7 | PILOTO | 🔄 | Onda 03 não aplicada |
| T8 | Infra/CI | ✅ | deploy triplo automático (Pages+Trigger+Bridge self-hosted) confirmado |
| T9 | Negócio | 🔓 D6 reaberta | **PLATAFORMA VENDE E COBRA SOZINHA (sandbox provado) — falta 1º cliente real** |

---

## 📋 Log de sessões

### 2026-06-08 (sessão 14 — Cowork: Frente Segurança FASE 2 onda 2)
- Leu handoffs COORDENACAO-MULTI-SESSAO + HANDOFF-FRENTE-SEGURANCA · CLAUDE.md · Tracker · migrations 001-004 · código audit.ts, usePermissions.js, bom-dia/envio-agendado, backup-supabase-diario
- **P-2 análise:** `tenantId?: string` em AgentRunLog → tasks de sistema (backup, bom-dia global) gravavam NULL. Fix: constante `CONSULT_TENANT_ID` + default centralizado em audit.ts (nenhuma task individual alterada)
- **P-3 análise:** usePermissions.js indexava agentMap só por agent_name legado → callers com agent_id recebiam false. Fix: dual-key (agent_id + agent_name)
- **P-5 análise:** SELECT em prod → Eduardo (1 grant) + Wellida (2 grants, incluindo can_approve_drafts=true no lara). Yasmin não em auth.users.
- **S4 análise:** get_advisors rodado (61KB) · RLS de 7 tabelas verificada em prod → tudo OK exceto advisors em customer_group_members/customer_groups/tarefas_analise (fora do escopo)
- **4 branches criadas + PRs abertos:** S1=#200, S2=#201, S3=#202, S4=#203
- **3 migrations versionadas (005-007):** aguardando aprovação Wandson

### 2026-06-08 (sessão paralela — ESTÚDIO DE CONTEÚDO: E1+E2+E3 + aceite e2e)
- Handoff #188 assumido · design aprovado conferido ao vivo no Claude Design · E1 #190 (migration 004 aplicada, RLS provada) · E2 #191 + fixes E2b #194 (endpoint chat/completions+modalities) e E2c #195 (slug `openai/gpt-5.4-image-2`) · E3 #192 (tela fiel, lock por item no Agentes IA)
- Aceite e2e em produção: brief pela tela → arte + legenda Brand Guard → bucket + agent_runs US$0,2386/234s → biblioteca. Resta E4.

### 2026-06-08 (sessão 13 — Cowork: PR9 + PR10 — multi-tenant + monetização)
- D7 decidida (Radar grátis até pagar · R$147 sem setup) · PR9 #187 (Clientes + gating D7) · PR10 #189 (assinaturas Asaas fila→cron→sync)
- Migrations 008/009 aplicadas (isolamento provado) · e2e sandbox completo: link em 68s, ativação automática pós-pagamento às 03:30
- Handoff do Estúdio (#188) p/ sessão paralela · corrigido registro: deploy do worker é automático (Actions)

### 2026-06-07/08 (sessão 12 — Cowork: D6 REABERTA + Etapa A aprovada + PR8)
- Wandson reabreu a D6 (decisão consciente, alertado sobre anti-dispersão). Registro feito aqui e no PLANO-MESTRE (Decisões Travadas — fecha pendência antiga).
- Plano apresentado (A Consolidação → B telas GAP-1..4 → C agentes+F2 → GAP-5..8 → D white-label); **Etapa A aprovada**.
- PR8 #185 merged: allowlist @defesa por JID + UI Aprovadores · migration 20260608_001 aplicada (isolamento intruso 0/membro 1) · seed aprovador Wandson · 3 casos de teste deletados (aprovado).

### 2026-06-07 (sessão 11 — Cowork: F1 COMPLETA — PR6 + PR5b + PR7)
- PR6 #181 ganho/perdido c/ valor → R$ defendido acumula; PR5b #182 OK pelo WhatsApp (prova: aprovação em 40s, via/quem rastreados); PR7 #183 Ativar loja (qualificação D6 + vínculo grupo)
- F1 PR1..PR7 ✅ — ciclo completo em produção, custo US$≈0,014/caso

### 2026-06-07 (sessão 10) — vigia automático #179 (caso em 4m47s; dedupe provado)
### 2026-06-07 (sessão 9) — PR2..PR5 (#171-#177): dados reais, P6, migration 006, agente, fila real
### 2026-06-07 (sessões 6-8) — benchmark #167 · direcionamento #168 · **D6 aprovada** · PR1 #169
### 2026-06-06 (sessões 1-5) — protocolo, FASE 0-2 onda 1, D4/D5, protótipo 32 telas

---

## 🧱 Regra de atualização (para a sessão de IA)

1. Leia este arquivo inteiro · 2. Leia `PLANO-MESTRE.md` · 3. Execute · 4. Atualize Onde parou / Próxima ação / Status / Log · 5. Atualize PLANO-MESTRE · 6. Commit no mesmo PR
