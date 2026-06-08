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

**A confirmar com o Wandson na sessão 12 (perguntas enviadas):** o que da D6 sobrevive — carteira de consultoria intocada · preço Defesa R$147/loja/mês · métricas D+90 como painel de acompanhamento (sem gate). Recusas permanentes (OAuth-de-assinatura · % sobre faturamento) **não** foram reabertas.

Plano da plataforma completa (Consolidação C1–C8 + telas GAP-1..8 + agentes + white-label): redigido na sessão 12. **Etapa A (Consolidação) APROVADA pelo Wandson na própria sessão 12** ("Bora fazer") — execução iniciada pelo PR8.

---

## 🔒 D6 — Direcionamento SaaS (APROVADA pelo Wandson em 2026-06-07)

**F1 = "Defesa Comercial iFood — modo copiloto" a R$147/loja/mês.** Carteira INTOCADA (beta não-pagante; venda só a lojas novas). ROI em cesta "R$ defendido". **Gate D+90** (`docs/estrategia/DIRECIONAMENTO-SAAS-2026-06.md` §5) antes de qualquer F2. Anti-dispersão aprovada. Kill-switch da Cris (§6). Plano: `docs/estrategia/F1-BUILD-PLAN.md`.
*Pendência resolvida na sessão 12: D6 gravada no `PLANO-MESTRE.md` (raiz).*

---

## 🔴 Onde parou

_Última sessão: 2026-06-08 (Cowork — sessão 12: **D6 REABERTA · Etapa A aprovada · PR8 ✅ entregue**)_

- **Sessão 12:** D6 reaberta registrada (acima). Plano da plataforma completa apresentado; **Etapa A aprovada pelo Wandson**.
- **PR8 ✅ (#185, merged):** allowlist do "@defesa ok" por **JID real** (join `messages.whatsapp_msg_id → whatsapp_messages → whatsapp_contacts.evolution_jid`; evidência 33/33 inbound 24h com JID; pushName é falsificável, JID não) + seção "Aprovadores do @defesa" na tela Ativar loja. Regra: allowlist vazia = modo aberto (F1, com rastro); 1+ ativos = só allowlist (comando externo ignorado + alerta + `comando_jid` no rastro). Webhook NÃO tocado.
- **Migration `20260608_001_defesa_aprovadores` APLICADA** (SQL aprovado, D5 v2): 4 policies + RLS on + 3 índices; **isolamento provado** (intruso vê 0 · membro vê 1). Seed: Wandson cadastrado aprovador do tenant consult (id `2d56cf67…`).
- **Limpeza aprovada dos 3 casos de teste executada** (DELETE com returning: R$89,00 · R$62,50 · R$41,90) → `defesa_casos` = 0 linhas; painel "R$ defendido" zerado para produção real.
- **⚠️ PENDENTE: deploy do worker Trigger.dev** — o vigia novo (allowlist) só vale em produção após `npx trigger.dev@4.4.6 deploy`; credencial está na outra sessão Cowork. **Até lá o modo é o da F1 (aberto, com rastro)** — sem risco novo, mas a allowlist ainda não bloqueia.
- Sessão 11 (histórico):
- **PR6 ✅ (#181):** seção "Em andamento" — Marcar enviado → **Ganho** (valor recuperado inline) / **Perdido**; `resultado_valor_centavos` alimenta a view → cartão "R$ defendido" acumula. Sem SQL novo.
- **PR5b ✅ (#182):** **OK pelo WhatsApp** — vigia entende `@defesa ok|aprovo|aprovar` e `@defesa descartar` na MESMA conversa do caso (idempotente; rastro via/quem na analise; nenhum agente envia nada). **Prova e2e em produção:** caso #9034 R$ 41,90 criado pelo vigia 22:05 → "@defesa ok" 22:09:32 → **aprovado 22:10:12 (40s)** com `via=whatsapp` + nome de quem mandou.
- **PR7 ✅ (#183):** onboarding self-service "**Ativar loja**" — cadastro + **qualificação D6 ao vivo** (≥300 pedidos/mês OU ≥6 cancelamentos/mês) + **vínculo grupo→loja** (`whatsapp_groups.loja_id`, zera gap dos grupos órfãos) + instruções do fluxo + lista de lojas ativadas. Sem SQL novo.
- Bundle final verificado: `index-Di3-s9E7.js` contém PR6+PR7; worker com vigia v2.
- **F1 — PLACAR FINAL: PR1–PR7 ✅ · 12+ PRs · 2 migrations aplicadas · agente DEFESA + VIGIA vivos · ciclo completo: WhatsApp → caso automático → análise IA (US$0,014) → OK (painel ou "@defesa ok") → enviado → ganho/perdido → R$ defendido.**
- Fora do escopo F1 (registrado): Radar real (sem fonte de dados ainda — tela com exemplo rotulado) · ~~allowlist de quem pode aprovar via WhatsApp~~ ✅ PR8 · ativação multi-tenant self-service (depende de signup público).
- **⚠️ Pendentes antigos:** `.obsidian/*`/`log.md` · grants órfãos P-5 · rotação credenciais · ~~D6 no PLANO-MESTRE.md~~ ✅ · 2 ajustes protótipo Claude Design.

---

## 👉 Próxima ação

1. **Deploy do worker Trigger.dev na sessão com credencial** (ativa a allowlist do PR8 em produção).
2. **Etapa A continua:** PR9 (C1 tenant self-service) → PR10 (C2 cobrança R$147 Asaas) → PR11 (C5 FASE 2 onda 2) → PR12 (C3 Radar real — definir fonte). Perguntas em aberto p/ Wandson: o que da D6 sobrevive (carteira/R$147/métricas como painel) · modelo de cobrança Asaas (R$147×loja? setup?) · fonte do Radar · white-label no fim?
3. Em paralelo, continua valendo: **Wandson valida a F1 no uso real** — ativar 1 loja real na tela "Ativar loja" · vincular o grupo · deixar o vigia rodar 1 semana · registrar ganhos/perdidos. É o ensaio do beta.
4. **Beta (ex-D+90):** recrutar primeiras lojas FORA da carteira (meta §5: 10-12 pagantes, ativação ≥80%, R$ defendido ≥2x mensalidade em 50%, churn<8%).
5. Técnico em paralelo (absorvido pelo plano da sessão 12): ~~limpar casos de teste~~ ✅ · ~~allowlist aprovadores~~ ✅ (PR8) · Radar real quando houver fonte · FASE 2 onda 2 · ~~D6 no PLANO-MESTRE.md~~ ✅ · 5.5.

---

## 📊 Status por track

| Track | Nome | Status | Última ação |
|-------|------|--------|-------------|
| T1 | Plataforma CD (V1→V3) | 🔄 | Console v2 F1 completo (4 telas reais) + Aprovadores PR8 |
| T2 | EvoNexus-replica | ✅ onda 1 | onda 2 a redigir (PR11 da Etapa A) |
| T3 | Visual-First / telas | ✅ | F1 concluída no design definitivo |
| T4 | Hermes | 🔄 | aguarda GATE 0 |
| T5 | Segurança | ✅ | RLS defesa_casos + defesa_aprovadores provadas |
| T6 | Agentes IA | ✅ F1 | DEFESA+VIGIA em produção; allowlist aguarda deploy worker |
| T7 | PILOTO | 🔄 | Onda 03 não aplicada |
| T8 | Infra/CI | ⚠️ | deploy duplo (Pages+Trigger) validado em série |
| T9 | Negócio | 🔓 D6 reaberta | **Plataforma completa: Etapa A em execução (PR8 ✅)** |

---

## 📋 Log de sessões

### 2026-06-07/08 (sessão 12 — Cowork: D6 REABERTA + Etapa A aprovada + PR8)
- Wandson reabriu a D6 (decisão consciente, alertado sobre anti-dispersão). Registro feito aqui e no PLANO-MESTRE (Decisões Travadas — fecha pendência antiga).
- Plano apresentado (A Consolidação → B telas GAP-1..4 → C agentes+F2 → GAP-5..8 → D white-label); **Etapa A aprovada**.
- PR8 #185 merged: allowlist @defesa por JID + UI Aprovadores · migration 20260608_001 aplicada (isolamento intruso 0/membro 1) · seed aprovador Wandson · 3 casos de teste deletados (aprovado). Pendente: deploy worker Trigger.dev.

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
