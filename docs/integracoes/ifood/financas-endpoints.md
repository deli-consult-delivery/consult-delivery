# Módulo Financial (+ Events) — pesquisa para o App 2 "Finanças"

> **Método de coleta**: `developer.ifood.com.br` bloqueia fetch anônimo direto (403, provável
> proteção Cloudflare/bot) — diferente do checklist de Avaliações (`homologacao-checklist-avaliacoes.md`),
> que foi **coletado logado** no portal por um humano. Este documento foi montado via busca web
> (resultados/trechos indexados das páginas oficiais, não a página renderizada completa) —
> por isso é um **RASCUNHO**: confiável para orientar o client/rotas/tela, mas os nomes exatos de
> campo/parâmetro devem ser **confirmados contra a chamada real no sandbox** antes de fechar a
> homologação (mesma ressalva já usada na matriz de Avaliações para `pageSize`/`dateFrom`/`dateTo`).
> Se alguém tiver acesso logado ao portal, recapturar as páginas de homologação verbatim é o
> upgrade natural deste doc.

Fontes: `developer.ifood.com.br/pt-BR/docs/guides/modules/financial/*` (intro, api-sales,
api-settlement, api-antecipation, api-financial-events, api-reconciliation, homologation,
definitions) e `developer.ifood.com.br/*/docs/guides/modules/events/*` (polling-overview,
order-events) — todos via busca, não fetch direto.

---

## 0. Achado importante: "Financial Events" ≠ "Order Events" (Events module)

Nomes parecidos, APIs completamente diferentes — **não confundir na implementação**:

| | **Financial Events** (parte do módulo **Financial**) | **Order Events** (módulo **Events**, "polling de eventos") |
|---|---|---|
| O que é | Ledger de fluxo de caixa (créditos/débitos) do período de repasse | Mudanças de status de pedido em tempo real |
| Como se consome | `GET` com `merchantId` + `beginDate`/`endDate` (consulta, não polling) | `GET /events:polling` a cada 30s + `POST /events/acknowledgment` |
| Uso no App 2 | **Sim, é uma das 4 APIs do escopo** (worker 83) | Provavelmente **fora de escopo** — ver §5 |

## 1. Autenticação (já implementada no Bridge — não mexer, só reaproveitar)

Igual ao resto da integração iFood (`docs/integracoes/ifood/PLANO-INTEGRACAO-IFOOD.md`):
OAuth2 `client_credentials` → `POST /authentication/v1.0/oauth/token` → `accessToken` Bearer,
6h de validade, sem refresh_token (pede token novo). Host base:
`https://merchant-api.ifood.com.br`. Cache em memória + single-flight já existem em
`bridge-server/lib/ifood.js` (`getAccessToken`/`ifoodFetch`) — as 4 APIs de Financial usam o
MESMO client, só endpoints novos.

## 2. API Sales — `GET /financial/v3.0/merchants/{merchantId}/sales`

**Já implementado e confirmado live** (`listarVendas`, `bridge-server/lib/ifood.js:360`,
`routes/ifood-api.js` — worker 86 já tem rota pronta pra consumir). Confirmado contra o sandbox
em 2026-07-05: sem período o iFood responde **400** — `beginSalesDate`/`endSalesDate` são
obrigatórios (formato `yyyy-MM-dd`); nosso client já aplica default de 7 dias quando o chamador
não informa.

- **Params (query)**: `beginSalesDate`, `endSalesDate` (obrigatórios) · `page`/`size` (paginação,
  não confirmados contra o sandbox ainda).
- **Resposta** (`sales[]`): `id`, `shortId`, `createdAt`, `type`, `category`, `salesChannel`,
  `currentStatus`, `merchant`, `saleGrossValue` (`{bag, deliveryFee, serviceFee}`), `benefits`,
  `delivery`.

## 3. API Settlement — repasses/liquidação

Endpoint exato (path completo) **não confirmado** via busca — provável
`GET /financial/v3.0/merchants/{merchantId}/settlements` (mesmo padrão dos demais, a confirmar
no sandbox). Dá o **valor líquido transferido à loja** + valor de recebíveis enviados a
instituições financeiras.

- **Resposta**: `beginDate`, `endDate`, `balance`, `merchantId`, `settlements[]` com
  `startDateCalculation`, `endDateCalculation`, `closingItems[]` (`id`, `type`, `product`,
  `amount`, `status`, `accountDetails`, `paymentDate`). Classificação `"Repasse"` = pagamento à
  loja pelo valor líquido das vendas do período.

## 4. API Anticipation — antecipação de recebíveis

Informa antecipações pagas à loja quando ela tem plano contratado com o iFood Pago:
**D+1** (recebe no próximo dia útil, com taxa) ou **D+7** (recebe na quarta-feira da semana
seguinte, com taxa).

- **Resposta**: mesmo formato-base de Settlement (`beginDate`/`endDate`/`balance`/`merchantId`/
  `settlements[]`), mas `closingItems[]` ganha `originalPaymentAmount`, `feePercentage`,
  `feeAmount`, `anticipatedPaymentAmount`, `originalPaymentDate`, `anticipatedPaymentDate`,
  `status` (ex.: `"SUCCEED"`).
- **Efeito colateral em outras APIs**: uma antecipação aparece também na Financial Events como
  evento `ANTICIPATION_FEE` (a taxa cobrada) e na Reconciliation (arquivo mensal registra a
  antecipação) — útil pra bater os 3 relatórios entre si na tela.

## 5. API Financial Events — ledger de créditos/débitos do período

Registro completo de eventos de fluxo de caixa por período de repasse (semanal ou diário),
com data prevista de pagamento.

- **Params (query)**: `merchantId` (path, obrigatório) · `beginDate`/`endDate` (obrigatórios,
  formato `AAAA-MM-DD`) · `page` (opcional).
- **Resposta**: `name`, `description`, `product`, `trigger`, `competence`, `period`,
  `reference` (carrega o id do evento), `hasTransferImpact`, `amount`, `billing`, `settlement`,
  `receiver`, `payment`. Tipos de evento observados: `IFOOD_SUBSIDY`, `ANTICIPATION_FEE`.

## 6. API Reconciliation — alternativa em CSV

Mesmo propósito da Financial Events, mas devolve um **link de download expirável** para um
arquivo **CSV comprimido (`.gz`)**, delimitador `;`. Existe também uma variante
**"Reconciliation On Demand"** (gera o arquivo sob demanda, a qualquer momento, em vez de só no
ciclo padrão). Campos citados em fontes secundárias (confiança baixa, **não confirmado** contra
doc oficial nem sandbox): `pedido_associado_ifood`, `valor`, `fato_gerador`,
`impacto_no_repasse` — tratar como pista, não como contrato.

> **Recomendação pro worker 83**: para o MVP do App 2, priorizar Sales (já pronto) + Settlement +
> Anticipation + Financial Events (as 4 citadas explicitamente no brief). Reconciliation (CSV) é
> "mesmo dado, formato diferente" — só vale a pena se o time preferir CSV a JSON para algum
> relatório específico; não é um endpoint adicional de valor único.

## 7. Rate limits

Página geral: `developer.ifood.com.br/.../getting-started/documentation/rate-limit/`. Padrão:
excesso → **429** + header **`Retry-After`**. Não achei um número específico de req/s publicado
para os endpoints de Financial (diferente do Merchant, que documenta 1000 req/s e polling de
30s) — **assumir o `withRetry`/backoff exponencial genérico já implementado** (`shouldRetry`,
`bridge-server/lib/ifood.js`) até confirmar um número real contra 429 no sandbox.

## 8. Paginação

`page`/`size` aparecem no exemplo de resposta da Sales API, mas **os valores default/máximo não
foram confirmados** via busca — mesmo tratamento cauteloso já usado para Review (`pageSize>50`
só foi confirmado quando alguém testou contra o sandbox real).

## 9. RASCUNHO — critérios de homologação da categoria Finanças

> Espelha o formato de `homologacao-checklist-avaliacoes.md`. **Confiança menor que aquele
> documento** (que foi capturado logado) — usar como ponto de partida, não como checklist final.

### Pré-requisitos gerais (iguais ao processo de Avaliações)
- [ ] Conta Profissional (CNPJ) — CPF não é aceito
- [ ] Aplicativo pronto para teste — "app completo", não chamadas isoladas
- [ ] Ticket de homologação aberto (Portal do Desenvolvedor → Suporte → Tickets → Homologação)
- [ ] Formulário prévio preenchido antes da reunião (demonstrar entendimento dos casos de uso)

### ⚠️ Achado específico do módulo Financial — header de teste
Durante a janela de homologação, as respostas do formulário devem usar dados do **ambiente de
teste** e as chamadas às APIs devem incluir o header **`x-request-homologation: true`**. Isso é
diferente do que documentamos para Avaliações (Merchant/Review não mencionavam esse header) —
**achado novo, exclusivo do módulo Financial**. Recomendo ao worker 83: deixar esse header
plugável (env/flag), não hardcoded, e só ativá-lo na janela real da sessão de homologação.

### Cenários de teste prováveis (por API, inferido da documentação — não confirmado 1:1)
- **Sales**: listar vendas de um período · período vazio (sem vendas) · período sem informar →
  erro (já confirmado: 400 no sandbox real)
- **Settlement**: consultar repasse de um período fechado · valor líquido bate com Sales−taxas
- **Anticipation**: loja sem plano de antecipação (lista vazia) · loja com D+1/D+7 configurado
- **Financial Events**: listar eventos de um período · paginação · evento de antecipação
  aparece corretamente cruzado com a API de Anticipation
- Tratamento de erros 400/401/403/404/429 — mesmo padrão exigido em Merchant/Review

### O que o sandbox hoje suporta (confirmado neste repo)
- ✅ **Sales**: `GET /financial/v3.0/merchants/{id}/sales` — implementado, testado offline,
  confirmado live contra o merchant `92a0ec17-...5f1` (2026-07-05).
- ❌ **Settlement/Anticipation/Financial Events**: nenhum client implementado ainda — é o
  trabalho do worker 83 nesta mesma leva.

## 10. Para o worker 89 (módulo Events) — Events/Order provavelmente FORA de escopo do App 2

O checklist original de Avaliações (`docs/dossie/checklist-homologacao.md`) já registrou a
decisão travada: **Order fica fora do MVP** ("plataforma não opera pedidos em tempo real, é
produto de BI/consultoria, não PDV") e por consequência **Events (polling `/events:polling`,
`Acknowledgment`)** foi marcado "não aplicável ao MVP atual". Nada no que encontrei sobre a
homologação do módulo **Financial** especificamente exige Order Events como pré-requisito — os
critérios de Financial giram em torno de Sales/Settlement/Anticipation/Financial-Events (a
API de ledger, não a de polling — ver §0). **Recomendação**: implementar só o esqueleto mínimo
(client+rota de leitura, sem UI), documentar a decisão no PR, e não investir em UI/produto para
Events nesta leva — decisão informada, não código especulativo (conforme o próprio brief pediu).

Detalhes técnicos do Events (Order Events), para quando/se for retomado:
- `GET /events:polling` a cada 30s por token (429 acima disso)
- Header `x-polling-merchants`: até 100 IDs por header; **obrigatório** acima de 500 merchants
  vinculados (senão recebe eventos de todos)
- `POST /events/acknowledgment`: confirma os eventos recebidos; requisições sem filtro recebem
  auto-acknowledgment
- Eventos ficam disponíveis por até ~8h após a entrega, depois somem
- Sempre validar eventos de cancelamento — pode ocorrer a qualquer momento do ciclo do pedido
