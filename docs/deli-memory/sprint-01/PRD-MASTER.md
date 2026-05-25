# PRD Master — Consult Delivery AI First
Versão: 1.0 | Data: 2026-05-25 | Horizonte: 90 dias (Sprint 1–3)
Autor: Wandson Silva (CEO) | Status: APROVADO

---

## 1. DIAGNÓSTICO ATUAL

### Números reais (2026-05-25)
| Métrica | Valor |
|---------|-------|
| Clientes ativos | 49 |
| Faturamento MRR | ~R$ 20.000 |
| LTV médio | R$ 1.500 |
| Churn mensal | ~33% |
| Ticket médio | ~R$ 408/mês |
| Conversas WhatsApp | 105 ativas |
| Mensagens processadas | 5.058 |
| Grupos WhatsApp | 69 |
| Runs de agentes em prod | 171 total |
| Tabelas no Supabase | 103 (53 com 0 rows) |

### Operação atual
- **VERA**: relatórios diários (77 runs, 100% sucesso) ✅
- **DELI**: revisão matinal (11 runs, 91% sucesso) ✅
- **BomDia + Encerramento**: scheduler fixado em 2026-05-24 (TD#36) ✅
- **BRENO**: bug corrigido em 2026-05-24 (TD#40), ainda sem runs reais ⚠️
- **BRENO task-extractor, renewal-monitor**: não existem ainda ❌
- **Contratos**: sem sistema digital ❌
- **Onboarding**: manual, sem playbook automatizado ❌
- **Re-contratação dos 49**: não iniciada ❌

### Gargalos críticos (ordenados por impacto)
1. **Churn 33%** — cliente some sem sistema de acompanhamento
2. **Contratos não digitais** — sem assinatura = sem obrigação jurídica
3. **BRENO não extrai tarefas** — Eduardo gerencia manualmente 100+ conversas
4. **Onboarding sem playbook** — cliente não sabe o que esperar nos primeiros 90 dias
5. **49 clientes sem contrato novo** — mudança de modelo não comunicada

---

## 2. METAS 12 MESES

| Meta | D30 (S1) | D60 (S2) | D90 (S3) | 12m |
|------|----------|----------|----------|-----|
| MRR | R$ 22k | R$ 28k | R$ 35k | R$ 50k |
| Clientes IA | 2 | 5 | 8 | 10 |
| Clientes consultoria | 35 | 40 | 45 | 30+ |
| Clientes sistema/CRM | 5 | 10 | 20 | 50 |
| Tickets BRENO solo | — | 40% | 55% | 60%+ |
| Churn mensal | 25% | 18% | 12% | <10% |
| Contratos assinados | 80% dos 49 | 95% | 100% | 100% |

### Pacotes aprovados
| Pacote | Valor | Posicionamento |
|--------|-------|----------------|
| Growth (âncora S1) | R$ 2.5k setup + R$ 1.5k/mês | IA no iFood = diferencial |
| Light | R$ 500/mês | entrada consultoria |
| Performance | R$ 500 + 12% do crescimento | alinhamento de incentivo |
| Enterprise | R$ 1.2k/mês (mín 6m + multa 50%) | ticket grande |

---

## 3. ARQUITETURA DE AGENTES

### Motor único — src/agents/shared/runtime.ts
Todos os agentes usam o mesmo runtime. Sem código duplicado.

```typescript
// Contrato do motor
export async function executeAgent(agentId: string, payload: unknown, ctx: RunContext): Promise<AgentResult>
export async function getPrompt(agentId: string, tenantId: string): Promise<string>  // lê de agent_prompts
export function logRun(params: RunLogParams): Promise<void>                           // escreve em agent_runs
```

### Tabela agent_prompts (a criar em G01.2)
```sql
CREATE TABLE agent_prompts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id    text NOT NULL,
  tenant_id   uuid REFERENCES tenants(id),   -- NULL = global default
  version     int NOT NULL DEFAULT 1,
  prompt      text NOT NULL,
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz DEFAULT now(),
  UNIQUE(agent_id, tenant_id, version)
);
-- RLS: tenant vê só seu prompt + globais
```

### Semáforo DELI
| Cor | Trigger | Ação |
|-----|---------|------|
| Verde | Padrão operacional | DELI executa autonomamente, reporta |
| Amarelo | Decisão com impacto médio | DELI propõe via WhatsApp, Wandson aprova com `ok` |
| Vermelho | Mudança crítica / irreversível | Aprovação explícita `APROVADO VERMELHO apr-xxx` |

### MCP Tools customizados (D60+)
- `get_loja_context(loja_id)` — lê client_facts + client_timeline + lojas
- `create_tarefa(tenant_id, loja_id, titulo, descricao)` — cria em tarefas_loja
- `send_whatsapp(jid, message)` — via Bridge → Evolution
- `get_metricas(loja_id, periodo)` — lê vera_metricas_snapshot

### Fluxo de evento padrão
```
WhatsApp → evolution-webhook (Edge Fn) → Bridge /internal/agents/:slug/run
→ Trigger.dev task → runtime.executeAgent() → Anthropic API
→ agent_runs (log) + ação (draft / tarefa / notificação)
```

---

## 4. ROADMAP

### Sprint 1 — Fundação (D0–D30) — Este sprint
| Goal | Escopo | Bloqueio |
|------|--------|---------|
| G01 | DELI Core (runtime + briefing + chat) | — |
| G02 | BRENO (tier-1 + task-extractor + renewal) | Depende G01 |
| G03 | Contratos digitais + Asaas | Independente |
| G04 | Onboarding playbook + UI + automação | Independente |
| G05 | Re-contratação 49 clientes | Independente |

### Sprint 2 — Combustível (D30–D60)
- LARA: CRM food service + régua de relacionamento
- VERA v2: loja_metricas populada + anomalias ativas
- MCP Tools customizados (get_loja_context, create_tarefa)
- Painel DELI público (semáforo ao vivo)
- Dashboard cliente público (piloto-07 F4)

### Sprint 3 — Pivotagem (D60–D90)
- SOFIA: SDR/prospecção automática
- MAX: consultor técnico on-demand
- Memória Central ativa (client_facts populada por todos os agentes)
- RBAC completo com dados reais
- Relatório ROI por pacote

---

## 5. TABELAS SUPABASE A CRIAR

### Sprint 1 — Obrigatórias

#### agent_prompts (G01.2)
```sql
CREATE TABLE agent_prompts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id text NOT NULL,
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
  version int NOT NULL DEFAULT 1,
  prompt text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(agent_id, COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid), version)
);
ALTER TABLE agent_prompts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_see_own_or_global" ON agent_prompts
  FOR SELECT USING (tenant_id IS NULL OR tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid()));
```

#### contratos (G03.1)
```sql
CREATE TABLE contratos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  customer_id uuid REFERENCES customers(id),
  pacote text NOT NULL CHECK (pacote IN ('light','performance','enterprise','growth')),
  valor_setup numeric(10,2),
  valor_mensal numeric(10,2) NOT NULL,
  percentual_crescimento numeric(5,2),
  duracao_meses int,
  multa_percentual numeric(5,2),
  status text NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho','enviado','assinado','encerrado')),
  assinado_em timestamptz,
  assinatura_hash text,
  asaas_subscription_id text,
  vigencia_inicio date,
  vigencia_fim date,
  pdf_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE contratos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_own" ON contratos FOR ALL USING (tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid()));
```

#### onboarding_checklists (G04.1)
```sql
CREATE TABLE onboarding_checklists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  customer_id uuid REFERENCES customers(id),
  marco text NOT NULL CHECK (marco IN ('D1','D7','D30','D60','D90')),
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','em_andamento','concluido')),
  concluido_em timestamptz,
  notas text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE onboarding_checklists ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_own" ON onboarding_checklists FOR ALL USING (tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid()));
```

#### aceite_recontratacao (G05.3)
```sql
CREATE TABLE aceite_recontratacao (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  customer_id uuid REFERENCES customers(id),
  whatsapp_jid text,
  pacote_ofertado text NOT NULL,
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','aceito','recusado','sem_resposta')),
  mensagem_enviada_em timestamptz,
  respondido_em timestamptz,
  notas text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE aceite_recontratacao ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_own" ON aceite_recontratacao FOR ALL USING (tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid()));
```

#### support_tickets (G02.1 — suporte BRENO)
```sql
CREATE TABLE support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  conversation_id uuid REFERENCES conversations(id),
  sender_jid text NOT NULL,
  titulo text,
  descricao text NOT NULL,
  status text NOT NULL DEFAULT 'aberto' CHECK (status IN ('aberto','em_andamento','resolvido','escalado')),
  resolvido_por text CHECK (resolvido_por IN ('breno','humano')),
  resolucao text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_own" ON support_tickets FOR ALL USING (tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid()));
```

---

## 6. RISCOS E MITIGAÇÕES

| Risco | Probabilidade | Impacto | Mitigação |
|-------|-------------|---------|-----------|
| 49 clientes recusam contrato novo | Média | Alto | G05 com abordagem personalizada; oferecer migração gradual |
| Anthropic API rate limit sob carga | Baixa | Médio | Runtime tem retry com `withOverloadedRetry()`; modelo padrão claude-sonnet-4-6 |
| Evolution API instável (TD#36 histórico) | Alta | Médio | AbortSignal 120s + retry 5×; monitorar Encerramento segunda 2026-05-26 |
| BRENO gera resposta inapropriada | Baixa | Alto | Modo padrão = "hibrido" (draft, não auto-send); aprovação humana obrigatória |
| Trigger.dev task falha em prod | Média | Médio | Rollback: npx trigger.dev@4.4.6 deploy da branch anterior; smoke E2E por sub-goal |
| Contrato sem validade jurídica | Baixa | Alto | Assinatura digital via timestamp + hash SHA256 + email de confirmação |
| RBAC sem dados bloqueia UI | Média | Médio | TD#50: popular roles/role_permissions antes de G01 deploy |

---

## 7. PADRÕES NÃO NEGOCIÁVEIS

1. Todo agente usa `runtime.executeAgent()` — sem Anthropic SDK direto em tasks
2. Toda tabela nova: `tenant_id NOT NULL` + RLS policy
3. Toda task Trigger.dev: InputSchema Zod + OutputSchema Zod + `logAgentRun()`
4. `throw` apenas dentro do `run()` — nunca no topo do módulo
5. Smoke E2E obrigatório antes de declarar sub-goal concluído
6. Nenhum agente envia mensagem a cliente sem draft + aprovação (exceto `telegram_interno`)

---

*PRD Master — Consult Delivery AI First | 2026-05-25*
