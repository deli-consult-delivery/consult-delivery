# Matriz de Cobertura — App 3 Catálogo

> Espelho de `docs/integracoes/ifood/homologacao-matriz-cobertura.md` (Avaliações) e
> `homologacao-matriz-financas.md` (Finanças), mesmo objetivo: mapear CADA critério/endpoint →
> onde está implementado → evidência (teste offline, smoke live, ou LACUNA), sem maquiagem —
> reporta lacuna como lacuna.
>
> **Estado dos PRs no momento desta matriz (2026-07-06, `main` em `b5b7118`+)**: #799 (rota
> `GET /ifood-api/catalogo/:lojaId`) **MERGEADO**. #800 (research, este worker) **MERGEADO**.
> #801 (tela `CardapioIfood` conecta `fonte_dados='api'` por loja) **ABERTO, em fix** — lido
> direto via `git show origin/wandson/cardapio-api` para esta matriz, mas **não está em `main`**
> ainda. Escrita de preço está **em desenvolvimento pelo worker 86** — sem branch/PR neste
> momento, marcada como tal abaixo.
>
> Base: `docs/integracoes/ifood/catalogo-endpoints.md` (research, PR #800) + PR #799 + branch
> `wandson/cardapio-api` (PR #801, lida via `git show`, não mergeada) + código pré-existente de
> Catalog v2.0 (fases anteriores do `PLANO-INTEGRACAO-IFOOD.md`, nunca documentado num doc
> dedicado até o #800).

## Legenda

| Símbolo | Significado |
|---|---|
| ✅ IMPLEMENTADO | Código existe, testado offline (e/ou confirmado live) |
| 🟡 PARCIAL | Parte do fluxo existe, ou existe mas com risco/divergência não resolvida |
| 🟠 EM DESENVOLVIMENTO | Trabalho em andamento por outro worker nesta mesma leva, ainda sem branch/PR visível a este worker |
| ❌ LACUNA | Não implementado |
| 🔵 SMOKE LIVE | Só confirmável com credencial real — não testável offline |
| ⚠️ | Achado desta matriz que precisa de decisão/ação antes de fechar |

---

## 1. Achado desta matriz — descompasso de nome de rota entre backend (#799) e frontend (#801)

O #799 (mergeado) implementou `GET /ifood-api/catalogo/:lojaId`. O #801 (aberto, branch
`wandson/cardapio-api`) foi escrito **antes** do #799 mergear e assumiu um contrato próprio —
`src/lib/api.js` (`getCardapioApiLoja`, branch do #801) chama:

```js
const res = await fetch(`${BRIDGE}/api/ifood-api/cardapio/${lojaId}`, { ... });
```

`cardapio` ≠ `catalogo` — **rota diferente da que existe em `main`**. Efeito prático: quando o
#801 mergear como está, essa chamada vai devolver **404** (rota inexistente) em vez de bater no
endpoint real do #799. Mitigado por design (comentário explícito no código do #801:
*"pode ainda não existir (404): erro carrega `.status` pro chamador decidir entre 'erro real' e
'ainda não disponível'"*) — o usuário não vê um crash, vê o estado "Cardápio via API oficial
ainda não disponível para esta loja — em desenvolvimento" (T3 abaixo). **Isso mascara o bug**:
parece "feature ainda não pronta" quando na verdade já está pronta do lado do backend, só com o
nome errado do lado do front. Ver M1/T3 na tabela — bloqueante pra fechar o App 3, mas conserto
trivial (renomear 1 string em `api.js`, ou renomear a rota no backend — decisão de qual lado
muda é do time, não deste worker de matriz).

---

## Leitura — Catalog v2.0

| # | Endpoint/Critério | Status | Client (`lib/ifood.js`) | Rota (`routes/*.js`) | Front (`CardapioIfood.jsx`) | Evidência |
|---|---|---|---|---|---|---|
| M1 | Cardápio agregado (catálogo→categorias→itens, disponibilidade efetiva por canal) | 🟡 PARCIAL — ⚠️ ver §1 (rota nova quebrada pelo nome) | `getCardapio` (`lib/ifood.js:814`, reusa `listarCatalogos`/`listarCategorias`/`listarItensCategoria`) — **pré-existente**, já tinha smoke live registrado (05/07, sandbox com 1 catálogo real, citado no commit do #799) | Rota antiga `GET /ifood/cardapio?tenant_id=` (`routes/ifood.js:160`, tenant-scoped) ✅ funcionando em `main` hoje · Rota nova `GET /ifood-api/catalogo/:lojaId` (`routes/ifood-api.js`, #799, gated por `fonte_dados`) ✅ mergeada, testada offline | `main` hoje: só usa a rota antiga tenant-wide, funcional (`CardapioIfood.jsx:103`). Branch #801 (não mergeada): tenta migrar pro padrão per-loja, mas chama `/ifood-api/**cardapio**/:lojaId` — path errado, ver §1 | Offline: +2 cenários do #799 em `test/ifood-api-routes.test.js` (200 com árvore completa; 404 sem `ifood_merchants`) — 37 cenários totais na suíte. Rota antiga sem teste dedicado (pré-existente). Smoke live: só a rota antiga foi confirmada (05/07); a rota nova (#799) e a integração do #801 nunca rodaram contra o sandbox real |
| M2 | Itens não-vendáveis (`unsellableItems`, arquivados/fora do catálogo ativo) | ❌ LACUNA | Nenhuma função | Nenhuma rota | Nenhum consumo — `CardapioIfood.jsx` só lista itens vendáveis via `getCardapio` | Documentado como gap em `catalogo-endpoints.md §2` — path usa `{catalogId}` (diferente de `sellableItems`, que usa `{groupId}`) |
| M3 | Versão do catálogo (`/catalog/version`) | ❌ LACUNA | Nenhuma função | Nenhuma rota | Não se aplica hoje (só relevante se algum merchant estiver preso em Catalog v1) | Documentado em `catalogo-endpoints.md §2` — baixa prioridade |

## Escrita — Disponibilidade (pausar/reabrir item)

| # | Item | Status | Evidência |
|---|---|---|---|
| M4 | `PATCH /items/{itemId}` `{status}` — pausar/reabrir item | ✅ IMPLEMENTADO end-to-end, **pré-existente** (não é trabalho desta leva) | Client: `pausarItem`/`reabrirItem` (`lib/ifood.js:604,615`). Dispatch: `OPERACOES_ESCRITA['ifood.pausar_item'\|'ifood.reabrir_item']` (`routes/ifood.js:30-31`) → draft `agent_name='BRENO'`, `autonomy_level='amarelo'` → `POST /ifood/aprovar/:draftId` executa de fato. UI: botão "Pausar"/"Reabrir" em `CardapioIfood.jsx:82-89`, cria o draft via `POST /api/ifood/acao` (nunca chama a API do iFood direto) |
| M5 | Resolução `item_nome` → `itemId` (evita chutar o item errado) | ✅ IMPLEMENTADO, **pré-existente** | `buscarItemPorNomeOuExternalCode` (`lib/ifood.js`) + `resolverItem` (`routes/ifood.js:204+`) — 0 ou >1 match devolve candidatos pro humano desambiguar, nunca aplica ação num item ambíguo |

## Escrita — Preço

| # | Item | Status | Evidência |
|---|---|---|---|
| M6 | Editar preço de item | 🟠 EM DESENVOLVIMENTO (worker 86, sem branch/PR visível a este worker no momento desta matriz) | `criarOuAtualizarItem` (`PUT /items`, `lib/ifood.js:578`) existe mas exige o payload **completo** do item (não é "só preço") — não serve como atalho de edição rápida. Decisão registrada no commit do #799: "não implementado nesta leva — decisão informada, não código especulativo" |
| M7 | ⚠️ Endpoint exato para "só preço" — 3 candidatos não resolvidos | ❌ LACUNA DE DECISÃO, bloqueia M6 | `catalogo-endpoints.md §3`: (a) `PATCH /items/{itemId}` (síncrono, 1 item) — nota antiga do repo (`00-api-reference.md:96`) diz que é o atual e que os outros dois estão deprecados; (b) `PATCH /items/price` (lote, assíncrono, `batchId`+`GET /batch/{batchId}`) — busca pública atual (2026-07) diz o oposto, que é este o endpoint de homologação; (c) `PATCH /products/price` (lote de produtos, citado em `PLANO-INTEGRACAO-IFOOD.md:98`). **Nenhum confirmado contra o sandbox.** Recomendação ao worker 86: testar os 3 contra o merchant de teste antes de escolher — risco real de "alterar o campo errado" (preço não refletir no app) se escolher o candidato errado |

## Multi-contexto (preço/disponibilidade por canal)

| # | Item | Status | Evidência |
|---|---|---|---|
| M8 | `contextModifiers` — preço/status independentes por canal (Delivery/Cardápio Digital/Consumo no Local) | 🟡 PARCIAL/RISCO — ⚠️ **achado do #800, ainda não corrigido** | `pickContextModifier`/`montarItem` (`lib/ifood.js:793,798`) busca `catalogContext === 'DEFAULT'`, caindo em `mods[0]` como fallback. Busca pública não encontrou nenhum contexto chamado `DEFAULT` — valores documentados são `DELIVERY`/`INDOOR`/`WHITELABEL`. **Se `'DEFAULT'` nunca bate, o cardápio sempre usa o primeiro modifier da lista (ordem não garantida) em vez do contexto correto** — preço/disponibilidade exibidos podem estar errados para lojas com múltiplos contextos configurados. Não corrigido ainda; sem smoke live pra confirmar se o sandbox de teste tem >1 contexto (se só tiver 1, o bug fica invisível hoje) |

## Tela `CardapioIfood.jsx` (Console v2)

| # | Item | Status | Evidência |
|---|---|---|---|
| T1 | Leitura tenant-wide (rota antiga) | ✅ IMPLEMENTADO, em `main` hoje | `CardapioIfood.jsx:103` consome `GET /ifood/cardapio?tenant_id=` — categorias + itens, badge Disponível/Pausado, preço formatado BRL |
| T2 | Escrita — botão Pausar/Reabrir | ✅ IMPLEMENTADO, em `main` hoje | `CardapioIfood.jsx:82-89` → cria draft, nunca executa direto; mensagem "Solicitação enviada para aprovação" |
| T3 | Migração per-loja (`fonte_dados='api'`, seletor de loja) | 🟡 PARCIAL, PR #801 aberto, **⚠️ com o bug do §1** | Branch `wandson/cardapio-api`: fluxo dual (tenant sem loja em `fonte_dados='api'` → comportamento idêntico ao de hoje, zero regressão; tenant com loja(s) em `fonte_dados='api'` → seletor de loja + `GET /ifood-api/**cardapio**/:lojaId`, que hoje 404 contra o real `/ifood-api/**catalogo**/:lojaId` do #799). Estado vazio decente no 404 ("em desenvolvimento") — não crasha, mas está sempre caindo nesse estado por engano assim que uma loja migrar pra `fonte_dados='api'` |
| T4 | Reset de `lojaId` ao trocar de tenant | ✅ IMPLEMENTADO no #801 (achado de revisão já corrigido dentro da própria branch) | Commit `6bdd355` na branch #801 — reset imediato de `lojaId`/`lojasApi` antes do fetch, evita vazamento cross-tenant (loja de um tenant sendo consultada com o merchant de outro) |
| T5 | Preço na UI | ❌ Fora da v1 da tela — depende de M6/M7 (worker 86) | Nenhum campo/botão de edição de preço em `CardapioIfood.jsx` |
| T6 | Visual (console.css) | ✅ — usa `cv2-card`/`cv2-btn`/`cv2-bdg`/`cv2-sub`, mesmo padrão das demais telas | `CardapioIfood.jsx` inteiro |

---

## Resumo executivo

- **Leitura (M1/T1)**: funciona hoje em produção via rota antiga tenant-wide — não é trabalho
  novo, é herança de fases anteriores do plano de integração. A rota nova gated (#799) está
  pronta e testada offline, mas **a integração do front com ela (#801) está quebrada por um
  descompasso de nome de rota** (§1) — bloqueante pra fechar a migração per-loja, não pra usar o
  app hoje (a rota antiga continua funcionando em paralelo).
- **Escrita de disponibilidade (M4/T2)**: completa e correta, ponta a ponta, desde antes desta
  leva — sem gaps.
- **Escrita de preço (M6/M7)**: bloqueada por decisão técnica não tomada — 3 endpoints candidatos,
  nenhum confirmado contra o sandbox, e uma nota antiga do repo que contradiz a busca pública
  atual sobre qual é o "certo". Em desenvolvimento pelo worker 86; recomendo à orquestradora
  garantir que ele veja `catalogo-endpoints.md §3` antes de escolher o endpoint.
- **Multi-contexto (M8)**: risco silencioso já em produção (não é regressão desta leva) — o
  cardápio pode estar mostrando preço/disponibilidade do contexto errado para lojas com mais de
  1 canal configurado, e ninguém percebeu ainda porque talvez o sandbox de teste só tenha 1
  contexto. Merece 1 smoke live dedicado antes de considerar o App 3 pronto para ticket.
- **Nada de Catalog foi confirmado contra a API real nesta leva especificamente** — o único smoke
  live existente (05/07, "1 catálogo real") é de uma sessão anterior, pré-App 3, e cobre só a
  rota antiga de leitura.

### Pendências recomendadas antes de qualquer ticket de homologação Catálogo

1. **Corrigir o descompasso de rota do §1** — `cardapio` vs `catalogo` — antes de mergear o #801.
2. **Fechar a decisão de M7** (endpoint de preço) contra o sandbox real, incluindo o worker 86.
3. **Smoke live de M8** (`contextModifiers`) — confirmar quais valores de `catalogContext` o
   merchant de teste realmente devolve, corrigir `pickContextModifier` se `'DEFAULT'` não bater.
4. Implementar `unsellableItems` (M2) se a homologação ou o produto exigir mostrar itens
   arquivados — hoje não é uma exigência confirmada, só um gap conhecido.
5. 1 rodada de smoke live cobrindo a rota nova (#799) e o fluxo per-loja (#801, após corrigido) —
   nenhum dos dois rodou contra o iFood real ainda.
