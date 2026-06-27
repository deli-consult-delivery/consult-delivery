# Integração iFood (Restaurante) — Plano-Mestre

> Doc-mestre de engenharia. Fonte primária: portal logado `developer.ifood.com.br` (conta Super Integradora, Wandson, 2026-06-27) + molde de integração externa já em produção na CD (`vendaerp`).
> Host base de TODAS as APIs do iFood: `https://merchant-api.ifood.com.br`. Auth: OAuth 2.0 + `Authorization: Bearer <accessToken>`.
> Regra-mãe da CD que atravessa o doc inteiro: **o Bridge Server é o ponto único de integração e de credencial**; **nenhum agente escreve em dado real de cliente sem draft + aprovação** (semáforo verde/amarelo/vermelho); **multi-tenant com RLS**; **Trigger.dev nunca dá `throw` no topo do módulo** (lazy getter); **Zod em todo input/output**; **SQL aditivo versionado em git antes de aplicar**.

---

## 0. Resumo executivo

A CD vai integrar o **iFood do restaurante** para que os agentes (BRENO no atendimento, VERA no BI) leiam e operem cardápio, status de loja, vendas e avaliações direto da plataforma. O app é da categoria **PDV** porque restaurante opera pedidos em tempo real — só a categoria PDV homologa o módulo `Order` (BI puro não homologa Order). O fluxo de auth recomendado é o **Distributed**: cada restaurante autoriza o app da CD via `userCode` no Portal do Parceiro (consentimento explícito e revogável por lojista), gerando `accessToken` (6h) + `refreshToken` por loja. Na stack CD isso encaixa exatamente como VendaERP/Asaas/Evolution: `lib/ifood.js` + `routes/ifood.js` no Bridge (credencial por tenant em `ifood_instances`), tasks `trigger/ifood/*` para leitura/escrita, e escrita de cardápio sempre gated por `agent_drafts` amarelo. Entrega faseada e gated: F1 leitura → F2 escrita de cardápio com confirmação → F3 pedidos (Order, exige homologação completa) → F4 multi-tenant distributed.

---

## 1. A pergunta do Wandson respondida — agente recebe demanda no WhatsApp e EXECUTA no iFood

**Pergunta:** "Como um agente recebe uma demanda no WhatsApp (ex.: *pausa o X-Bacon no iFood*) e de fato EXECUTA isso no iFood?"

**Resposta curta:** a mesma espinha que já roda o BRENO. A mensagem entra pela `evolution-webhook`, vira evento no Supabase, o BRENO interpreta com o LLM e emite uma **intenção estruturada** (Zod), nunca uma chamada de API. A intenção vira uma `client_task` com `target_system='ifood'`. Se a operação toca dado real de cliente (cardápio), nasce um **draft amarelo** que aguarda o `ok` humano. Aprovado, uma **task Trigger.dev** chama o **Bridge** (`POST /api/ifood/acao`), que é o único componente que fala com a API do iFood — ele injeta a credencial do tenant via `lib/ifood.js`, faz o `PATCH /items/{itemId}`, grava `execution_result` + `logAgentRun`, e o loop fecha respondendo no mesmo canal.

**Invariante crítica:** o LLM só **interpreta**. O trust boundary de escrita fica na task + Bridge. O LLM nunca toca o token do iFood nem a API.

### Diagrama ASCII — ponta a ponta

```
 WhatsApp / Telegram interno / Chat interno (Console v2)
        │  "pausa o X-Bacon no iFood da loja Y"
        ▼
 supabase/functions/evolution-webhook/index.ts
        │  1. grava em messages/conversations (Supabase = fonte primária, QA P3)
        │  2. triggerBrenoIfNeeded() → POST {BRIDGE_URL}/internal/agents/breno-processar-webhook/run  (x-bridge-secret)
        ▼
 bridge-server/index.js  ·  POST /internal/agents/:slug/run   [L382]
        │  valida x-bridge-secret → POST {TRIGGER_API_URL}/api/v1/tasks/<slug>/trigger (Bearer TRIGGER_SECRET_KEY)
        ▼
 trigger/breno/processar-webhook.ts   (gate off-hours · modo humano|hibrido|ia · filtros)
        ▼
 trigger/breno/responder.ts           (executeAgent: atende o cliente em linguagem natural)
        │  acao = "criar_tarefa" + sistema_alvo = "ifood"
        ▼
 ┌──────────────────────────────────────────────────────────────────────┐
 │  INTENT ROUTER  (Zod)  ── NL → { operacao, parametros, confianca }     │  ◀── encaixe novo
 │  ex.: { operacao:"ifood.pausar_item", parametros:{item_nome:"X-Bacon", loja:"Y"} }
 └──────────────────────────────────────────────────────────────────────┘
        │  createLoopTask() → client_tasks(target_system='ifood',
        │                                  execution_result={operacao,parametros}, loop_state='open')
        │
        ├─ modo ia / verde        → agentExecutarIfood.trigger()         (executa já)
        └─ modo hibrido / amarelo  → agent_drafts(autonomy_level='amarelo', status='pending')
                                      → painel/Telegram → humano aprova
                                      → POST /api/ifood/aprovar/:draft_id (Bridge)
                                      → agentExecutarIfood.trigger()
        ▼
 trigger/ifood/executar.ts   (task agent-executar-ifood — Zod in/out, lazy getter, retry, logAgentRun)
        │  POST {BRIDGE_URL}/api/ifood/acao   (x-internal-token)
        ▼
 bridge-server/routes/ifood.js  ·  dispatch por operacao  →  bridge-server/lib/ifood.js
        │  getIfoodConfig(tenantId) → token do tenant (ifood_instances + refresh) 
        │  PATCH https://merchant-api.ifood.com.br/catalog/v2.0/merchants/{merchantId}/items/{itemId}  { status: "UNAVAILABLE" }
        ▼
 API iFood  →  resposta  →  execution_result + logAgentRun + audit_log
        ▼
 agent-responder-conclusao → fecha o loop com o cliente no MESMO canal (WhatsApp/Telegram/Chat)
```

**Arquivos-âncora reais (todos já existem, exceto os marcados a criar):** `supabase/functions/evolution-webhook/index.ts` (`triggerBrenoIfNeeded` L1081) · `bridge-server/index.js` (L382 `/internal/agents/:slug/run`, `requireJwtOrInternal` L77-85, `requireAgentAccess` L298-341, `supabaseSelect` L88-100) · `trigger/breno/processar-webhook.ts` · `trigger/breno/responder.ts` (intent embrionário + `agent_drafts` insert L273) · `trigger/agents/executar-tarefa.ts` (molde do executor que chama o Bridge) · `trigger/_shared/loop-tasks.ts` (`createLoopTask`) · `bridge-server/routes/breno-aprovacao.js` + `deli-approvals.js` (draft→aprova→executa) · `bridge-server/routes/vendaerp.js` + `lib/vendaerp.js` (molde da integração externa) · **a criar:** `bridge-server/lib/ifood.js`, `bridge-server/routes/ifood.js`, `trigger/ifood/*`, migration `ifood_instances`.

---

## 2. A API do iFood para restaurante — módulos e endpoints-chave

Legenda: **[R]** = leitura · **[W]** = escrita. Host de tudo: `https://merchant-api.ifood.com.br`.

### Merchant — `/merchant/v1.0` (gestão de loja: status, horários, pausa)
| | Endpoint | Para quê |
|---|---|---|
| [R] | GET `/merchants` | Listar lojas autorizadas |
| [R] | GET `/merchants/{merchantId}` | Detalhes da loja |
| [R] | GET `/merchants/{merchantId}/status` | Loja aberta/fechada agora |
| [R] | GET `/merchants/{merchantId}/interruptions` | Listar interrupções (pausas ativas) |
| [W] | POST `/merchants/{merchantId}/interruptions` | **Fechar/pausar a loja** (criar interrupção) |
| [W] | DELETE `/merchants/{merchantId}/interruptions/{interruptionId}` | **Reabrir a loja** (remover interrupção) |
| [R] | GET `/merchants/{merchantId}/opening-hours` | Horário de funcionamento |
| [W] | PUT `/merchants/{merchantId}/opening-hours` | Definir horário |
| [R/W] | GET/POST/PUT/DELETE `/merchants/{merchantId}/myPreparationTime` | Tempo de preparo (5–70 min; body = inteiro JSON puro; header `X-iFood-Customer-ID`; **rate 100/60s**) |

### Catalog — `/catalog/v2.0` (v1.0 legado) — CARDÁPIO (o coração da F2)
| | Endpoint | Para quê |
|---|---|---|
| [R] | GET `/merchants/{merchantId}/catalogs` | Listar catálogos → `catalogId` |
| [R] | GET `/.../catalogs/{groupId}/sellableItems` · `/.../catalogs/{catalogId}/unsellableItems` | Itens vendáveis (param **`groupId`**) / não-vendáveis (`catalogId`) — ⚠️ a doc usa nomes de parâmetro DIFERENTES; confirmar em *Catalog → Fundamentos* se `groupId == catalogId` neste contexto **antes de codar o getter** (risco de 404) |
| [R] | GET `/merchants/{merchantId}/catalog/version` | Versão do catálogo |
| [R/W] | GET/POST `/.../catalogs/{catalogId}/categories` | Listar / criar categoria |
| [R] | GET `/merchants/{merchantId}/categories/{categoryId}/items` | Listar itens da categoria (verificação) |
| [W] | PUT `/merchants/{merchantId}/items` | **Criar/atualizar item** (idempotente: substitui o item inteiro) |
| [W] | PATCH `/merchants/{merchantId}/items/{itemId}` | **Pausar/preço/status** de item (endpoint atual; `/items/price`,`/items/status` deprecados) |
| [W] | PATCH `/merchants/{merchantId}/products/status` | **Pausar produtos em LOTE** |
| [W] | PATCH `/merchants/{merchantId}/products/price` | Atualizar preços em lote |
| [W] | POST `/merchants/{merchantId}/inventory` | Criar/atualizar estoque |
| [W] | POST `/merchants/{merchantId}/image/upload` | Upload de imagem |
| [R] | GET `/merchants/{merchantId}/batch/{batchId}` | Resultado de operação em lote |

> **Conceito Catalog:** sincroniza categorias/itens/complementos em tempo real com 3 canais — **Entrega, Cardápio Digital e Consumo no Local** — com **preços e disponibilidade INDEPENDENTES por canal**. IDs de item/produto/opção são **gerados pela CD em UUID v4** (ID fora de UUID v4 → 404); `externalCode` é único por merchant (duplicado → 409). É o ponto de espelhamento entre o cardápio do VendaERP/POS e o iFood.

### Events + Order — `/events/v1.0` e `/order/v1.0` (pedidos, exclusivo PDV — F3)
| | Endpoint | Para quê |
|---|---|---|
| [R] | GET `/events:polling` | Buscar novos eventos (polling **30s**; header `x-polling-merchants`) |
| [W] | POST `/events/acknowledgment` | Confirmar (ack 200) TODOS os eventos recebidos |
| [R] | GET `/orders/{id}` | Detalhes do pedido |
| [W] | POST `/orders/{id}/confirm` | Confirmar pedido (DELIVERY/TAKEOUT, dentro do SLA) |
| [W] | POST `/orders/{id}/startPreparation` · `/readyToPickup` · `/dispatch` | Avançar estados do pedido |
| [R] | GET `/orders/{id}/cancellationReasons` | Códigos de cancelamento |
| [W] | POST `/orders/{id}/requestCancellation` | Solicitar cancelamento |
| [W] | POST `/disputes/{disputeId}/accept` · `/reject` · `/alternatives/{altId}` | Disputas (Handshake) |

> **Order é exclusivo de PDV em tempo real.** Apps de BI **não** homologam Order. Por isso a F3 é a fase que exige homologação PDV completa.

### Financial — `/financial/v3.0` (vendas/repasses — BI da VERA)
| | Endpoint | Para quê |
|---|---|---|
| [R] | GET `/merchants/{merchantId}/sales` | **Vendas** |
| [R] | GET `/merchants/{merchantId}/reconciliation` · `/settlements` · `/anticipations` · `/financial-events` | Conciliação, repasses, antecipações, eventos financeiros |
| [W] | POST `/merchants/{merchantId}/reconciliation/on-demand` | Gerar arquivo de conciliação sob demanda |

> ⚠️ **Financial NÃO está nos módulos da categoria PDV** (disponível em Groceries e Finanças). Para BI financeiro de restaurante seria um **app categoria Finanças** separado, ou puxar `sales` por outra via. Decisão de escopo da F1/VERA — ver §8.

### Review — `/review/v2.0` (avaliações — BRENO/VERA)
| | Endpoint | Para quê |
|---|---|---|
| [R] | GET `/merchants/{merchantId}/reviews` | Listar avaliações |
| [R] | GET `/merchants/{merchantId}/reviews/{reviewId}` | Obter avaliação |
| [W] | POST `/merchants/{merchantId}/reviews/{reviewId}/answers` | **Responder avaliação** (gated, draft amarelo) |
| [R] | GET `/merchants/{merchantId}/summary` | Resumo (contagem, nota média) |

### Shipping — `/shipping/v1.0` (entrega via iFood para canais próprios)
Disponibilidade de entrega, solicitar entregador, Safe Delivery Score, rastreamento. Relevante só se a CD operar canal próprio com logística iFood — fora do escopo F1–F3.

> **Fora do escopo restaurante** (capturados, mas Groceries/Logística): `/logistics/v1.0`, `/picking/v1.0`, `/item/v1.0` (ingestion groceries).

---

## 3. Autenticação e multi-tenant

Token: `type=bearer`, `expiresIn=21600s` (**6 horas**), `accessToken` é JWT (carrega `aud/scope/tenantId/merchant_scope/client_id`). Tokens ≤ 8.000 caracteres.

### Centralized vs Distributed

| | **Centralized** (`client_credentials`) ✅ **ESCOLHIDO** | **Distributed** (`authorization_code` + userCode) |
|---|---|---|
| Quando (texto da doc) | App **opera em ambiente interno/privado**, **não acessível diretamente pela internet**, **guarda o secret no servidor**. Ex.: *"servidores em VPC privada que consomem APIs do iFood para expor serviços próprios"* | App **público** acessível pela internet, precisa de **autorização explícita do dono da loja** |
| Credenciais | 1 par `clientId`+`clientSecret` (nível CD) → accessToken | Por lojista, com consentimento |
| `refresh_token` | **NÃO recebe** — renova pedindo token de novo | Sim (`refreshToken`) |
| Autorização do lojista | Não | Sim — no Portal do Parceiro (`userCode`) |

### DECISÃO = **Centralized** — CONFIRMADO na doc (2026-06-27), não precisa perguntar ao iFood

O critério do iFood **não é "quem é dono da loja"** — é a natureza do app. O Bridge da CD é um **backend privado na VPS que guarda o `clientSecret` e expõe serviços próprios** (Console + agentes): bate 1:1 com a definição de *centralized*. O *distributed* (userCode) é para apps públicos onde o usuário final clica "autorizar" — não é o nosso caso.

**Implicações práticas (simplificam MUITO a F1):**
- Grant **`client_credentials`**: `POST /authentication/v1.0/oauth/token` com `grantType=client_credentials` + `clientId` + `clientSecret` → `accessToken` (6h).
- **Sem `refresh_token`, sem `userCode`, sem autorização por loja.** Renovar = pedir um token novo com as mesmas credenciais quando o atual estiver perto de expirar.
- **Um único token da integradora** (não um por loja). O token carrega `merchant_scope` (lista de merchants vinculados à integradora). O vínculo loja↔integradora é administrativo (onboarding de Super Integradora / Portal), não um `userCode` por loja.
- `clientId`/`clientSecret` vivem no **Infisical** (nível CD), nunca no código nem por tenant.

**Fluxo (o que `lib/ifood.js` implementa):**
1. `getAccessToken()` — cache em memória do Bridge (`{ token, expiresAt }`). Se ausente/perto de expirar (< 5 min), `POST /oauth/token` `grantType=client_credentials` e cacheia. **Single-flight** (uma Promise compartilhada) para não pedir N tokens sob concorrência.
2. Todas as chamadas usam esse token. Sem persistir token no Supabase (é da integradora, não do tenant).

**O que sobra por tenant** (tabela `ifood_merchants`, ver §5.4): só o mapa `tenant_id → merchant_id` (qual loja iFood pertence a qual restaurante da CD). Sem token/refresh por loja.

---

## 4. Guia de homologação passo a passo

Política iFood (texto integral coletado): homologue o app de **TESTE** ANTES de liberar para clientes; crie o app de **PRODUÇÃO** somente **APÓS** homologar. O iFood testa o **aplicativo completo** (interface final — painel, app, PDV — criando/atualizando/exibindo dados reais), **não chamadas isoladas**. **Conta Profissional (CNPJ) obrigatória — CPF (Pessoal/Estudante) NÃO é aceita.**

### Passos
1. **Criar conta** Profissional (CNPJ) no portal — `/getting-started/first-steps/create-account`.
2. **Criar app de TESTE** categoria **PDV** — `/create-app`. (PDV = único que dá acesso a Order + tem Catalog/Review/Shipping.)
3. **Solicitar acessos dos módulos** que a CD vai usar — `/request-access`: **Merchant, Events, Order, Catalog, Review** (+ Shipping se houver canal próprio).
4. **Gerar pedido de teste** — `/generate-test-order` (necessário para homologar Order/Events; precisa do ID e nome da loja de teste + conexão estável).
5. **Cumprir os critérios por módulo** (checklist abaixo) demonstrando a **interface final** da CD (Console v2 + agentes) operando dados reais.
6. **Agendar a reunião de homologação** — o iFood testa ao vivo o app completo; pedido que não cumpre pré-requisitos é rejeitado no agendamento ou na reunião.
7. **Só depois, criar o app de PRODUÇÃO** e migrar as credenciais (Infisical).

### Checklist marcável de homologação

**Pré-requisitos gerais**
- [ ] Conta Profissional **CNPJ** ativa (CPF não serve)
- [ ] App de TESTE categoria **PDV** criado
- [ ] Acessos solicitados: Merchant · Events · Order · Catalog · Review
- [ ] Loja de teste com ID/nome + conexão estável
- [ ] Interface final da CD pronta (Console v2 exibindo/operando dados reais) — não é teste de chamada isolada

**Catalog** (todos que usam Catalog homologam)
- [ ] Demonstrar criação de item via interface final (UUID v4 + `externalCode`)
- [ ] Demonstrar atualização de preço
- [ ] Demonstrar pausar/despausar item (disponibilidade)
- [ ] Demonstrar operação multi-contexto (preço/disponibilidade por canal)

**Order** (exclusivo PDV)
- [ ] `/events:polling` a cada **30s** OU webhook; `/acknowledgment` (200) para **TODOS** os eventos
- [ ] Confirmar pedidos **DELIVERY e TAKEOUT** (imediatos e agendados) dentro do SLA
- [ ] Exibir motivos de `/cancellationReasons` e processar cancelamentos
- [ ] Exibir **bandeira do cartão** e **troco em dinheiro**
- [ ] Exibir **cupons** (valor e responsabilidade)

**Events**
- [ ] Polling a cada **30s** (não perder pedidos)
- [ ] Header `x-polling-merchants` para filtrar por merchant
- [ ] Filtrar eventos por tipo/grupo quando necessário
- [ ] `acknowledgment` (200) imediato para todos os eventos
- [ ] Conta **CNPJ** (reforçado pelo módulo Events)

**Merchant / Review / Shipping**
- [ ] Critérios detalhados — **ainda não coletados** (só existência das URLs). Coletar antes da F2/F3 (ver §8).

---

## 5. Blueprint de código na stack CD

Todo o blueprint copia 1:1 o par `vendaerp` já em produção. Não inventar padrão novo.

> 🔁 **Ajuste pós-decisão de auth (§3 = Centralized):** `getAccessToken` usa **`client_credentials` (sem refresh_token)** com cache em memória + single-flight no Bridge — NÃO lê token por tenant do Supabase. A tabela por tenant guarda só `tenant_id → merchant_id` (renomeada `ifood_merchants`, ver §5.4); não há `access_token`/`refresh_token`/`authorization_code_verifier` por loja. `clientId`/`clientSecret` no Infisical (nível CD).

### 5.1 `bridge-server/lib/ifood.js` — espelho de `lib/vendaerp.js` (7 peças, mesma ordem)
`'use strict'` + CommonJS (Bridge é Node puro). As 7 peças:

1. **Erro tipado** no topo:
   ```js
   class IfoodApiError extends Error {
     constructor(message, status, body) {
       super(message);
       this.name = 'IfoodApiError';
       this.status = status;  // 0 = rede/timeout; 4xx/5xx = HTTP do iFood
       this.body = body;      // corpo de erro do iFood (regra de negócio)
     }
   }
   ```
2. **Config LAZY** — `getIfoodConfig(tenantId)` lê env **dentro da chamada** (nunca no topo — `throw` no topo derruba o worker). `clientId`/`clientSecret` do Infisical; guard "credencial ausente → throw status 0". Assinatura já recebe `tenantId` (Fase 1 pode ignorar, Fase 4 resolve por tenant — zero mudança de assinatura na virada).
3. **Token por tenant + refresh** — `getAccessToken(tenantId)`: `supabaseSelect('ifood_instances', { tenant_id })`; se `expires_at` perto de expirar (< 5 min), chamar `POST /oauth/token` `grant_type=refresh_token` e **gravar de volta** `access_token`/`expires_at`. ⚠️ **Concorrência:** sob várias chamadas simultâneas perto da expiração, um refresh ingênuo gera *corrida* e pode invalidar o `refresh_token` (alguns provedores rotacionam o refresh a cada uso). Usar **single-flight por tenant** (um `Map<tenantId, Promise>` que coalesce refreshes concorrentes na mesma Promise) e, idealmente, `UPDATE ... WHERE expires_at = <valor_lido>` (compare-and-set) para que só um vencedor grave. Testar **expiração real**, não só o caminho feliz. ponytail: single-flight in-process basta para 1 instância do Bridge; se virar multi-instância, trocar por lock no Postgres (`pg_advisory_lock` por tenant). // ponytail: lock in-process, advisory-lock quando o Bridge escalar horizontalmente.
4. **Retry** — `shouldRetry(status) = status === 429 || status >= 500`; `withRetry(fn, max=3)` com backoff `[0,1000,2000]`. 4xx (exceto 429) e `status 0` (rede) falham na 1ª. **GET com retry; POST/PUT/PATCH SEM retry** (escrita não-idempotente — o `PUT /items` do iFood é idempotente por design, mas mantemos a regra geral; só ele pode entrar em `withRetry` com `// ponytail:` justificando).
5. **`ifoodFetch(path, options, tenantId)`** — único ponto que injeta `Authorization: Bearer <token>` + `Content-Type`/`accept` + `signal: AbortSignal.timeout(15_000)`; monta `baseUrl + prefixo-da-API + path`; rede → `IfoodApiError(...,0,null)`; `!response.ok` → `IfoodApiError(msg, status, body)` carregando o corpo. Helper `qs(params)` omitindo vazios.
6. **Zod tolerante** — `PassObj = z.object({}).passthrough()` + `tolerant(raw)`; refinar depois do 1º retorno real.
7. **Métodos de domínio** (export nomeado por área):
   - leitura: `listarCatalogos(tenantId, merchantId)`, `listarItens(...)`, `getStatusLoja(...)`, `listarVendas(...)`, `listarReviews(...)` — todos `withRetry(...).then(tolerant)`.
   - escrita: `pausarItem(tenantId, merchantId, itemId)` → `PATCH /catalog/v2.0/merchants/{merchantId}/items/{itemId}` `{ status:'UNAVAILABLE' }`; `reabrirItem(...)` `{ status:'AVAILABLE' }`; `pausarLoja(...)` → `POST .../interruptions`; `reabrirLoja(...)` → `DELETE .../interruptions/{id}`; `responderReview(...)` → `POST .../reviews/{id}/answers`. **Validação defensiva antes de tocar a API** (ex.: `pausarItem` exige `itemId` UUID, senão `throw` status 0).

### 5.2 `bridge-server/routes/ifood.js` — espelho de `routes/vendaerp.js`
Factory `module.exports = function ({ requireJwtOrInternal, ifood }) { ... }` devolvendo `express.Router()`, com o wrapper `handle(fn)` padronizando `{ ok:true, data }` / `{ ok:false, status, error, details: err.body }` (o `details` propaga a regra de negócio do iFood ao cliente — torna o write-live-smoke evidência útil).
- **GET = leitura livre**, montados com `requireJwtOrInternal` (aceita JWT do Console OU `x-internal-token` da task). Ex.: `GET /api/ifood/catalogo`, `/api/ifood/vendas`, `/api/ifood/reviews`.
- **POST/PUT/PATCH = escrita gated**. `POST /api/ifood/acao` faz dispatch por `operacao` para o método de escrita do `lib/`. Para ações por agente, `requireAgentAccess` (gating por `user_agent_access`/`tenant_members.role`). A escrita **só executa no commit da aprovação** (ver §1 e §7) — `POST /api/ifood/aprovar/:draft_id` valida `assertTenantMember` (anti-IDOR cross-tenant), lê o draft, chama `ifood.<metodoEscrita>` (sem retry), marca o draft `sent`/`failed` e grava `audit_log`.

### 5.3 `trigger/ifood/*` — tasks (padrão CLAUDE.md: Zod, `logAgentRun`, lazy getter, retry, `additionalFiles`)
- **`trigger/ifood/sync-cardapio.ts`** (`ifood-sync-cardapio`, LEITURA) — `schedules.task` ou on-demand; chama `GET /api/ifood/catalogo` no Bridge, persiste no Supabase (espelho do cardápio para a plataforma/VERA). Read-only, sem draft.
- **`trigger/ifood/executar.ts`** (`agent-executar-ifood`, ESCRITA) — carrega `client_tasks` por `task_id`+`tenant_id`, idempotência por `loop_state` (`open`→`executing`→`done`/`failed`), `POST /api/ifood/acao` com `x-internal-token`, persiste `execution_result`, `logAgentRun` no fim. Espelho exato de `trigger/agents/executar-tarefa.ts`. **Lazy getter** (`getSupabase`), **sem throw no topo** (checar `INTERNAL_BRIDGE_TOKEN` dentro do `run`), `OutputSchema.parse(...)` no retorno.
- ⚠️ `additionalFiles` no `trigger.config.ts` se importar arquivos fora de `trigger/`.

### 5.4 Migration Supabase — `ifood_instances`
SQL **aditivo, versionado em git ANTES de aplicar** (PADRÃO MIGRATION). Toda tabela nova: `tenant_id uuid NOT NULL REFERENCES tenants(id)` + RLS. Reaproveitar `agent_drafts` (escrita gated) e `audit_log` (não criar tabelas novas para aprovação).

```sql
-- supabase/migrations/YYYYMMDD_NNN_ifood_instances.sql
CREATE TABLE IF NOT EXISTS ifood_instances (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id),
  merchant_id text NOT NULL,                       -- ID da loja no iFood
  access_token  text,
  refresh_token text,
  expires_at    timestamptz,                       -- accessToken vale 6h
  authorization_code_verifier text,                -- guardar no fluxo distributed
  status      text NOT NULL DEFAULT 'pending'
              CHECK (status IN ('pending','connected','revoked','error')),
  last_error  text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE ifood_instances ENABLE ROW LEVEL SECURITY;
CREATE POLICY ifood_instances_tenant_isolation ON ifood_instances
  USING (tenant_id IN (SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid()));
CREATE UNIQUE INDEX IF NOT EXISTS ifood_instances_tenant_merchant
  ON ifood_instances (tenant_id, merchant_id);
```
> ⚠️ **O RLS NÃO é o que isola a leitura de credencial pelo Bridge.** O Bridge lê `ifood_instances` via **service_role** (`supabaseSelect`, igual ao molde vendaerp), que **bypassa RLS por design**. O isolamento anti-cross-tenant da credencial vem do **filtro `{ tenant_id }` em código de aplicação** + `assertTenantMember` na rota de aprovação — defesa **app-level**, não RLS. A policy RLS acima protege só o acesso direto via API/Console (anon/auth key), não o caminho do Bridge. Não marcar "multi-tenant resolvido por RLS" como se o RLS cobrisse a leitura do token.
>
> 🔐 **Tokens cifrados desde a F1, não na F4.** `refresh_token` é credencial de longa duração; deixá-lo `text` puro no Supabase cria janela de exposição já na loja piloto. Opções (decidir antes de aplicar a migration): (a) coluna cifrada com chave do Infisical (`pgcrypto`/cifra na aplicação), ou (b) a linha guarda só um **ponteiro Infisical** e o segredo vive no Infisical (coerente com "Bridge = ponto único de credencial"). O `access_token` (6h) é menos crítico, mas o `refresh_token` **não** deve ficar plaintext em nenhuma fase.
>
> Teste de isolamento RLS obrigatório ao aplicar (CLAUDE.md).

### 5.5 Intent router (BRENO) — NL → `{ operacao, item, merchant }`
Hoje o intent vive embrionário em `breno-responder.ts` (`TarefaSchema`, `sistema_alvo: vendaerp|asaas|nenhum`). Estender para incluir `ifood`. **Não usar `z.record(z.unknown())` para os parâmetros** — eles viram uma escrita real no iFood, então o trust boundary exige schema fechado. Usar **discriminated union por `operacao`** (cada operação valida exatamente os campos que precisa):
```ts
const IfoodIntent = z.discriminatedUnion("operacao", [
  z.object({ operacao: z.literal("ifood.pausar_item"),
             alvo: z.object({ item_nome: z.string().min(1), loja: z.string().min(1) }) }),
  z.object({ operacao: z.literal("ifood.reabrir_item"),
             alvo: z.object({ item_nome: z.string().min(1), loja: z.string().min(1) }) }),
  z.object({ operacao: z.literal("ifood.ajustar_preco_item"),
             alvo: z.object({ item_nome: z.string().min(1), loja: z.string().min(1),
                              preco_novo: z.number().positive() }) }),
  z.object({ operacao: z.literal("ifood.pausar_loja"),  alvo: z.object({ loja: z.string().min(1) }) }),
  z.object({ operacao: z.literal("ifood.reabrir_loja"), alvo: z.object({ loja: z.string().min(1) }) }),
  z.object({ operacao: z.literal("ifood.responder_review"),
             alvo: z.object({ review_id: z.string().min(1), texto: z.string().min(1), loja: z.string().min(1) }) }),
]);
const IfoodIntentSchema = z.object({
  sistema_alvo: z.literal("ifood"),
  intent: IfoodIntent,
  confianca: z.number().min(0).max(1),
  precisa_humano: z.boolean(),
});
```
Ex.: `"pausa o X-Bacon no iFood da loja Y"` → `{ sistema_alvo:"ifood", intent:{ operacao:"ifood.pausar_item", alvo:{ item_nome:"X-Bacon", loja:"Y" } }, confianca:0.9, precisa_humano:true }`. O LLM emite só a **intenção** (nomes humanos); a resolução para IDs acontece na task/Bridge contra o cardápio sincronizado (F1), nunca no LLM.

> ⚠️ **Desambiguação `item_nome → itemId` (UUID) é onde mora o dano real.** Pausar o item ERRADO prejudica o lojista. A resolução não pode ser "primeiro match":
> - Match **exato** (case-insensitive) de nome no cardápio sincronizado do `merchant_id` → 1 resultado: segue.
> - 0 resultados ou **>1** (ambíguo, ex.: "X-Bacon" e "X-Bacon Duplo"), ou `confianca < 0.85`: **NÃO executa** — devolve ao humano a lista de candidatos para escolher (no mesmo draft amarelo), nunca chuta.
> - `loja → merchant_id`: se o tenant tem >1 loja iFood e a mensagem não desambígua, idem — pedir a loja.
> O mapeamento **`ifood.ajustar_preco_item`** precisa de confirmação do endpoint correto contra *Catalog → Fundamentos*: a doc separa `PATCH /items/{itemId}` (item carrega `price`) de `PATCH /products/price` (lote de produtos). Validar qual reflete o preço exibido antes de codar (risco de alterar o campo errado).

---

## 6. Roadmap de fases gated (espelha VendaERP)

| Fase | Escopo | Critério de aceite |
|---|---|---|
| **F1 — Leitura read-only** | Puxar cardápio (`/catalogs`+`/sellableItems`), vendas (`/sales`), avaliações (`/reviews`), status de loja (`/status`) para a plataforma. `lib/ifood.js` (getters), `routes/ifood.js` (GET), `trigger/ifood/sync-cardapio.ts`. Credencial via env do Bridge (1 loja piloto). | `GET /api/ifood/catalogo` retorna itens reais da loja piloto (output bruto); `ifood-sync-cardapio` grava no Supabase; nenhum endpoint de escrita exposto; `tsc`/`node --check` limpos. |
| **F2 — Escrita gated de cardápio** | Criar/editar/pausar item com confirmação. `PATCH /items/{itemId}` (pausar), `PUT /items` (criar/editar), `PATCH /products/status` (lote). Intent router BRENO + `agent_drafts` amarelo + `POST /api/ifood/aprovar/:draft_id` → `agent-executar-ifood`. | Draft nasce `autonomy_level='amarelo', status='pending'`; escrita só dispara após o `ok`; write-live-smoke pausa um item real e o `details` confirma; `audit_log` registrado; rollback (reabrir) testado. |
| **F3 — Pedidos / Order** | Events polling 30s + `acknowledgment`, `confirm`/`dispatch`, `cancellationReasons`. **Exige homologação PDV completa** (reunião iFood). | Homologação Order/Events aprovada pelo iFood; polling 30s + ack 200 para todos os eventos; confirmar DELIVERY+TAKEOUT no SLA; bandeira/troco/cupons exibidos no Console. |
| **F4 — Multi-tenant distributed** | Cada loja autoriza via `userCode`. `getIfoodConfig`/`getAccessToken` resolvem por tenant em `ifood_instances`; refresh automático; revogação. App de PRODUÇÃO. | Onboarding distributed funcional (userCode → token por loja); RLS isola tenants (teste de isolamento); refresh automático antes das 6h; ≥2 lojas operando em paralelo sem cross-tenant. |

Cada fase para em CHECKPOINT (Wandson aprova a virada). F3 e F4 dependem de **homologação iFood** (processo externo com reunião) — risco de cronograma fora do controle da CD.

---

## 7. Caso de uso fim-a-fim — "pausar o X-Bacon no iFood via WhatsApp"

1. **Mensagem** — dono da loja Y manda no WhatsApp: *"pausa o X-Bacon no iFood, acabou o bacon"*. `evolution-webhook` grava em `messages` e dispara `triggerBrenoIfNeeded()`.
2. **Interpretação** — `breno-processar-webhook` (modo `hibrido` do tenant) → `breno-responder` chama o LLM. Intent router emite `{ operacao:"ifood.pausar_item", parametros:{ item_nome:"X-Bacon", loja:"Y" }, confianca:0.9, precisa_humano:true }`.
3. **Resolução** — `createLoopTask()` cria `client_tasks(target_system='ifood', execution_result={operacao,parametros}, loop_state='open')`. A task resolve `item_nome → itemId` (UUID) e `loja → merchant_id` contra o cardápio sincronizado na F1.
4. **Draft amarelo** — modo hibrido → `INSERT agent_drafts (autonomy_level='amarelo', status='pending', content="Pausar X-Bacon no iFood da loja Y", metadata={ operacao, item_id, merchant_id, conversation_id })`. ⚠️ **`autonomy_level` tem que ser exatamente `amarelo`** — qualquer outro valor viola o CHECK e o insert falha em silêncio (memória `agent-drafts-autonomy-level-check`, bug PR #577). Notifica humano (painel + Telegram).
5. **`ok` humano** — Wandson/lojista aprova no Console v2 (ou link Telegram). `POST /api/ifood/aprovar/:draft_id` valida `assertTenantMember`, lê o draft.
6. **Execução** — aprovação dispara `agent-executar-ifood` → `POST /api/ifood/acao` (`x-internal-token`) → `lib/ifood.js` `pausarItem()` → `PATCH https://merchant-api.ifood.com.br/catalog/v2.0/merchants/{merchantId}/items/{itemId}` body `{ "status": "UNAVAILABLE" }` (sem retry). iFood responde 200.
7. **Fechamento** — grava `execution_result={ ok:true, operacao:"ifood.pausar_item" }`, `loop_state='done'`, `logAgentRun(status='success')`, `audit_log`. `agent-responder-conclusao` responde no WhatsApp: *"Pronto, pausei o X-Bacon no iFood da loja Y. Me avisa quando o bacon voltar que eu reabro."*

Reabrir = mesmo fluxo com `operacao:"ifood.reabrir_item"` → `{ "status": "AVAILABLE" }`.

---

## 8. Riscos, rate limits e o que falta coletar

### Riscos
- **Homologação iFood é dependência externa com reunião** (F3/F4). Cronograma fora do controle da CD; pedido rejeitado se a interface final não estiver pronta. Mitigação: F1/F2 não dependem de homologação de Order — entregar valor antes.
- **CNPJ obrigatório** — conta de teste/produção precisa ser Profissional. CPF (Pessoal/Estudante) é rejeitado.
- **Financial fora da categoria PDV** — `sales`/`reconciliation` só aparecem em Groceries/Finanças. Para BI financeiro da VERA, decidir: app categoria Finanças separado, ou viver sem o módulo Financial na F1 (puxar faturamento por outra via). **Decisão pendente do Wandson.**
- **Token 6h + refresh** — sem renovação automática, toda loja para a cada 6h. O refresh inline no Bridge (§5.1) é o ponto crítico da F4; testar expiração real, não só o caminho feliz.
- **Idempotência de escrita** — `PATCH /items` repetido é seguro, mas `POST /interruptions` (pausar loja) duplicado cria interrupções sobrepostas. Por isso POST/escrita **sem retry** + idempotência por `loop_state`.

### Rate limits
- **Conhecido:** `myPreparationTime` = **100 req / 60s**.
- **Desconhecidos (coletar antes da F2/F3):** Events `/events:polling`, Catalog `PUT`/`PATCH`, Order, Review. Implementar `withRetry` honrando 429 desde já (já previsto em `shouldRetry`).

### O que falta coletar da doc iFood
- **Critérios de homologação detalhados:** Merchant, Review, Shipping (só temos as URLs, sem checklist) — coletar antes de F2 (Review/Merchant) e F3.
- **Catalog "Gerenciar disponibilidade" (sub-página):** controle por canal (Entrega/Cardápio Digital/Consumo no Local), pausa programada, `contextModifiers` — só temos o conceito de alto nível.
- **Catalog sub-páginas:** Combos, Pizzas, Multi-menu, Gerenciar complementos, Fundamentos (schema de cada campo/tipo), Erros e troubleshooting completos.
- **Order — máquina de estados e payloads:** sequência `PLACED→CONFIRMED→...→DISPATCHED/CONCLUDED`, payload dos eventos, virtual-bag, fluxo de disputas/Handshake — essencial para a F3.
- **Events — critérios de Webhook** (alternativa ao polling): não capturados.
- **Financial:** schema de `sales`/`reconciliation`/`settlements`, parâmetros de período, formato do arquivo on-demand.
- **Confirmação operacional Super Integradora:** qual fluxo de auth (Centralized vs Distributed) o iFood habilita para PDV multi-loja da CD.

---

### Regras CD endereçadas neste plano (conformidade de DESIGN — não verificada em runtime)

> Estes itens são **decisões de projeto**, não fatos provados. Ficam `[ ]` até a F1 rodar com **output bruto** (QA MANDATO da CD: nada é "feito" sem log real). Marcar `[x]` só quando o smoke/live-smoke confirmar.

- [ ] **Bridge = ponto único** de integração e de credencial (lojista/agente nunca tocam o token iFood). — *garantido por design; provar quando `routes/ifood.js` existir e o token só viver no Bridge.*
- [ ] **Nenhuma escrita em dado real de cliente sem draft + aprovação** — cardápio e `responder_review` = `agent_drafts` **`autonomy_level='amarelo'`** (valor exato — CHECK constraint, ver memória `agent-drafts-autonomy-level-check`); semáforo verde/amarelo/vermelho. *Toda* operação de escrita (incl. review, que é mensagem pública ao cliente do lojista) passa pelo mesmo gate.
- [ ] **Isolamento multi-tenant da credencial é APP-LEVEL** (filtro `{ tenant_id }` + `assertTenantMember`), **não RLS** — o Bridge usa service_role e bypassa RLS (ver §5.4). RLS cobre só o acesso direto via Console.
- [ ] **`refresh_token` cifrado/Infisical desde a F1** (nunca `text` plaintext) — ver §5.4.
- [ ] **Trigger.dev nunca `throw` no topo** — lazy getter (`getSupabase`, `getIfoodConfig`), checagens dentro do `run`.
- [ ] **Zod fechado em todo input/output** — `InputSchema`/`OutputSchema` nas tasks; `IfoodIntentSchema` = **discriminated union por operação** no router (sem `z.record(z.unknown())` no boundary de escrita).
- [ ] **SQL aditivo versionado antes de aplicar** — migration `ifood_instances` em git antes do `apply`; reaproveita `agent_drafts`/`audit_log`; teste de isolamento ao tocar RLS.
