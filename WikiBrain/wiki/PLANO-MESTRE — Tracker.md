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

_Última sessão: 2026-06-08 (Cowork — sessão 13: **PR9 multi-tenant + PR10 assinaturas Asaas — ciclo comercial completo PROVADO em sandbox**)_

- **PR9 ✅ (#187):** tela **Clientes (plataforma)** no Console v2 (Admin) — cria tenant + owner + convite do dono via bridge `/users/invite` + toggle Defesa. **Gating D7 cabeado nas 2 pontas:** vigia pula tenants sem `defesa` em `tenant_agents` (preserva allowlist do PR8); tela Defesa vira **paywall R$147** quando desabilitada (pill "RADAR GRÁTIS"). Sem SQL novo. Bundle verificado `index-U8Exi0qN.js`.
- **PR10 ✅ (#189) + migrations 008/009 aplicadas:** assinaturas da Defesa via **fila-por-tabela** (`defesa_assinaturas`): tela grava `pendente` (policy INSERT admin, isolamento provado: admin insere/intruso bloqueado) → `defesa-criar-assinatura` (cron 5min) cria customer+subscription R$147 MONTHLY no Asaas → `defesa-sync-assinaturas` (cron 15min) **liga a Defesa quando paga** e desliga com 2+ vencidas. Cliente Asaas próprio (`ASAAS_DEFESA_*` com fallback) — **sandbox da Defesa sem tocar a config da CORA** (Wandson cadastrou as env vars).
- **PROVA E2E EM SANDBOX (output bruto):** fila 02:53:59 → customer `cus_000008114142` + sub `sub_5oxdzvzhqufpzefz` + link `sandbox.asaas.com/i/w7k5q6...` em **68s** → Wandson confirmou pagamento → sync 03:30:35: status **ativa** · cobrança **RECEIVED** · **`tenant_agents` defesa criada SOZINHA** · notificação "ATIVADA" no sino. **Ciclo comercial autônomo: criar cliente → Radar grátis → assinar → pagou, ligou → atrasou 2, desligou.**
- **Correção de registro:** a pendência "deploy do worker" da sessão 12 **não existia** — deploy do worker é AUTOMÁTICO via Actions em todo push à main (provado na página Deployments: `20260608.2` do commit do PR8, "Automatically triggered by pushes to main"). Allowlist do PR8 está ATIVA em produção desde 22:33 de 07/06.
- **Sessão paralela do Estúdio de Conteúdo** rodando com handoff próprio (`docs/handoff/HANDOFF-ESTUDIO-CONTEUDO.md`, #188): GPT Image 2 via OpenRouter (key já existia no Trigger), Console v2 grupo Agentes IA, plano E1-E4. Coordenação: prefixo `feat/estudio-*`, rebase em ConsoleV2.
- Restos de teste no banco (manter p/ inspeção do Wandson; limpar depois): tenant `Cliente Teste Sandbox` (fd7d9eb9) + assinatura ativa de teste + assinatura/customer no sandbox Asaas.
- **⚠️ Pendentes antigos:** `.obsidian/*`/`log.md` · grants órfãos P-5 · rotação credenciais · 2 ajustes protótipo Claude Design.

---

## 👉 Próxima ação

1. **Etapa A — itens restantes:** PR11 (C5-C7: FASE 2 onda 2 — P-2 cutover logAgentRun · P-3 contract user_agent_access · P-4 tenant_agent_config · P-5 grants órfãos) · PR12 (C3: Radar real — decidir fonte de dados com o Wandson).
2. **Depois da Etapa A:** Etapa B (telas GAP-1..4 no Console v2) → Etapa C (agentes novos / ex-F2) → Etapa D (white-label). Estúdio corre em paralelo na outra sessão.
3. **Wandson — beta real:** ativar 1 loja real (tela Ativar loja) · vincular grupo · 1 semana de vigia · registrar ganho/perdido. Quando fechar a 1ª loja pagante de fora: trocar `ASAAS_DEFESA_ENVIRONMENT` p/ production (ou remover o override).
4. Limpeza dos registros de teste (tenant sandbox + assinatura) quando o Wandson autorizar.

---

## 📊 Status por track

| Track | Nome | Status | Última ação |
|-------|------|--------|-------------|
| T1 | Plataforma CD (V1→V3) | 🔄 | Console v2: 5 telas reais + Clientes/paywall (PR9/PR10) |
| T2 | EvoNexus-replica | ✅ onda 1 | onda 2 = PR11 (próximo da Etapa A) |
| T3 | Visual-First / telas | 🔄 | F1 ✅ no design definitivo; Estúdio em design (sessão paralela) |
| T4 | Hermes | 🔄 | aguarda GATE 0 |
| T5 | Segurança | ✅ | RLS provada em defesa_casos/aprovadores/assinaturas (008/009) |
| T6 | Agentes IA | ✅ | DEFESA+VIGIA+allowlist ativos; Estúdio em gestação |
| T7 | PILOTO | 🔄 | Onda 03 não aplicada |
| T8 | Infra/CI | ✅ | deploy triplo automático (Pages+Trigger+Bridge self-hosted) confirmado |
| T9 | Negócio | 🔓 D6 reaberta | **PLATAFORMA VENDE E COBRA SOZINHA (sandbox provado) — falta 1º cliente real** |

---

## 📋 Log de sessões

### 2026-06-08 (sessão 13 — Cowork: PR9 + PR10 — multi-tenant + monetização)
- D7 decidida (Radar grátis até pagar · R$147 sem setup) · PR9 #187 (Clientes + gating D7) · PR10 #189 (assinaturas Asaas fila→cron→sync)
- Migrations 008/009 aplicadas (isolamento provado) · e2e sandbox completo: link em 68s, ativação automática pós-pagamento às 03:30
- Handoff do Estúdio (#188) p/ sessão paralela · corrigido registro: deploy do worker é automático (Actions)

### 2026-06-07/08 (sessão 12 — Cowork: D6 REABERTA + Etapa A aprovada + PR8)
- Wandson reabriu a D6 (decisão consciente, alertado sobre anti-dispersão). Registro feito aqui e no PLANO-MESTRE (Decisões Travadas — fecha pendência antiga).
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
