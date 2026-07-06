# Matriz de Cobertura — App 2 Finanças (Financial + Events)

> Espelho de `docs/integracoes/ifood/homologacao-matriz-cobertura.md` (Avaliações), mesmo
> objetivo: mapear CADA critério/endpoint → onde está implementado → evidência (teste offline,
> smoke live, ou LACUNA), sem maquiagem — reporta lacuna como lacuna.
>
> **Estado dos PRs no momento desta matriz**: #790, #791, #793 **MERGEADOS**. #796 (fix de
> paths/params Financial pós-smoke + header `x-request-homologation`) **MERGEADO E RE-SMOKADO
> AO VIVO** nesta atualização (2026-07-06, ver M2/M3/M7 abaixo) — desta vez chamando as ROTAS
> reais do Bridge já deployado (`GET /api/ifood-api/repasses/:lojaId` e `.../antecipacoes/:lojaId`
> via `x-internal-token`, loja de teste `2494ee86-41b4-481b-994b-6f54965ced30`,
> `fonte_dados='api'`, tenant `daebb6a7-76c1-492e-b872-0a37b9f36b0d`), não mais lib/curl direto na
> API do iFood. Migration `20260706_018` (allowlist) segue não verificada por este worker (sem
> acesso a leitura de schema além do necessário para achar a loja de teste).
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
| M2 | `GET /settlements` — repasses/liquidação | ✅ **CONFIRMADO LIVE via rota do Bridge** (2026-07-06) — 🟡 shape do front ainda não decidível (ver evidência) | `listarRepasses` — `lib/ifood.js` (query `beginPaymentDate`/`endPaymentDate` — **corrigida e confirmada** contra o sandbox; o próprio 400 do iFood revelou os 2 pares válidos, `#796`) | `GET /ifood-api/repasses/:lojaId` — `routes/ifood-api.js` (400 `DATA_INVALIDA`) | `getIfoodRepasses` (`api.js:735`) espera `r.settlements` como array de **linhas de repasse**; a resposta real (ver evidência) é `settlements[]` **vazio** (loja sandbox sem movimentação) — a dúvida de shape (período vs transação) segue **não decidível**, precisa de merchant com dado real | `curl` via rota do Bridge (`x-internal-token`, loja `2494ee86-...`): `200 {"beginDate":"2026-06-29","endDate":"2026-07-06","balance":0,"merchantId":"92a0ec17...","settlements":[]}` — confirma path+params+contrato da rota, **não** confirma o shape de `settlements[]` não-vazio |
| M3 | `GET /anticipations` — antecipação D+1/D+7 | ✅ **CONFIRMADO LIVE via rota do Bridge** (2026-07-06) | `listarAntecipacoes` — `lib/ifood.js` (query **corrigida**: era `calculationDate`/`anticipatedPaymentDate` como data única mutuamente exclusiva — o sandbox real rejeitou com 400 "At least one date range must be provided"; agora `beginCalculationDate`/`endCalculationDate`, um INTERVALO, mesmo padrão `dataInicio`/`dataFim` das demais rotas, `#796`) | `GET /ifood-api/antecipacoes/:lojaId` — `routes/ifood-api.js` (400 `DATA_INVALIDA`; a validação `FILTRO_ANTECIPACAO_CONFLITANTE` foi **removida** — não fazia mais sentido com o novo contrato de período) | ❌ Nenhuma tela consome ainda (confirmado por grep — troca de contrato da rota foi sem risco) | `curl` via rota do Bridge: `200 {"beginDate":"2026-06-29","endDate":"2026-07-06","balance":0,"merchantId":"92a0ec17...","settlements":[]}` |
| M4/M5 | Ajustes financeiros (chargeback/falha sistêmica) — path correto ainda em aberto | 🔴 **LACUNA CONFIRMADA AO VIVO — não resolvida** | `listarOcorrencias` — `lib/ifood.js` aponta hoje pra `/financial-events` (kebab-case; corrigido de `/occurrences`, que o smoke confirmou 404) | `GET /ifood-api/ocorrencias/:lojaId` — `routes/ifood-api.js` (propaga o erro upstream, `handle()` genérico) | ❌ Nenhuma tela consome — correto não consumir enquanto não resolvido | **3 candidatos testados ao vivo contra o sandbox** (merchant `92a0ec17...`): `/occurrences` → `404 "no Route matched"` (confirmado errado); `/financialEvents` (camelCase, nome do research #789) → `404 "no Route matched"` (também errado); `/financial-events` (kebab-case, **bate com a referência interna `00-api-reference.md`**, §1 desta matriz) → **`500 "Internal server error"`**, consistente com/sem query params e com/sem o header `x-request-homologation`. Diferente de um 404 limpo — sugere que o path existe no gateway do iFood mas quebra antes de validar a query (falta de escopo na credencial sandbox? limitação do merchant de teste?). **Não é uma confirmação de sucesso.** Path mantido em `/financial-events` por ser o candidato correto segundo a referência interna, com a ressalva documentada em destaque no código — precisa escalar pro suporte iFood (ticket vetado nesta janela) ou recapturar a doc de homologação logado |
| M6 | Tratamento de erros 400/401/403/404/429 | ✅ IMPLEMENTADO (genérico, reaproveita M6 da matriz de Avaliações) | `IfoodApiError`+`withRetry` (mesmo pipeline) | `handle()` genérico + validação de data 400 `DATA_INVALIDA` em cada rota nova | `mensagemErro()` em `FinanceiroIfood.jsx` trata 401/403/429 (não trata 404/409 explicitamente — vendas/repasses vazios já caem no "sem dados", não em erro) | Offline: casos de `DATA_INVALIDA` nas 3 rotas novas (M2/M3/M4-M5) |
| M7 | Header `x-request-homologation: true` (achado do research #789 §9) | ✅ **IMPLEMENTADO** (`#796`) | `ifoodFetch` (`lib/ifood.js`) injeta o header em TODAS as chamadas Financial/Merchant/Catalog/Review quando `process.env.IFOOD_HOMOLOGATION_HEADER === 'true'` — ponto único, plugável, **OFF por padrão** | — (transparente a todas as rotas, sem mudança de contrato) | — | **Confirmado ao vivo (2026-07-06)**: `.env` da VPS não tem `IFOOD_HOMOLOGATION_HEADER` definida → header nunca enviado por padrão (smoke de M2/M3 rodou sem o header, sucesso). Testado também que ligar o header não quebra `settlements` nem resolve o 500 de M4/M5. 2 testes unitários dedicados em `test/ifood.test.js` |

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

## Resumo executivo (atualizado 2026-07-06 pós-#796 + re-smoke via rota do Bridge)

- **Sales**: pronto e confirmado live (pré-existente, não é trabalho novo desta leva).
- **Settlement/Anticipation (M2/M3): ✅ CONFIRMADOS LIVE via rota do Bridge já deployado** —
  paths e query params corrigidos e testados contra o sandbox real (não mais lib/curl direto na
  API do iFood). Risco residual: o merchant sandbox não tem movimentação financeira real, então
  `settlements[]` só foi confirmado **vazio** — a dúvida de shape (período vs transação, M2) segue
  em aberto até haver dado real pra inspecionar.
- **Ajustes financeiros (M4/M5) — LACUNA CONFIRMADA AO VIVO, não resolvida**: testados 3
  candidatos de path contra o sandbox; `/financial-events` (kebab, bate com a referência interna)
  é o mais provável mas devolve 500 consistente — não é sucesso confirmado. Requer escalar pro
  suporte iFood (ticket vetado nesta janela) ou doc de homologação capturada logado.
- **Header `x-request-homologation` (M7): ✅ IMPLEMENTADO e CONFIRMADO** — plugável via env, OFF
  por padrão, testado ao vivo que não interfere no que já funciona (M2/M3) nem resolve o 500 de
  M4/M5.
- **Events (Order)**: decisão bem fundamentada de ficar fora de escopo, esqueleto mínimo
  implementado sem dívida técnica real (read-safe, sem consumidor, sem risco).
- **Tela**: cobre o caminho feliz de Sales; Settlement com estado vazio decente se a rota falhar
  — agora sabemos que a rota **não falha** (M2 confirmado 200), mas o KPI ainda não foi validado
  contra um shape de dado real (settlements não-vazio).

### Pendências recomendadas antes de qualquer ticket de homologação Finanças

1. **Resolver M4/M5** — escalar pro suporte iFood (ou doc capturada logado) pra confirmar se
   `/financial-events` é mesmo o path certo e por que devolve 500 no sandbox atual.
2. **Smoke de M2 com dado real** — pedir/gerar uma venda + repasse fechado no sandbox pra
   confirmar o shape de `settlements[]` não-vazio antes de confiar no KPI da tela.
3. Confirmar se a migration `20260706_018` foi de fato aplicada em prod (T1) — este worker não
   verificou (fora do escopo desta rodada — só leitura mínima pra achar a loja de teste).
