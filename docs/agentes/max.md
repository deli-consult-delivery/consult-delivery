# MAX · Suporte a Sistemas

**Status:** ✅ Ativo — Feature V2-4 concluída em 15/05/2026  
**Role necessário:** `atendimento` ou `admin`  
**Usuário principal:** Eduardo (role: atendimento)  
**Integração externa:** nenhuma (opera sobre base de conhecimento interna)  
**Orquestrador:** Trigger.dev (projeto `proj_slexhoelcjwgbopmbzzr`)

---

## Identidade

MAX é o consultor técnico da Consult Delivery especialista em sistemas de delivery. Ele diagnostica problemas técnicos relatados pelos clientes (iFood, WhatsApp Business, PDVs, delivery), gera tutoriais passo-a-passo e decide quando escalar para atendimento humano (Eduardo).

MAX opera exclusivamente sobre uma **base de conhecimento interna** armazenada em `max_knowledge_base`. Ele nunca inventa soluções sem embasamento na base de conhecimento — se não souber, recomenda escalação.

---

## Trigger.dev Tasks

### `max-diagnostico` ([trigger/max/diagnostico.ts](../../trigger/max/diagnostico.ts))

Analisa um problema técnico relatado e gera solução baseada na base de conhecimento. Decide automaticamente se requer escalação humana.

**Input:**
```ts
{
  tenant_id: uuid,
  user_id: uuid,
  message: string,            // min 3, max 2000 chars — descrição do problema
  sistema?: 'ifood' | 'whatsapp' | 'pdv' | 'delivery' | 'geral',
  loja_id?: uuid,
  triggered_by?: uuid,
}
```

**Output:**
```ts
{
  ok: boolean,
  solution: string,           // Solução em prosa, com citações "[Artigo N]"
  citations: string[],        // Ex: ["[Artigo 1]", "[Artigo 3]"]
  needs_escalation: boolean,
  escalation_reason?: string,
  knowledge_articles_used: number,
}
```

**Efeitos colaterais:**
- Insere mensagem de relatório em `deli_messages` (para DELI monitorar)
- Audit log em `agent_runs`

**Lógica de escalação:** detectada por regex no texto da solução — palavras como "escal", "Eduardo", "atendimento manual", "fora do escopo" disparam `needs_escalation = true`.

---

### `max-tutorial` ([trigger/max/tutorial.ts](../../trigger/max/tutorial.ts))

Gera um tutorial estruturado passo-a-passo sobre qualquer tópico relacionado a sistemas de delivery.

**Input:**
```ts
{
  tenant_id: uuid,
  user_id: uuid,
  topico: string,             // min 3, max 500 chars
  sistema?: 'ifood' | 'whatsapp' | 'pdv' | 'delivery' | 'geral',
  nivel?: 'basico' | 'intermediario' | 'avancado',  // default: 'basico'
  triggered_by?: uuid,
}
```

**Output:**
```ts
{
  ok: boolean,
  titulo: string,
  sistema: string,
  nivel: string,
  introducao: string,
  passos: Array<{
    passo: number,
    titulo: string,
    descricao: string,
    dica?: string,
  }>,
  tempo_estimado: string,     // Ex: "5 minutos", "10-15 minutos"
  dica_final?: string,
}
```

Mínimo 3 passos, máximo 10. Linguagem ajustada ao nível solicitado.

---

### `max-escalonar` ([trigger/max/escalonar.ts](../../trigger/max/escalonar.ts))

Classifica a prioridade de um problema e cria um ticket de escalação para Eduardo via `agent_drafts`.

**Input:**
```ts
{
  tenant_id: uuid,
  user_id: uuid,
  problema: string,           // min 10, max 2000 chars
  solucoes_tentadas?: string,
  loja_id?: uuid,
  triggered_by?: uuid,
}
```

**Output:**
```ts
{
  ok: boolean,
  precisa_humano: boolean,
  prioridade: 'baixa' | 'media' | 'alta' | 'critica',
  motivo: string,
  resumo_ticket: string,      // 2-3 linhas para Eduardo agir rapidamente
  proximo_passo: string,
}
```

**Efeitos colaterais (quando `precisa_humano = true`):**
- Cria draft em `agent_drafts` com emoji de prioridade (🔴🟠🟡🟢) e `autonomy_level = 'vermelho'` (crítica) ou `'amarelo'` (demais)
- Insere em `deli_messages` notificando DELI

**Critérios de prioridade:**
| Nível | Critério |
|-------|----------|
| `critica` | Sistema totalmente fora, perda de receita ativa, falha de segurança |
| `alta` | Problema recorrente, loja perdendo pedidos, tentativas anteriores falharam |
| `media` | Problema impactante mas loja operando parcialmente |
| `baixa` | Dúvida, melhoria ou configuração simples |

---

## Base de conhecimento

### `public.max_knowledge_base`

Artigos de suporte técnico usados pelo MAX em todas as tasks.

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | uuid PK | |
| `tenant_id` | uuid nullable | NULL = artigo global (compartilhado por todos os tenants) |
| `title` | text | Título do artigo |
| `content` | text | Corpo do artigo (instruções, passos, troubleshooting) |
| `system_name` | text | `ifood` \| `whatsapp` \| `pdv` \| `delivery` \| `geral` |
| `tags` | text[] | Tags para busca por similaridade |
| `is_active` | boolean | Se false, artigo ignorado |

**Queries:** MAX busca artigos filtrando por `system_name` + `tenant_id` (inclui artigos globais `tenant_id IS NULL`). Limit: 20 para diagnóstico, 10 para tutorial.

---

## Migration

| Arquivo | O que faz |
|---------|-----------|
| `20260514_014_max_knowledge_base.sql` | Tabela `max_knowledge_base`, índices, RLS |

---

## UI — tela `/agentes/max`

**Componente:** `src/screens/MaxScreen.jsx`

### Tabs

| Tab | Função |
|-----|--------|
| Diagnosticar | Formulário para `max-diagnostico` — mensagem do problema, sistema, loja |
| Tutorial | Formulário para `max-tutorial` — tópico, sistema, nível |
| Escalonar | Formulário para `max-escalonar` — problema, soluções tentadas |
| Base de Conhecimento | Listar, criar e editar artigos em `max_knowledge_base` |
| Drafts | Escalações pendentes de aprovação por Eduardo |

---

## RBAC

| Papel | Pode invocar tasks MAX | Acessa tela |
|-------|----------------------|-------------|
| `atendimento` | ✅ (prefixo `max-`) | ✅ |
| `admin` / `owner` | ✅ | ✅ |
| outros | ❌ | ❌ |

Bridge Server valida via `requireAgentAccess` → `ROLE_AGENT_PREFIXES.atendimento = ['max-', 'breno-']`.

---

## Variáveis de ambiente necessárias

| Variável | Onde | Descrição |
|----------|------|-----------|
| `ANTHROPIC_API_KEY` | Infisical + Trigger.dev | Claude Haiku para diagnóstico e tutorial |
| `SUPABASE_SERVICE_ROLE_KEY` | Infisical + Trigger.dev | Leitura da knowledge base, escrita de drafts |
| `TRIGGER_SECRET_KEY` | Bridge Server | Autenticação Trigger.dev |

---

## Decisões de design

- MAX usa `claude-haiku-4-5-20251001` para velocidade e custo baixo — diagnósticos precisam ser rápidos
- Citações explícitas obrigatórias ("[Artigo N]") — rastreabilidade da solução
- Artigos com `tenant_id IS NULL` são globais e compartilhados por todos os tenants (base comum da Consult Delivery)
- `max-escalonar` tem `retry: { maxAttempts: 1 }` — escalação não deve ser retentada automaticamente
- Retry: 2 tentativas em `diagnostico` e `tutorial`; 1 tentativa em `escalonar`

---

## Referências cruzadas

- `trigger/_shared/audit.ts` — `logAgentRun()`
- `trigger/_shared/supabase.ts` — cliente Supabase com lazy singleton
- `bridge-server/index.js` — rota `/agents/:slug/run`
- `supabase/migrations/20260514_014_max_knowledge_base.sql`
- `docs/agentes/breno.md` — BRENO também atua em atendimento, mas via WhatsApp PV; MAX atua em diagnóstico técnico sob demanda
