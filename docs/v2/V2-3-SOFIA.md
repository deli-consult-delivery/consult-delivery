# V2 Feature 3 — SOFIA (SDR/Prospecção)

**Prompt pra colar no Claude Code no repo `consult-delivery`.**

**Antes de colar:**
1. `cd "C:\Users\Consult Delivery\consult-delivery"`
2. `git checkout -b feature/v2-sofia`
3. `claude`
4. Cola o prompt abaixo

---

## ⚠️ DECISÃO PENDENTE ANTES DE COMEÇAR

SOFIA precisa de **fonte de prospects**. Você (Wandson) deve decidir:

| Opção | Custo | Volume | Fricção |
|---|---|---|---|
| Upload manual CSV | R$ 0 | Limitado pelo Wandson | Alta — depende de você gerar lista |
| Google Maps API + filtro | ~R$ 1.000/mês (alto volume) | Ilimitado | Média — configura uma vez |
| Apify scrapers (iFood, Instagram) | ~R$ 250/mês | Médio | Baixa |
| Manualmente pelo time | R$ 0 | Baixo | Alta |

**Se ainda não decidiu, NÃO inicie esta feature.** Decida primeiro.

---

```
# OBJETIVO
Implementar SOFIA — SDR/Prospecção. SOFIA recebe lista de prospects 
(restaurantes/lojas que ainda não são clientes), pesquisa cada um, 
qualifica o lead (size + match com Consult Delivery), gera abordagem 
personalizada para Wélida/Wandson aprovar e enviar.

# CONTEXTO
- Doc autoritativo: RESTRUCTURE.md
- Subagents: @cd-task-creator, @cd-migration-creator, @cd-validator
- SOFIA é ZERO CÓDIGO — vamos criar do zero
- Fonte de leads: [PREENCHER conforme decisão Wandson]
- Casos de uso: Wélida usa diariamente; Wandson aprova batches semanais
- Integração com módulo Clientes existente (lead → cliente quando converte)

# IMPORTANTE — Quem é o "cliente alvo" da Consult Delivery
SOFIA precisa saber qualificar lead. Wandson, ME RESPONDA antes de gerar 
prompts de IA pra SOFIA:

1. Tamanho típico de cliente: faturamento mensal? número de pedidos/dia?
2. Plataformas: iFood, 99Food, Rappi, todos? só delivery próprio?
3. Cidades-alvo: só Imperatriz/MA? Maranhão? Brasil todo?
4. Anti-perfil: que tipo de loja NÃO serve?
5. Ticket médio da consultoria: R$ X/mês?

# TAREFAS

## Tarefa 0 — Captura de perfil ideal
PERGUNTAR ao Wandson as 5 perguntas acima. Salvar respostas em 
docs/agentes/sofia-icp.md (Ideal Customer Profile).

NÃO seguir sem essa definição clara.

## Tarefa 1 — Schema (use @cd-migration-creator)

### 1.1. Tabela prospects
- id uuid PK
- tenant_id uuid FK tenants (sempre o tenant principal "consult" por enquanto)
- nome text
- cidade text
- estado text
- segmento text (restaurante|hamburgueria|pizzaria|açaí|outro)
- fonte text (manual|maps|apify|outro)
- instagram text NULL
- whatsapp text NULL
- site text NULL
- ifood_link text NULL
- avaliacao_ifood numeric NULL
- num_avaliacoes_ifood integer NULL
- status text (novo|pesquisando|qualificado|nao_qualificado|abordado|respondeu|convertido|descartado)
- score integer NULL (0-100 — calculado por SOFIA)
- razao_score text NULL
- created_at timestamptz
- updated_at timestamptz
- RLS: tenant_id

### 1.2. Tabela prospect_pesquisas
- id uuid PK
- prospect_id uuid FK prospects
- agent_run_id uuid FK agent_runs
- dados_coletados jsonb (estrutura do que SOFIA encontrou)
- fontes text[] (URLs consultadas)
- created_at timestamptz
- RLS via prospects.tenant_id

### 1.3. Tabela prospect_abordagens
- id uuid PK
- prospect_id uuid FK prospects
- canal text (whatsapp|instagram_dm|email)
- mensagem text
- status text (rascunho|aprovada|enviada|respondida|sem_resposta)
- created_by uuid FK auth.users (SOFIA gera, humano aprova)
- approved_by uuid FK auth.users NULL
- sent_at timestamptz NULL
- responded_at timestamptz NULL
- created_at timestamptz
- RLS via prospects.tenant_id

## Tarefa 2 — Tasks SOFIA (use @cd-task-creator)

### 2.1. sofia-pesquisar-prospect
Input: { tenant_id, prospect_id }
- Busca prospect no banco
- Usa web_search pra coletar: redes sociais, avaliações, volume estimado
- Salva em prospect_pesquisas
- Atualiza prospect com dados encontrados
- Atualiza prospects.status para "pesquisando"

### 2.2. sofia-qualificar
Input: { tenant_id, prospect_id }
- Lê pesquisa existente
- Lê ICP (Ideal Customer Profile) do tenant
- Atribui score 0-100 com razão escrita
- Se score >= 70: status = "qualificado"
- Se score < 30: status = "nao_qualificado"
- Entre: deixa "pesquisando" pra humano decidir

### 2.3. sofia-gerar-abordagem
Input: { tenant_id, prospect_id, canal }
- Lê dados do prospect
- Gera mensagem personalizada baseada em:
  - O que descobriu (ex: "Vi que vocês têm avaliação 4.8 no iFood mas só 12 pedidos/dia...")
  - Tom apropriado pro canal
  - Cidade/região (português regional)
- Salva em prospect_abordagens com status "rascunho"
- NUNCA envia direto — sempre rascunho

### 2.4. sofia-batch-pesquisar
Input: { tenant_id, prospect_ids: [] }
- Dispara sofia-pesquisar-prospect pra cada prospect em paralelo
- Limite: max 20 simultâneos
- Retorna agregado quando termina

## Tarefa 3 — Importação de prospects
Conforme decisão Wandson:

### Se "upload manual CSV":
- Tela /agentes/sofia/importar com upload de CSV
- Colunas obrigatórias: nome, cidade, estado, segmento
- Colunas opcionais: instagram, whatsapp, site, ifood_link
- Preview antes de salvar
- Insere em prospects com status "novo"

### Se "Google Maps API":
- Implementação adicional necessária (chave Google Cloud + billing)
- Tela /agentes/sofia/buscar com filtros (cidade + categoria)
- SOFIA puxa lista, deduplica, insere

### Se "Apify":
- Implementação adicional necessária (chave Apify + scrapers)
- Tela /agentes/sofia/scraper escolhendo scraper + região

## Tarefa 4 — UI /agentes/sofia
- Lista de prospects com filtros (status, score, cidade, segmento)
- Cores por status (novo=cinza, qualificado=verde, abordado=azul, etc)
- Detalhes do prospect: dados coletados, pesquisas, abordagens
- Botões de ação por prospect:
  - "Pesquisar" → dispara sofia-pesquisar-prospect
  - "Qualificar" → dispara sofia-qualificar
  - "Gerar abordagem" → dispara sofia-gerar-abordagem (escolhe canal)
- Batch actions: selecionar múltiplos e pesquisar/qualificar em massa
- Modal de aprovação de abordagem: visualiza mensagem, edita se quiser, aprova ou rejeita

## Tarefa 5 — Workflow de aprovação
Quando Wélida ou Wandson aprovam uma abordagem:
- Status muda pra "aprovada"
- (Por agora) Wélida envia manualmente. Não automatizar envio em V2.
- Em V3: integração com Evolution pra envio automático

## Tarefa 6 — Conversão para Cliente
Quando prospect.status = "convertido":
- Botão "Criar cliente" na UI
- Copia dados do prospect pra clientes (módulo existente)
- Mantém prospect arquivado pra histórico
- Cria link prospect → cliente

## Tarefa 7 — Métricas SOFIA
Dashboard com:
- Total prospects por status
- Conversion rate (novo → qualificado, qualificado → abordado, abordado → convertido)
- Score médio
- Tempo médio entre pesquisa e qualificação

## Tarefa 8 — Documentação
- docs/agentes/sofia.md com fluxos
- docs/agentes/sofia-icp.md (criado na Tarefa 0)
- Atualizar RESTRUCTURE.md
- Atualizar CLAUDE.md

# CRITÉRIO DE ACEITE

- [ ] ICP definido em docs/agentes/sofia-icp.md (Wandson aprovou)
- [ ] 3 migrations criadas e aplicadas
- [ ] 4 tasks SOFIA implementadas
- [ ] Importação funcional (conforme decisão Wandson)
- [ ] UI /agentes/sofia completa
- [ ] Smoke test E2E:
  1. Importar 5 prospects de teste
  2. Pesquisar todos
  3. Qualificar
  4. Gerar abordagem pros qualificados
  5. Aprovar/rejeitar
- [ ] @cd-validator passa
- [ ] Conversão prospect → cliente funciona
- [ ] Sem regressão em outros agentes

# RESTRIÇÕES

- NÃO enviar abordagens automaticamente em V2 (humano sempre aprova)
- NÃO criar prospects sem fonte clara
- Limite 100 prospects por batch (não estourar custo Anthropic)
- SOFIA nunca alucina dados — se não encontrar, deixa NULL
- ICP definido por Wandson, NÃO chutar

# USO DOS SUBAGENTS

- @cd-task-creator pra 4 tasks
- @cd-migration-creator pra 3 migrations
- @cd-validator antes de PR

Começar pela Tarefa 0 (ICP). ME PERGUNTAR ao terminar cada tarefa.
```

---

## Estimativa

- Tarefa 0 (ICP): 30min-1h (Wandson responde)
- Tarefas 1-2 (schema + tasks): 3-4 dias
- Tarefa 3 (importação): 1-3 dias (depende da fonte)
- Tarefas 4-7 (UI + workflow + métricas): 3-4 dias
- Tarefa 8 (docs): 2-3h
- Validação + PR: 1-2 dias

**Total: 8-15 dias úteis** (2-3 semanas)
