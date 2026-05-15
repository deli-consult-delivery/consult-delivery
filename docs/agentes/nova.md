# NOVA · Automação IA

**Status:** ✅ Ativa — Feature V2-5 concluída em 15/05/2026  
**Role necessário:** `admin` ou `owner` (acesso restrito — apenas Wandson)  
**Integração externa:** nenhuma (opera sobre dados do banco e input do usuário)  
**Orquestrador:** Trigger.dev (projeto `proj_slexhoelcjwgbopmbzzr`)

---

## Identidade

NOVA é a consultora de automação com IA da Consult Delivery. Ela conduz o processo de discovery, blueprinting e estimativa financeira para projetos de automação com IA oferecidos a clientes PMEs de delivery e food service.

NOVA transforma a descrição de um problema de negócio em um pacote completo: análise de discovery, blueprint técnico por fases e estimativa financeira com ROI. Cada etapa depende da anterior (pipeline sequencial).

---

## Pipeline de 3 etapas

```
nova-discovery → nova-blueprint → nova-estimate
     ↓                ↓                ↓
  cria registro   atualiza blueprint  completa estimativa
  na nova_blueprints  + status        + status = 'complete'
```

Cada task recebe o `blueprint_id` e acessa o registro em `nova_blueprints` para ler o output da etapa anterior.

---

## Trigger.dev Tasks

### `nova-discovery` ([trigger/nova/discovery.ts](../../trigger/nova/discovery.ts))

Entrevista o cliente (via formulário) e produz análise estruturada do problema, causas-raiz e oportunidades de IA.

**Input:**
```ts
{
  tenant_id: uuid,
  user_id: uuid,
  client_name: string,
  segmento?: string,          // default: "Delivery / Food Service"
  problema: string,           // min 10 chars
  objetivo?: string,
  sistemas_atuais: string[],  // default: []
  budget_range?: 'ate-500' | '500-2000' | '2000-5000' | 'acima-5000',
  prazo_desejado?: 'urgente' | '1-mes' | '2-3-meses' | 'flexivel',
  blueprint_id?: uuid,        // se fornecido, atualiza registro existente
}
```

**Output:**
```ts
{
  ok: boolean,
  blueprint_id: uuid,         // ID criado (ou atualizado) em nova_blueprints
  discovery: {
    resumo_problema: string,
    impacto_atual: string,
    raiz_causa: string[],
    oportunidades_ia: Array<{
      area: string,
      descricao: string,
      potencial: 'alto' | 'medio' | 'baixo',
    }>,
    dados_necessarios: string[],
    riscos: string[],
    recomendacao_geral: string,
  },
}
```

**Efeitos colaterais:**
- INSERT em `nova_blueprints` com `status = 'discovery'` (ou UPDATE se `blueprint_id` fornecido)
- INSERT em `agent_runs`

---

### `nova-blueprint` ([trigger/nova/blueprint.ts](../../trigger/nova/blueprint.ts))

Gera blueprint técnico por fases a partir do discovery. Requer que `nova-discovery` já tenha sido executado.

**Input:**
```ts
{
  tenant_id: uuid,
  user_id: uuid,
  blueprint_id: uuid,         // deve existir em nova_blueprints com discovery preenchido
}
```

**Output:**
```ts
{
  ok: boolean,
  blueprint_id: uuid,
  blueprint: {
    titulo: string,
    descricao: string,
    fases: Array<{
      numero: number,
      nome: string,
      objetivo: string,
      entregaveis: string[],
      tecnologias: string[],
      duracao_semanas: number,
    }>,
    integracoes: Array<{
      sistema: string,
      tipo: string,
      descricao: string,
    }>,
    kpis: Array<{
      metrica: string,
      baseline: string,
      meta: string,
      prazo: string,
    }>,
    stack_recomendada: string[],
    arquitetura_resumo: string,
  },
}
```

**Efeitos colaterais:**
- UPDATE em `nova_blueprints` com `blueprint` + `status = 'blueprint'`
- INSERT em `agent_runs`

**Lançará erro** se `nova_blueprints.discovery` for null — execute `nova-discovery` primeiro.

---

### `nova-estimate` ([trigger/nova/estimate.ts](../../trigger/nova/estimate.ts))

Gera estimativa financeira completa (investimento, custo mensal, ROI, cronograma) a partir do blueprint. Requer `nova-blueprint` executado.

**Input:**
```ts
{
  tenant_id: uuid,
  user_id: uuid,
  blueprint_id: uuid,         // deve existir em nova_blueprints com blueprint preenchido
}
```

**Output:**
```ts
{
  ok: boolean,
  blueprint_id: uuid,
  estimate: {
    investimento_setup: { minimo: number, maximo: number, descricao: string },
    custo_mensal: { minimo: number, maximo: number, descricao: string },
    retorno_estimado: {
      economia_mensal: number,
      payback_meses: number,
      roi_12meses: string,    // Ex: "340% — R$ 18.000 economizados"
    },
    cronograma: Array<{
      fase: string,
      inicio: string,         // YYYY-MM-DD
      fim: string,            // YYYY-MM-DD
      marcos: string[],
    }>,
    premissas: string[],
    proximos_passos: string[],
    nivel_complexidade: 'baixo' | 'medio' | 'alto',
    score_viabilidade: number, // 0–10
    justificativa_score: string,
  },
}
```

**Efeitos colaterais:**
- UPDATE em `nova_blueprints` com `estimate` + `status = 'complete'`
- INSERT em `agent_runs`

**Lançará erro** se `nova_blueprints.blueprint` for null — execute `nova-blueprint` primeiro.

---

## Schema do banco

### `public.nova_blueprints`

Registro central de cada projeto de automação. Evolui ao longo do pipeline.

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | uuid PK | |
| `tenant_id` | uuid FK tenants | Multi-tenant |
| `user_id` | uuid | Usuário que criou (Wandson) |
| `client_name` | text | Nome do cliente do projeto |
| `segmento` | text nullable | Segmento do cliente |
| `problema` | text | Problema descrito no discovery |
| `objetivo` | text nullable | Objetivo desejado |
| `sistemas_atuais` | text[] | Sistemas que o cliente já usa |
| `budget_range` | text | Enum de faixas de orçamento |
| `prazo_desejado` | text | Enum de prazos |
| `discovery` | jsonb nullable | Output de `nova-discovery` |
| `blueprint` | jsonb nullable | Output de `nova-blueprint` |
| `estimate` | jsonb nullable | Output de `nova-estimate` |
| `status` | text | `discovery` \| `blueprint` \| `complete` |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | Trigger automático |

---

## Migration

| Arquivo | O que faz |
|---------|-----------|
| `20260514_015_nova_blueprints.sql` | Tabela `nova_blueprints`, índices, RLS |

---

## UI — tela `/agentes/nova`

**Componente:** `src/screens/NovaScreen.jsx`

### Tabs

| Tab | Função |
|-----|--------|
| Novo Projeto | Formulário de discovery — cliente, problema, budget, prazo, sistemas atuais |
| Blueprints | Lista todos os blueprints com status (discovery / blueprint / complete) |
| Detalhe | Visualiza discovery + blueprint + estimate de um projeto específico |

### Fluxo de uso na tela

1. Wandson preenche formulário → `nova-discovery` → blueprint criado com status `discovery`
2. Abre blueprint → clica "Gerar Blueprint Técnico" → `nova-blueprint` → status `blueprint`
3. Clica "Gerar Estimativa" → `nova-estimate` → status `complete`
4. Exporta PDF ou apresenta ao cliente

---

## RBAC

| Papel | Pode invocar tasks NOVA | Acessa tela |
|-------|------------------------|-------------|
| `admin` / `owner` | ✅ (prefixo `nova-`) | ✅ |
| `financeiro` | ✅ (prefixo `nova-` compartilhado) | ✅ |
| outros | ❌ | ❌ |

Bridge Server valida via `requireAgentAccess` → `ROLE_AGENT_PREFIXES.financeiro = ['cora-', 'nova-']`.

---

## Variáveis de ambiente necessárias

| Variável | Onde | Descrição |
|----------|------|-----------|
| `ANTHROPIC_API_KEY` | Infisical + Trigger.dev | Claude Haiku para todas as etapas |
| `SUPABASE_SERVICE_ROLE_KEY` | Infisical + Trigger.dev | CRUD em nova_blueprints |
| `TRIGGER_SECRET_KEY` | Bridge Server | Autenticação Trigger.dev |

---

## Decisões de design

- NOVA usa `claude-haiku-4-5-20251001` em todas as tasks — blueprints técnicos não precisam do Sonnet
- Pipeline sequencial obrigatório: cada task valida que a etapa anterior existe antes de executar
- Valores financeiros sempre em BRL — estimativas conservadoras por design
- Não há draft/aprovação — output vai direto no banco para o usuário visualizar no painel
- Retry: 2 tentativas em todas as tasks
- NOVA não notifica DELI — é uma ferramenta de trabalho direto do Wandson

---

## Referências cruzadas

- `trigger/_shared/audit.ts` — `logAgentRun()`
- `trigger/_shared/supabase.ts` — cliente Supabase
- `bridge-server/index.js` — rota `/agents/:slug/run`
- `supabase/migrations/20260514_015_nova_blueprints.sql`
- `docs/agentes/cora.md` — CORA e NOVA compartilham prefixo de role `financeiro` no Bridge Server
