# 🖥️ T3 — Mapa de Telas · Console Interno (v1 — revisado contra o app real)

> **v1 (2026-06-06, Cowork):** o v0 partia de "32 telas a construir". Revisão contra o **código real**
> (`src/screens/`, `Sidebar.jsx`) + screenshot do **DELI Hub** em produção mostrou que **~70% já existe**.
> O v1 reclassifica cada tela e muda o foco do protótipo: **não redesenhar o que funciona — prototipar os 8 gaps reais.**
> v0 completo no histórico git deste arquivo.

**Legenda:** ✅ JÁ EXISTE (evoluir) · 🔧 PARCIAL (gap específico) · 🆕 NOVA · 🟢 prioridade MVP · 🟡 V2 · 🔵 V3+

**Vocabulário real do app (usar este, não o do v0):** “DELI Hub” (catálogo+orquestração) · “Superagentes” · “Painel Agentes” · “Espaços” (tarefas-clientes) · “Disparos” · créditos no rodapé da sidebar · busca global no topo · tenant switcher no topo.

---

## 1. O que JÁ EXISTE (não prototipar — só evoluir onde indicado)

| v0 | Tela real (código) | Estado | Evolução sugerida |
|----|--------------------|--------|--------------------|
| S-00 Login | `LoginScreen` + `ResetPasswordScreen` | ✅ | tenant switcher já existe na topbar |
| S-01 Dashboard | `DashboardScreen` | 🔧 | dar destaque à fila de aprovações + alertas (churn/inadimplência/erro de agente) |
| S-02 DELI | `DeliScreen` + `DeliPainel` + prompt do DELI Hub | ✅ | — |
| S-03/04 Clientes | `CRMScreen` + `Contratos/` + `Recontratacao/` + `OnboardingScreen` | ✅ | flag de risco de churn + tier no card |
| S-05/06/07 Lojas | `lojas/` (detalhe c/ abas) | ✅ | métricas/snapshots 🟡 |
| S-08 Agentes | `AgentsPage` = **DELI Hub** (Superagentes, Meus/Todos, cards c/ exec e tempo) | 🔧 | **GAP-1: toggle de habilitação por tenant** — `tenant_agents` já cabeada no banco (onda 1), UI não expõe |
| S-09 Agente config | `AgentBuilderScreen` | 🔧 | **GAP-2:** modo (humano/híbrido/IA via `tenant_agent_config`), provider, custo — hoje só prompt/básico |
| S-10 Runs | `AgentRunsScreen` + “Atividade” na sidebar do Hub | ✅ | custo agregado vai pra GAP-4 (Custos) |
| S-11 Aprovações | `ApprovalsScreen` + `DraftsPendentesScreen` + `AgentInboxScreen` + `SugestaoModal` | 🔧 | **GAP-3: consolidar 3–4 superfícies numa FILA ÚNICA de aprovação** (coração do propõe-e-aprova) |
| S-12 MIA | `MiaAuditScreen` | ✅ | — |
| S-13 Chat | `ChatScreen` (+ bots, departamentos, Kanban de tarefas) | ✅ | maduro — não tocar |
| S-15/16 Cobrança | `InadimplentesScreen` + `CoraScreen` | ✅ | — |
| S-19 Memória | `MemoriesScreen` + `KnowledgeBaseScreen` (RAG) | ✅ | — |
| S-22/23 Rotinas | `AutomacoesScreen` + `HeartbeatsScreen` + `BomDiaScreen` + `EncerramentoScreen` | ✅ | EvoNexus-parity já melhor que o esperado |
| S-27 SOFIA | `SofiaScreen` + `Sofia/` | ✅ (v0 dizia 🔵 futuro — errado) | — |
| S-28 LARA | `LaraScreen` + `LaraEditorial/` + `campanhas/` | ✅ (idem) | — |
| S-32 Config | `SettingsScreen` + `Settings/` + `DepartmentManagementPage` | ✅ | — |
| (sem nº no v0) | `GoalsScreen` (Metas!), `KanbanScreen`, `TasksScreen`, `TarefasClientesScreen` (Espaços), `NotificacoesScreen`, `GruposScreen`, `WhatsappVinculosScreen`, `AnaliseiFoodScreen`, `BrenoScreen`, `MaxScreen`, `NovaScreen`, `VeraScreen`, `ReportsScreen` | ✅ | o v0 nem listava — já cobrem Metas/Tickets/Relatórios do checklist EvoNexus |

## 2. GAPS REAIS — escopo do protótipo clicável T3(b)

> Só isto entra no protótipo. 8 telas/pedaços, não 32.

| GAP | Tela/pedaço | Por que | Prio |
|-----|-------------|---------|------|
| **GAP-1** | **Habilitação de agentes por tenant** — toggle no DELI Hub/Painel Agentes (liga/desliga agente por cliente, lê/escreve `tenant_agents`) | Banco já pronto (onda 1); é A feature SaaS multi-tenant | 🟢 |
| **GAP-2** | **Agente config completo** — modo humano/híbrido/IA (`tenant_agent_config`), provider (D1 multi-provider), limites de custo | Completa o S-09; paridade EvoNexus “Provedores” sem tela separada | 🟢 |
| **GAP-3** | **Fila única de aprovações** — funde Approvals + DraftsPendentes + AgentInbox + sugestões MIA num só lugar com filtros (origem/agente/loja) | Hoje 4 lugares; humano-no-loop precisa de UM ponto | 🟢 |
| **GAP-4** | **Custos** — agregação por agente/dia/tenant a partir de `agent_runs.cost_usd` (1686 runs já logados); evolui o widget de créditos da sidebar | Paridade EvoNexus “Custos” (CORE); controle de margem | 🟢 |
| **GAP-5** | **Skills** — lista + editor (markdown-as-tool, globais vs por-tenant) | Único CORE do EvoNexus sem NENHUMA tela | 🟡 |
| **GAP-6** | **Audit log** — viewer de `audit_log` (quem/quê/quando/IP, filtros) | Tabela tem dados, zero UI; compliance multi-tenant | 🟡 |
| **GAP-7** | **Acesso a agentes por usuário** — UI de `user_agent_access` (agora com FK/tenant da onda 1) | Hoje só via SQL | 🟡 |
| **GAP-8** | **Templates** — lista + editor (mensagens e **ofertas**) | Paridade EvoNexus “Modelos”; LARA consome | 🟡 |

**Recorte do protótipo MVP = GAP-1 a GAP-4** (os 🟢): 4 telas/pedaços em React com dados fake, navegação entre eles, no visual do app atual (dark, sidebar, cards — referenciar o DELI Hub).

## 3. NÃO entra (decisão herdada do checklist FASE 1)

MemPalace · Terminal embutido · MCP Servers · Plugins/Marketplace · Docs · Sistemas → **DEPOIS** (v2+). Workspace/file-browser e Links compartilhados → 🟡 avaliar depois dos GAPs.

## 4. Divergência registrada (doc vence memória)

- Screenshot mostra **NOVA = “Agente de novidades e conteúdo”** e **MAX = “consultor técnico e auditoria de cardápio”** — descrições divergem do RESTRUCTURE §11 (NOVA = automação vendida a clientes; MAX = suporte a sistemas). Não bloqueia T3; alinhar descrições quando tocar no catálogo.
- Sidebar real não tem grupo “Admin” do v0; Config/Grupos vivem em “Sistema”.

## ▶️ Próximo passo

Wandson bate o olho neste v1 (especialmente §2) → com o ok, Cowork constrói o **protótipo clicável dos GAP-1..4** (React, dados fake, navegação, visual DELI Hub). Aprovado o protótipo → vira código real por gap, um PR por vez.
