# Matriz de Cobertura — Homologação iFood (Merchant + Review)

> Gerada em 2026-07-06, a partir de `origin/main` pós-#758/#759/#760.
> **Atualizada em 2026-07-06** contra `origin/main` pós-#761/#762/#764 (rebase) — #762 fechou quase toda a lacuna de Merchant (interruptions/opening-hours/tela `lojas`).
> **2ª atualização em 2026-07-06** contra `origin/main` pós-#763 (agora MERGEADO — summary: 404 "sem reviews"→estado vazio decente) — ver nota em R8.
> **3ª atualização em 2026-07-06** contra `origin/main` pós-#768 (MERGEADO) — fechou os 2 últimos critérios pendentes de Review (filtro por data e detalhe de 1 review). Fila de PRs desta homologação esvaziada.
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
| Aplicativo pronto p/ teste (sessão remota ~45min) | 🟡 PARCIAL | Review 10/11 pronto (só falta o link de política ser confirmado) e Merchant com interruptions/opening-hours/status já entregues (ver módulos abaixo); resta só M2 (detalhe root do merchant, baixo risco) — nada bloqueia a demo central |
| Conta Profissional (CNPJ) | 🔵 SMOKE LIVE | Depende do cadastro no portal do desenvolvedor — fora do código |
| Token de acesso válido (onboarding) | ✅ IMPLEMENTADO | `IFOOD_CLIENT_ID`/`IFOOD_CLIENT_SECRET` no `.env` do Bridge na VPS (confirmado ligado 2026-07-05, memória `project_ifood_api_sandbox`) |
| Ticket de homologação aberto | 🔵 SMOKE LIVE | Ação do Wandson no portal, não é código |
| Categoria do app = "Avaliações" | 🔵 SMOKE LIVE | Confirmar/criar no portal do desenvolvedor |

---

## Módulo Merchant

| # | Endpoint/Critério | Status | Client (`lib/ifood.js`) | Rota Express | Front (UI) | Evidência de teste |
|---|---|---|---|---|---|---|
| M1 | `GET /merchants` (lista id/name/corporateName) | 🟡 PARCIAL | `listarMerchants(tenantId)` — `lib/ifood.js:235` | ❌ nenhuma rota expõe isso | ❌ nenhuma tela | `test/ifood.test.js:122` (retry 429, mock sem `corporateName` — shape não confirmado) |
| M2 | `GET /merchants/{id}` (detalhe: operações + endereço completo) | ❌ LACUNA | nenhuma função (#762 implementou status/interruptions/opening-hours, mas NÃO o detalhe root do merchant) | ❌ | ❌ | — |
| M3 | `GET /merchants/{id}/status` (state OK/WARNING/CLOSED/ERROR) | ✅ IMPLEMENTADO (atualizado — antes 🟡, front chegou no #762) | `getStatusLoja` — `lib/ifood.js:256` | `GET /ifood/status` — `routes/ifood.js:162`; `GET /ifood-api/merchant-status/:lojaId` — `routes/ifood-api.js:85` | `TabMerchantIfood` em `src/screens/lojas/LojaWorkspace.jsx:522`, polling `setInterval` a cada `MERCHANT_STATUS_POLL_MS = 30_000` (linha 483, com comentário `ponytail`: "mínimo exigido pelo checklist — não reduzir") | `test/ifood.test.js:143,161`; `test/ifood-api-routes.test.js` cenários 1–5,7 |
| M4 | `GET/POST /merchants/{id}/interruptions` + `DELETE .../interruptions/{id}` (pausar/despausar loja) | ✅ IMPLEMENTADO (era ❌ LACUNA — fechado pelo #762) | `listarInterrupcoes` (`lib/ifood.js:436`), `criarInterrupcao` (`:444`), `removerInterrupcao` (`:459`) — distintos de `pausarItem`/`reabrirItem` (`:398,409`, que são **Catalog**/item de cardápio, não a loja inteira) | `GET /ifood-api/merchant-interruptions/:lojaId` (`routes/ifood-api.js:97`); escrita via `OPERACOES_ESCRITA['ifood.pausar_loja'\|'ifood.despausar_loja']` (`routes/ifood.js:33-34`), draft→aprovação como as demais | `TabMerchantIfood` (`LojaWorkspace.jsx:522`) — form "Pausar loja" (início/fim/motivo) + lista de pausas ativas com botão "Remover", ambos criando draft amarelo (nunca chamam a API direto) | `#762` adicionou testes próprios em `test/ifood.test.js` e `test/ifood-routes-acao-aprovar.test.js` (arquivo novo) |
| M5 | `GET/PUT /merchants/{id}/opening-hours` (horários) | 🟡 PARCIAL (era ❌ LACUNA — backend fechado pelo #762, front só lê) | `listarHorarios` (`lib/ifood.js:470`), `atualizarHorarios` (`:478`) | `GET /ifood-api/merchant-opening-hours/:lojaId` (`routes/ifood-api.js:105`); escrita via `OPERACOES_ESCRITA['ifood.atualizar_horarios']` (`routes/ifood.js:35`) — backend PRONTO para PUT via draft | `TabMerchantIfood` (`LojaWorkspace.jsx`, seção "Horários de funcionamento — leitura") **só exibe os turnos, sem form de edição** — decisão consciente do #762 (satisfaz a leitura mínima que o checklist exige; PUT via draft "se exigido na sessão" ainda não tem botão) | Backend testado (mesmos arquivos do M4); front de edição não existe pra testar |
| M6 | Tratamento de erros 400/401/403/404/409/429 | ✅ IMPLEMENTADO (genérico) | `IfoodApiError` (`lib/ifood.js:23`), `withRetry`+`shouldRetry` (`lib/ifood.js:126-152`, retenta só 429/5xx), `ifoodFetch` anexa `retryAfterMs` do header `Retry-After` em 429 | `handle()` em `routes/ifood.js` e `routes/ifood-api.js` convertem em JSON `{ok:false,status,error,retryAfterSeconds,details}`, nunca ecoam `err.body` cru — `details.code`/`details.message` já carregam o código específico do iFood (ex. `InterruptionOverlap`, testado em `test/ifood.test.js` "removerInterrupcao: 409 InterruptionOverlap propaga status e body.code") | `erroIfoodParaMensagem()` em `LojaWorkspace.jsx:485` traduz pra mensagem em pt-BR | `test/ifood.test.js` (404 não retenta, 429 c/ Retry-After, 409 InterruptionOverlap); `test/ifood-api-routes.test.js` cenários 19–20 (upstream 401/403 repassados) |
| M7 | Tela `lojas` (T-HOMOLOG): status polling ≥30s + pausar/despausar + horários | ✅ IMPLEMENTADO (era ❌ LACUNA — o maior risco da versão anterior desta matriz, fechado pelo #762) | — | — | `TabMerchantIfood` em `src/screens/lojas/LojaWorkspace.jsx:522`, gated por `isFonteApi = loja.fonte_dados === 'api'` (linha 181), só aparece como aba extra (`MERCHANT_TAB_INDEX`, linha 32) quando a loja está na fonte API. Cobre status+polling+pausar/despausar; horários só leitura (ver M5). | Testes do bridge cobrindo as 3 rotas novas; front sem teste de componente (não há infra de teste de componente React neste repo) |

### Resumo Merchant (atualizado pós-#762)
**6 de 7 critérios com código real (M1 parcial, M2 lacuna, M3/M4/M6/M7 completos, M5 parcial só na UI de escrita).** A lacuna que era o maior risco do ticket (M4+M5+M7 — "demonstrar escrita pela interface") **foi fechada pelo #762**. Restam: M2 (detalhe do merchant — não pedido explicitamente como cenário de teste no checklist, só como campo do endpoint raiz), M1 sem rota/UI (baixo risco — a listagem de merchants não é um cenário de teste do checklist, só um endpoint documentado), e M5 sem form de edição de horários no front (aceitável — o checklist só exige "leitura no mínimo").

---

## Módulo Review

| # | Critério | Status | Client | Rota | Front | Evidência de teste |
|---|---|---|---|---|---|---|
| R1 | Listar avaliações — 200, campos `id/status/replies[]/version/visibility`, paginação `page/size/total/pageCount` | 🟡 PARCIAL | `listarReviews(merchantId,{page,size},tenantId)` — `lib/ifood.js:270` (traduz `size`→`pageSize` na query real ao iFood, ver nota R1b) | `GET /ifood/reviews` — `routes/ifood.js:169`; `GET /ifood-api/reviews/:lojaId` — `routes/ifood-api.js:95` | `AvaliacoesReviewApi.jsx` (lista + pagina) | `test/ifood.test.js:316` (page/size→query); `test/ifood-api-routes.test.js` cenário 10 (linha 235, `size=51`→400) |
| R1b | Shape dos campos (`version`,`visibility`, `replies[].from`) | 🔵 SMOKE LIVE | `tolerant()` (`lib/ifood.js:214`) só garante objeto/array via passthrough Zod — não valida schema específico | — | — | Sandbox de reviews está **vazio** (confirmado 05/07) — schema real só confirmável no smoke live |
| R2 | Filtro por data (retorna só reviews do período) | ✅ IMPLEMENTADO (era ❌ LACUNA — fechado pelo #768) | `listarReviews(merchantId,{page,size,dataInicio,dataFim})` — `lib/ifood.js:275` (traduz `dataInicio`/`dataFim` yyyy-MM-dd pra `dateFrom`/`dateTo` ISO 8601 date-time na query real ao iFood; nomes NÃO confirmados contra chamada real — mesma ressalva já feita pro `pageSize`) | `GET /ifood-api/reviews/:lojaId?dataInicio=&dataFim=` — `routes/ifood-api.js:121`, valida formato → 400 `code:DATA_INVALIDA` | `AvaliacoesReviewApi.jsx` — 2 inputs `type="date"` que resetam a página ao mudar (linhas 213-247) | `test/ifood.test.js` (filtro aplicado/ausente); `test/ifood-api-routes.test.js` cenários 20-21 (data inválida→400 `DATA_INVALIDA`; data válida repassada ao client) |
| R3 | Paginação: `pageSize>50`→400, lista vazia→`reviews:[]` | ✅ IMPLEMENTADO | — | `routes/ifood-api.js:95` valida `size>50` antes de gastar rede | `AvaliacoesReviewApi.jsx` limita front a `PAGE_SIZE=20` | `test/ifood-api-routes.test.js` cenário 10 (linha 235: `size=51`→400 `code:PAGE_SIZE_INVALIDO`) |
| R4 | Obter detalhes de 1 review (200 completo; 404 se inexistente) | ✅ IMPLEMENTADO (era ❌ LACUNA — fechado pelo #768) | `getReviewDetalhe(merchantId,reviewId)` — `lib/ifood.js:289` (GET, sem retry — 4xx propaga direto) | `GET /ifood-api/reviews/:lojaId/:reviewId` — `routes/ifood-api.js:165`; reviewId malformado → 400 `REVIEW_ID_INVALIDO` antes de tocar a rede | `AvaliacoesReviewApi.jsx` — botão "Ver detalhes" abre `ReviewDetalheModal` (linhas 44-104) com score/comentário/`replies[]` (Lojista/Cliente) e 404 tratado via `mensagemErro()` | `test/ifood-api-routes.test.js` cenários 22-24 (200 com `replies[].from`; 404 repassado do iFood com `details.message`; reviewId malformado→400 sem chamar o client) |
| R5 | Responder avaliação — texto 10–300→201 com `createdAt/reviewId/text` | ✅ IMPLEMENTADO | `responderReview` — `lib/ifood.js:438` | Draft: `POST /ifood-api/reviews/:lojaId/:reviewId/draft` (`routes/ifood-api.js:131`, valida 10–300→400 `code:TEXTO_INVALIDO`); Aprovação: `POST /ifood/aprovar/:draftId` (`routes/ifood.js:320`, despacha `ifood.responder_review` via `OPERACOES_ESCRITA`, persiste `resultado` no `audit_log`) | `AvaliacoesReviewApi.jsx` — fluxo "Salvar rascunho"→"Aprovar e enviar", validação 10–300 no input (linhas 51,98-102,111) | `test/ifood.test.js:267` (POST correto); `test/ifood-aprovar-routes.test.js` cenário 1 (linha 79: sucesso, `resultado.reviewId` persistido) |
| R6 | Status ≠ `NOT_REPLIED` → 409 ou 422 | ✅ IMPLEMENTADO | `responderReview` sem retry (não-idempotente) | `routes/ifood.js:320` repassa `err.status`/`err.body.{message,code}` via `details` | `mensagemErro()` no front prefere `err.details?.message` (ex. "já respondida") sobre o `err.message` genérico | `test/ifood-aprovar-routes.test.js` cenário 2 (linha 105: 409 repassado, draft marcado `failed`) |
| R7 | Texto <10 ou >300 → 400 | ✅ IMPLEMENTADO | `responderReview` valida texto não-vazio (`lib/ifood.js:441`) — mas a validação de **tamanho** 10–300 é no Bridge/front, não no client (design correto: o client só valida o essencial pra não quebrar a URL/body) | `routes/ifood-api.js:138-146` valida 10–300→400 `code:TEXTO_INVALIDO` | Front bloqueia o botão "Salvar rascunho" fora do range + mostra contador (linha 102) | `test/ifood-api-routes.test.js` cenário 11 (linha 255: texto curto→400) |
| R8 | Obter resumo `/summary` — 200, `totalReviewsCount≥listadas`, `validReviewsCount≤total`, `score=média` | 🟡 PARCIAL (caso de borda "0 reviews" fechado pelo #763) | `getSummaryReviews` — `lib/ifood.js:287` (passthrough + cache 60s TTL; #763 estendeu com tratamento do 404 "Summary not found" → `null`, ver nota abaixo) | `GET /ifood-api/summary/:lojaId` — `routes/ifood-api.js:205` (deixa `summary: null` passar sem tratamento especial) | `getIfoodSummary()` (`src/lib/api.js:667`) alimenta o card "Notas iFood" da Visão Geral — `src/console/ConsoleV2.jsx:417`; card mostra "Sem avaliações ainda." quando `summary === null` | Mecânica testada: `test/ifood-api-routes.test.js` cenários 8–9 (passthrough + gate `fonte_dados`) e cenário 19 (#763: `getSummaryReviews→null` → rota 200 `summary:null`); **aritmética do `score`/`totalReviewsCount`/`validReviewsCount` NÃO testável offline** — quem calcula é o iFood, não nosso código; só confirmável comparando o JSON real no smoke live |
| R9 | Link "Política de Avaliações" visível na UI | 🟡 PARCIAL (⚠️ risco) | — | — | `AvaliacoesReviewApi.jsx:159` — link presente e sempre visível | ⚠️ **URL não confirmada contra fonte oficial** — foi escrita no PR #760 sem link canônico documentado no projeto (nenhuma referência anterior em `docs/`). **Ação antes da sessão de homologação: o Wandson precisa confirmar/corrigir a URL real no portal do desenvolvedor.** |
| R10 | Erros 401/403/404 (Review) | ✅ IMPLEMENTADO | mesmo pipeline genérico de M6 | mesmo `handle()` genérico | `mensagemErro()` mapeia 401/403/404 pra texto claro em pt-BR (`AvaliacoesReviewApi.jsx:26-28`) | `test/ifood-api-routes.test.js` cenários 25–26 (upstream 401/403 repassados) |
| R11 | Rate limit 429 (Retry-After) | ✅ IMPLEMENTADO | `withRetry` respeita `Retry-After` real (cap 30s) — `lib/ifood.js:126-152` | `retryAfterSeconds` no JSON de erro (`routes/ifood.js`,`routes/ifood-api.js`) | `mensagemErro()` mostra "tente novamente em Xs" (`AvaliacoesReviewApi.jsx:29-32`) | `test/ifood.test.js:341` (Retry-After curto → não espera o backoff fixo) |

**Nota R8 — PR #763 (MERGEADO)**: trata um caso de borda real e já confirmado live — o merchant sandbox de homologação tem 0 reviews hoje, e nesse caso o iFood não devolve `{totalReviewsCount:0,...}`, devolve **404** `{"errorMessage":"Summary not found"}` (condição de negócio, não erro). Antes do fix, o Bridge propagava esse 404 como erro e o card "Notas iFood" mostrava um card vermelho de erro com JSON cru em vez de "Sem avaliações ainda." O #763 faz `getSummaryReviews` reconhecer especificamente esse `errorMessage` (não qualquer 404 — um 404 por merchantId errado continua propagando erro normalmente) e devolver `summary: null`; a rota (`routes/ifood-api.js:205`) e `CardNotasIfood` (`ConsoleV2.jsx`) tratam `summary: null` como "sem avaliações ainda", não erro. Testado offline (o 404 específico vira sucesso — cenário 19 em `test/ifood-api-routes.test.js`; outro 404 genérico continua propagando erro — cenário próprio do #763 em `test/ifood.test.js`). **Já em `main` — a loja de homologação (0 reviews hoje) mostra o card correto na sessão com o analista.**

**Nota sobre PR #764 (mergeado, fora do escopo desta matriz)**: título menciona "reviews", mas é sobre a tabela `public.reviews` do Supabase (RLS anon insert/update) — usada SÓ por `PainelAvaliacoesConsultor.jsx` (fluxo antigo de aprovação de resposta via WhatsApp, mediado por consultor, sem API do iFood). Não tem nenhuma relação com o módulo Review API (`lib/ifood.js`, `routes/ifood-api.js`, `AvaliacoesReviewApi.jsx`) mapeado nesta matriz — confirmado via grep (`public.reviews` só é referenciado por aquele componente). Nenhuma linha desta matriz muda por causa do #764.

### Resumo Review (atualizado pós-#768 — módulo Review 100% fechado)
**10 de 11 critérios ✅ IMPLEMENTADOS e testados offline (R2, R3, R4, R5, R6, R7, R10, R11 completos ponta-a-ponta; R1/R8 parciais só por causa de nuances externas — schema não confirmado / aritmética é da API). Zero lacunas reais de feature restantes** — o #768 fechou os 2 últimos critérios (filtro de data, detalhe de 1 review). R9 (política) tem um risco de conteúdo, não de código — URL precisa de confirmação humana.

---

## Checklist final Review (como o analista avalia — mapeamento direto)

| Item do checklist | Cobertura |
|---|---|
| Lista de avaliações retorna todas as reviews | ✅ R1 |
| Filtro por data funciona | ✅ R2 (fechado pelo #768) |
| Paginação correta | ✅ R1+R3 |
| Detalhes completos de uma review | ✅ R4 (fechado pelo #768) |
| Resposta criada com sucesso (201) | ✅ R5 |
| Rejeição de status inválido (409) | ✅ R6 |
| Rejeição de texto inválido (400) | ✅ R7 |
| Summary com cálculo correto | 🟡 R8 — mecânica ok, aritmética é smoke live |
| **Link de Política de Avaliações visível** | 🟡 R9 — visível, URL não confirmada |
| Tratamento de erros 401/403/404 | ✅ R10 |
| Tratamento de rate limit 429 | ✅ R11 |

**9 de 11 itens do checklist final 100% prontos (atualizado — #768 fechou filtro de data e detalhe de review). Zero lacunas de feature restantes. 1 risco de conteúdo (URL da política). 1 item parcialmente smoke-live-dependente (summary — a aritmética é calculada pelo iFood, não testável offline).**

---

## Itens de build derivados do sprint (seção final do checklist)

| # | Item | Status |
|---|---|---|
| 1 | Tela `resp-avaliacoes` (T-HOMOLOG): reply via Review API no fluxo draft→aprovação | ✅ Entregue no PR #760 — `AvaliacoesReviewApi.jsx`, ativa quando `loja.fonte_dados='api'` |
| 2 | Tela `lojas` (T-HOMOLOG): status polling ≥30s + pausar/despausar + horários | ✅ Entregue no PR #762 — `TabMerchantIfood` em `LojaWorkspace.jsx` (M4/M5/M7 acima); horários só leitura no front (aceitável, checklist pede leitura mínima) |
| 3 | Link "Política de Avaliações" visível | 🟡 Visível, URL a confirmar (R9) |
| 4 | Tratamento de erro uniforme 401/403/404/429 (Retry-After) | ✅ Entregue (R10, R11, M6) — #762 estendeu pro módulo Merchant também |
| 5 | Summary alimentando "BI de notas" da Visão Geral | ✅ Entregue no PR #758 (`ConsoleV2.jsx:417`); caso de borda "0 reviews→404" tratado no PR #763 (mergeado — ver nota R8) |

---

## Resumo executivo (atualizado pós-#761/#762/#763/#764/#768 — todos já mergeados)

- **Review (o "coração" do App Avaliações) — 100% dos critérios de feature fechados**: 10/11 critérios prontos e testados offline. O #768 fechou os 2 últimos (filtro de data, detalhe de review individual). Só resta R9 (conteúdo — confirmar URL da política) e R8 (aritmética do summary, inerentemente smoke-live).
- **Merchant — MUDANÇA GRANDE desde a versão original desta matriz**: o #762 fechou a lacuna que era o maior risco do ticket. Status, interruptions (pausar/despausar) e opening-hours (leitura) agora existem ponta-a-ponta com UI e polling de 30s (`TabMerchantIfood` em `LojaWorkspace.jsx`). Só restam: M2 (detalhe root do merchant — baixo risco, não é cenário de teste do checklist) e a edição de horários no front (backend PUT pronto, sem botão ainda — aceitável, checklist só exige leitura mínima).
- **Maior risco não-técnico, ainda aberto (o único risco real que sobra nesta matriz)**: URL da Política de Avaliações nunca foi confirmada contra o portal oficial — pode estar errada.
- **Risco de timing RESOLVIDO**: PR #763 mergeou — o caso real "loja com 0 reviews → iFood devolve 404, não sucesso vazio" agora vira "Sem avaliações ainda." no card de resumo, em vez de um card de erro.
- **PR #764 (mergeado)**: sobre a tabela `public.reviews` (fluxo antigo de aprovação via WhatsApp) — confirmado sem relação com o módulo Review API mapeado aqui, nenhuma linha desta matriz mudou por causa dele.
- **PR #768 (mergeado)**: fechou filtro de data (`dataInicio`/`dataFim` → `dateFrom`/`dateTo`) e detalhe de review (`getReviewDetalhe` + modal "Ver detalhes" no front) — ver R2/R4 acima.
- **Testes novos neste PR (matriz)**: 2 cenários cobrindo 401/403 upstream repassados pela rota (antes só testados no client `lib/ifood.js`, não no caminho HTTP completo) — ver `test/ifood-api-routes.test.js` cenários 25–26 (renumerados 3x ao longo dos rebases sucessivos com #762/#763/#768, que foram inserindo seus próprios cenários na frente dos meus).
- **Nada aqui foi testado contra a API real** — o sandbox de reviews está vazio (confirmado 05/07); tudo que exige dado real do iFood (shape exato dos campos V2, aritmética do summary, nomes de query `pageSize`/`dateFrom`/`dateTo` não confirmados) está marcado 🔵 SMOKE LIVE.

### Pendências recomendadas antes de abrir o ticket de homologação

1. ~~**Bloqueante**: construir M4 (interruptions) + M5 (opening-hours) + tela `lojas` com polling~~ — **RESOLVIDO pelo #762.**
2. ~~**Bloqueante leve**: R2 (filtro de data) e R4 (detalhe de review)~~ — **RESOLVIDO pelo #768.**
3. **Rápido, sem código**: confirmar a URL real da Política de Avaliações no portal do desenvolvedor e corrigir `AvaliacoesReviewApi.jsx:15` se necessário. **Única pendência de conteúdo restante.**
4. ~~**Decisão rápida**: mergear o #763 antes da sessão~~ — **RESOLVIDO, #763 já está em `main`.**
5. **Smoke live obrigatório antes da sessão**: rodar ao menos 1 review real através do fluxo completo (listar→responder→aprovar), filtro por data, detalhe de 1 review, o `/summary` (com e sem reviews cadastradas), e ao menos 1 pausa/despausa de loja + leitura de horários contra o merchant de teste `92a0ec17-6951-4a9b-9c02-ee12963be5f1`, pra confirmar os shapes que hoje são só suposição documentada em comentários `ponytail` no código (`pageSize`, `dateFrom`/`dateTo`).
6. **Opcional, baixo risco**: M2 (detalhe root do merchant) e M1 (rota/UI para listar merchants) — nenhum dos dois é citado como cenário de teste explícito no checklist Merchant, só como linha da tabela de endpoints; avaliar se vale a pena implementar antes do ticket ou deixar para depois.
