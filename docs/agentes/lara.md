# LARA · CRM & Marketing Food Service

**Status:** ✅ Ativa — Feature V2-3 concluída em 15/05/2026  
**Role necessário:** `marketing` ou `admin`  
**Usuária principal:** Wélida (role: marketing)  
**Integração externa:** iFood, Instagram, Google Maps (via web_search)  
**Orquestrador:** Trigger.dev (projeto `proj_slexhoelcjwgbopmbzzr`)

---

## Identidade

LARA é a especialista sênior de CRM food service da Consult Delivery. Ela pesquisa lojas no iFood e redes sociais, gera conteúdo de marketing personalizado e analisa tendências do mercado de delivery para alimentar a régua de disparo.

LARA **nunca** publica conteúdo diretamente. Todo conteúdo gerado vira um draft em `agent_drafts` com `autonomy_level = 'amarelo'` para aprovação da Wélida.

LARA usa `web_search` (tool `web_search_20250305`) para pesquisa em tempo real. É uma das poucas agentes com acesso ativo à internet.

---

## Trigger.dev Tasks

### `lara-pesquisar-loja` ([trigger/lara/pesquisar-loja.ts](../../trigger/lara/pesquisar-loja.ts))

Pesquisa dados completos de uma loja no iFood, Instagram e Google Maps para alimentar `client_facts`.

**Input:**
```ts
{
  tenant_id: uuid,
  loja_id?: uuid,
  loja_nome: string,          // mínimo 2 chars
  cidade?: string,
  ifood_link?: string,
  instagram?: string,
  triggered_by?: uuid,
}
```

**Output:**
```ts
{
  ok: boolean,
  loja_nome: string,
  ifood: {
    categorias: string[],
    nota: number | null,
    avaliacoes: number | null,
    ticket_medio: string | null,
    diferenciais: string[],
  },
  cardapio: {
    destaques: string[],
    especialidades: string[],
  },
  instagram: {
    handle: string | null,
    estilo: string | null,
    frequencia: string | null,
  },
  posicionamento: string,
  tom_de_voz: string,
  oportunidades: string[],
  concorrentes: Array<{ nome: string, diferencial: string }>,
  resumo_executivo: string,
}
```

**Efeitos colaterais:**
- Upsert em `client_facts` (key `pesquisa_lara`) se `loja_id` for fornecido
- Notifica DELI via `deli_messages` com resumo e count de oportunidades

---

### `lara-gerar-conteudo` ([trigger/lara/gerar-conteudo.ts](../../trigger/lara/gerar-conteudo.ts))

Gera conteúdo de marketing em 3 variações (produto, benefício, urgência) para Instagram, WhatsApp, e-mail ou iFood.

**Input:**
```ts
{
  tenant_id: uuid,
  loja_id?: uuid,
  loja_nome: string,
  tipo: 'post_instagram' | 'stories_instagram' | 'mensagem_whatsapp' | 'email_marketing' | 'legenda_campanha',
  objetivo: string,           // Ex: "reativar clientes inativos 30 dias"
  contexto?: string,          // Dados da loja, produto destaque, promoção ativa
  tom?: string,               // Ex: "informal e próximo", "premium"
  cupom?: string,             // Ex: "VOLTA10", "FRETE0"
  triggered_by?: uuid,
  campanha_id?: uuid,
}
```

**Output:**
```ts
{
  ok: boolean,
  loja_nome: string,
  tipo: string,
  objetivo: string,
  variacoes: Array<{
    titulo: string,
    conteudo: string,
    cta: string,
    observacoes?: string,
  }>,
  dicas_uso: string[],
}
```

**Efeitos colaterais:**
- Insere cada variação como draft em `agent_drafts` (`autonomy_level = 'amarelo'`, `channel = 'painel'`)
- Se `campanha_id` fornecido: atualiza `campanhas.status → 'pendente_revisao'` e dispara notificação via `notify()`
- Notifica DELI via `notifyDeli()`

---

### `lara-analisar-tendencia` ([trigger/lara/analisar-tendencia.ts](../../trigger/lara/analisar-tendencia.ts))

Pesquisa tendências atuais de mercado para um segmento de delivery e retorna oportunidades acionáveis.

**Input:**
```ts
{
  tenant_id: uuid,
  segmento: string,           // Ex: "pizza", "hambúrguer", "açaí", "japonesa"
  cidade?: string,
  foco?: string,              // Ex: "cardápio", "marketing", "preços", "embalagem"
  triggered_by?: uuid,
}
```

**Output:**
```ts
{
  ok: boolean,
  segmento: string,
  cidade: string | null,
  tendencias: Array<{
    titulo: string,
    descricao: string,
    como_aplicar: string,
    urgencia: 'alta' | 'media' | 'baixa',
  }>,
  oportunidades_rapidas: string[],
  alertas: string[],
  resumo: string,
}
```

**Efeitos colaterais:**
- Notifica DELI via `notifyDeli()` com count de tendências e alertas

---

## Fluxo de ativação

```
Wélida abre LaraScreen → aba "Pesquisar"/"Conteúdo"/"Tendências"
  → POST /agents/lara-pesquisar-loja/run (ou outra task)
    → Bridge Server → Trigger.dev API → task executa
      → resultado aparece no painel (Realtime via agent_runs)
      → drafts gerados ficam em aba "Drafts" para aprovação
```

LARA também é acionada automaticamente pela DELI via tool `acionar_lara` em `deli-conversa` e `deli-supervisionar`.

---

## Schema do banco

### `public.client_facts` (memória central)

LARA lê e escreve nesta tabela. Cada pesquisa de loja upserta a key `pesquisa_lara` com o JSON completo do output.

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `loja_id` | uuid FK lojas | Loja pesquisada |
| `key` | text | `pesquisa_lara` |
| `value` | jsonb | Output serializado |
| `ts` | timestamptz | Última atualização |

### `public.agent_drafts`

Drafts gerados por `lara-gerar-conteudo`. Campos relevantes:

| Coluna | Valor para LARA |
|--------|-----------------|
| `agent_name` | `'lara'` |
| `channel` | `'painel'` |
| `autonomy_level` | `'amarelo'` (sempre — Wélida aprova) |
| `metadata.tipo` | tipo do conteúdo gerado |
| `metadata.variacao_index` | 0, 1 ou 2 |

### `public.campanhas`

Tabela de campanhas de marketing. LARA atualiza `status`, `conteudo_gerado` e `agent_run_id` após gerar conteúdo.

---

## Migrations

| Arquivo | O que faz |
|---------|-----------|
| `20260506_001_lara_regua.sql` | Tabelas da régua de disparo: `campanhas`, regras, agenda |

---

## UI — tela `/agentes/lara`

**Componente:** `src/screens/LaraScreen.jsx`

### Tabs

| Tab | Função |
|-----|--------|
| Pesquisar | Formulário para `lara-pesquisar-loja` — nome, cidade, link iFood, Instagram |
| Conteúdo | Formulário para `lara-gerar-conteudo` — tipo, objetivo, tom, cupom |
| Tendências | Formulário para `lara-analisar-tendencia` — segmento, cidade, foco |
| Drafts | Listar e aprovar/rejeitar drafts gerados em `agent_drafts` |
| Campanhas | Listar campanhas com status de geração |

---

## RBAC

| Papel | Pode invocar tasks LARA | Acessa tela |
|-------|------------------------|-------------|
| `marketing` | ✅ (prefixo `lara-`) | ✅ |
| `admin` / `owner` | ✅ | ✅ |
| outros | ❌ | ❌ |

Bridge Server valida via `requireAgentAccess` → `ROLE_AGENT_PREFIXES.marketing = ['lara-']`.

---

## Variáveis de ambiente necessárias

| Variável | Onde | Descrição |
|----------|------|-----------|
| `ANTHROPIC_API_KEY` | Infisical + Trigger.dev | Claude com web_search |
| `SUPABASE_SERVICE_ROLE_KEY` | Infisical + Trigger.dev | Leitura/escrita no banco |
| `TRIGGER_SECRET_KEY` | Bridge Server | Autenticação Trigger.dev |

---

## Decisões de design

- LARA usa `web_search_20250305` para pesquisas — acesso real à internet, dados sempre atualizados
- Conteúdo gerado é sempre 3 variações (produto / benefício / urgência) — Wélida escolhe ou combina
- Drafts usam `autonomy_level = 'amarelo'` obrigatoriamente — LARA nunca publica sem aprovação humana
- `lara-analisar-tendencia` e `lara-pesquisar-loja` têm `useWebSearch: true`; `lara-gerar-conteudo` tem `useWebSearch: false` (não precisa de dados externos)
- Retry: 2 tentativas em todas as tasks

---

## Referências cruzadas

- `trigger/_shared/claude.ts` — wrapper `runClaudeWithWebSearch()` usado por LARA
- `trigger/_shared/audit.ts` — `logAgentRun()` e `notifyDeli()`
- `trigger/_shared/notify.ts` — notificações de campanha pronta
- `bridge-server/index.js` — rota `/agents/:slug/run`
- `supabase/migrations/20260506_001_lara_regua.sql`
- `CLAUDE.md` § LARA — referências completas e fluxo de subagentes Nexus
