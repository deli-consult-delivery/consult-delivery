# PRD Sprint 1 — Fundação AI First (30 dias)
Versão: 1.0 | Data: 2026-05-25 | Horizonte: D0–D30
Status: APROVADO | Branch: chore/sprint-01-bootstrap

---

## ESCOPO TRAVADO (não mudar sem aprovação VERMELHO)

Sprint 1 entrega 5 goals em paralelo. Resultado esperado em D30:
- DELI briefing 7h rodando toda manhã
- BRENO resolvendo tickets tier-1 sem acordar Wandson
- 49 clientes com oferta de contrato novo enviada
- Sistema de contratos digitais com link Asaas
- Playbook de onboarding D1/D7/D30/D60/D90 ativo

---

## MÉTRICAS D30

| Métrica | Baseline (hoje) | Target D30 | Critério de aceite |
|---------|----------------|------------|-------------------|
| Contratos digitais assinados | 0 | ≥ 39 (80% dos 49) | `SELECT COUNT(*) FROM contratos WHERE status='assinado'` ≥ 39 |
| DELI briefing 7h | 0 runs automáticos | 100% dias úteis | `agent_runs WHERE agent_id='deli' AND created_at > NOW()-7d` ≥ 5 |
| BRENO tickets resolvidos sozinho | 0% | ≥ 60% | `SELECT * FROM support_tickets WHERE resolvido_por='breno'` ÷ total ≥ 0.60 |
| Onboarding novos clientes | 0% | 100% (todo novo cliente) | Checklist D1 criada automaticamente em `onboarding_checklists` |
| Clientes com oferta enviada (G05) | 0 | 49 | `SELECT COUNT(*) FROM aceite_recontratacao` = 49 |

---

## DEPENDÊNCIAS E ORDEM DE EXECUÇÃO

```
G01 (runtime + DELI core)
    ↓ (runtime.ts criado)
G02 (BRENO reusa runtime)

G03 (contratos)     ← independente, paralelo com G01
G04 (onboarding)    ← independente, paralelo com G01
G05 (recontratação) ← independente, paralelo com G01
```

**Regra de colisão:**
- G02 só LÊ `src/agents/shared/runtime.ts` (não edita)
- G03/G04/G05 não tocam em `trigger/` nem `src/agents/`
- Arquivos de migrations: cada goal usa prefixo de data único (ver SETUP-WORKTREES.md)

---

## GOALS

| Goal | Nome | Worktree | Bloqueado por | Estimativa |
|------|------|---------|--------------|-----------|
| G01 | DELI Core | cd-deli | — | 5 dias |
| G02 | BRENO | cd-breno | G01 (runtime) | 4 dias |
| G03 | Contratos | cd-contratos | — | 4 dias |
| G04 | Onboarding | cd-onboarding | — | 3 dias |
| G05 | Re-contratação 49 | cd-recontratacao | — | 3 dias |

---

## G01 — DELI Core (5 sub-goals)

**Objetivo:** Motor único de agentes + DELI funcionando de forma autônoma

Sub-goals:
- G01.1: `src/agents/shared/runtime.ts` — motor único
- G01.2: Migration `agent_prompts` + seed DELI/BRENO/VERA
- G01.3: Task `deli-briefing-7h` — Trigger.dev cron 07:00 BRT
- G01.4: Task `deli-chat-handler` — responde @deli em grupos
- G01.5: Task `deli-orchestrator-5min` — monitora triggers Verde/Amarelo/Vermelho

**Critério de aceite G01:**
- `runtime.executeAgent('deli', payload, ctx)` chamado com sucesso em prod
- `agent_runs WHERE agent_id='deli' AND created_at > NOW()-1h` tem pelo menos 1 row
- Briefing 7h chegou no WhatsApp de Wandson em D+1

---

## G02 — BRENO (3 sub-goals)

**Objetivo:** BRENO resolve 60%+ de tickets de suporte sem intervenção humana

Sub-goals:
- G02.1: `breno-processar-webhook` reusa runtime (já deployado — ligar runtime)
- G02.2: `breno-task-extractor` — cron 30min, extrai tarefas de conversas
- G02.3: `breno-renewal-monitor` — diário 8h, verifica Asaas + notifica

**Critério de aceite G02:**
- `support_tickets WHERE resolvido_por='breno'` existe pelo menos 1 row
- `agent_runs WHERE agent_id='breno-task-extractor'` tem run de hoje
- `agent_runs WHERE agent_id='breno-renewal-monitor'` tem run de hoje

---

## G03 — Contratos Digitais (4 sub-goals)

**Objetivo:** Todo cliente novo assina contrato digital vinculado ao Asaas

Sub-goals:
- G03.1: Migration `contratos` + `contratos_templates`
- G03.2: UI "Novo Contrato" em `src/screens/Contratos/`
- G03.3: Bridge `POST /contratos/:id/enviar-assinatura` (PDF + link)
- G03.4: Bridge `POST /contratos/:id/link-asaas` (cria subscription Asaas)

**Critério de aceite G03:**
- Consultor cria contrato em UI → PDF gerado → link enviado ao cliente
- Cliente acessa link → assina (checkbox + timestamp) → `contratos.status='assinado'`
- `contratos.asaas_subscription_id` preenchido após G03.4

---

## G04 — Onboarding (3 sub-goals)

**Objetivo:** Todo cliente novo tem playbook D1/D7/D30/D60/D90 ativado automaticamente

Sub-goals:
- G04.1: Migration `onboarding_checklists` + `onboarding_templates`
- G04.2: UI checklist por cliente em `src/screens/Onboarding/`
- G04.3: Task `onboarding-automacao` — Trigger.dev cron diário, dispara ações nos marcos

**Critério de aceite G04:**
- Novo cliente criado → `onboarding_checklists` com D1 criado automaticamente
- Consultor vê checklist por cliente na UI
- D7: task Trigger.dev envia WhatsApp "Primeira semana — como está indo?"

---

## G05 — Re-contratação 49 Clientes (3 sub-goals)

**Objetivo:** Todos os 49 clientes atuais recebem oferta do novo modelo de contrato

Sub-goals:
- G05.1: Script `scripts/recontratacao-list.ts` — exporta lista com status + JID WhatsApp
- G05.2: UI `src/screens/Recontratacao/` — bulk WhatsApp com preview de mensagem por pacote
- G05.3: Migration `aceite_recontratacao` + tracker de status na UI

**Critério de aceite G05:**
- `SELECT COUNT(*) FROM aceite_recontratacao` = 49
- UI mostra taxa de aceite ao vivo (aceitos / total)
- WhatsApp de oferta enviado para 100% dos 49 (evidência: `mensagem_enviada_em IS NOT NULL`)

---

## ANTI-PADRÕES — PROIBIDOS NESTE SPRINT

1. **Agente fora de Trigger.dev** — qualquer lógica de IA direto no Bridge é proibido
2. **Anthropic SDK direto em task** — usar `runtime.executeAgent()` sempre
3. **Tabela sem tenant_id** — 100% das tabelas novas têm `tenant_id NOT NULL REFERENCES tenants(id)`
4. **Declarar "feito" sem output bruto** — log de agent_run ou SQL result obrigatório
5. **G02 criando runtime.ts** — G02 LEIA APENAS o arquivo criado por G01
6. **Migration sem aprovação SQL** — mostrar SQL completo antes de aplicar
7. **Commit direto em main** — sempre branch worktree + PR + merge squash

---

## ROLLBACK POR SUB-GOAL

Se smoke falhar após deploy:
```bash
# Trigger.dev: reverter para versão anterior
git checkout main
npx trigger.dev@4.4.6 deploy

# Frontend: GitHub Actions reverte automaticamente com revert commit
git revert HEAD && git push origin main

# Migration: sem rollback automático — escalar para Wandson (VERMELHO)
```

---

*PRD Sprint 1 | Consult Delivery AI First | 2026-05-25*
