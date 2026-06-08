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

Plano da plataforma completa (Consolidação C1–C8 + telas GAP-1..8 + agentes + white-label): redigido na sessão 12. **Etapa A (Consolidação) APROVADA** — PR8 ✅ · PR9 ✅ · PR10 ✅. **Etapa B (Telas GAP-1..4) CONCLUÍDA** — PR T1 #198 ✅ · PR T2 #199 ✅ · PR T3 #204 ✅ · PR T4 #205 ✅.

---

## 🔒 D6 — Direcionamento SaaS (APROVADA pelo Wandson em 2026-06-07)

**F1 = "Defesa Comercial iFood — modo copiloto" a R$147/loja/mês.** Carteira INTOCADA (beta não-pagante; venda só a lojas novas). ROI em cesta "R$ defendido". Métricas do antigo gate D+90 viram painel de acompanhamento (`docs/estrategia/DIRECIONAMENTO-SAAS-2026-06.md` §5). Kill-switch da Cris (§6).

---

## 🔴 Onde parou

_Última sessão: 2026-06-08 (Cowork — sessão 15: **Frente Telas — Etapa B concluída: T1+T2+T3+T4 mergeados**)_

- **PR T1 ✅ mergeado (#198):** `src/console/CustosIA.jsx` criado + ConsoleV2 grupo Dados desbloqueado + rota `custos`. GAP-4 fechado.
- **PR T2 ✅ mergeado (#199):** `src/console/PainelAgentes.jsx` criado (toggle GAP-1 + config GAP-2) + ConsoleV2 rota `agentes`. GAP-1+2 fechados.
- **PR T3 ✅ mergeado (#204):** `src/console/Execucoes.jsx` criado (log agent_runs, filtros, expand JSONB) + ConsoleV2 rota `execucoes`.
- **PR T4 ✅ mergeado (#205):** `src/console/AprovacoesUnificadas.jsx` criado (fila unificada agent_drafts + defesa_casos) + ConsoleV2 rota `aprovacoes`. GAP-3 fechado.
- **Sidebar do Console v2 final:** Inicio(visao) · Operacao(defesa/radar/ativar/execucoes/aprovacoes) · Agentes IA(agentes/estudio/x1-x3 lock) · Dados(custos) · Admin(clientes)
- **Pendente da sessão 14 (Frente Segurança):** PRs S1..S4 (#200-#203) aguardando aprovação Wandson para migrations 005-007. Grants órfãos Eduardo/Wellida mapeados.

---

## 👉 Próxima ação

**🛑 CHECKPOINT Segurança (sessão 14, ainda aberto) — Wandson precisa aprovar:**

1. **Migration 005** (P-2 — `agent_runs.tenant_id SET NOT NULL`) — PR #200
2. **Migration 006** (P-3 — `user_agent_access` contrato) — PR #201
3. **Confirmar revogação P-5** (Wellida `can_approve_drafts=true` no lara) — migration 007, PR #202
4. Após aprovações: merge S1→S2→S3→S4 em ordem + aplicar migrations com output bruto.

**Etapa B concluída — próximo bloco disponível:**

5. PR12 (C3: Radar real — decidir fonte de dados)
6. E4: Estúdio — botão "Enviar como rascunho"
7. Etapa C: novos agentes (Skills/Rotinas/Gatilhos — T5+ do handoff Telas)
8. Beta real com 1ª loja pagante.

---

## 📊 Status por track

| Track | Nome | Status | Última ação |
|-------|------|--------|-------------|
| T1 | Plataforma CD (V1→V3) | ✅ | Console v2: 9 telas reais + Clientes/paywall/custos/agentes/execucoes/aprovacoes |
| T2 | EvoNexus-replica | 🟡 aguard. aprovação | PRs S1..S4 #200-203 — migrations 005-007 pendentes OK Wandson |
| T3 | Visual-First / telas | ✅ | **Etapa B concluída: GAP-1..4 todos fechados (T1-T4 mergeados)** |
| T4 | Hermes | 🔄 | aguarda GATE 0 |
| T5 | Segurança | 🟡 aguard. aprovação | RLS OK, grants mapeados, migrations prontas aguardando Wandson |
| T6 | Agentes IA | ✅ | DEFESA+VIGIA+allowlist+ESTÚDIO ativos em produção |
| T7 | PILOTO | 🔄 | Onda 03 não aplicada |
| T8 | Infra/CI | ✅ | deploy triplo automático confirmado |
| T9 | Negócio | 🔓 D6 reaberta | Plataforma SaaS funcional — falta 1º cliente real pagante |

---

## 📋 Log de sessões

### 2026-06-08 (sessão 15 — Cowork: Frente Telas — Etapa B)
- Leu COORDENACAO-MULTI-SESSAO + HANDOFF-FRENTE-TELAS + CLAUDE.md + Tracker + Mapa T3 + ConsoleV2 + console.css + FASE-1-mapeamento + agents/agent_runs/tenant_agents schemas
- **T1 — CustosIA.jsx:** custo por agente/dia/tenant, 30d, P6 limit(1000), KPIs, tabela por agente, tabela por dia, alerta de pico (>2× média). PR #198 mergeado.
- **T2 — PainelAgentes.jsx:** GAP-1 toggle ativo/inativo (upsert/delete tenant_agents) + GAP-2 config por agente (custom_prompt, custom_model, max_tokens → campo config JSONB). P6. PR #199 mergeado.
- **T3 — Execucoes.jsx:** log agent_runs com filtros (janela 7/15/30d, agente, status), KPIs, tabela cronológica, expand inline com ID+Trigger.dev+input/output JSONB collapsível. P6. PR #204 mergeado.
- **T4 — AprovacoesUnificadas.jsx:** GAP-3. Fila unificada agent_drafts (pending, canais não-diretos) + defesa_casos (aguardando_ok). Editar texto inline, Aprovar/Rejeitar. Degradação graceful se agent_drafts não existir. PR #205 mergeado.
- **ConsoleV2.jsx:** zona compartilhada atualizada 4× (fetch da main antes de cada edit, mudança mínima, merge imediato).
- **4 novas telas, 4 novos componentes, 4 PRs, 0 migrations SQL.** Etapa B 100% concluída.

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
