# UI-Spec — Tela `financeiro-ifood` (Console v2)

> Contrato de layout pro worker 86 (implementação). Segue `docs/prototipo/METODO-CONSOLE-V2.md`: visual claro, `console.css` (classes `cv2-*`), mesmo padrão das telas já entregues (`Avaliacoes.jsx`/`AvaliacoesReviewApi.jsx`, `ConsoleV2.jsx`). Dados reais via `listarVendas` (já live no sandbox) + settlements/repasses quando o worker 83 entregar a rota — renderizar com estado vazio decente enquanto ela não existir (mesmo padrão do card "Notas iFood" antes do #763: nunca card de erro pra "ainda não implementado").

## Módulo / navegação

- `moduleCatalog.js`: `{ id: 'financeiro-ifood', ic: 'i-dollar', label: 'Financeiro iFood' }` — grupo "Avaliações" já virou grupo iFood de fato (`cardapio-ifood`, `resp-avaliacoes` estão lá); adicionar `financeiro-ifood` no mesmo grupo, não criar grupo novo.
- Allowlist (`tenant_modules`): incluir `financeiro-ifood` na migration de `cd-homolog` e `cd-demo` (padrão das migrations `20260706_002`/`006` já aplicadas) — sem isso a tela não aparece nem no T-HOMOLOG.
- Gate: só renderiza quando `loja.fonte_dados === 'api'` (mesmo padrão de `AvaliacoesReviewApi.jsx`/`TabMerchantIfood` — sem isso, tela some pra lojas ainda no scraping antigo).

## Layout (topo → base)

### 1. Cabeçalho da página
Padrão das demais telas cv2: `<h1>Financeiro <span className="cv2-mock">iFood</span></h1>` + `<div className="cv2-rule" />` + `<div className="cv2-sub">` com 1 linha de contexto (ex.: "Vendas e repasses da API oficial do iFood — sandbox de homologação.").

### 2. Seletor de loja
Igual `Avaliacoes.jsx`: `<select>` de lojas em `fonte_dados='api'` (reusar `listLojasConsultoria` ou equivalente já existente — não recriar).

### 3. Filtro de período
Card único (`cv2-card`) acima dos KPIs:
- 2 inputs `type="date"` (`dataInicio`/`dataFim` — mesmo nome de query que `listarVendas` já usa: `bridge-server/lib/ifood.js`, default de 7 dias quando vazio).
- Botão "Aplicar" (`cv2-btn`) — não precisa ser reativo a cada tecla, só ao clicar (evita rajada de chamada à API a cada dígito de data).
- Atalhos rápidos (chips `cv2-btn sec`, opcional se o worker 86 tiver tempo): "Hoje", "7 dias", "30 dias" — preenchem os inputs e já disparam a busca.

### 4. KPIs (cards de resumo)
`<div className="cv2-kpis">` com 3-4 `cv2-kpi`, na ordem:

| Card | Fonte | Estado vazio (sandbox sem vendas) |
|---|---|---|
| **Vendas brutas** | soma de `grossValue` (ou campo equivalente) das vendas do período retornado por `listarVendas` | `—` com `.d.mut` "sem vendas no período" |
| **Vendas líquidas** | soma do valor líquido (bruto − taxas/comissão do iFood) | idem |
| **Repasses (settlements)** | 🔲 depende da rota do worker 83 — enquanto não existir, card mostra `—` / "Em breve" (nunca erro) | — |
| **Transações** | contagem de itens no período | `0` |

Mesmo padrão visual de `.cv2-kpi .l` (label uppercase), `.v` (valor grande), `.d`/`.d.neg`/`.d.mut` (variação — provavelmente `.d.mut` sempre aqui, já que não há período anterior pra comparar sem uma 2ª chamada; não inventar comparação sem dado real).

### 5. Tabela de transações
`<div className="cv2-tbl-wrap"><table>` — colunas sugeridas (ajustar aos campos reais que `listarVendas`/settlements devolverem; **não assumir nome de campo sem confirmar no doc do worker 82 ou no JSON real** — usar `tolerant()`/passthrough como o resto do client já faz):

| Coluna | Conteúdo |
|---|---|
| Data | data da venda/liquidação |
| Pedido | id do pedido (curto, com tooltip do id completo se for longo) |
| Bruto | valor bruto |
| Taxas/comissão | dedução do iFood (se o campo existir) |
| Líquido | valor líquido |
| Status | badge (`cv2-bdg`) — ex. `ok`=liquidado, `warn`=pendente, se a API expuser status |

Estado vazio da tabela (0 itens no período): `cv2-card` centralizado, mesmo texto/estilo já usado em `Avaliacoes.jsx`/`AvaliacoesReviewApi.jsx` ("Nenhuma venda encontrada no período.") — nunca tabela em branco sem explicação.

### 6. Erros (400/401/403/404/429)
Mesmo padrão de `mensagemErro()` de `AvaliacoesReviewApi.jsx` — banner `cv2-card` com texto claro (`⚠ {erro}`), nunca JSON cru. 429 mostra `retryAfterSeconds` se o Bridge devolver ("tente novamente em Xs").

## Fora de escopo desta spec (decisão do worker 86 ou de sprint futuro)

- Exportar CSV/relatório — não pedido no brief do sprint.
- Gráfico de série temporal — os KPIs cobrem o resumo; gráfico é incremento futuro, não bloqueia a entrega desta tela.
- Paginação da tabela de transações — só adicionar se `listarVendas`/settlements devolverem envelope de paginação (mesmo padrão `page`/`size`/`total`/`pageCount` já usado em Reviews); se não devolverem, listar tudo do período (períodos maiores → o usuário reduz o filtro).

## Notas para o worker 86

- Reusar a MESMA função de fetch/erro do Bridge já estabelecida em `src/lib/api.js` (padrão `ifoodBridgeFetch` de `criarDraftRespostaReview`/`listIfoodReviews`) — não recriar um wrapper de fetch novo.
- `listarVendas` já é uma rota GET de leitura (sem draft→aprovação — é leitura, não escrita). Se o worker 83 entregar escrita em Finanças (não previsto no brief, mas por precaução), qualquer escrita segue o padrão draft→aprovação já usado em Merchant/Review — nunca chamada direta.
