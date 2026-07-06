# Matriz de Cobertura — App 2 Finanças (Financial + Events)

> Espelho de `docs/integracoes/ifood/homologacao-matriz-cobertura.md` (Avaliações), mesmo
> objetivo: mapear CADA critério/endpoint → onde está implementado → evidência (teste offline,
> smoke live, ou LACUNA), sem maquiagem — reporta lacuna como lacuna.
>
> **Estado dos PRs no momento desta matriz**: #790 (client Financial) **MERGEADO**. #791 (Events)
> e #793 (tela `financeiro-ifood`) **ainda ABERTOS** — o código existe nas branches
> `wandson/ifood-financas-events` e `wandson/financeiro-ifood`, lido diretamente via `git show`
> para esta matriz, mas **não está em `main`** ainda. A migration `20260706_018` (allowlist do
> module novo) está no #793 — a afirmação "aplicada" no commit do PR **não foi verificada por
> este worker** (sem acesso ao banco); tratar como não confirmado até a orquestradora confirmar.
>
> Base: `docs/integracoes/ifood/financas-endpoints.md` (research, PR #789) + PRs #790/#791/#793 +
> `docs/integracoes/ifood/_fontes-portal-ifood/00-api-reference.md` (referência interna já
> existente no repo, não citada no research original — achado desta matriz, ver §1).

## Legenda

| Símbolo | Significado |
|---|---|
| ✅ IMPLEMENTADO | Código existe, testado offline |
| 🟡 PARCIAL | Parte do fluxo existe, ou existe mas com risco/divergência não resolvida |
| ❌ LACUNA | Não implementado |
| 🔵 SMOKE LIVE | Só confirmável com credencial real — não testável offline |
| ⚠️ | Achado desta matriz que precisa de decisão/ação antes de fechar |

---

## 1. Achado desta matriz — referência interna já existia e diverge do que foi implementado

Havia (antes desta sprint) um doc **`docs/integracoes/ifood/_fontes-portal-ifood/00-api-reference.md`**
com a lista real dos endpoints Financial, não consultado pelo research original (#789) nem pelo
worker 83 (#790) — ambos pesquisaram via busca pública em paralelo. A referência interna lista:

```
## Financial — /financial/v3.0 (v2.0, v2.1 legados)
- GET /merchants/{merchantId}/reconciliation
- GET /merchants/{merchantId}/settlements
- GET /merchants/{merchantId}/anticipations
- GET /merchants/{merchantId}/sales
- GET /merchants/{merchantId}/financial-events
- POST /merchants/{merchantId}/reconciliation/on-demand
- GET /merchants/{merchantId}/reconciliation/on-demand/{requestId}
```

**Divergência real**: o worker 83 implementou `listarOcorrencias` apontando pra
`/financial/v3.0/merchants/{id}/occurrences` (path inferido por analogia, marcado como "não
confirmado" no próprio código) — mas **`/occurrences` não existe** nesta lista de 7 endpoints.
O endpoint real de "ajustes financeiros" é `/reconciliation` (+ variante `/on-demand`), e existe
um **endpoint separado não implementado**: `/financial-events` (ledger de créditos/débitos —
o que o research #789 chamou de "Financial Events", distinto do polling de Order Events do
worker 89, ver M-E1 abaixo). Ver M4 na tabela.

---

## Módulo Financial

| # | Endpoint/Critério | Status | Client (`lib/ifood.js`) | Rota (`routes/ifood-api.js`) | Front (`FinanceiroIfood.jsx`) | Evidência |
|---|---|---|---|---|---|---|
| M1 | `GET /sales` — vendas do período (`beginSalesDate`/`endSalesDate`) | ✅ IMPLEMENTADO + 🔵 CONFIRMADO LIVE (pré-existente) | `listarVendas` — `lib/ifood.js:360` | `GET /ifood/vendas` (rota antiga, `routes/ifood.js:193`, tenant-scoped) | Consome via `getIfoodVendas` (`src/lib/api.js:727`) — tabela de vendas, KPI "Vendas brutas" (soma `saleGrossValue.{bag,deliveryFee,serviceFee}`) | Confirmado live 2026-07-05 (400 sem período, default 7 dias aplicado); testes prévios em `test/ifood.test.js` |
| M2 | `GET /settlements` — repasses/liquidação | ✅ IMPLEMENTADO (offline) — 🟡 shape do front não verificado | `listarRepasses` — `lib/ifood.js:383` (query `beginSettlementDate`/`endSettlementDate` **inferida por analogia, não confirmada**) | `GET /ifood-api/repasses/:lojaId` — `routes/ifood-api.js:267` (400 `DATA_INVALIDA`) | `getIfoodRepasses` (`api.js:735`) espera `r.settlements` como array de **linhas de repasse**; mas a doc (§1 e `financas-endpoints.md` §3) diz que `settlements[]` é um array de **períodos**, cada um com `closingItems[]` (as linhas reais) — **KPI "Repasses" provavelmente contaria períodos, não transações de repasse, quando a rota devolver dado real** | Offline: `test/ifood.test.js` (2 casos: default 7 dias, período explícito) + `test/ifood-api-routes.test.js` (sucesso + `DATA_INVALIDA`). ⚠️ **Shape front×resposta real não testado — só confirmável no 1º smoke live** |
| M3 | `GET /anticipations` — antecipação D+1/D+7 | ✅ IMPLEMENTADO (offline) | `listarAntecipacoes` — `lib/ifood.js:405` (filtros `calculationDate`/`anticipatedPaymentDate` mutuamente exclusivos, **confirmados** pela doc pública) | `GET /ifood-api/antecipacoes/:lojaId` — `routes/ifood-api.js:287` (400 `DATA_INVALIDA` e `FILTRO_ANTECIPACAO_CONFLITANTE`, 2 camadas de validação) | ❌ Nenhuma tela consome ainda — fora do escopo da v1 da tela (`FinanceiroIfood.jsx` só usa Sales+Settlement) | Offline: 2 casos em `test/ifood.test.js` (sem filtro, conflito→erro em 2 camadas) + 2 em `test/ifood-api-routes.test.js` |
| M4 | `GET /financial-events` — ledger de créditos/débitos | ❌ **LACUNA CONFIRMADA** | Nenhuma função implementada | Nenhuma rota | Nenhum consumo | Zero — `grep -rn "financial-events\|financialEvents\|ledger"` em `lib/ifood.js`/`routes/ifood-api.js` não retorna nada. Endpoint listado na referência interna (§1) e no research #789 §5, mas **ninguém implementou** — o que foi implementado no lugar (`listarOcorrencias`→`/occurrences`) é um path diferente, não confirmado, que talvez nem exista |
| M5 | `GET /reconciliation` (+ `/reconciliation/on-demand`) — ajustes em CSV | 🟡 PARCIAL/DIVERGENTE | `listarOcorrencias` — `lib/ifood.js:427` — mas aponta pra `/occurrences`, **não** `/reconciliation` (path da referência interna) | `GET /ifood-api/ocorrencias/:lojaId` — `routes/ifood-api.js:319` | ❌ Nenhuma tela consome | Offline: 1 caso confirma path/período — mas o path testado é o **inferido** (`/occurrences`), não o da referência interna. Ver §1 — precisa decisão: renomear pra `/reconciliation` antes do 1º smoke, ou confirmar que `/occurrences` também existe (endpoint extra não documentado) |
| M6 | Tratamento de erros 400/401/403/404/429 | ✅ IMPLEMENTADO (genérico, reaproveita M6 da matriz de Avaliações) | `IfoodApiError`+`withRetry` (mesmo pipeline) | `handle()` genérico + validação de data 400 `DATA_INVALIDA` em cada rota nova | `mensagemErro()` em `FinanceiroIfood.jsx` trata 401/403/429 (não trata 404/409 explicitamente — vendas/repasses vazios já caem no "sem dados", não em erro) | Offline: casos de `DATA_INVALIDA` nas 3 rotas novas (M2/M3/M5) |
| M7 | Header `x-request-homologation: true` (achado do research #789 §9) | ❌ LACUNA | Não implementado em nenhuma chamada | — | — | Nenhum dos 2 PRs de client (research nem #790) implementou esse header — necessário só na janela real de homologação, mas hoje não há nem a opção de ligá-lo. Recomendo ao worker 83 (ou quem pegar o follow-up): parâmetro/env opcional em `ifoodFetch`, não hardcoded |

## Módulo Events (Order Events — polling/acknowledgment)

**Decisão registrada (worker 89, `docs/integracoes/ifood/events-modulo-analise.md`, PR #791
aberto): Events NÃO se aplica ao app de Finanças/BI** — é o barramento de eventos de PEDIDOS
(Order/PDV: `PLACED`, `CONFIRMED`, `DISPATCHED`...), não dado financeiro. Concorda com a
recomendação do research #789 §10 (chegaram à mesma conclusão de forma independente).
Implementado só como **esqueleto mínimo read-safe**, sem consumidor:

| # | Item | Status | Nota |
|---|---|---|---|
| E1 | `listarEventos`/`confirmarEventos` (`lib/ifood.js`, PR #791) | ✅ IMPLEMENTADO (esqueleto, offline) | Nunca chama confirm/dispatch de Order — só poll+ack. Path `/events/v1.0/events:polling` e `/events/v1.0/events/acknowledgment` **confirmado** contra a referência interna `00-api-reference.md:21-23` (bate exatamente) |
| E2 | `GET /ifood-api/events/:lojaId` + `POST .../ack` (PR #791) | ✅ IMPLEMENTADO (esqueleto, offline) | Gated pelo padrão `resolveLojaGated`; nenhuma tela/task chama |
| E3 | Aplicabilidade ao App Finanças | ❌ **FORA DE ESCOPO (decisão informada, não lacuna)** | Ver `events-modulo-analise.md` — gate de homologação PDV é um processo à parte (reunião + `/generate-test-order`), vetado pelo brief ("nenhum ticket/ação no portal hoje") |

## Tela `financeiro-ifood` (Console v2, PR #793 aberto)

| # | Item | Status | Evidência |
|---|---|---|---|
| T1 | Module key + allowlist | 🟡 PARCIAL | `moduleCatalog.js` + `ConsoleV2.jsx` wireados (case `financeiro-ifood` → `FinanceiroIfood`); migration `20260706_018` (allowlist aditiva pra `cd-homolog`/`cd-demo`) existe no PR — **não confirmável se já foi aplicada em prod** (commit do PR afirma que sim, este worker não tem acesso ao banco pra verificar; tratar como pendente até a orquestradora confirmar) |
| T2 | Vendas (Sales) | ✅ IMPLEMENTADO | Tabela + KPIs "Vendas brutas"/"Transações", consumindo a rota M1 (já live) |
| T3 | Repasses (Settlement) | 🟡 PARCIAL — risco de shape (ver M2) | KPI "Repasses" + estado "Em breve" se a rota falhar (nunca card de erro, mesmo padrão do card "Notas iFood" pré-#763) — mas se a rota **responder com sucesso** em vez de falhar, o KPI pode contar período em vez de transação (M2) |
| T4 | "Vendas líquidas" | 🟡 PLACEHOLDER CONSCIENTE | Mostra o mesmo valor de "Vendas brutas" — nota explícita no código: `saleGrossValue` não tem campo de dedução documentado; decisão de não inventar fórmula sem fonte confirmada. Correto ficar assim até Settlement trazer o valor líquido real |
| T5 | Antecipações/Ajustes na UI | ❌ Fora da v1 da tela — só Sales+Settlement, conforme o brief ("repasses/settlements quando o 83 entregar") |
| T6 | Visual (console.css) | ✅ — usa `cv2-card`/`cv2-kpis`/`cv2-tbl-wrap`, mesmo padrão das demais telas |

---

## Resumo executivo

- **Sales**: pronto e confirmado live (pré-existente, não é trabalho novo desta leva).
- **Settlement/Anticipation**: implementados e testados offline; **risco real não resolvido**:
  (a) shape do settlement no front pode contar período em vez de linha de repasse (M2); (b) query
  params de request inferidos por analogia, nunca confirmados contra o sandbox.
- **Financial Events (ledger) — LACUNA CONFIRMADA**: nenhum dos 3 endpoints de "ajuste
  financeiro" citados no brief bate 100% com a referência interna. O que foi implementado
  (`/occurrences`) não está na lista de 7 endpoints reais; o que a lista pede (`/financial-events`,
  `/reconciliation`) não foi implementado. **Ação recomendada**: revisar `listarOcorrencias`
  contra `00-api-reference.md` antes do próximo smoke live — pode precisar de rename/path fix ou
  de uma 4ª função nova.
- **Header `x-request-homologation`**: não implementado em nenhum client — não bloqueia o
  desenvolvimento agora, mas falta a opção de ligá-lo quando a janela de homologação chegar.
- **Events (Order)**: decisão bem fundamentada de ficar fora de escopo, esqueleto mínimo
  implementado sem dívida técnica real (read-safe, sem consumidor, sem risco).
- **Tela**: cobre o caminho feliz de Sales; Settlement com estado vazio decente se a rota falhar,
  mas ainda não testado contra uma resposta real bem-sucedida (M2/T3).
- **Nada foi testado contra a API real nesta leva** — sandbox de Financial não teve nenhuma
  chamada smoke live ainda para Settlement/Anticipation/Reconciliation (só Sales, de sessão
  anterior). Recomendo 1 rodada de smoke live focada em M2 (shape do settlement) e M4/M5 (path
  correto do ajuste financeiro) antes de considerar o App 2 pronto para ticket.

### Pendências recomendadas antes de qualquer ticket de homologação Finanças

1. **Resolver a divergência de path do M4/M5** (financial-events vs reconciliation vs occurrences) — não é cosmético, pode ser o endpoint errado.
2. **Smoke live de M2** (Settlement) para confirmar se `settlements[]` é período ou transação — decide se o KPI da tela está certo.
3. Implementar (ou decidir não implementar) `/financial-events` (M4) — está no brief original como uma das 4 APIs esperadas.
4. Adicionar o header `x-request-homologation` como opção plugável antes da janela real de homologação (M7).
5. Confirmar se a migration `20260706_018` foi de fato aplicada em prod (T1) — este worker não pôde verificar.
