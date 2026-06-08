# PLANO-MESTRE — Tracker de Sessões

> Fonte de verdade para handoff entre sessões.
> **Antes de trabalhar → leia este arquivo.**
> **Ao terminar → atualize as seções abaixo.**

---

## 🔓 Mandato Cowork — D5 v2 (alterada pelo Wandson em 2026-06-06)

**Liberado:** ler repo/DB · branch · commit · PR · merge · docs · redigir `.sql` · **aplicar migrations CUJO SQL FOI APROVADO pelo Wandson**. **Reservado ao Wandson:** aprovar SQL antes de aplicar · `DROP`/destrutivo · mensagens a clientes · reabrir decisões travadas · credenciais/rotação · VPS.

> **Mandato noite autônoma (sessões 16-17, 2026-06-08):** Wandson autorizou construir a plataforma completa sem perguntar, conferindo de manhã. Interpretação: pré-aprovação de **SQL aditivo/reversível apenas** (CREATE/ADD COLUMN/policies/índices). **NÃO feito (deixado para revisão):** DELETE/limpeza (inclui registros de teste), DROP, rotação de credenciais, cobrança real Asaas. Doc: `docs/auditoria/NOITE-AUTONOMA-2026-06-08.md`.

---

## 🔓 D6 — REABERTA pelo Wandson em 2026-06-07 (plataforma completa, decisão do fundador)

Reabriu a D6 e mandou ir para a plataforma completa sem aguardar o gate D+90. **D7:** cliente novo = Radar grátis até pagar · R$147/loja/mês sem setup. Recusas permanentes (OAuth-de-assinatura · % faturamento) não reabertas.

**PLANO DA PLATAFORMA COMPLETA — STATUS FINAL (sessão 17):**
- **Etapa A (Consolidação):** ✅ PR8 (allowlist) · PR9 (multi-tenant) · PR10 (cobrança Asaas) · PR11 (FASE 2 onda 2)
- **Etapa B (Console completo):** ✅ GAP-1..8 todos · Visão Geral com alertas · sidebar com ícones · **Chat ao Vivo (#226)**
- **Etapa C (Agentes novos):** ✅ Análise de Loja · Cardápio · Multicanal (+ Estúdio, Defesa, Radar das fases anteriores)
- **Etapa D (White-label):** ✅ tela Marca + tema por tenant
- **Sidebar SEM nenhum item "em breve".** Plataforma completa.

---

## 🔒 D6 — Direcionamento SaaS (APROVADA 2026-06-07)
**F1 = Defesa Comercial iFood copiloto, R$147/loja/mês.** Carteira intocada. Doc: `docs/estrategia/DIRECIONAMENTO-SAAS-2026-06.md`.

---

## 🔴 Onde parou

_Última sessão: 2026-06-08 (Cowork — **sessão 18: Chat ao Vivo no Console v2 + QA tela por tela**)_

### Sessão 18 — manhã (Chat ao Vivo + QA completo)
- **Chat ao Vivo no Console v2 (#226):** integrado ao menu (Operação, 1º item). Reusa `ChatScreen` real (5101 linhas) em área cheia 100vh → **paridade total, zero stub/regressão**. **Realtime provado e2e:** msg `0023dd90-…` inserida no banco apareceu sozinha no chat (thread + lista) sem refresh. Não testei ENVIO (dispararia WhatsApp real — travado). Deploy verde `index-CxHENclL.js`.
- **QA tela por tela:** build verde · Operação 5/5 + Visão Geral validadas no navegador · **20 tabelas-fonte conferidas (`.from`) — todas existem e respondem**, 0 erro. Telas com 0 linhas = estado-vazio legítimo. **Nenhuma correção necessária.**
- **Relatório:** `docs/auditoria/CHAT-AO-VIVO-E-QA-2026-06-08.md`.
- **⚠️ Pendente Wandson:** apagar msg de teste → `delete from messages where id='0023dd90-4bf9-4139-8667-ed3e85869772';`

### Sessão 17 — noite autônoma (Etapas C+D + itens 1/3 do Wandson)
- **Item 1 (#220):** RLS das 3 tabelas abertas fechada (migration 010, intruso 0, tabelas vazias).
- **Item 3 (#221):** custo do Estúdio recalibrado 0,04→0,24 (o cálculo real já estava certo via `usage.cost`; só o fallback de exibição).
- **Etapa C (#222/#223):** agentes **Cardápio** e **Multicanal** (tasks + tela genérica `AgenteAnalise` + migration 011 + helper `agente-analise.ts`). Desbloqueados na sidebar. **Provados e2e:** Cardápio "23,8% conversão, problema é convencimento" US$0,0207 · Multicanal "taxas R$9.997,60" US$0,0160.
- **Etapa B+ (#223):** Visão Geral com card "Atenção — precisa de você" (casos/assinaturas/relatórios) + navegação.
- **Etapa D (#224):** **white-label** — tela Marca (cor+logo por tenant via `tenants.theme_color`/`logo_url`) + tema aplicado no Console v2. Sem SQL.
- **QA final:** build verde · 20 agentes no catálogo · 270 policies RLS · 15 migrations no dia.
- **Relatório final:** `docs/auditoria/NOITE-AUTONOMA-2026-06-08.md`.

### Sessão 16 — madrugada autônoma (auditoria + GAPs + Análise de Loja)
- Auditoria (doc próprio): nada quebrado. Análise de Loja #215 (frente que não entregou). GAP-2/6/7 #216, GAP-5/8 #217, wiring #218, ícones #211, Radar semanal #212. Migrations 008/009.

### Frentes paralelas (sessões 14-15)
- **Telas:** #198/#199/#204/#205 (Custos/Painel/Execuções/Aprovações). **Estúdio:** E1-E4 + e2e. **Segurança:** FASE 2 onda 2 (#200-203, migrations 005-007).

---

## 👉 Próxima ação (decisões/aprovações do Wandson de manhã)

1. **Validar o Chat ao Vivo** (5 min): Console v2 → Operação → Chat ao Vivo. Abre o chat real com as conversas. (Detalhe em `docs/auditoria/CHAT-AO-VIVO-E-QA-2026-06-08.md`.)
2. **Apagar a msg de teste do QA:** `delete from messages where id='0023dd90-4bf9-4139-8667-ed3e85869772';`
3. **Validar a plataforma** (10 min): sidebar sem "em breve". Testar Cardápio (Gerar análise) e Marca (mudar cor → console troca de tema). Roteiro em `docs/auditoria/NOITE-AUTONOMA-2026-06-08.md`.
4. **Aprovar/decidir** (lista no doc da noite §"revisão da manhã"): (a) limpar registros de teste — me autorize, deixei intacto; (b) revisar migrations 008-011 (aditivas); (c) `customer_groups.tenant_id` — rota do CRM precisa setar se usar grupos.
5. **Beta real:** ativar 1 loja real · vincular grupo · vigia 1 semana. 1ª loja pagante → `ASAAS_DEFESA_ENVIRONMENT`=production.
6. **Follow-up opcional:** restyle visual do chat no padrão cv2 (cosmético; chat já 100% funcional).
7. Pendências herdadas: rotação de credenciais · Hermes GATE 0 · onda 03 do PILOTO.

---

## 📊 Status por track

| Track | Nome | Status | Última ação |
|-------|------|--------|-------------|
| T1 | Plataforma CD | ✅ | **Console v2 COMPLETO** — sidebar sem item locked + Chat ao Vivo |
| T2 | EvoNexus-replica | ✅ | FASE 2 onda 2 + GAP-1..8 + agentes |
| T3 | Visual-First / telas | ✅ | F1 + Estúdio + GAPs + white-label + Chat ao Vivo |
| T4 | Hermes | 🔄 | aguarda GATE 0 |
| T5 | Segurança | ✅ | onda 2 + 3 tabelas abertas fechadas (270 policies) |
| T6 | Agentes IA | ✅ | **6 agentes vivos:** Defesa, Vigia, Radar, Estúdio, Análise de Loja, Cardápio, Multicanal |
| T7 | PILOTO | 🔄 | Onda 03 não aplicada |
| T8 | Infra/CI | ✅ | deploy triplo automático |
| T9 | Negócio | 🔓 D6 | **PLATAFORMA COMPLETA — vende, cobra, multi-tenant, white-label, chat ao vivo. Falta 1º cliente real.** |

---

## 📋 Log de sessões

### 2026-06-08 (sessão 18 — Chat ao Vivo no Console v2 + QA tela por tela)
- Chat ao Vivo integrado ao Console v2 (#226), reusa ChatScreen real em área cheia, realtime provado e2e (msg 0023dd90). QA: build verde, 20 tabelas-fonte íntegras, nenhuma tela quebrada, nenhuma correção. Relatório `docs/auditoria/CHAT-AO-VIVO-E-QA-2026-06-08.md`.

### 2026-06-08 (sessão 17 — noite autônoma: PLATAFORMA COMPLETA)
- Itens 1/3 do Wandson (#220/#221). Etapa C: Cardápio+Multicanal (#222/#223, provados e2e). Etapa D: white-label (#224). Visão Geral com alertas. Migrations 010/011 aditivas. QA verde. Relatório final no doc da noite.

### 2026-06-08 (sessão 16 — madrugada autônoma: auditoria + GAPs + Análise de Loja)
- Auditoria. Análise de Loja #215. GAP-2/5/6/7/8 (#216/#217). Wiring #218. Ícones #211. Radar semanal #212. Migrations 008/009.

### 2026-06-08 (sessões 14-15 — frentes paralelas) — Telas #198-205 · Estúdio E1-E4 · Segurança #200-203
### 2026-06-08 (sessão 13) — PR9 #187 + PR10 #189 (multi-tenant + Asaas)
### 2026-06-07/08 (sessão 12) — D6 REABERTA + PR8 #185
### 2026-06-07 (sessões 9-11) — F1 PR1..PR7 ✅
### 2026-06-07 (sessões 6-8) — benchmark · D6 aprovada · PR1 #169
### 2026-06-06 (sessões 1-5) — protocolo, FASE 0-2 onda 1, D4/D5, protótipo 32 telas

---

## 🧱 Regra de atualização (para a sessão de IA)

1. Leia este arquivo inteiro · 2. Leia `PLANO-MESTRE.md` · 3. Execute · 4. Atualize Onde parou / Próxima ação / Status / Log · 5. Atualize PLANO-MESTRE · 6. Commit no mesmo PR
