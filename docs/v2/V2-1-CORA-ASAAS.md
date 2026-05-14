# V2 Feature 1 — CORA + Asaas (Cobrança End-to-End)

**Prompt pra colar no Claude Code no repo `consult-delivery`.**

**Antes de colar:**
1. `cd "C:\Users\Consult Delivery\consult-delivery"`
2. `git checkout -b feature/v2-cora-asaas` (ou em worktree própria)
3. `claude`
4. Cola o prompt abaixo

---

```
# OBJETIVO
Implementar CORA — Cobrança Inteligente — com integração completa Asaas.
Cliente pode disparar análise de inadimplentes, CORA pesquisa, gera mensagem 
personalizada, envia via WhatsApp (Evolution) e monitora status via webhook 
Asaas. Modo humano/híbrido/IA respeitando hierarquia tenant→agente.

# CONTEXTO
- Doc autoritativo: RESTRUCTURE.md (consultar seção sobre CORA e Asaas)
- Subagents disponíveis: @cd-task-creator, @cd-migration-creator, @cd-validator
- CORA já tem 3 tasks built mas NUNCA executadas em produção:
  - trigger/cora/analisar-devedor.ts
  - trigger/cora/gerar-mensagem.ts
  - trigger/cora/escalonar.ts
- Asaas é gateway de cobrança brasileiro. Doc: https://docs.asaas.com
- Tenant principal: consult (id: 9079bd4d-4df7-4023-90fb-d79c8ba7e900)
- WhatsApp via Evolution API (já configurado no Bridge Server)

# IMPORTANTE — Riscos assumidos
- As 3 tasks existentes têm `new Anthropic()` no top-level (anti-padrão).
- Antes de adicionar lógica nova, AVISE se vai mover pra dentro do run() ou manter.
- Recomendação: corrija no início desta feature (já que vamos mexer aí).

# TAREFAS

## Tarefa 1 — Smoke test das 3 tasks existentes
Antes de adicionar coisa nova, executar UMA vez cada uma das 3 tasks 
no dashboard Trigger.dev com input real. Documentar output bruto.
Se quebrar, registrar bug em issue do GitHub mas NÃO consertar agora 
(escopo desta feature é integração, não refatoração).

## Tarefa 2 — Configuração Asaas (Wandson faz manualmente)
Wandson vai criar:
- Conta sandbox Asaas (https://sandbox.asaas.com)
- Pegar API key sandbox
- Criar webhook apontando para: https://app.consultdelivery.com.br/webhooks/asaas
- Anotar webhook secret
- Adicionar ao Infisical: ASAAS_API_KEY, ASAAS_WEBHOOK_SECRET, ASAAS_ENVIRONMENT (sandbox|production)

PERGUNTAR pro Wandson confirmar quando isso estiver pronto.

## Tarefa 3 — Schema (use @cd-migration-creator)
Criar migrations:

### 3.1. Tabela cobrancas
- id uuid PK
- tenant_id uuid FK tenants
- cliente_id uuid FK clientes
- asaas_charge_id text UNIQUE (id retornado pela API Asaas)
- valor numeric(10,2)
- vencimento date
- status text (pending|received|overdue|refunded|canceled)
- billing_type text (BOLETO|PIX|CREDIT_CARD)
- invoice_url text
- bank_slip_url text
- pix_qr_code text
- created_at timestamptz
- updated_at timestamptz
- RLS: tenant_id

### 3.2. Tabela cobranca_eventos
Audit trail de toda mudança de status.
- id uuid PK
- cobranca_id uuid FK cobrancas
- event_type text (created|status_changed|payment_received|cora_acted)
- old_status text
- new_status text
- triggered_by text (asaas_webhook|cora|manual)
- metadata jsonb
- created_at timestamptz
- RLS: via cobrancas.tenant_id

### 3.3. Tabela cora_acoes
Histórico do que CORA fez por cobrança.
- id uuid PK
- cobranca_id uuid FK cobrancas
- agent_run_id uuid FK agent_runs (já existe)
- acao text (analise|mensagem_enviada|escalonado_humano)
- mensagem_enviada text (se aplicável)
- whatsapp_message_id text (id retornado Evolution)
- created_at timestamptz
- RLS: via cobrancas.tenant_id

## Tarefa 4 — Bridge Server: webhook receiver do Asaas
Criar endpoint POST /webhooks/asaas no Bridge Server:
- Valida X-Asaas-Access-Token contra ASAAS_WEBHOOK_SECRET
- Recebe eventos (PAYMENT_CREATED, PAYMENT_RECEIVED, PAYMENT_OVERDUE, etc)
- Para cada evento:
  1. Encontra cobrança pelo asaas_charge_id
  2. Atualiza status
  3. Registra em cobranca_eventos
  4. Se PAYMENT_OVERDUE: dispara task cora-analisar-devedor automaticamente

## Tarefa 5 — Cliente Asaas em _shared/
Criar trigger/_shared/asaas.ts:
- Wrapper sobre fetch para API Asaas
- Métodos: createCharge, getCharge, listCharges, refundCharge
- Lê API_KEY e ENVIRONMENT do process.env
- Validação Zod das respostas
- Retry com exponential backoff (Asaas tem rate limit)

## Tarefa 6 — Refatorar 3 tasks existentes (use @cd-task-creator)
Adaptar as 3 tasks CORA pra:
- Mover `new Anthropic()` pra dentro de run() (anti-padrão fix)
- Adicionar logAgentRun obrigatório
- Receber tenant_id e respeitar modo (humano|hibrido|ia) de tenant_agent_config
- Em modo humano: gerar resposta mas NÃO enviar; em híbrido: enviar mas marcar pra revisão; em ia: enviar autonomamente
- Salvar em cora_acoes

## Tarefa 7 — Nova task cora-criar-cobranca (use @cd-task-creator)
Recebe cliente_id + valor + vencimento + tipo.
Chama Asaas createCharge.
Insere em cobrancas com status pending.
Retorna URL de boleto/PIX.

## Tarefa 8 — UI em /agentes/cora
Tela com:
- Lista de inadimplentes (cobrancas com status overdue)
- Para cada um: nome, valor, dias de atraso, última ação CORA, próxima ação sugerida
- Botão "Analisar com CORA" (dispara cora-analisar-devedor)
- Botão "Gerar mensagem" (dispara cora-gerar-mensagem)
- Painel de detalhes: histórico de eventos + ações CORA
- Filtro por status, valor, dias atraso
- Modo humano/híbrido/IA com toggle visível

Usa padrão de componentes do projeto (Tailwind + shadcn).
Realtime via Supabase Realtime para atualizar quando status mudar.

## Tarefa 9 — Documentação
- Atualizar RESTRUCTURE.md adicionando CORA como produção
- Criar docs/agentes/cora.md com fluxos
- Atualizar CLAUDE.md se padrão novo emergir

# CRITÉRIO DE ACEITE

- [ ] Smoke test das 3 tasks existentes documentado (passou ou falhou — não importa, importa documentar)
- [ ] Asaas API key configurada no Infisical (Wandson confirma)
- [ ] 3 migrations criadas (cobrancas, cobranca_eventos, cora_acoes) com RLS
- [ ] Migrations aplicadas em DEV primeiro, validadas, depois em PROD
- [ ] Endpoint /webhooks/asaas implementado e validando token
- [ ] Cliente _shared/asaas.ts com Zod + retry
- [ ] 3 tasks CORA refatoradas (sem `new Anthropic()` top-level + logAgentRun + modos)
- [ ] Nova task cora-criar-cobranca implementada
- [ ] UI /agentes/cora renderiza, dispara, atualiza via Realtime
- [ ] Smoke test end-to-end: criar cobrança → simular pagamento atrasado → CORA detecta → gera mensagem → enviar WhatsApp → marca como acionado
- [ ] @cd-validator passa com VEREDITO ✅ ou ⚠️ aceitável
- [ ] PR aberta com descrição completa

# RESTRIÇÕES

- NÃO usar Asaas em produção real sem confirmação de Wandson (sandbox primeiro)
- NÃO mexer em outros agentes (BRENO, NOVA, MAX, LARA, DELI)
- NÃO mexer em chat ao vivo
- NÃO commitar credenciais
- TODA dúvida: ME PERGUNTAR

# USO DOS SUBAGENTS

Quando criar tasks: invoque @cd-task-creator explicitamente.
Quando criar migrations: invoque @cd-migration-creator explicitamente.
Antes de declarar feature pronta: invoque @cd-validator obrigatoriamente.

# OUTPUT BRUTO SEMPRE

- Antes de "feito" em qualquer tarefa: mostrar evidência (SQL, log, output JSON, screenshot)
- Não resumir comportamento — colar dump do run real

Começar agora pela Tarefa 1 (smoke test). ME PERGUNTAR ao terminar cada tarefa.
```

---

## Checklist de validação (Wandson usa)

Antes de mergear `feature/v2-cora-asaas`:

- [ ] @cd-validator rodado, relatório anexado na PR
- [ ] Veredito ✅ ou ⚠️ (sem ❌ bloqueante)
- [ ] Smoke test end-to-end funcionou (output bruto na PR)
- [ ] Asaas sandbox configurado, webhook respondendo
- [ ] Migrations aplicadas em DEV e PROD (com print)
- [ ] UI testada manualmente em http://localhost:5173
- [ ] Chat ao vivo continua funcionando (regressão)
- [ ] DELI continua funcionando (regressão)

Se algum falhar: NÃO mergeia. Corrige antes.

---

## Estimativa

- Tarefa 1 (smoke): 30min-1h
- Tarefa 2 (Asaas setup): 1h (Wandson)
- Tarefas 3-7 (código): 3-5 dias
- Tarefa 8 (UI): 1-2 dias
- Tarefa 9 (docs): 2h
- Validação + PR: 1 dia

**Total: 6-9 dias úteis** (1-2 semanas com folga pra ajustes)
