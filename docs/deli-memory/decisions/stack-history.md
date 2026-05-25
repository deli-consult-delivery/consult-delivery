# Histórico de Decisões de Stack

## Fase 0 — Reestruturação (12-13/05/2026)

**Decisão:** Migrar orquestrador de agentes de OpenClaw para Trigger.dev cloud.

**Antes:** OpenClaw (local, experimental, porta 18789)  
**Depois:** Trigger.dev cloud (proj_slexhoelcjwgbopmbzzr) + @anthropic-ai/sdk + Zod

**Motivos:**
- OpenClaw sem suporte ativo
- Trigger.dev oferece retry nativo, scheduling, dashboard de runs, composição de tasks
- @anthropic-ai/sdk permite modelo padrão `claude-sonnet-4-6` + web_search_20250305
- Zod garante contratos fortes entre input/output de cada task

**Decisão 2:** Remover n8n da stack.  
Execução de tarefas agora é 100% Trigger.dev. n8n não é usado.

**Decisão 3:** EvoNexus em POC (avaliação).  
Instalado em evonexus.evolutionfoundation.com.br (VPS), roda sobre Claude Code SDK. Não usar em produção.

**Decisão 4:** Lovable e Vercel fora da stack.  
Plataforma desenvolvida diretamente com React 18 + Vite. Deploy via GitHub Pages.

## Arquivos-chave criados na Fase 0

| Arquivo                              | Propósito                              |
|--------------------------------------|----------------------------------------|
| `trigger.config.ts`                  | config Trigger.dev                     |
| `trigger/_shared/claude.ts`          | wrapper @anthropic-ai/sdk              |
| `trigger/_shared/supabase.ts`        | lazy singleton Supabase                |
| `trigger/_shared/schemas.ts`         | Zod schemas comuns                     |
| `trigger/_shared/audit.ts`           | logAgentRun()                          |
| `trigger/_examples/hello-world.ts`   | task de sanidade (validação OK)        |
| `docs/architecture/agent-communication.md` | fluxo Frontend↔Bridge↔Trigger   |
| `bridge-server/README.md`            | doc endpoints Bridge                   |

## Milestones (referência histórica)

- **Milestone v1** — Operacional Interno (prazo: 22/05/2026)
  - Fase 1A: RBAC + Memória Central + WhatsApp + Drafts/DELI
  - Fase 1B: RequireRole/RequireAgent React + middleware Bridge
  - Fase 1C: CoraScreen + ReportsScreen sem mock + DraftsPendentes
  - Fase 1D: Sidebar hierárquica + TasksScreen (Lista/Board/Calendário)
  - Fase 1E: DELI ativa (Trigger.dev) + DeliPainel
  - Fase 1F: WhatsApp evoluído (webhook grupo/PV/menção)
  - Fase 1G: AgentsPage como painel de controle real

- **Milestone v2** — ClickUp Médio + Crescimento (jun-jul/2026)
  - Custom fields, Automations, Dashboard builder, CRM completo, SOFIA e LARA ativos, Asaas integrado

- **Milestone v3** — Revenda (ago/2026+)
  - Onboarding self-service, planos/billing, white-label, marketplace de agentes

## Orçamento aprovado

Máximo: R$ 800/mês  
Estimativa atual: R$ 430-630/mês  
- Supabase Pro: R$ 130  
- Claude API: R$ 300-500  
- GitHub Pages: gratuito
