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

_Última sessão: 2026-06-07 (Cowork — sessão 10: VIGIA automático — cancelamentos caem na fila sozinhos)_

- **PR5c ✅ ACEITO (#179):** task `defesa-vigia` (cron 5min) varre `messages` inbound (Supabase fonte primária, P3), detecta menção `@defesa` ou padrões de cancelamento, deduplica por `origem_message_id`, resolve loja pelo grupo, extrai valor R$ do texto e dispara `defesa-analisar-caso`. **Teste real:** mensagem plantada 20:15:57 → caso na fila 20:20:44 (4m47s) · valor R$ 62,50 extraído sozinho · loja "Cannoli" identificada pelo contexto do grupo · **dedupe provado** (2ª varredura não duplicou). Modelo WhatsApp preservado (vigia nunca responde na conversa).
- Sessão 9: F1 PR2→PR5 aceitos (fila real; aprovação do Wandson gravada no banco; padrão P6 qa-knowledge).
- Sessões 6-8: benchmark #167 · direcionamento #168 · D6 · PR1 #169.
- **F1 operacional ponta-a-ponta SEM toque humano na entrada:** WhatsApp → vigia → análise IA → fila → OK do Wandson → auditoria. Falta só o lado do envio/resultado.
- **⚠️ Pendentes antigos:** `.obsidian/*`/`log.md` trackeados · grants órfãos P-5 · rotação credenciais · 2 ajustes do protótipo Claude Design · registrar D6 no PLANO-MESTRE.md · vincular grupos→lojas (`whatsapp_groups.loja_id` está 100% nulo; onboarding PR7).

---

## 👉 Próxima ação

1. **PR6:** transição enviado→ganho/perdido com `resultado_valor_centavos` (alimenta "R$ defendido") + Radar real (rotina semanal).
2. **PR5b:** reply-loop de OK pelo WhatsApp (webhook Evolution + `parse-resposta-cliente`).
3. **PR7:** onboarding self-service + vínculo grupos→lojas + qualificação por volume.
4. Docs: D6 no `PLANO-MESTRE.md` · 5.5 consolidar docs · FASE 2 onda 2 (P-2/P-3/P-5).

---

## 📊 Status por track

| Track | Nome | Status | Última ação |
|-------|------|--------|-------------|
| T1 | Plataforma CD (V1→V3) | 🔄 | Console v2: Visão Geral + Defesa REAIS (#171-#179) |
| T2 | EvoNexus-replica | ✅ onda 1 aplicada | onda 2 a redigir |
| T3 | Visual-First / telas | ✅ | F1 no design definitivo |
| T4 | Hermes | 🔄 3A ✅ / 3B bloqueado | aguarda GATE 0 |
| T5 | Segurança | ✅ | defesa_casos com RLS provada |
| T6 | Agentes IA | 🔄 | **DEFESA + VIGIA vivos** (entrada automática de casos funcionando) |
| T7 | PILOTO | 🔄 | Onda 03 não aplicada |
| T8 | Infra/CI | ⚠️ 2 riscos | deploy-trigger automático validado 2x |
| T9 | Negócio | 🔒 D6 travada | produto F1 com entrada automática — pronto p/ beta na carteira |

---

## 📋 Log de sessões

### 2026-06-07 (sessão 10 — Cowork: vigia automático PR5c)
- #179: defesa-vigia (cron 5min, Supabase P3, dedupe origem_message_id, valor R$ extraído, loja por grupo)
- Aceite com output bruto: caso automático em 4m47s · R$ 62,50 · loja Cannoli · dedupe 1 caso após 2 varreduras

### 2026-06-07 (sessão 9 — Cowork: build F1 PR2→PR5)
- PR2 #171 dados reais + bug cap-1000 (achado pelo Wandson) → fix #173 + padrão P6 #174
- PR3 migration 006 aplicada (isolamento provado); PR4 #175 agente + seed 007 (#176); e2e 23s US$0,0139
- PR5 #177 fila real + draft/sino/DELI; aceite: aprovação do Wandson gravada (20:05 UTC)

### 2026-06-07 (sessões 6-8 — Cowork: benchmark → D6 → build F1 PR1)
- Benchmark #167 + Gemini; método adversarial → DIRECIONAMENTO-SAAS #168; **D6 aprovada**; PR1 #169 em produção

### 2026-06-06 (sessão 5) — mapa v1 #163; protótipo 32 telas #164
### 2026-06-06 (sessão 4) — FASE 2 onda 1 APLICADA; isolamento 0/0/0; D5 v2
### 2026-06-06 (sessão 3) — conector GitHub escrita; #156/#152/#158/#159; D4+D5; 5.4
### 2026-06-06 (sessão 2) — 5.1 fechado
### 2026-06-06 (sessão 1) — PLANO-MESTRE raiz; #154; Hermes 3A; T3 v0

---

## 🧱 Regra de atualização (para a sessão de IA)

1. Leia este arquivo inteiro · 2. Leia `PLANO-MESTRE.md` · 3. Execute · 4. Atualize Onde parou / Próxima ação / Status / Log · 5. Atualize PLANO-MESTRE · 6. Commit no mesmo PR
