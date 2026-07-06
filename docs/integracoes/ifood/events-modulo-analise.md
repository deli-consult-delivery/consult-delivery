# Módulo Events (iFood) — análise de aplicabilidade ao App Finanças/BI

> Escopo: worker 89 do sprint App 2 — Finanças iFood (06/07/2026). Pergunta a
> responder: o módulo Events (polling + acknowledgment) da API do iFood serve
> ao app de Finanças/BI? **Resposta: não.** Decisão documentada abaixo, com
> fontes. Implementação ficou como esqueleto mínimo (ver §4).

## 1. O que é o módulo Events

`GET /events/v1.0/events:polling` + `POST /events/v1.0/events/acknowledgment` é
o barramento de eventos do fluxo de **PEDIDOS** (Order/PDV): novo pedido
(`PLACED`), confirmado (`CONFIRMED`), despachado (`DISPATCHED`), cancelado
etc. Um sistema de PDV faz polling a cada ~30s, processa os eventos novos e
confirma (`acknowledgment`) para não recebê-los de novo. Fontes:

- Doc pública (via busca — o portal `developer.ifood.com.br` bloqueia fetch
  direto de agente, retorna 403/Cloudflare): páginas "Order events", "Event
  polling", "Order negotiation platform" — todas sob a hierarquia do módulo
  **Order**, nunca sob Financial. Nenhum resultado indicou grupo/categoria de
  evento financeiro.
- `docs/integracoes/ifood/PLANO-INTEGRACAO-IFOOD.md:105-109,344`: já
  classificava como **"Events + Order — `/events/v1.0` e `/order/v1.0`
  (pedidos, exclusivo PDV — F3)"**, com homologação própria (reunião completa
  + `/generate-test-order`), separada da homologação Financial/Merchant/Review
  já em andamento neste sprint.
- `docs/integracoes/ifood/_fontes-portal-ifood/00-api-reference.md:21-22,98`:
  lista `Events — /events/v1.0` (polling/ack) **e**, à parte, dentro do bloco
  Financial, `GET /merchants/{merchantId}/financial-events` — um endpoint de
  **listagem simples** (não polling/ack) de eventos financeiros. São duas
  coisas diferentes com nomes parecidos — ver §3.

## 2. Por que não se aplica ao app de Finanças/BI

- **Dado errado.** Os eventos de `/events/v1.0` são de ciclo de vida de
  pedido (status, timestamps, `orderId`), não linhas de repasse/settlement,
  antecipação ou ajuste — que é o que a tela Financeiro precisa mostrar.
- **Gate de homologação incompatível.** Ativar Events/Order exige reunião de
  homologação PDV completa com o iFood e geração de pedidos de teste — um
  processo à parte do que está sendo feito para Merchant/Review/Financial
  neste sprint (regra do brief: "NENHUM ticket/ação no portal dev vetado
  hoje"). Puxar Events agora romperia essa restrição sem necessidade.
- **Sem consumidor no app.** Não há tela nem lógica de negócio no App 2 que
  processe pedidos — só relatórios financeiros (vendas, repasses,
  antecipações). Acoplar um poller de eventos de pedido a um app de BI seria
  código especulativo sem caso de uso.

## 3. Não confundir com `financial-events` (Financial API)

`GET /financial/v3.0/merchants/{merchantId}/financial-events` (mencionado em
`00-api-reference.md:98`) é um endpoint de **listagem** (GET simples, sem
polling/ack) dentro do módulo **Financial** — esse sim é dado financeiro em
potencial. Está fora do escopo deste worker (89 = módulo Events) e é
responsabilidade do worker 83 (client bridge), que já cobre
settlements/antecipações/ajustes conforme o doc do worker 82.

## 4. O que foi implementado (esqueleto mínimo)

Read-safe, sem nenhuma tela/task consumindo — só para não deixar "decisão
informada" sem nenhum código de suporte, caso uma necessidade real de Order
apareça no futuro (F3 do plano de integração):

- `bridge-server/lib/ifood.js`: `listarEventos()` (GET polling, filtra por
  `x-polling-merchants`, `groups`, `types`) e `confirmarEventos()` (POST
  acknowledgment, `body: [{id}, ...]`, máx. 2000 ids/chamada). **Nunca** chama
  endpoints de Order (`confirm`/`dispatch`) — só o protocolo do módulo Events.
- `bridge-server/routes/ifood-api.js`: `GET /ifood-api/events/:lojaId` e
  `POST /ifood-api/events/:lojaId/ack`, no mesmo padrão gated
  (`resolveLojaGated`, erros com `code`/`message`, `Retry-After` em 429) das
  demais rotas do arquivo.
- Testes offline: `bridge-server/test/ifood.test.js` (client — headers,
  limites de 100 merchants/2000 ids, validação de merchantId) e
  `bridge-server/test/ifood-api-routes.test.js` (rotas — gate de
  `fonte_dados`, validação de `eventIds`).

**Não confirmado contra uma chamada real**: o path exato (`/events/v1.0/...`)
e o formato do body de acknowledgment (`[{id}]`) vêm do `00-api-reference.md`
interno; buscas públicas retornaram variantes (`/order/v1.0/orders:polling`,
payload `{acknowledgedEventIds:[...]}`) que podem refletir versões diferentes
da API. Mesma ressalva já usada em `listarReviews`/`responderReview`: ajustar
se o 1º smoke live divergir — mas como este módulo não tem consumidor real no
app hoje, não há urgência em confirmar.

## 5. Recomendação

Não gastar mais esforço em Events nesta fase. Retomar só se/quando o roadmap
priorizar F3 (Pedidos/PDV) — aí sim vale a homologação completa e a
confirmação live dos paths/payloads acima.
