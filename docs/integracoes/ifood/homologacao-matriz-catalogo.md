# Matriz de Cobertura — App 3 Catálogo

> Espelho de `docs/integracoes/ifood/homologacao-matriz-cobertura.md` (Avaliações) e
> `homologacao-matriz-financas.md` (Finanças), mesmo objetivo: mapear CADA critério/endpoint →
> onde está implementado → evidência (teste offline, smoke live, ou LACUNA), sem maquiagem —
> reporta lacuna como lacuna.
>
> **v2 (2026-07-06, fechamento) — atualização desta matriz.** Desde a v1 (PR #805):
> **#801** (tela `CardapioIfood` per-loja) **MERGEADO** — o descompasso de rota do §1 da v1
> (`cardapio` vs `catalogo`) foi **encontrado em revisão e corrigido dentro da própria branch**
> antes do merge (ver §1 abaixo, agora "RESOLVIDO"). **#806** (alterar preço via draft→aprovação)
> **MERGEADO** — resolve a decisão de M7 (escolheu `PATCH /items/{itemId}` síncrono, não o
> mecanismo em lote). **Smoke live da rota `/ifood-api/catalogo/:lojaId`** confirmado
> (`report-88-catalogo.md`, 2026-07-06): `200`, catálogo real do sandbox (1 catálogo → 1
> categoria "Teste-Cd" → 1 item "X-Burger Teste Cd").
>
> Base: `catalogo-endpoints.md` (research, #800) + #799 (rota, mergeado) + #801 (tela per-loja,
> mergeado) + #806 (preço, mergeado) + `report-88-catalogo.md` (smoke live) + código pré-existente
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

## Leitura — Catalog v2.0

| # | Endpoint/Critério | Status | Client (`lib/ifood.js`) | Rota | Front (`CardapioIfood.jsx`) | Evidência |
|---|---|---|---|---|---|---|
| M1 | Cardápio agregado (catálogo→categorias→itens, disponibilidade efetiva por canal) | ✅ IMPLEMENTADO + 🔵 CONFIRMADO LIVE | `getCardapio` (`lib/ifood.js:814`, reusa `listarCatalogos`/`listarCategorias`/`listarItensCategoria`) | `GET /ifood/cardapio?tenant_id=` (rota antiga, tenant-wide) **e** `GET /ifood-api/catalogo/:lojaId` (#799, gated por `fonte_dados`) — ambas ativas | Fluxo dual: tenant sem loja em `fonte_dados='api'` → rota antiga (zero regressão); tenant com loja(s) migrada(s) → rota nova por-loja, seletor de loja (`CardapioIfood.jsx:103-152`) | Offline: 2 cenários do #799 em `test/ifood-api-routes.test.js` (200 árvore completa; 404 sem `ifood_merchants`) — 37 cenários totais na suíte. **🔵 Smoke live** (`report-88-catalogo.md`, 2026-07-06): `GET /ifood-api/catalogo/:lojaId` real (loja `2494ee86...`, merchant `92a0ec17...`) → `200`, `cardapio.catalogos[0].categorias[0].itens[0]` = item real do sandbox (`X-Burger Teste Cd`, `preco:25`, `disponivel:true`) |
| M2 | Itens não-vendáveis (`unsellableItems`, arquivados/fora do catálogo ativo) | ❌ LACUNA | Nenhuma função | Nenhuma rota | Nenhum consumo — `CardapioIfood.jsx` só lista itens vendáveis via `getCardapio` | Documentado como gap em `catalogo-endpoints.md §2` — path usa `{catalogId}` (diferente de `sellableItems`, que usa `{groupId}`). Sem mudança desde a v1 |
| M3 | Versão do catálogo (`/catalog/version`) | ❌ LACUNA | Nenhuma função | Nenhuma rota | Não se aplica hoje (só relevante se algum merchant estiver preso em Catalog v1) | Baixa prioridade, sem mudança desde a v1 |

## Escrita — Disponibilidade (pausar/reabrir item)

| # | Item | Status | Evidência |
|---|---|---|---|
| M4 | `PATCH /items/{itemId}` `{status}` — pausar/reabrir item | ✅ IMPLEMENTADO end-to-end, **pré-existente** (não é trabalho desta leva) | Client: `pausarItem`/`reabrirItem` (`lib/ifood.js:604,615`). Dispatch: `OPERACOES_ESCRITA['ifood.pausar_item'\|'ifood.reabrir_item']` (`routes/ifood.js:30-31`) → draft `agent_name='BRENO'`, `autonomy_level='amarelo'` → `POST /ifood/aprovar/:draftId` executa de fato. UI: botão "Pausar"/"Reabrir" em `CardapioIfood.jsx:91-98`, cria o draft via `POST /api/ifood/acao` (nunca chama a API do iFood direto) |
| M5 | Resolução `item_nome` → `itemId` (evita chutar o item errado) | ✅ IMPLEMENTADO, **pré-existente**, reusado por M6 | `buscarItemPorNomeOuExternalCode` (`lib/ifood.js`) + `resolverItem` (`routes/ifood.js`) — 0 ou >1 match devolve candidatos pro humano desambiguar, nunca aplica ação num item ambíguo. O #806 reusa exatamente esta função para resolver o item antes de trocar o preço |

## Escrita — Preço — ✅ decisão tomada e implementada (#806)

| # | Item | Status | Evidência |
|---|---|---|---|
| M6 | Editar preço de item, via draft→aprovação | ✅ IMPLEMENTADO (offline) | `alterarPrecoItem(merchantId, itemId, novoPreco, tenantId)` (`lib/ifood.js:633`) — `PATCH /catalog/v2.0/merchants/{id}/items/{itemId}` `{price:{value}}`. Validação server-side: preço deve ser número finito > 0 (rejeita ANTES de tocar a rede). `OPERACOES_ESCRITA['ifood.alterar_preco']` (`routes/ifood.js:36`) + branch de resolução de item + validação de preço em `prepararDraftIfood` (`routes/ifood.js:295-334`) — preço inválido (`<=0`/NaN) → 400, nunca cria draft; item ambíguo/não encontrado → 422 com candidatos |
| M7 | ⚠️ Decisão do endpoint — **RESOLVIDA**: `PATCH /items/{itemId}` síncrono (não o mecanismo em lote) | ✅ DECISÃO INFORMADA, registrada no código | O #806 escolheu explicitamente o MESMO endpoint síncrono já usado por `pausarItem`/`reabrirItem` (só troca o campo do merge patch, de `status` pra `price`), em vez do mecanismo em lote assíncrono (`PATCH /items/price` → `202 {batchId}` + `GET /batch/{id}`) que o research #800 encontrou mas nunca confirmou contra o sandbox. Nota explícita no código (`lib/ifood.js:633+`): decisão informada, não especulativa — o PATCH direto já é usado e validado neste client. **Ainda não confirmado contra o sandbox real** (sem smoke live de alteração de preço até o momento desta matriz) — só testado offline |
| M8 | Testes offline de M6/M7 | ✅ IMPLEMENTADO | `lib/ifood.js`: +2 casos em `test/ifood.test.js` (PATCH correto com `{price:{value}}`; preço `<=0`/NaN rejeitado antes da rede) — suíte em 46 asserções totais. Rotas: +3 casos em `test/ifood-routes-acao-aprovar.test.js` (draft criado com `item_id`/`price` corretos; `price<=0` → 400 sem criar draft; aprovar despacha `alterarPrecoItem` com os 4 argumentos certos) — suíte em 13 cenários totais |
| T5 | Preço na UI (`CardapioIfood.jsx`) | ✅ IMPLEMENTADO (offline) | Botão "Alterar preço" ao lado do preço exibido em cada item (`CardapioIfood.jsx:113-140`). Clica → input decimal (`inputMode="decimal"`) + Salvar/Cancelar. Enter salva, Esc cancela. `salvarPreco()` valida client-side (price > 0, finito, aceita vírgula decimal) → `POST /api/ifood/acao` com `operacao='ifood.alterar_preco'` e `parametros={item_nome, price}` — cria draft amarelo, nunca chama a API do iFood direto. Fecha a lacuna T5/T7 (backend + dispatch já prontos desde #806, faltava só o controle na tela). Build verde (vite build 6.33s). **Ainda sem smoke live** (confirmar contra o sandbox real antes do ticket) |

## Multi-contexto (preço/disponibilidade por canal) — sem mudança desde a v1

| # | Item | Status | Evidência |
|---|---|---|---|
| M9 | `contextModifiers` — preço/status independentes por canal (Delivery/Cardápio Digital/Consumo no Local) | 🟡 PARCIAL/RISCO — ⚠️ **achado do #800, ainda NÃO corrigido nem confirmado** | `pickContextModifier`/`montarItem` (`lib/ifood.js:793,798`, linhas inalteradas desde a v1) busca `catalogContext === 'DEFAULT'`, caindo em `mods[0]` como fallback. Busca pública não encontrou nenhum contexto chamado `DEFAULT` — valores documentados são `DELIVERY`/`INDOOR`/`WHITELABEL`. O smoke live do `report-88-catalogo.md` tem só **1 catálogo** no sandbox — não exercita múltiplos `contextModifiers`, então **não prova nem desmente** o risco. Continua sem correção e sem confirmação |

## Tela `CardapioIfood.jsx` (Console v2)

| # | Item | Status | Evidência |
|---|---|---|---|
| T1 | Leitura tenant-wide (rota antiga) | ✅ IMPLEMENTADO, em `main` | `CardapioIfood.jsx:142` — fallback quando não há loja selecionada em `fonte_dados='api'` |
| T2 | Escrita — botão Pausar/Reabrir | ✅ IMPLEMENTADO, em `main` | `CardapioIfood.jsx:91-98` → cria draft, nunca executa direto |
| T3 | Migração per-loja (`fonte_dados='api'`, seletor de loja) | ✅ IMPLEMENTADO + 🔵 CONFIRMADO LIVE (#801 mergeado) | Fluxo dual completo (`CardapioIfood.jsx:103-152`); path corrigido pra `/ifood-api/catalogo/:lojaId` (§1); confirmado contra o sandbox real no `report-88-catalogo.md` |
| T4 | Reset de `lojaId` ao trocar de tenant (anti-vazamento cross-tenant) | ✅ IMPLEMENTADO, em `main` | `CardapioIfood.jsx:116-133` — reset de `lojasApi`/`lojaId` ANTES do fetch, não só depois |
| T5' | Distinção 404 "rota ausente" × 404 "condição de negócio" | ✅ IMPLEMENTADO (achado de revisão do #801, ver §1) | `CardapioIfood.jsx:147` (`e.rotaAusente`) + contrato em `src/lib/api.js:getCardapioApiLoja` |
| T6 | Race guard (troca rápida de loja não deixa resposta atrasada sobrescrever estado) | ✅ IMPLEMENTADO (achado de revisão do #801) | `reqIdRef` em `CardapioIfood.jsx:110,137,143,146,150` |
| T7 | Preço na UI | ✅ IMPLEMENTADO (offline) — ver T5 acima | Botão "Alterar preço" + input decimal no `CardapioIfood.jsx`; cria draft via `POST /api/ifood/acao` (`ifood.alterar_preco`). Sem smoke live ainda |
| T8 | Visual (console.css) | ✅ — usa `cv2-card`/`cv2-btn`/`cv2-bdg`/`cv2-sub`, mesmo padrão das demais telas | `CardapioIfood.jsx` inteiro |

---

## Resumo executivo (v2 — fechamento)

- **Leitura (M1/T1/T3)**: ✅ completa, testada offline E confirmada live contra o sandbox real
  (`report-88-catalogo.md`). O bug de rota da v1 desta matriz foi pego e corrigido em revisão
  antes do #801 mergear — o processo funcionou como deveria.
- **Escrita de disponibilidade (M4/M5/T2)**: ✅ completa e correta, ponta a ponta, desde antes
  desta leva — sem gaps, sem mudança.
- **Escrita de preço (M6/M7/M8/T5/T7)**: ✅ decisão tomada e implementada, testada offline (13+46
  asserções) + UI no Console. Escolheu o endpoint síncrono já validado
  (`PATCH /items/{itemId}`) em vez do mecanismo em lote não confirmado — decisão correta e
  conservadora. **Falta**: smoke live da alteração de preço em si (nunca rodou contra o
  sandbox real) — o backend, o dispatch e a UI estão prontos, só falta confirmar contra o
  sandbox antes do ticket.
- **Multi-contexto (M9)**: 🟡 risco silencioso segue em produção, sem mudança desde a v1 — o
  sandbox de teste só tem 1 catálogo/contexto, então o smoke live disponível não prova nem
  desmente o problema. Continua sendo o maior risco não resolvido da categoria Catálogo.
- **Itens não-vendáveis/versão de catálogo (M2/M3)**: ❌ lacunas conhecidas, baixa prioridade,
  sem mudança.

### Pendências recomendadas antes de qualquer ticket de homologação Catálogo

1. **Smoke live de M9** (`contextModifiers`) — precisa de um item de teste com >1 contexto
   configurado no sandbox (o catálogo de teste atual só tem 1); sem isso, o risco de
   `pickContextModifier` usando `'DEFAULT'` errado permanece não verificável.
2. **Smoke live de M6/M7** (alterar preço) — confirmar que `PATCH /items/{itemId}` com `{price}`
   realmente reflete no app, já que só foi testado offline até agora.
3. **UI de preço (T5/T7)** — ✅ implementada (botão "Alterar preço" + input decimal no
   `CardapioIfood.jsx`, cria draft amarelo via `POST /api/ifood/acao`). Falta só o smoke live
   de M6/M7 (confirmar que o PATCH reflete no app).
4. Itens não-vendáveis (M2) — implementar só se a homologação ou o produto exigir mostrar itens
   arquivados; não é bloqueante hoje.
