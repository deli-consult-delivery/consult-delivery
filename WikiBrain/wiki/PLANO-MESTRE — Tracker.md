# PLANO-MESTRE — Tracker de Sessões

> Fonte de verdade para handoff entre sessões.
> **Antes de trabalhar → leia este arquivo.**
> **Ao terminar → atualize as seções abaixo.**

---

## 🔓 Mandato Cowork — D5 v2 (alterada pelo Wandson em 2026-06-06)

**Liberado:** ler repo/DB · branch · commit · PR · merge · docs · redigir `.sql` · **aplicar migrations CUJO SQL FOI APROVADO pelo Wandson** (sempre: SQL versionado antes · 1 arquivo por vez · validação com output bruto · parar no 1º erro · teste de isolamento quando tocar RLS).

**Reservado ao Wandson:** aprovar o SQL antes de aplicar · `DROP`/destrutivo · mensagens a clientes (drafts) · reabrir decisões travadas / 🛑 CHECKPOINTS · credenciais/rotação · comandos na VPS.

---

## 🔴 Onde parou

_Última sessão: 2026-06-06 (Cowork — sessão 5: T3 revisão + protótipo)_

- **T3(a) mapa v1 ✅ (#163):** revisão contra o código real (`src/screens/` = 40+ telas) + screenshot do DELI Hub — ~70% do mapa v0 JÁ EXISTE; 8 gaps reais identificados (GAP-1..8 no doc).
- **Decisão do Wandson (escopo T3b):** protótipo COMPLETO com as ~32 telas estilo EvoNexus + redesign moderno do console inteiro — ele quer reconstruir a UI da plataforma nesse padrão (multi-tenant). Substitui o recorte de 4 gaps.
- **T3(b) protótipo ✅ ENTREGUE (#164, `6092e98`):** `docs/prototipo/console-v2.html` — arquivo único, abre com duplo clique. 32+ telas em 6 grupos, login c/ seleção de tenant, **tenant switcher funcional** (A não vê B), toggles `tenant_agents`, fila única de aprovações interativa, custos c/ gráfico, config de agente (modo/provider/RBAC). Visual dark EvoNexus (#0b0f1a + verde #00ffa7) + marca CD.
- Sessão anterior (4): FASE 2 onda 1 APLICADA com isolamento provado; D5 v2; fatos equipe/COO.
- **⚠️ Pendentes antigos:** `.obsidian/*` e `log.md` trackeados · grants órfãos P-5 · rotação credenciais.

---

## 👉 Próxima ação

1. **Wandson:** `git pull` na pasta → abrir `docs/prototipo/console-v2.html` (duplo clique) → clicar à vontade (trocar tenant no topo, ligar/desligar agentes, aprovar/rejeitar na fila) → anotar o que mudar (cores, nomes, telas a cortar/juntar).
2. **Com o feedback:** Cowork itera o protótipo → travado o visual, começa a construção real tela a tela (1 PR por tela, CORE primeiro), reusando o que já existe (Chat preservado).
3. **FASE 2 onda 2** (paralelo): P-2 cutover logAgentRun · P-3 contract user_agent_access · P-5 grants órfãos · tenants seed.
4. **5.5** consolidar docs de plano.

---

## 📊 Status por track

| Track | Nome | Status | Última ação |
|-------|------|--------|-------------|
| T1 | Plataforma CD (V1→V3) | 🔄 ~95% | console v2 (T3) vai absorver o redesign da UI |
| T2 | EvoNexus-replica | ✅ onda 1 aplicada | onda 2 a redigir; framework de telas validado no protótipo |
| T3 | Visual-First / telas | ✅ mapa v1 + **protótipo 32 telas entregue** | 👉 Wandson clica e dá feedback → iteração → build real |
| T4 | Hermes | 🔄 3A ✅ / 3B bloqueado | aguarda GATE 0 |
| T5 | Segurança | ✅ 4 brechas RLS corrigidas | rotação adiada |
| T6 | Agentes IA | 🔄 | DELI em andamento |
| T7 | PILOTO | 🔄 | Onda 03 não aplicada |
| T8 | Infra/CI | ⚠️ 2 riscos | — |
| T9 | Negócio | contexto | 1º cliente real = prioridade |

---

## 📋 Log de sessões

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
