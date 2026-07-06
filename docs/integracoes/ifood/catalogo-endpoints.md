# Módulo Catalog — pesquisa para o App 3 "Catálogo"

> **Método de coleta**: `developer.ifood.com.br` bloqueia fetch anônimo direto (403, provável
> proteção Cloudflare/bot) — mesma limitação já registrada em `financas-endpoints.md`. Este
> documento foi montado via busca web (resultados/trechos indexados das páginas oficiais, não a
> página renderizada completa) **+** um trecho já capturado logado por sessão anterior
> (`_fontes-portal-ifood/criterios-homologacao-modulos.md`, `catalog-introduction.md`,
> `00-api-reference.md`). É um **RASCUNHO**: confiável para orientar client/rotas/tela, mas nomes
> exatos de campo/parâmetro devem ser **confirmados contra a chamada real no sandbox** antes de
> fechar a homologação (mesma ressalva já usada em Avaliações/Finanças).

Fontes: `developer.ifood.com.br/*/docs/guides/modules/catalog/*` (introduction, workflow,
using-api, definitions, homologation, multisetup) e `developer.ifood.com.br/*/docs/guides/catalog/v1|v2/`
— todos via busca, não fetch direto — **+** `docs/integracoes/ifood/_fontes-portal-ifood/{00-api-reference,catalog-introduction,criterios-homologacao-modulos}.md`
(capturados logados por sessão anterior, ver cabeçalho de cada arquivo).

---

## 0. O que já existe implementado neste repo (ponto de partida)

Catalog v2.0 já é o módulo com **mais cobertura de escrita** da integração — implementado antes
deste sprint (fase 1/2 do `PLANO-INTEGRACAO-IFOOD.md`), mas **nunca documentado num doc dedicado
como este**. Achado importante: a rota gated nova (`routes/ifood-api.js`, padrão
`resolveLojaGated` usado por Finanças/Events) **ainda não tem nenhum endpoint de Catalog** — só o
`routes/ifood.js` antigo (padrão `resolveContext`/`?tenant_id=`) expõe `/ifood/catalogo` e
`/ifood/cardapio`. Se o App 3 seguir o mesmo padrão do App 2, migrar/duplicar essas rotas para
`ifood-api.js` é provável trabalho do worker de client bridge desta leva.

| Função (`bridge-server/lib/ifood.js`) | Endpoint | Status |
|---|---|---|
| `listarCatalogos` (`:260`) | `GET /catalog/v2.0/merchants/{merchantId}/catalogs` | ✅ implementado, sem retry-live confirmado |
| `listarSellableItems` (`:267`) | `GET /catalog/v2.0/merchants/{merchantId}/catalogs/{groupId}/sellableItems` | ✅ implementado — usa param `groupId` (a doc pública usa nomes diferentes por endpoint, ver §1) |
| `listarCategorias` (`:530`) | `GET /catalog/v2.0/merchants/{merchantId}/catalogs/{catalogId}/categories` | ✅ implementado |
| `criarCategoria` (`:543`) | `POST /catalog/v2.0/merchants/{merchantId}/catalogs/{catalogId}/categories` | ✅ implementado (`template: DEFAULT\|PIZZA`) |
| `listarItensCategoria` (`:572`) | `GET /catalog/v2.0/merchants/{merchantId}/categories/{categoryId}/items` | ✅ implementado |
| `criarOuAtualizarItem` (`:559`) | `PUT /catalog/v2.0/merchants/{merchantId}/items` | ✅ implementado — idempotente, substitui o item inteiro |
| `pausarItem`/`reabrirItem` (`:585`,`:596`) | `PATCH /catalog/v2.0/merchants/{merchantId}/items/{itemId}` `{status}` | ✅ implementado — gated por draft→aprovação (`routes/ifood.js` `OPERACOES_ESCRITA`) |
| `deletarCategoria` (`:607`) | `DELETE /catalog/v2.0/merchants/{merchantId}/catalogs/{catalogId}/categories/{categoryId}` | ✅ implementado (cleanup) |
| `getCardapio` (`:795`) | agregado (catálogos→categorias→itens, 1 request por nó) | ✅ implementado — ver ⚠️ §3 sobre `contextModifiers` |

UI existente: `src/console/CardapioIfood.jsx` (ConsoleV2) já consome `getCardapio` via
`GET /ifood/cardapio`.

## 1. Autenticação e paths (reaproveitar — não mexer)

Mesmo client `client_credentials` de sempre (`getIfoodConfig`/`getAccessToken`/`ifoodFetch` em
`bridge-server/lib/ifood.js`). Prefixo do módulo: `/catalog/v2.0` (v1.0 é legado, não usar em
integração nova — `00-api-reference.md:87`).

⚠️ **Achado já registrado internamente, continua válido**: a doc usa nomes de parâmetro
DIFERENTES para itens vendáveis vs não-vendáveis — `sellableItems` usa `{groupId}`,
`unsellableItems` usa `{catalogId}` no path. Nosso `listarSellableItems` já usa `groupId`
(correto), mas **`unsellableItems` (itens fora de venda/arquivados) não está implementado** —
seria a próxima leitura óbvia a adicionar se o App 3 precisar mostrar itens pausados/arquivados
separado dos ativos.

## 2. Endpoints de LEITURA (Catalog v2.0)

| Endpoint | Uso | Status neste repo |
|---|---|---|
| `GET /merchants/{merchantId}/catalogs` | Lista catálogos → `catalogId`/`groupId` | ✅ `listarCatalogos` |
| `GET /merchants/{merchantId}/catalogs/{groupId}/sellableItems` | Itens vendáveis (ativos p/ venda) | ✅ `listarSellableItems` |
| `GET /merchants/{merchantId}/catalogs/{catalogId}/unsellableItems` | Itens **não-vendáveis** (arquivados/fora do catálogo ativo) | ❌ não implementado |
| `GET /merchants/{merchantId}/catalog/version` | Versão do catálogo (v1 legado vs v2) | ❌ não implementado — só relevante se algum merchant ainda estiver em v1 |
| `GET /merchants/{merchantId}/catalogs/{catalogId}/categories` | Lista categorias | ✅ `listarCategorias` |
| `GET /merchants/{merchantId}/categories/{categoryId}/items` | Lista itens de uma categoria (+ `products[]`) | ✅ `listarItensCategoria` |
| `GET /merchants/{merchantId}/batch/{batchId}` | Consulta status de uma operação em lote assíncrona (ver §3) | ❌ não implementado — necessário se o App 3 usar os endpoints de preço/status em lote |

## 3. Endpoints de ESCRITA (Catalog v2.0) — SEMPRE draft→aprovação

Regra do projeto (`CLAUDE.md` DRAFTS + padrão já usado em `pausarItem`/`reabrirItem`): **nenhuma
escrita sai direto para o iFood** — o Console cria um `agent_drafts` (`autonomy_level='amarelo'`),
humano aprova, só então `POST /ifood/aprovar/:draftId` (dispatcher por `metadata.operacao`) chama
o método real. Qualquer endpoint novo abaixo deve seguir o mesmo fluxo, nunca ser chamado direto
de uma tela/task.

| Endpoint | Uso | Status neste repo |
|---|---|---|
| `POST /merchants/{merchantId}/catalogs/{catalogId}/categories` | Criar categoria | ✅ `criarCategoria` |
| `PATCH /merchants/{merchantId}/catalogs/{catalogId}/categories/{categoryId}` | Editar categoria (nome/status/template) | ❌ não implementado — só criar/deletar hoje |
| `PUT /merchants/{merchantId}/items` | Criar/atualizar item completo (idempotente — reenviar `item`+`products`+`optionGroups`+`options` sempre) | ✅ `criarOuAtualizarItem` |
| `PATCH /merchants/{merchantId}/items/{itemId}` | Patch de UM item (JSON Merge Patch — usado hoje só para `{status}`) | ✅ `pausarItem`/`reabrirItem` — só o campo `status`, nunca preço |
| `DELETE /merchants/{merchantId}/catalogs/{catalogId}/categories/{categoryId}` | Deletar categoria | ✅ `deletarCategoria` |

### ⚠️ Achado — dois mecanismos de preço/status, possível conflito com nota antiga do repo

`00-api-reference.md:96` (pesquisa anterior) registra: *"PATCH `/merchants/{merchantId}/items/{itemId}`
— **Pausar/preço/status** de item (endpoint atual; `/items/price`,`/items/status` **deprecados**)"*.

A busca pública **atual** (2026-07) contradiz isso — mostra `PATCH /items/price` e
`PATCH /items/status` como os endpoints de homologação oficiais, com um detalhe importante que a
nota antiga não tinha: **são operações em LOTE, assíncronas**:

```
PATCH /merchants/{merchantId}/items/price   → 202 { "batchId": "...", "url": "/v2.0/merchants/{id}/batch/{batchId}" }
PATCH /merchants/{merchantId}/items/status  → mesmo padrão (batchId)
GET   /merchants/{merchantId}/batch/{batchId} → { "batchStatus": "COMPLETED", "results": [{ "resourceId", "result": "SUCCESS" }] }
```

**Não dá para confirmar por busca qual das duas notas está certa** (a antiga pode ter capturado
uma versão anterior da doc, ou os dois mecanismos podem coexistir: `PATCH /items/{itemId}` para
alterar 1 item por vez de forma síncrona, `PATCH /items/price`/`/items/status` para alterar
**vários itens numa chamada só**, de forma assíncrona). **Recomendação para quem implementar**:
não assumir nenhuma das duas — testar as 3 rotas contra o sandbox real antes de escolher qual
usar para "ajustar preço" (item ainda **não implementado** neste repo — só status via
`/items/{itemId}` existe hoje). Se o App 3 precisar editar preço em lote (útil pra sincronizar
cardápio inteiro de uma vez), o par `/items/price` + `GET /batch/{batchId}` é o caminho — mas
exige polling do batch até `COMPLETED`, padrão ainda não existente no client (`withRetry` atual
não serve pra isso, é polling de *resultado*, não de *rate limit*).

- `PATCH /merchants/{merchantId}/products/price` (lote de PRODUTOS, não itens — mencionado em
  `PLANO-INTEGRACAO-IFOOD.md:98`) é uma **terceira** rota candidata, não confirmada por esta
  pesquisa — mais um motivo para validar contra o sandbox antes de fechar qual endpoint reflete
  o preço realmente exibido no app (risco: alterar o campo errado).

### ⚠️ Achado — `contextModifiers`: valor usado no código pode estar errado

`getCardapio`/`pickContextModifier` (`lib/ifood.js:774`) hoje busca o modifier com
`catalogContext === 'DEFAULT'`, caindo no primeiro (`mods[0]`) como fallback. **A busca pública
não encontrou nenhuma menção a um contexto chamado `DEFAULT`** — os valores documentados são
`DELIVERY`, `INDOOR` (consumo no local) e um exemplo de doc usando `WHITELABEL`; a introdução do
módulo fala em 2 contextos padrão ("Entrega" e "Cardápio Digital"). Isto é um **risco concreto**:
se `'DEFAULT'` nunca bate com um `catalogContext` real, `getCardapio` está sempre caindo no
fallback `mods[0]` (o primeiro modifier da lista, ordem não garantida pela API) em vez do
contexto correto — o preço/disponibilidade exibido no `CardapioIfood.jsx` pode estar errado
sempre que uma loja tiver mais de 1 contexto configurado com valores diferentes.
**Recomendação**: antes de expandir a tela de Catálogo, confirmar contra o sandbox real quais
valores de `catalogContext` o merchant de teste realmente devolve (`GET .../items` de um item com
`contextModifiers` preenchido) e corrigir `pickContextModifier` para usar o valor certo (ex.
`'DELIVERY'`) em vez de `'DEFAULT'`.

## 4. Estrutura do payload de item (`PUT /items`)

```
item → metadados (id UUID v4, price.value, status, categoryId)
├── products[]      → produto(s) do item (id, name, description, externalCode)
├── optionGroups[]  → grupos de complemento (ex.: "Bebidas", "Tamanhos")
└── options[]       → opções dentro dos grupos (referenciam productId + price)
```

Regras confirmadas na doc (`catalog-introduction.md`):
- Os 4 campos (`item`, `products`, `optionGroups`, `options`) são **sempre enviados**, mesmo
  vazios — `PUT` substitui o item inteiro (não faz merge).
- IDs de item/produto/opção são **gerados pelo integrador**, formato **UUID v4 obrigatório** —
  ID fora do padrão UUID v4 → **404** (não 400).
- `externalCode` é **único por merchant** — duplicado → **409 Conflict**.
- **Scale prices**: além do preço normal, dá pra configurar preço por faixa de quantidade
  comprada (quantidade mínima + valor) — não usado neste repo hoje, útil se o App 3 precisar
  disso (ex.: combos/atacado).

## 5. Rate limits e paginação

Mesma situação já documentada para Financial (`financas-endpoints.md §7-8`): não encontrei um
número específico de req/s publicado para Catalog (diferente de Merchant, que documenta
1000 req/s, e Events/polling, 30s). **Assumir o `withRetry`/backoff exponencial genérico já
implementado** até confirmar um valor real contra 429 no sandbox. Endpoints de listagem
(`catalogs`, `categories`, `items`) não mostraram parâmetros de paginação na documentação
pesquisada — parecem devolver a lista completa (cardápios normalmente não são grandes o
suficiente para precisar paginar, ao contrário de vendas/reviews).

## 6. RASCUNHO — critérios de homologação da categoria Catálogo

> Espelha o formato de `homologacao-checklist-avaliacoes.md`/`financas-endpoints.md §9`.
> **Confiança mista**: o trecho abaixo combina uma captura logada truncada
> (`_fontes-portal-ifood/criterios-homologacao-modulos.md`, ~1900 chars/página) com busca web —
> usar como ponto de partida, não como checklist final.

### Pré-requisitos gerais (iguais aos demais módulos)
- [ ] Conta Profissional (CNPJ) — CPF não é aceito
- [ ] Aplicativo pronto para PRODUÇÃO — homologação **não testa chamadas isoladas**, testa a
  aplicação completa: demonstrar a **interface final** (painel admin/app/PDV) criando,
  atualizando e **exibindo** dados reais do catálogo (ex.: `CardapioIfood.jsx` precisa mostrar o
  item recém-criado, não só o Postman/curl retornando 200)
- [ ] Ticket de homologação aberto (Portal do Desenvolvedor → Suporte → Tickets → Homologação)
- [ ] Formulário prévio preenchido antes da reunião

### 4 pilares do critério de Catalog (TODOS que usam a API devem homologar)
1. **Criação de itens** — demonstrar `PUT /items` criando um item completo (produto + complementos
   se aplicável) e ele aparecendo no app.
2. **Preços** — demonstrar alteração de preço refletindo no app. Endpoint exato **não fechado**
   (ver ⚠️ §3) — decidir e confirmar antes da sessão de homologação.
3. **Disponibilidade** — demonstrar pausar/despausar item (`status AVAILABLE`↔`UNAVAILABLE`) e o
   item sumindo/reaparecendo no app. **Já implementado e gated** (`pausarItem`/`reabrirItem`).
4. **Multi-contexto** — demonstrar preço/disponibilidade **independentes por canal** (Entrega vs
   Cardápio Digital vs Consumo no Local). Depende de resolver o achado de `contextModifiers` (§3)
   antes de conseguir demonstrar isso corretamente.

### Cenários de teste prováveis (inferido, não confirmado 1:1)
- Criar item novo → aparece no cardápio via `GET /categories/{categoryId}/items`
- Pausar item → some da listagem de vendáveis / aparece como `UNAVAILABLE`
- Reabrir item → volta a aparecer
- Alterar preço → novo valor refletido (endpoint a confirmar)
- Item com `contextModifiers` → preço/status corretos por canal
- `externalCode` duplicado → 409 tratado com mensagem clara (não só repassar o erro cru)
- ID fora de UUID v4 → 404 tratado (nosso `assertPathId` já valida formato ANTES de chamar a API,
  mas hoje só aceita alfanumérico+hífen — não valida UUID v4 estritamente; vale revisar se a
  homologação cobrar isso)
- Tratamento de erros 400/401/403/404/409/429 — mesmo padrão já exigido em Merchant/Review/Financial

### O que o sandbox hoje suporta (confirmado neste repo)
- ✅ Leitura completa (catálogos → categorias → itens, agregado em `getCardapio`) — implementada,
  **sem confirmação live registrada** (diferente de Sales/Merchant-status, que já têm smoke live
  documentado em `homologacao-matriz-cobertura.md`).
- ✅ Escrita: criar categoria, criar/atualizar item (`PUT`), pausar/reabrir item, deletar
  categoria — todas gated por draft→aprovação, **sem confirmação live registrada**.
- ❌ Editar preço, editar categoria, itens não-vendáveis (`unsellableItems`), operações em lote
  (`/items/price`, `/items/status`, `GET /batch/{batchId}`) — nada implementado ainda.

## 7. Para quem for implementar (client bridge / rota / tela do App 3)

Seguindo o padrão do App 2 (Finanças): migrar as leituras existentes (`/ifood/catalogo`,
`/ifood/cardapio`) para o padrão gated novo (`routes/ifood-api.js`, `resolveLojaGated`) em vez de
manter só no `routes/ifood.js` antigo, e decidir/confirmar contra o sandbox real qual dos 2-3
candidatos de endpoint de preço usar **antes** de implementar escrita de preço nova — é o único
gap onde "decisão informada > código especulativo" realmente importa aqui (diferente do módulo
Events do App 2, aqui a funcionalidade É necessária para o produto, só falta confirmar o contrato
exato).
