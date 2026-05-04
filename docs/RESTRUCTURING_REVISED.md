# Reestruturação Estratégica REVISADA — Plataforma Consult Delivery v2.0

**Data de revisão:** 04/05/2026
**Versão anterior:** docs/RESTRUCTURING.md (de 23/04/2026)
**Status:** SUBSTITUI a versão anterior. Aprovada pelo Wandson.

---

## Resumo

1. [Por que essa revisão existe](#1-por-que-essa-revisão-existe)
2. [Princípios norteadores](#2-princípios-norteadores)
3. [Buracos identificados na v1](#3-buracos-identificados-na-v1)
4. [Stack final aprovada](#4-stack-final-aprovada)
5. [Equipe atualizada](#5-equipe-atualizada)
6. [Modelo de Permissões (RBAC)](#6-modelo-de-permissões-rbac)
7. [Memória Central Compartilhada](#7-memória-central-compartilhada)
8. [Modelo de WhatsApp e Grupos](#8-modelo-de-whatsapp-e-grupos)
9. [Sistema de Drafts (proposta-aprovação)](#9-sistema-de-drafts-proposta-aprovação)
10. [DELI como COO Digital](#10-deli-como-coo-digital)
11. [Inspiração ClickUp — Nível Médio](#11-inspiração-clickup--nível-médio)
12. [Roadmap revisado](#12-roadmap-revisado)
13. [Plano de execução para o Claude Code](#13-plano-de-execução-para-o-claude-code)
14. [Critérios de aceite](#14-critérios-de-aceite)

---

## 1. Por que essa revisão existe

A v1 cobriu bem a parte técnica visível: descontinuar Lovable/Vercel, manter React+Vite+Supabase, modelar agentes, planejar 3 milestones.

Mas foram identificados **4 buracos arquiteturais críticos** que, se ignorados, gerariam refatorações pesadas em 3-6 meses:

1. **Sistema de permissões (RBAC)** não estava modelado — colaboradores teriam acesso indevido a financeiro e a agentes que não deveriam usar.
2. **Memória dos agentes** estava distribuída em workspaces individuais (`memory/lojas/` por agente) — DELI não conseguiria orquestrar bem sem visão unificada.
3. **Modelo de WhatsApp** não considerava a realidade: número único oficial, grupo por loja, PVs separados.
4. **DELI proativa** estava planejada mas sem infraestrutura técnica de drafts, triggers e aprovação.

Essa revisão **resolve os 4 buracos antes de codar features**, evitando dívida técnica.

---

## 2. Princípios norteadores

1. **Velocidade depois > velocidade agora.** 1-2 semanas de fundação correta agora = 2-3 meses ganhos depois.
2. **Multi-tenant desde o primeiro byte.** Toda tabela tem `tenant_id`, toda RLS valida tenant.
3. **Agente propõe, humano aprova.** Nenhum agente fala direto com cliente sem `agent_drafts → status approved → sent`.
4. **DELI é COO, não chatbot.** Acompanha tudo, aciona especialistas, propõe ações com semáforo Verde/Amarelo/Vermelho. Nunca responde clientes diretamente.
5. **Memória compartilhada no Supabase.** Fatos sobre clientes vivem no banco. Backup, queries cruzadas, BI.
6. **ClickUp Médio.** Multi-views, custom fields, automations, dashboards. Não tenta replicar Goals, Whiteboards, Docs, Mind Maps.
7. **Identidade Consult Delivery preservada.** Cores, logo, vibe atual continuam. ClickUp é UX/funcionalidade, não estética.
8. **WhatsApp interno é diferencial.** ClickUp não tem. É o motivo do cliente trocar ClickUp pela plataforma.

---

## 3. Buracos identificados na v1

### 3.1 RBAC ausente
Dentro do tenant, todo usuário tinha o mesmo nível de acesso.
- Yasmin (dev) **não pode ver** CORA/financeiro
- Wélida (marketing) **não pode invocar** analista-ifood
- Eduardo (atendimento) **pode ver** análises mas **não aprova drafts para cliente**

### 3.2 Memória fragmentada
Cada agente OpenClaw tinha `memory/lojas/{nome}.md` próprio. CORA não sabia o que analista-ifood sabia. VERA tinha que SSH em cada agente para puxar dados.

### 3.3 WhatsApp mal modelado
`chat_unificado` genérico não diferenciava: 1 número oficial, N grupos (1 por loja), PVs separados, quem falou (dono vs esposa vs gerente), DELI monitorando vs agentes respondendo.

### 3.4 DELI proativa sem infra
Sem: sistema de triggers, política de autonomia, drafts, auditoria.

---

## 4. Stack final aprovada

| Camada | Tecnologia | Status |
|---|---|---|
| Frontend | React 18 + Vite | ✅ Em uso |
| Deploy | GitHub Actions → GitHub Pages | ✅ Em uso |
| Domínio | app.consultdelivery.com.br | ✅ Ativo |
| Banco/Auth/Realtime/Storage | Supabase (PostgreSQL 15) | ✅ Em uso |
| Edge Functions | Supabase Functions (Deno) | ✅ Em uso |
| Bridge Server | Node.js/Express porta 3001 na VPS | ✅ Em uso |
| Agentes IA | OpenClaw 2026.5.2 na VPS 45.39.210.183:18789 | ✅ Em uso |
| LLM | Claude API (claude-sonnet-4-6) | ✅ Em uso |
| WhatsApp | Evolution API | ✅ Em uso |
| Automações | n8n | ✅ Em uso |
| Pagamento | Asaas | ✅ Integração via CORA |
| Secrets | Infisical self-hosted (172.18.0.3:8080) | ✅ Em uso |
| ~~Lovable~~ | ~~Builder visual~~ | ❌ Descontinuado |
| ~~Vercel~~ | ~~Deploy~~ | ❌ Descontinuado |

---

## 5. Equipe atualizada

| Pessoa | Papel | Role na plataforma |
|---|---|---|
| **Wandson Silva** | CEO/Fundador | admin + deli_owner |
| **Yasmin** | Desenvolvedora frontend | dev |
| **Wélida** | Marketing e CRM | marketing |
| **Eduardo** | Atendimento e suporte | atendimento |
| **DELI** | COO Digital (agente IA) | deli_owner (via OpenClaw) |

---

## 6. Modelo de Permissões (RBAC)

### Schema Supabase

```sql
CREATE TABLE roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  is_system BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, name)
);

CREATE TABLE user_roles (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  granted_at TIMESTAMPTZ DEFAULT NOW(),
  granted_by UUID REFERENCES auth.users(id),
  PRIMARY KEY (user_id, role_id)
);

CREATE TABLE role_permissions (
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  resource TEXT NOT NULL,
  action TEXT NOT NULL,
  PRIMARY KEY (role_id, resource, action)
);

CREATE TABLE user_agent_access (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_name TEXT NOT NULL,
  can_invoke BOOLEAN DEFAULT TRUE,
  can_view_history BOOLEAN DEFAULT TRUE,
  can_approve_drafts BOOLEAN DEFAULT FALSE,
  granted_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, agent_name)
);

CREATE TABLE audit_log (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL,
  user_id UUID REFERENCES auth.users(id),
  agent_name TEXT,
  action TEXT NOT NULL,
  resource TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Matriz de papéis padrão

| Role | Recursos acessíveis |
|---|---|
| admin | Tudo |
| dev | chat, kanban, crm (view), reports (view), analista-ifood (invoke) — SEM financeiro |
| marketing | chat, kanban, crm, reports, lara (invoke) — SEM financeiro |
| atendimento | chat, grupos_whatsapp, kanban, analise_ifood (view), analista-ifood (invoke, approve_drafts) — SEM financeiro |
| financeiro | cobranca, inadimplencias, cora (invoke, approve_drafts), reports financeiros |
| deli_owner | deli (invoke, approve_drafts), approve_high_autonomy |

---

## 7. Memória Central Compartilhada

Fatos sobre clientes vivem no Supabase, não em `memory/*.md` na VPS.

```sql
CREATE TABLE lojas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  client_id UUID REFERENCES customers(id),
  nome TEXT NOT NULL,
  nicho TEXT,
  plataforma TEXT DEFAULT 'ifood',
  cidade TEXT, estado TEXT,
  data_entrada DATE,
  status TEXT DEFAULT 'ativo',
  metadata JSONB DEFAULT '{}'
);

CREATE TABLE client_facts (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL,
  loja_id UUID NOT NULL REFERENCES lojas(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  key TEXT NOT NULL,
  value JSONB NOT NULL,
  source_agent TEXT,
  confidence REAL DEFAULT 1.0,
  ts TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ
);

CREATE TABLE client_timeline (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL,
  loja_id UUID NOT NULL REFERENCES lojas(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  agent_name TEXT,
  user_id UUID REFERENCES auth.users(id),
  title TEXT NOT NULL,
  description TEXT,
  payload JSONB,
  ts TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE loja_metricas (
  loja_id UUID NOT NULL REFERENCES lojas(id) ON DELETE CASCADE,
  data DATE NOT NULL,
  faturamento NUMERIC, ticket_medio NUMERIC,
  novos_clientes INTEGER, visitas INTEGER,
  conversao_cardapio REAL, conversao_final REAL,
  cancelamentos INTEGER, tempo_aberto_pct REAL,
  pedidos INTEGER, raw_data JSONB,
  PRIMARY KEY (loja_id, data)
);
```

---

## 8. Modelo de WhatsApp e Grupos

### Realidade da operação
- 1 número oficial Evolution API
- 1 grupo por loja cliente
- PV separado (cliente que chama no PV = conversa separada)
- Múltiplos remetentes no grupo: dono, esposa, sócio, gerente, equipe Consult Delivery
- **DELI monitora** mas **nunca responde** grupos/PVs de cliente
- **Agentes só respondem quando mencionados** no grupo
- **Resumo sob demanda** via menção (`@DELI resume últimos 3 dias`)

```sql
CREATE TABLE whatsapp_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  evolution_jid TEXT NOT NULL,
  display_name TEXT, phone TEXT,
  loja_id UUID REFERENCES lojas(id),
  is_internal BOOLEAN DEFAULT FALSE,
  internal_user_id UUID REFERENCES auth.users(id),
  UNIQUE(tenant_id, evolution_jid)
);

CREATE TABLE whatsapp_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  evolution_jid TEXT NOT NULL,
  group_name TEXT NOT NULL,
  loja_id UUID REFERENCES lojas(id) ON DELETE SET NULL,
  UNIQUE(tenant_id, evolution_jid)
);

CREATE TABLE whatsapp_group_members (
  group_id UUID NOT NULL REFERENCES whatsapp_groups(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES whatsapp_contacts(id) ON DELETE CASCADE,
  role_in_group TEXT,
  PRIMARY KEY (group_id, contact_id)
);

CREATE TABLE whatsapp_messages (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL,
  evolution_message_id TEXT UNIQUE,
  group_id UUID REFERENCES whatsapp_groups(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES whatsapp_contacts(id) ON DELETE CASCADE,
  sender_contact_id UUID NOT NULL REFERENCES whatsapp_contacts(id),
  direction TEXT NOT NULL,
  message_type TEXT NOT NULL,
  content TEXT, media_url TEXT, media_metadata JSONB,
  is_mention_to_bot BOOLEAN DEFAULT FALSE,
  mentioned_agent TEXT,
  ts TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 9. Sistema de Drafts (proposta-aprovação)

**Nenhum agente envia mensagem para fora sem aprovação humana.**

Fluxo: `Agente → cria draft → notifica humano → humano aprova/edita/rejeita → sistema envia`

```sql
CREATE TABLE agent_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  agent_name TEXT NOT NULL,
  loja_id UUID REFERENCES lojas(id),
  channel TEXT NOT NULL,
  target_id TEXT NOT NULL,
  content TEXT NOT NULL,
  reasoning TEXT,
  status TEXT DEFAULT 'pending',
  reviewer_id UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,
  edits_made TEXT,
  rejection_reason TEXT,
  sent_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '24 hours'),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

Drafts com `channel = 'telegram_interno'` ou `'painel'` vão direto (sem aprovação) — são para a equipe.

---

## 10. DELI como COO Digital

DELI **não é chatbot**. É uma agente que:
1. **Monitora** continuamente (mensagens, métricas, alertas)
2. **Detecta padrões** (cliente sumiu, métrica caiu, prazo estourou)
3. **Propõe ações** com semáforo Verde/Amarelo/Vermelho
4. **Aciona especialistas** conforme necessário
5. **Reporta** para Wandson ações executadas e pendentes

### Semáforo de autonomia

| Nível | Comportamento | Exemplo |
|---|---|---|
| 🟢 Verde | DELI executa e reporta | Adicionar evento na timeline, gerar resumo interno |
| 🟡 Amarelo | DELI propõe, Wandson aprova com "ok" | Criar draft de mensagem para cliente |
| 🔴 Vermelho | Aprovação explícita "APROVADO VERMELHO apr-xxx" | Cancelar contrato, modificar config OpenClaw |

```sql
CREATE TABLE deli_triggers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  name TEXT NOT NULL,
  condition_jsonb JSONB NOT NULL,
  proposed_action_jsonb JSONB NOT NULL,
  autonomy_level TEXT NOT NULL,
  enabled BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE deli_pending_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  trigger_id UUID REFERENCES deli_triggers(id),
  context_jsonb JSONB NOT NULL,
  proposed_action_jsonb JSONB NOT NULL,
  reasoning TEXT,
  autonomy_level TEXT NOT NULL,
  status TEXT DEFAULT 'waiting',
  approver_id UUID REFERENCES auth.users(id),
  approved_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '48 hours'),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE deli_actions_log (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL,
  trigger_id UUID REFERENCES deli_triggers(id),
  context_jsonb JSONB,
  action_taken_jsonb JSONB NOT NULL,
  autonomy_level TEXT NOT NULL,
  result TEXT,
  error_detail TEXT,
  related_draft_id UUID REFERENCES agent_drafts(id),
  ts TIMESTAMPTZ DEFAULT NOW()
);
```

**Restrição fundamental:** DELI **não tem `can_invoke = true`** em canais externos (`whatsapp_grupo`, `whatsapp_pv`). Só em `telegram_interno` e `painel`.

---

## 11. Inspiração ClickUp — Nível Médio

### O que copiar (agora)
- ✅ Multi-views: Lista, Board (Kanban), Calendário
- ✅ Sidebar hierárquica com agrupamento por cliente
- ✅ TopbarFilter (por cliente, prioridade, responsável, prazo)
- ✅ Task cards compactos e denses

### Próxima fase
- Custom fields nas tarefas
- Automations (regras "se X então Y")
- Dashboard builder simples

### O que NÃO copiar
- Goals, Whiteboards, Docs colaborativos, Mind Maps, Gantt, Time tracking elaborado

### Identidade visual
**Manter 100% o que já existe:** logo foguete vermelho, cores atuais, dark mode, componentes já criados.
ClickUp é **UX e funcionalidade**, não estética.

---

## 12. Roadmap revisado

### Milestone v1 — Operacional Interno (até 22/05/2026)

**Fase 1A — Fundação (semanas 1-2)**
- Schema RBAC, Memória Central, WhatsApp, Drafts+DELI no Supabase
- Seed de papéis

**Fase 1B — RBAC aplicado (semana 2)**
- `<RequireRole />`, `<RequireAgent />` no React
- Middleware Bridge Server
- RLS atualizada

**Fase 1C — Telas reais (semanas 2-3)**
- CoraScreen e ReportsScreen sem mock
- Tela Drafts Pendentes

**Fase 1D — ClickUp Light (semana 3)**
- Sidebar hierárquica
- TasksScreen com MultiViewSwitch

**Fase 1E — DELI ativa (semanas 4-5)**
- Agente DELI no OpenClaw
- DELI escutando Realtime
- DeliPainel

**Fase 1F — WhatsApp evoluído (semanas 5-6)**
- Webhook grupo/PV/menção
- Identificação de remetente

### Milestone v2 — ClickUp Médio + Crescimento (jun-jul/2026)
- Custom fields, Automations, Dashboard builder
- CRM completo, SOFIA e LARA ativos, Asaas integrado

### Milestone v3 — Revenda (ago/2026+)
- Onboarding self-service, planos/billing, white-label, marketplace de agentes

---

## 13. Plano de execução para o Claude Code

Ver arquivo de plano em `.claude/plans/jolly-stargazing-pumpkin.md` para o detalhamento das 14+ etapas.

Resumo:
1. Atualizar CLAUDE.md
2. Migration RBAC
3. Migration Memória Central
4. Migration WhatsApp
5. Migration Drafts+DELI
6. Seed de papéis
7. Componentes React de autorização
8. Middleware Bridge Server
9. Telas reais (CoraScreen, ReportsScreen)
10. ClickUp Light (Sidebar + MultiView)
11. Tela de Drafts
12. DELI no OpenClaw
13. DELI escutando Realtime
14. Webhook Evolution evoluído
15. AgentsPage como painel real
16. Atualizar diagramas Mermaid

---

## 14. Critérios de aceite

- [ ] CLAUDE.md sem Lovable/Vercel; equipe correta; stack real
- [ ] 4 migrations aplicadas com RLS
- [ ] Seed de papéis aplicado; cada usuário com papel correto
- [ ] `<RequireRole />` ativo em telas sensíveis
- [ ] Bridge Server validando agente antes de invoke + audit_log
- [ ] CoraScreen e ReportsScreen sem mock
- [ ] Sidebar hierárquica + MultiViewSwitch funcionando
- [ ] DraftsPendentesScreen funcional
- [ ] Agente DELI subido no OpenClaw e escutando Realtime
- [ ] Webhook Evolution diferenciando grupo/PV/menção
- [ ] AgentsPage como painel real
- [ ] Diagramas Mermaid atualizados

---

*Documento finalizado em 04/05/2026. Aprovado por Wandson Silva.*
