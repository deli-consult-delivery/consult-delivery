# Matriz de Cobertura — Homologação iFood (Merchant + Review)

> Gerada em 2026-07-06, a partir de `origin/main` pós-#758/#759/#760.
> Mapeia CADA critério de `docs/integracoes/ifood/homologacao-checklist-avaliacoes.md` → onde está implementado → evidência (teste offline, smoke live já rodado, ou LACUNA).
> **Regra**: lacuna é reportada como lacuna, sem maquiagem — esta matriz é para o Wandson decidir o que falta antes do ticket.

## Legenda de status

| Símbolo | Significado |
|---|---|
| ✅ IMPLEMENTADO | Código existe, testado offline (ou é passthrough trivial da API iFood) |
| 🟡 PARCIAL | Parte do fluxo existe (ex.: client, mas sem rota; ou rota, mas sem UI) |
| ❌ LACUNA | Não implementado — nenhum código, nenhuma tela |
| 🔵 SMOKE LIVE | Só confirmável com credencial real na VPS — não dá pra testar offline |

---

## Pré-requisitos gerais (checklist §"Pré-requisitos gerais")

| Critério | Status | Nota |
|---|---|---|
| Aplicativo pronto p/ teste (sessão remota ~45min) | 🟡 PARCIAL | Review parcialmente pronto (ver módulo abaixo); Merchant tem lacunas grandes (interruptions/opening-hours/detalhe) |
| Conta Profissional (CNPJ) | 🔵 SMOKE LIVE | Depende do cadastro no portal do desenvolvedor — fora do código |
| Token de acesso válido (onboarding) | ✅ IMPLEMENTADO | `IFOOD_CLIENT_ID`/`IFOOD_CLIENT_SECRET` no `.env` do Bridge na VPS (confirmado ligado 2026-07-05, memória `project_ifood_api_sandbox`) |
| Ticket de homologação aberto | 🔵 SMOKE LIVE | Ação do Wandson no portal, não é código |
| Categoria do app = "Avaliações" | 🔵 SMOKE LIVE | Confirmar/criar no portal do desenvolvedor |

---

## Módulo Merchant

| # | Endpoint/Critério | Status | Client (`lib/ifood.js`) | Rota Express | Front (UI) | Evidência de teste |
|---|---|---|---|---|---|---|
| M1 | `GET /merchants` (lista id/name/corporateName) | 🟡 PARCIAL | `listarMerchants(tenantId)` — `lib/ifood.js:235` | ❌ nenhuma rota expõe isso | ❌ nenhuma tela | `test/ifood.test.js:122` (retry 429, mock sem `corporateName` — shape não confirmado) |
| M2 | `GET /merchants/{id}` (detalhe: operações + endereço completo) | ❌ LACUNA | nenhuma função | ❌ | ❌ | — |
| M3 | `GET /merchants/{id}/status` (state OK/WARNING/CLOSED/ERROR) | 🟡 PARCIAL | `getStatusLoja` — `lib/ifood.js:256` | `GET /ifood/status` — `routes/ifood.js:162`; `GET /ifood-api/merchant-status/:lojaId` — `routes/ifood-api.js:85` | ❌ nenhuma tela consome (sem polling ≥30s) | `test/ifood.test.js:143,161`; `test/ifood-api-routes.test.js` cenários 1–5,7 (linhas 69–194) |
| M4 | `GET/POST /merchants/{id}/interruptions` + `DELETE .../interruptions/{id}` (pausar/despausar loja) | ❌ LACUNA | nenhuma (não confundir com `pausarItem`/`reabrirItem` em `lib/ifood.js:398,409` — esses são endpoint de **Catalog**, item de cardápio, não Merchant/interruptions da loja inteira) | ❌ `OPERACOES_ESCRITA` (`routes/ifood.js:28`) só tem `pausar_item`/`reabrir_item`/`responder_review` | ❌ | — |
| M5 | `GET/PUT /merchants/{id}/opening-hours` (horários) | ❌ LACUNA | nenhuma | ❌ | ❌ | — |
| M6 | Tratamento de erros 400/401/403/404/409/429 | ✅ IMPLEMENTADO (genérico) | `IfoodApiError` (`lib/ifood.js:23`), `withRetry`+`shouldRetry` (`lib/ifood.js:126-152`, retenta só 429/5xx), `ifoodFetch` anexa `retryAfterMs` do header `Retry-After` em 429 (`lib/ifood.js:~190-200`) | `handle()` em `routes/ifood.js:38+` e `routes/ifood-api.js:18+` convertem em JSON `{ok:false,status,error,retryAfterSeconds}`, nunca ecoam `err.body` cru | — | `test/ifood.test.js` (404 não retenta, 429 c/ Retry-After); `test/ifood-api-routes.test.js` cenários 16–17 (upstream 401/403 repassados, linhas ~340-375) |

**Nuance M6**: os specs 400 (`code`+`message`), 403 ("permissão insuficiente") e 409 (`InterruptionOverlap`) são o corpo que o **iFood devolve** — o Bridge não constrói isso, só não pode mascará-lo. Hoje `handle()` **não repassa `err.body` cru pro cliente** (por design — evita vazar detalhe interno), só `message`/`code` seguros. Isso é suficiente pros endpoints GET já implementados (M3), mas quando M4/M5 forem construídos, os testes de escrita (`POST interruptions`, `PUT opening-hours`) vão precisar confirmar que o `code` específico do iFood (ex. `InterruptionOverlap`) chega ao front pelo mesmo canal que hoje leva `code: TEXTO_INVALIDO`/`PAGE_SIZE_INVALIDO` (nossos próprios códigos) — isto é, **o mecanismo já existe e funciona** (`details.code`/`details.message` em `routes/ifood.js:60-65`), só falta ligar M4/M5 nele quando forem implementados.

| M7 | Tela `lojas` (T-HOMOLOG): status polling ≥30s + pausar/despausar + horários | ❌ LACUNA | — | — | Telas existentes (`src/screens/lojas/LojasListView.jsx`, `LojaWorkspace.jsx`) não têm nenhum dos 3 recursos — só um campo estático "Link iFood" (URL) em `LojaWorkspace.jsx:298,329,367`. PRs #757 (tenants T-HOMOLOG/T-DEMO) e #759 (RBAC + loja sandbox) tocaram só schema/tenant/RBAC, nenhuma tela de lojas. | — |

### Resumo Merchant
**2 de 7 critérios com algum código (M3, M6); 0 completos ponta-a-ponta com UI. 5 lacunas totais (M2, M4, M5, M7 de UI, M1 sem rota/UI).** Este é o maior risco pro ticket — o checklist exige DEMONSTRAR escrita (pausa + horário) pela interface, e isso não existe ainda.

---

## Módulo Review

| # | Critério | Status | Client | Rota | Front | Evidência de teste |
|---|---|---|---|---|---|---|
| R1 | Listar avaliações — 200, campos `id/status/replies[]/version/visibility`, paginação `page/size/total/pageCount` | 🟡 PARCIAL | `listarReviews(merchantId,{page,size},tenantId)` — `lib/ifood.js:270` (traduz `size`→`pageSize` na query real ao iFood, ver nota R1b) | `GET /ifood/reviews` — `routes/ifood.js:169`; `GET /ifood-api/reviews/:lojaId` — `routes/ifood-api.js:95` | `AvaliacoesReviewApi.jsx` (lista + pagina) | `test/ifood.test.js:316` (page/size→query); `test/ifood-api-routes.test.js` cenário 10 (linha 235, `size=51`→400) |
| R1b | Shape dos campos (`version`,`visibility`, `replies[].from`) | 🔵 SMOKE LIVE | `tolerant()` (`lib/ifood.js:214`) só garante objeto/array via passthrough Zod — não valida schema específico | — | — | Sandbox de reviews está **vazio** (confirmado 05/07) — schema real só confirmável no smoke live |
| R2 | Filtro por data (retorna só reviews do período) | ❌ LACUNA | `listarReviews` só aceita `page`/`size` — sem `startDate`/`endDate` | ❌ | ❌ (front não expõe filtro de data) | — |
| R3 | Paginação: `pageSize>50`→400, lista vazia→`reviews:[]` | ✅ IMPLEMENTADO | — | `routes/ifood-api.js:95` valida `size>50` antes de gastar rede | `AvaliacoesReviewApi.jsx` limita front a `PAGE_SIZE=20` | `test/ifood-api-routes.test.js` cenário 10 (linha 235: `size=51`→400 `code:PAGE_SIZE_INVALIDO`) |
| R4 | Obter detalhes de 1 review (200 completo; 404 se inexistente) | ❌ LACUNA | nenhuma função `obterReview(merchantId,reviewId)` — só existe listagem em massa | ❌ | ❌ | — |
| R5 | Responder avaliação — texto 10–300→201 com `createdAt/reviewId/text` | ✅ IMPLEMENTADO | `responderReview` — `lib/ifood.js:438` | Draft: `POST /ifood-api/reviews/:lojaId/:reviewId/draft` (`routes/ifood-api.js:131`, valida 10–300→400 `code:TEXTO_INVALIDO`); Aprovação: `POST /ifood/aprovar/:draftId` (`routes/ifood.js:320`, despacha `ifood.responder_review` via `OPERACOES_ESCRITA`, persiste `resultado` no `audit_log`) | `AvaliacoesReviewApi.jsx` — fluxo "Salvar rascunho"→"Aprovar e enviar", validação 10–300 no input (linhas 51,98-102,111) | `test/ifood.test.js:267` (POST correto); `test/ifood-aprovar-routes.test.js` cenário 1 (linha 79: sucesso, `resultado.reviewId` persistido) |
| R6 | Status ≠ `NOT_REPLIED` → 409 ou 422 | ✅ IMPLEMENTADO | `responderReview` sem retry (não-idempotente) | `routes/ifood.js:320` repassa `err.status`/`err.body.{message,code}` via `details` | `mensagemErro()` no front prefere `err.details?.message` (ex. "já respondida") sobre o `err.message` genérico | `test/ifood-aprovar-routes.test.js` cenário 2 (linha 105: 409 repassado, draft marcado `failed`) |
| R7 | Texto <10 ou >300 → 400 | ✅ IMPLEMENTADO | `responderReview` valida texto não-vazio (`lib/ifood.js:441`) — mas a validação de **tamanho** 10–300 é no Bridge/front, não no client (design correto: o client só valida o essencial pra não quebrar a URL/body) | `routes/ifood-api.js:138-146` valida 10–300→400 `code:TEXTO_INVALIDO` | Front bloqueia o botão "Salvar rascunho" fora do range + mostra contador (linha 102) | `test/ifood-api-routes.test.js` cenário 11 (linha 255: texto curto→400) |
| R8 | Obter resumo `/summary` — 200, `totalReviewsCount≥listadas`, `validReviewsCount≤total`, `score=média` | 🟡 PARCIAL | `getSummaryReviews` — `lib/ifood.js:287` (passthrough puro + cache 60s TTL) | `GET /ifood-api/summary/:lojaId` — `routes/ifood-api.js:205` | `getIfoodSummary()` (`src/lib/api.js:667`) alimenta o card "Notas iFood" da Visão Geral — `src/console/ConsoleV2.jsx:417` | Mecânica testada: `test/ifood-api-routes.test.js` cenários 8–9 (linhas 197,220: passthrough + gate `fonte_dados`); **arimética NÃO testável offline** — quem calcula `score`/`totalReviewsCount`/`validReviewsCount` é o iFood, não nosso código; só confirmável comparando o JSON real no smoke live |
| R9 | Link "Política de Avaliações" visível na UI | 🟡 PARCIAL (⚠️ risco) | — | — | `AvaliacoesReviewApi.jsx:159` — link presente e sempre visível | ⚠️ **URL não confirmada contra fonte oficial** — foi escrita no PR #760 sem link canônico documentado no projeto (nenhuma referência anterior em `docs/`). **Ação antes da sessão de homologação: o Wandson precisa confirmar/corrigir a URL real no portal do desenvolvedor.** |
| R10 | Erros 401/403/404 (Review) | ✅ IMPLEMENTADO | mesmo pipeline genérico de M6 | mesmo `handle()` genérico | `mensagemErro()` mapeia 401/403/404 pra texto claro em pt-BR (`AvaliacoesReviewApi.jsx:26-28`) | `test/ifood-api-routes.test.js` cenários 16–17 (upstream 401/403 repassados) |
| R11 | Rate limit 429 (Retry-After) | ✅ IMPLEMENTADO | `withRetry` respeita `Retry-After` real (cap 30s) — `lib/ifood.js:126-152` | `retryAfterSeconds` no JSON de erro (`routes/ifood.js`,`routes/ifood-api.js`) | `mensagemErro()` mostra "tente novamente em Xs" (`AvaliacoesReviewApi.jsx:29-32`) | `test/ifood.test.js:341` (Retry-After curto → não espera o backoff fixo) |

### Resumo Review
**8 de 11 critérios ✅ IMPLEMENTADOS e testados offline (R3, R5, R6, R7, R10, R11 completos ponta-a-ponta; R1/R8 parciais só por causa de nuances externas — schema não confirmado / aritmética é da API). 2 lacunas reais de feature (R2 filtro de data, R4 detalhe de 1 review) — nenhuma delas bloqueia o fluxo central de "responder avaliação", mas ambas aparecem no checklist final do analista.** R9 (política) tem um risco de conteúdo, não de código — URL precisa de confirmação humana.

---

## Checklist final Review (como o analista avalia — mapeamento direto)

| Item do checklist | Cobertura |
|---|---|
| Lista de avaliações retorna todas as reviews | 🟡 sim, mas sem filtro de data (R2 lacuna) |
| Filtro por data funciona | ❌ R2 — não implementado |
| Paginação correta | ✅ R1+R3 |
| Detalhes completos de uma review | ❌ R4 — não implementado |
| Resposta criada com sucesso (201) | ✅ R5 |
| Rejeição de status inválido (409) | ✅ R6 |
| Rejeição de texto inválido (400) | ✅ R7 |
| Summary com cálculo correto | 🟡 R8 — mecânica ok, aritmética é smoke live |
| **Link de Política de Avaliações visível** | 🟡 R9 — visível, URL não confirmada |
| Tratamento de erros 401/403/404 | ✅ R10 |
| Tratamento de rate limit 429 | ✅ R11 |

**6 de 11 itens do checklist final 100% prontos. 2 lacunas de feature (filtro de data, detalhe de review). 1 risco de conteúdo (URL da política). 1 item parcialmente smoke-live-dependente (summary).**

---

## Itens de build derivados do sprint (seção final do checklist)

| # | Item | Status |
|---|---|---|
| 1 | Tela `resp-avaliacoes` (T-HOMOLOG): reply via Review API no fluxo draft→aprovação | ✅ Entregue no PR #760 — `AvaliacoesReviewApi.jsx`, ativa quando `loja.fonte_dados='api'` |
| 2 | Tela `lojas` (T-HOMOLOG): status polling ≥30s + pausar/despausar + horários | ❌ LACUNA (M4, M5, M7 acima) — maior pendência pro ticket |
| 3 | Link "Política de Avaliações" visível | 🟡 Visível, URL a confirmar (R9) |
| 4 | Tratamento de erro uniforme 401/403/404/429 (Retry-After) | ✅ Entregue (R10, R11, M6) |
| 5 | Summary alimentando "BI de notas" da Visão Geral | ✅ Entregue no PR #758 — `ConsoleV2.jsx:417` |

---

## Resumo executivo

- **Review (o "coração" do App Avaliações)**: 8/11 critérios prontos e testados offline. Faltam filtro de data e detalhe de review individual — nenhum bloqueia a demo central (listar → responder → aprovar), mas ambos aparecem no checklist final que o analista confere.
- **Merchant**: cobertura muito mais fraca — só status de loja (leitura) existe ponta-a-ponta, e mesmo esse sem tela/polling no front. Pausar/despausar loja (interruptions) e horários (opening-hours) — que o checklist marca como **exigência de demonstrar escrita pela interface** — não têm nenhum código.
- **Maior risco não-técnico**: URL da Política de Avaliações nunca foi confirmada contra o portal oficial — pode estar errada.
- **Testes novos neste PR**: 2 cenários cobrindo 401/403 upstream repassados pela rota (antes só testados no client `lib/ifood.js`, não no caminho HTTP completo) — ver `test/ifood-api-routes.test.js` cenários 16–17.
- **Nada aqui foi testado contra a API real** — o sandbox de reviews está vazio (confirmado 05/07); tudo que exige dado real do iFood (shape exato dos campos V2, aritmética do summary, código de erro `InterruptionOverlap`) está marcado 🔵 SMOKE LIVE.

### Pendências recomendadas antes de abrir o ticket de homologação

1. **Bloqueante**: construir M4 (interruptions) + M5 (opening-hours) + tela `lojas` com polling — o checklist Merchant exige demonstrar escrita ao vivo.
2. **Bloqueante leve**: R2 (filtro de data) e R4 (detalhe de review) — aparecem no checklist final do analista.
3. **Rápido, sem código**: confirmar a URL real da Política de Avaliações no portal do desenvolvedor e corrigir `AvaliacoesReviewApi.jsx:15` se necessário.
4. **Smoke live obrigatório antes da sessão**: rodar ao menos 1 review real através do fluxo completo (listar→responder→aprovar) e o `/summary` contra o merchant de teste `92a0ec17-6951-4a9b-9c02-ee12963be5f1`, pra confirmar os shapes que hoje são só suposição documentada em comentários `ponytail` no código.
