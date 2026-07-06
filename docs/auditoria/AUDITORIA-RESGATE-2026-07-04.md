> ## ⚠️ STATUS DESTE DOCUMENTO (lido em 05/07/2026)
> Registro histórico do diagnóstico de 04/07/2026 que fundamentou o
> **`docs/estrategia/PLANO-CONTINUIDADE-PLATAFORMA-2026-07.md`** — que é o **doc autoritativo**
> vigente. Em divergência, o plano vence. Itens desta auditoria **superados por decisões
> posteriores do Wandson (04/07)**:
> 1. ~~Instalar Tailwind~~ → **console.css claro oficializado** como design system (decisão 4).
> 2. ~~Quebrar ChatScreen.jsx~~ → T3 v1 classifica "maduro — não tocar"; refatorar SÓ se uma
>    feature tocar nele.
> 3. Fases 0-3 do "Plano de Resgate" (§5) → substituídas pela **sequência de 6 semanas** do
>    plano de continuidade (estruturação → API iFood).
> 4. Coleta de KPIs (Fase 1 §5) → reconciliada com o agente GESTOR já em produção; validação
>    Claude-first no Cowork = laboratório da F3.
> O restante (inventário, classificação mantém/refatora/refaz, riscos) permanece válido.

# AUDITORIA TÉCNICA + PLANO DE RESGATE
## Repositório: deli-consult-delivery/consult-delivery
### Data: 04/07/2026 | Auditor: Claude (a pedido de Wandson Silva)

---

## 1. VEREDITO EXECUTIVO

O projeto **não está quebrado — está sobrecarregado**. A fundação é sólida e acima da média
(multi-tenant, RBAC, RLS, agentes com governança, aprovação human-in-the-loop, memória central,
CI/CD, QA mandato). O que existe é **dívida de consolidação**: crescimento de ~235 migrations e
30+ telas em ~10 semanas, com 1 único humano na equipe, sem ciclos de refatoração entre as ondas
de features.

**A descoberta mais importante:** o "Jarvis" que você me pediu nesta conversa **já existe em
grande parte dentro do seu próprio código** — `Hermes` (CEO agent, migration 20260609),
`DELI` (COO orquestradora com semáforo Verde/Amarelo/Vermelho), `ApprovalsScreen` +
`DraftsPendentesScreen` (fila de aprovação), `AgentRunsScreen` (monitor de execuções),
`agent_memories` (memória). O trabalho não é construir do zero: é **consolidar, completar o
dashboard e polir**.

---

## 2. INVENTÁRIO DO QUE EXISTE

### 2.1 Backend / Dados (Supabase `czyanilrverorwenikqw`)
- **235 migrations** (824KB SQL), de 26/04 a 02/07/2026
- Multi-tenant completo: `tenants`, `tenant_members`, `tenant_modules`, `tenant_agents`,
  hierarquia de tenancy (fase 1b/1c aplicadas em 01/07)
- RBAC: 7 papéis + `audit_log` + `user_screen_permissions`
- Agentes no banco: DELI, LARA, VERA, BRENO, CORA, SOFIA, MAX, MIA, NOVA, ORACLE, HERMES (CEO),
  GESTOR, RADAR, ESTÚDIO, BOM DIA
- Sistemas completos: drafts com aprovação, tarefas + aprovações + templates (27KB de templates),
  campanhas, cobranças (Cora/Asaas), contratos, onboarding, goals, CSAT/NPS/avaliações,
  defesa de casos iFood, workspaces/espaços, heartbeats, knowledge base
- iFood: `ifood_merchants`, `lojas_portal_ifood` (02/07) — dados do portal já modelados

### 2.2 Frontend (React 18 + Vite)
- 30+ telas em `src/screens/`
- Telas por agente (Deli, Lara, Vera, Breno, Cora, Sofia, Max, Nova, Oracle, Mia)
- Telas de operação (Dashboard, Análise iFood, Approvals, Drafts, Kanban, Tasks, CRM, Grupos,
  Inadimplentes, Reports, Goals, KnowledgeBase, Memories, Heartbeats...)

### 2.3 Orquestração / Infra
- Trigger.dev cloud (runtime oficial dos agentes) + padrão de task com Zod
- Bridge Server (VPS 187.127.25.24:3001, systemd) | Infisical (secrets)
- Deploy: GitHub Actions → GitHub Pages → app.consultdelivery.com.br
- MCPs próprios: `ifood-mcp`, `asaas-mcp`, `evolution-mcp`, `vendaerp-mcp`, `admin-mcp`
- Coleta navegador: `ifood-browser/` + `ifood-portal-worker/` já existem
- Governança exemplar: CLAUDE.md, PLANO-MESTRE (63KB) + Tracker, RESTRUCTURE.md (doc
  autoritativo), WikiBrain, QA mandato, anti-padrões, índice de tech debts (TD#36–55)

---

## 3. CLASSIFICAÇÃO: MANTÉM / REFATORA / REFAZ

### ✅ MANTÉM (não tocar — é ativo valioso)
| Item | Motivo |
|---|---|
| Arquitetura multi-tenant + RBAC + RLS | Já pronta para a revenda futura (SaaS) |
| Trigger.dev como runtime de agentes | Decisão D1 correta; padrão de task maduro |
| Semáforo DELI + Drafts + Approvals | O human-in-the-loop que o mercado inteiro está tentando construir |
| Memória central (`client_facts`, `client_timeline`, `loja_metricas`) | Diferencial competitivo real |
| Governança de desenvolvimento (CLAUDE.md, Tracker, QA) | Acima do padrão de mercado |
| MCPs próprios + `ifood-portal-worker` | Base da coleta de KPIs via navegador |

### ⚠️ REFATORA (funciona, mas cobra juros todo dia)
| Item | Problema | Ação |
|---|---|---|
| `ChatScreen.jsx` — **306KB** | Monolito inmantenível; qualquer mudança é risco | Quebrar em módulos (lista, thread, composer, painéis) — *superado: só se feature tocar* |
| Telas > 40KB (BomDia 92K, CRM 61K, TarefasClientes 58K, Cora 56K, Sofia 50K, Grupos 50K, Encerramento 46K, Settings 45K, Goals 44K) | Mesmo padrão de monolito | Extrair componentes/hooks por tela, na ordem de uso |
| `index.css` — **136KB** | CLAUDE.md declara Tailwind, mas `package.json` **não tem Tailwind** — é CSS manual acumulado | *Superado: console.css claro é o DS oficial; congelar crescimento do CSS global* |
| `data.js` — 46KB | Resíduo de dados hardcoded | Migrar o que restou para Supabase; deletar |
| Navegação manual em `App.jsx` (15KB, sem react-router) | Roteamento caseiro limita deep-links e permissões por rota | Adotar react-router com guards RBAC |
| **235 migrations** | Fricção alta; histórico com dezenas de "fix" | **Squash em schema baseline** versionado (com snapshot + backup antes) |
| Mistura TS/JS (tsconfig + jsconfig, tudo .jsx) | Inconsistência | Padronizar TS gradualmente nos módulos novos |

### ❌ REFAZ (mais barato reconstruir)
| Item | Motivo |
|---|---|
| `DashboardScreen.jsx` (22KB) | É a tela MAIS usada pelo gestor e a MENOS desenvolvida do sistema. Reconstruir como Centro de Comando de KPIs, sobre `loja_metricas` + `radar_series` que já existem |

---

## 4. CORREÇÃO DE ROTA (honestidade intelectual)

A spec "Jarvis CD" desenhada no início da conversa de 04/07 sugeria **n8n** para crons/alertas e um
backend novo. **Estava desalinhada com a stack oficial**, que proíbe n8n na plataforma e usa
**Trigger.dev** como orquestrador. Corrigido:

- Crons/relatórios/alertas → **Trigger.dev scheduled tasks** (padrão já existente em `trigger/`)
- Chat do agente → estender `agent_chat_messages` + telas existentes, não LibreChat
- Fila de aprovação → `deli_pending_approvals` + `agent_drafts` (já existem)
- n8n permanece **apenas** na operação da consultoria (fora da plataforma), como já é hoje

---

## 5. PLANO DE RESGATE ORIGINAL (superado — ver plano de continuidade)

> Mantido como registro. A sequência vigente é a de 6 semanas do
> `PLANO-CONTINUIDADE-PLATAFORMA-2026-07.md`.

### 🔴 FASE 0 — Estancar: congelar features, squash das migrations, design system
### 🟠 FASE 1 — Centro de Comando (Dashboard): coleta dos 7 KPIs + grid semáforo + alertas
### 🟡 FASE 2 — Atendimento B2B (BRENO): triagem WhatsApp → resposta aprovável ou tarefa
### 🟢 FASE 3 — Marketing/Campanhas (LARA): briefing → arte + legenda + régua + disparo
### 🔵 CONTÍNUO — Refatoração guiada por uso (só telas tocadas)
### 📄 PARALELO — Dossiê iFood (LGPD, segurança, termos — para a homologação)

---

## 6. RISCOS REGISTRADOS

1. **Bus factor = 1.** Wandson é o único humano. Mitigação: a própria governança (Tracker/WikiBrain) + este relatório versionado no repo.
2. **RLS ainda em estabilização** (migrations de correção até 02/07). O squash + os testes de isolamento do mandato D5 são o remédio.
3. **Escopo emocional.** 15 agentes nomeados criam pressão de "terminar todos". Entregar valor com poucos (DELI, GESTOR/RADAR no dashboard, BRENO, LARA) — os outros ficam scaffolded sem culpa.

---

## 7. HANDOFF

Ver `docs/estrategia/PLANO-CONTINUIDADE-PLATAFORMA-2026-07.md` §7 (branches, protocolo e
primeiro comando da semana 1).
