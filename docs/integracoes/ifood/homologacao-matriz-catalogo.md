# Matriz de Cobertura — App 3 Catálogo

> Espelho de `docs/integracoes/ifood/homologacao-matriz-cobertura.md` (Avaliações) e
> `homologacao-matriz-financas.md` (Finanças), mesmo objetivo: mapear CADA critério/endpoint →
> onde está implementado → evidência (teste offline, smoke live, ou LACUNA), sem maquiagem —
> reporta lacuna como lacuna.
>
> **v3 (2026-07-07, smoke live da escrita nova) — atualização desta matriz.** Desde a v2
> (PR #805): **smoke live de M2 (`unsellableItems`) e M6/M7 (`alterar_preco` → draft) rodou
> contra o sandbox real** via Bridge deployado em prod (`report-89-catalogo-smoke.md`,
> 2026-07-07). Resultado: **M2 rota 200 confirmada + ⚠️ achado de shape** (o iFood devolve
> `itens={"categories":[...]}`, não array direto — o front `CardapioIfood.jsx:249` faz
> `Array.isArray(itens)` → `false` → sempre "Nenhum item arquivado", mesmo com itens reais);
> **M6/M7 draft→aprovação confirmado live** (resolução de item contra o sandbox real +
> draft amarelo criado com metadata correto). Endpoint de **escrita PATCH real segue
> não-confirmado-live** (amarelo = gated, só rodou offline). Gates server-side (preço `<=0`
> → 400; item não-resolvível → 422) confirmados ao vivo sem criar draft.
>
> Base: `catalogo-endpoints.md` (research, #800) + #799 (rota, mergeado) + #801 (tela per-loja,
> mergeado) + #806 (preço, mergeado) + `report-88-catalogo.md` (smoke live M1, 2026-07-06) +
> `report-89-catalogo-smoke.md` (smoke live M2/M6, 2026-07-07) + código pré-existente
> de Catalog v2.0 (disponibilidade, fases anteriores do plano).

## Legenda

| Símbolo | Significado |
|---|---|
| ✅ IMPLEMENTADO | Código existe, testado offline (e/ou confirmado live) |
| 🟡 PARCIAL | Parte do fluxo existe, ou existe mas com risco/divergência não resolvida |
| ❌ LACUNA | Não implementado |
| 🔵 CONFIRMADO LIVE | Testado contra o sandbox real (credencial de verdade) |
| ⚠️ | Achado desta matriz que precisa de decisão/ação antes de fechar |

---

## 1. Achado da v1 — descompasso de nome de rota — ✅ RESOLVIDO no #801

A v1 desta matriz (PR #805) sinalizou como bloqueante: o #799 (mergeado) implementou
`GET /ifood-api/catalogo/:lojaId`, mas a branch do #801 (escrita ANTES do #799 mergear) chamava
`/ifood-api/**cardapio**/:lojaId` — nome diferente, ia 404 pra sempre, mascarado como "ainda não
disponível".

**Confirmado corrigido**: o próprio #801, em revisão interna antes do merge, encontrou o mesmo
problema (classificado `[HIGH]` no changelog do PR) e corrigiu o path em
`src/lib/api.js:getCardapioApiLoja` para `/ifood-api/catalogo/:lojaId` — bate exatamente com o
`report-88-catalogo.md` (smoke live 200 na mesma rota). Também endureceu a distinção entre 404
"rota ausente" (`Cannot GET`, sem envelope `{ok:...}`) e 404 "condição de negócio" (`resolveLojaGated`,
sempre com `{ok:false,...}`) via `err.rotaAusente` — só o primeiro cai no estado "em
desenvolvimento"; o segundo aparece como erro real. Sem essa distinção, um bug de rota real
(regressão futura) voltaria a ser mascarado como "feature pendente" — boa blindagem.

---

## 2. Achado da v3 (smoke 2026-07-07) — ⚠️ shape de `unsellableItems` diverge do front

O smoke live de M2 (`report-89-catalogo-smoke.md` STEP 2) revelou que o iFood devolve:

```json
{"itens":{"categories":[]}}
```

— **NÃO** um array direto de itens. A rota do Bridge (`routes/ifood-api.js:289`) repassa o body
cru do iFood sem normalizar (diferente de `getCardapio` que monta `ItemLinha` via
`montarItem`/`pickContextModifier`). O front `CardapioIfood.jsx:249` faz:

```js
const rawArr = Array.isArray(itens) ? itens : [];
```

→ `itens` é um objeto `{categories:[...]}`, não array → `rawArr=[]` → sempre "Nenhum item
arquivado", **mesmo se houver itens reais dentro de `categories`**. O sandbox de teste tem
`categories:[]` vazio, então o smoke não prova o bug em ação — mas o shape diverge do que o
front espera. **Não crasha, mas M2 está funcionalmente quebrado para qualquer merchant com
itens arquivados reais.** Risco real a corrigir antes do ticket (ver §"Pendências" item 1).

A normalização correta seria achatar `itens.categories[].items[]` (shape aninhado do iFood)
no mesmo formato `ItemLinha` que o front já espera — mesma lógica que `categoriasDe()` faz
para o cardápio principal (`CardapioIfood.jsx:47-53`).

---

## Leitura — Catalog v2.0

| # | Endpoint/Critério | Status | Client (`lib/ifood.js`) | Rota | Front (`CardapioIfood.jsx`) | Evidência |
|---|---|---|---|---|---|---|
| M1 | Cardápio agregado (catálogo→categorias→itens, disponibilidade efetiva por canal) | ✅ IMPLEMENTADO + 🔵 CONFIRMADO LIVE | `getCardapio` (`lib/ifood.js:814`, reusa `listarCatalogos`/`listarCategorias`/`listarItensCategoria`) | `GET /ifood/cardapio?tenant_id=` (rota antiga, tenant-wide) **e** `GET /ifood-api/catalogo/:lojaId` (#799, gated por `fonte_dados`) — ambas ativas | Fluxo dual: tenant sem loja em `fonte_dados='api'` → rota antiga (zero regressão); tenant com loja(s) migrada(s) → rota nova por-loja, seletor de loja (`CardapioIfood.jsx:103-152`) | Offline: 2 cenários do #799 em `test/ifood-api-routes.test.js` (200 árvore completa; 404 sem `ifood_merchants`) — 37 cenários totais na suíte. **🔵 Smoke live** (`report-88-catalogo.md`, 2026-07-06 + reproduzido no `report-89-catalogo-smoke.md` STEP 1, 2026-07-07): `GET /ifood-api/catalogo/:lojaId` real (loja `2494ee86...`, merchant `92a0ec17...`) → `200`, `cardapio.catalogos[0].categorias[0].itens[0]` = item real do sandbox (`X-Burger Teste Cd`, `preco:25`, `disponivel:true`) |
| M2 | Itens não-vendáveis (`unsellableItems`, arquivados/fora do catálogo ativo) | 🟡 PARCIAL/RISCO — ⚠️ **rota 200 confirmada live, mas shape diverge do front (§2)** | `listarUnsellableItems(merchantId, catalogId, tenantId)` (`lib/ifood.js:283`) — `GET /catalog/v2.0/merchants/{merchantId}/catalogs/{catalogId}/unsellableItems`. A doc usa `{catalogId}` no path (diferente de `sellableItems` que usa `{groupId}`) — respeitado. | `GET /ifood-api/catalogo/:lojaId/unsellable/:groupId` (`routes/ifood-api.js`, #856) — gated por `resolveLojaGated`; `?catalogId=` opcional sobrescreve o `groupId` do path | `CardapioIfood.jsx` (#857) — botão "Mostrar arquivados" (toggle on-demand, só faz fetch extra no clique); `getUnsellableApiLoja` em `src/lib/api.js`; normaliza shape raw → `ItemLinha` | Offline: 2 cenários em `test/ifood-api-routes.test.js` (200 repassa array; `?catalogId=` vence o path) + 1 em `test/ifood.test.js` (path usa `catalogId`, não `groupId`). **🔵 Smoke live** (`report-89-catalogo-smoke.md` STEP 2, 2026-07-07): rota `200` contra o sandbox real (com e sem `?catalogId=`), path+gating funcionando. **⚠️ Achado de shape**: iFood devolve `itens={"categories":[...]}` (objeto aninhado), não array; o front `Array.isArray(itens)` → `false` → sempre "Nenhum item arquivado" mesmo com itens reais em `categories`. Sandbox atual tem `categories:[]` vazio → bug não aparece em teste, mas é real p/ merchant com arquivados. Suíte 39 cenários rotas + 47 asserções client |
| M3 | Versão do catálogo (`/catalog/version`) | ❌ LACUNA | Nenhuma função | Nenhuma rota | Não se aplica hoje (só relevante se algum merchant estiver preso em Catalog v1) | Baixa prioridade, sem mudança desde a v1 |

## Escrita — Disponibilidade (pausar/reabrir item)

| # | Item | Status | Evidência |
|---|---|---|---|
| M4 | `PATCH /items/{itemId}` `{status}` — pausar/reabrir item | ✅ IMPLEMENTADO end-to-end, **pré-existente** (não é trabalho desta leva) | Client: `pausarItem`/`reabrirItem` (`lib/ifood.js:604,615`). Dispatch: `OPERACOES_ESCRITA['ifood.pausar_item'\|'ifood.reabrir_item']` (`routes/ifood.js:30-31`) → draft `agent_name='BRENO'`, `autonomy_level='amarelo'` → `POST /ifood/aprovar/:draftId` executa de fato. UI: botão "Pausar"/"Reabrir" em `CardapioIfood.jsx:91-98`, cria o draft via `POST /api/ifood/acao` (nunca chama a API do iFood direto). Smoke live da escrita real confirmado em rodada de Avaliações (mesma dispatcher) |
| M5 | Resolução `item_nome` → `itemId` (evita chutar o item errado) | ✅ IMPLEMENTADO + 🔵 **CONFIRMADO LIVE** (2026-07-07, §STEP 3 do report-89), **pré-existente**, reusado por M6 | `buscarItemPorNomeOuExternalCode` (`lib/ifood.js`) + `resolverItem` (`routes/ifood.js`) — 0 ou >1 match devolve candidatos pro humano desambiguar, nunca aplica ação num item ambíguo. O #806 reusa exatamente esta função para resolver o item antes de trocar o preço. **Smoke live**: resolução de `"X-Burger Teste Cd"` contra o sandbox real devolveu `item_id=0bb349b1-...` + `product_id=b80e2f34-...` (ambos reais); `"ITEM_FANTASMA_999"` → `422` com `candidatos:[]` (sem criar draft) |

## Escrita — Preço — ✅ decisão tomada, implementada (#806) e 🔵 draft confirmado live

| # | Item | Status | Evidência |
|---|---|---|---|
| M6 | Editar preço de item, via draft→aprovação | ✅ IMPLEMENTADO (offline) + 🔵 **DRAFT CONFIRMADO LIVE** (2026-07-07) | `alterarPrecoItem(merchantId, itemId, novoPreco, tenantId)` (`lib/ifood.js:633`) — `PATCH /catalog/v2.0/merchants/{id}/items/{itemId}` `{price:{value}}`. Validação server-side: preço deve ser número finito > 0 (rejeita ANTES de tocar a rede). `OPERACOES_ESCRITA['ifood.alterar_preco']` (`routes/ifood.js:36`) + branch de resolução de item + validação de preço em `prepararDraftIfood` (`routes/ifood.js:295-334`) — preço inválido (`<=0`/NaN) → 400, nunca cria draft; item ambíguo/não encontrado → 422 com candidatos. **🔵 Smoke live** (`report-89-catalogo-smoke.md` STEP 3, 2026-07-07): `POST /api/ifood/acao` com `ifood.alterar_preco` `price:26.50` → `200`, draft `66b6c35c-...` criado `amarelo/pending`, `agent_name=BRENO`, metadata com `price:26.5`/`item_id`/`product_id`/`merchant_id`/`tenant_id` — todos os `argKeys` presentes pro `/aprovar` despachar. Draft de teste limpo após validação (DELETE 204) |
| M7 | ⚠️ Decisão do endpoint — **RESOLVIDA**: `PATCH /items/{itemId}` síncrono (não o mecanismo em lote) | ✅ DECISÃO INFORMADA, registrada no código — 🔲 **escrita PATCH real ainda não confirmada live** | O #806 escolheu explicitamente o MESMO endpoint síncrono já usado por `pausarItem`/`reabrirItem` (só troca o campo do merge patch, de `status` pra `price`), em vez do mecanismo em lote assíncrono (`PATCH /items/price` → `202 {batchId}` + `GET /batch/{id}`) que o research #800 encontrou mas nunca confirmou contra o sandbox. Nota explícita no código (`lib/ifood.js:633+`): decisão informada, não especulativa — o PATCH direto já é usado e validado neste client. **A escrita real (após `/aprovar`) NÃO foi confirmada contra o sandbox** — só o draft→aprovação está confirmado live; o `PATCH` em si segue só testado offline. Para confirmar live seria preciso aprovar o draft (semáforo amarelo → precisa `ok` do Wandson) |
| M8 | Testes offline de M6/M7 | ✅ IMPLEMENTADO | `lib/ifood.js`: +2 casos em `test/ifood.test.js` (PATCH correto com `{price:{value}}`; preço `<=0`/NaN rejeitado antes da rede) — suíte em 46 asserções totais. Rotas: +3 casos em `test/ifood-routes-acao-aprovar.test.js` (draft criado com `item_id`/`price` corretos; `price<=0` → 400 sem criar draft; aprovar despacha `alterarPrecoItem` com os 4 argumentos certos) — suíte em 13 cenários totais. **🔵 Gates confirmados live** (`report-89-catalogo-smoke.md` STEP 4): `price:-5` → `400` sem draft; item inexistente → `422` `candidatos:[]` sem draft |
| T5 | Preço na UI (`CardapioIfood.jsx`) | ✅ IMPLEMENTADO (offline) + 🔵 **fluxo confirmado live** (draft criado via rota) | Botão "Alterar preço" ao lado do preço exibido em cada item (`CardapioIfood.jsx:113-140`). Clica → input decimal (`inputMode="decimal"`) + Salvar/Cancelar. Enter salva, Esc cancela. `salvarPreco()` valida client-side (price > 0, finito, aceita vírgula decimal) → `POST /api/ifood/acao` com `operacao='ifood.alterar_preco'` e `parametros={item_nome, price}` — cria draft amarelo, nunca chama a API do iFood direto. Build verde (vite build 6.33s). **Smoke live** (2026-07-07) confirmou que o mesmo payload que a UI gera (`{item_nome, price}`) cria o draft corretamente no sandbox real |

## Multi-contexto (preço/disponibilidade por canal) — sem mudança desde a v1

| # | Item | Status | Evidência |
|---|---|---|---|
| M9 | `contextModifiers` — preço/status independentes por canal (Delivery/Cardápio Digital/Consumo no Local) | 🟡 PARCIAL/RISCO — ⚠️ **achado do #800, ainda NÃO corrigido nem confirmado** | `pickContextModifier`/`montarItem` (`lib/ifood.js:793,798`, linhas inalteradas desde a v1) busca `catalogContext === 'DEFAULT'`, caindo em `mods[0]` como fallback. Busca pública não encontrou nenhum contexto chamado `DEFAULT` — valores documentados são `DELIVERY`/`INDOOR`/`WHITELABEL`. O smoke live do `report-88-catalogo.md` + `report-89-catalogo-smoke.md` tem só **1 catálogo** no sandbox — não exercita múltiplos `contextModifiers`, então **não prova nem desmente** o risco. Continua sem correção e sem confirmação |

## Tela `CardapioIfood.jsx` (Console v2)

| # | Item | Status | Evidência |
|---|---|---|---|
| T1 | Leitura tenant-wide (rota antiga) | ✅ IMPLEMENTADO, em `main` | `CardapioIfood.jsx:142` — fallback quando não há loja selecionada em `fonte_dados='api'` |
| T2 | Escrita — botão Pausar/Reabrir | ✅ IMPLEMENTADO, em `main` | `CardapioIfood.jsx:91-98` → cria draft, nunca executa direto |
| T3 | Migração per-loja (`fonte_dados='api'`, seletor de loja) | ✅ IMPLEMENTADO + 🔵 CONFIRMADO LIVE (#801 mergeado) | Fluxo dual completo (`CardapioIfood.jsx:103-152`); path corrigido pra `/ifood-api/catalogo/:lojaId` (§1); confirmado contra o sandbox real no `report-88-catalogo.md` + `report-89-catalogo-smoke.md` |
| T4 | Reset de `lojaId` ao trocar de tenant (anti-vazamento cross-tenant) | ✅ IMPLEMENTADO, em `main` | `CardapioIfood.jsx:116-133` — reset de `lojasApi`/`lojaId` ANTES do fetch, não só depois |
| T5' | Distinção 404 "rota ausente" × 404 "condição de negócio" | ✅ IMPLEMENTADO (achado de revisão do #801, ver §1) | `CardapioIfood.jsx:147` (`e.rotaAusente`) + contrato em `src/lib/api.js:getCardapioApiLoja` |
| T6 | Race guard (troca rápida de loja não deixa resposta atrasada sobrescrever estado) | ✅ IMPLEMENTADO (achado de revisão do #801) | `reqIdRef` em `CardapioIfood.jsx:110,137,143,146,150` |
| T7 | Preço na UI | ✅ IMPLEMENTADO (offline) + 🔵 fluxo confirmado live — ver T5 acima | Botão "Alterar preço" + input decimal no `CardapioIfood.jsx`; cria draft via `POST /api/ifood/acao` (`ifood.alterar_preco`). Payload da UI confirmado criando draft no sandbox real (2026-07-07) |
| T8 | Visual (console.css) | ✅ — usa `cv2-card`/`cv2-btn`/`cv2-bdg`/`cv2-sub`, mesmo padrão das demais telas | `CardapioIfood.jsx` inteiro |
| T9 | Itens arquivados na UI (botão "Mostrar arquivados") | 🟡 PARCIAL — ⚠️ **rota 200 mas shape não normalizado (§2)** | `CardapioIfood.jsx:341-378` — toggle on-demand, `carregarArquivados()` busca `getUnsellableApiLoja` e normaliza raw → `ItemLinha`. **⚠️ A normalização assume `itens` é array** (`Array.isArray(itens)` em `:249`), mas o iFood devolve `{categories:[...]}`. Resultado: sempre "Nenhum item arquivado" mesmo com itens reais. Bug de shape, não de crash — correção = achatar `itens.categories[].items[]` (mesma lógica de `categoriasDe()` em `:47`) |

---

## Resumo executivo (v3 — fechamento pós-smoke 2026-07-07)

- **Leitura (M1/T1/T3)**: ✅ completa, testada offline E confirmada live contra o sandbox real
  (`report-88-catalogo.md` reproduzido no `report-89-catalogo-smoke.md` STEP 1). O bug de rota da
  v1 desta matriz foi pego e corrigido em revisão antes do #801 mergear — o processo funcionou
  como deveria.
- **Escrita de disponibilidade (M4/M5/T2)**: ✅ completa e correta, ponta a ponta, desde antes
  desta leva. M5 (resolução de item) agora 🔵 confirmada live contra o sandbox real (2026-07-07).
- **Escrita de preço (M6/M7/M8/T5/T7)**: ✅ decisão tomada, implementada, testada offline (13+46
  asserções) + UI no Console. **🔵 Draft→aprovação confirmado live** (2026-07-07): resolução de
  item contra o sandbox real + draft amarelo criado com metadata correto + gates server-side
  (preço `<=0` → 400, item não-resolvível → 422) confirmados ao vivo sem criar draft. Escolheu o
  endpoint síncrono já validado (`PATCH /items/{itemId}`) em vez do mecanismo em lote não
  confirmado — decisão correta e conservadora. **Falta**: smoke live da **escrita PATCH real**
  (após `/aprovar`) — só rodou offline; precisa aprovar um draft (amarelo = `ok` do Wandson).
- **Itens não-vendáveis (M2/T9)**: 🟡 **rota 200 confirmada live, mas ⚠️ shape diverge do front**
  (§2) — o iFood devolve `itens={"categories":[...]}`, o front espera array. Resultado: botão
  "Mostrar arquivados" sempre mostra "Nenhum item arquivado" mesmo com itens reais. Não crasha,
  mas é **funcionalmente quebrado** p/ merchant com arquivados. Sandbox atual tem `categories:[]`
  vazio → bug mascarado em teste. Correção = normalizar `categories[].items[]` → `ItemLinha`
  (mesma lógica de `categoriasDe()`). **Bloqueante para o ticket** até corrigir.
- **Multi-contexto (M9)**: 🟡 risco silencioso segue em produção, sem mudança desde a v1 — o
  sandbox de teste só tem 1 catálogo/contexto, então o smoke live disponível não prova nem
  desmente o problema. Continua sendo o maior risco não resolvido da categoria Catálogo.
- **Versão de catálogo (M3)**: ❌ lacuna de baixa prioridade, sem mudança.

### Pendências recomendadas antes de qualquer ticket de homologação Catálogo

1. **Corrigir M2/T9 (shape de `unsellableItems`)** — ⚠️ **bloqueante**, achado desta v3. A rota
   devolve `{categories:[...]}`, o front espera array. Normalizar em `CardapioIfood.jsx:249`
   (achatar `itens.categories[].items[]` → `ItemLinha`, mesma lógica de `categoriasDe()` em
   `:47-53`) ou na rota do Bridge (`routes/ifood-api.js:289`, antes de devolver pro front).
   Re-smoke contra um merchant com itens arquivados reais depois de corrigir (o sandbox atual
   tem `categories:[]` vazio, não exercita).
2. **Smoke live de M9** (`contextModifiers`) — precisa de um item de teste com >1 contexto
   configurado no sandbox (o catálogo de teste atual só tem 1); sem isso, o risco de
   `pickContextModifier` usando `'DEFAULT'` errado permanece não verificável.
3. **Smoke live de M6/M7 (escrita PATCH real)** — confirmar que `PATCH /items/{itemId}` com
   `{price}` realmente reflete no app, já que só o draft→aprovação foi confirmado live até
   agora. Precisa aprovar um draft (amarelo = `ok` do Wandson).
4. **QA visual da tela `CardapioIfood.jsx`** — 🔲 não feito nesta rodada (smoke live foi só
   curl contra a rota do Bridge; a UI não foi exercitada no navegador). Mesmo pipeline dos
   Apps 1 e 2 (`QA-VISUAL-HOMOLOG-2026-07-06.md`). Confirmar botão "Alterar preço" + input
   decimal + botão "Mostrar arquivados" + seletor de loja no tenant de teste.
5. Itens não-vendáveis (M2) — após corrigir o shape (item 1), re-confirmar live.