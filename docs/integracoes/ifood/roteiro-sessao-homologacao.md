# Roteiro — Sessão de Homologação iFood (~45 min, App Avaliações)

> Ordem exata de demonstração pro analista do iFood. Cada passo cita o critério do checklist (`homologacao-checklist-avaliacoes.md`) e da matriz de cobertura (`homologacao-matriz-cobertura.md`) que ele prova, com o status real (✅ confirmado live nos smoke tests de 2026-07-06, 3 rodadas verdes) ou a ressalva quando algo é só teste offline.
>
> **Base**: `homologacao-matriz-cobertura.md` (estado de código) + relatório de smoke live (sessão consult-delivery-87, 3 rodadas). Nenhum passo aqui demonstra algo que não esteja implementado e testado — se um critério do checklist não tem como ser mostrado hoje (ex.: review real, aritmética do summary), o roteiro diz isso explicitamente em vez de fingir.

## Antes de começar

- **Login**: usuário `qa-homolog@consultdelivery.com.br` (criado via runbook `docs/runbooks/homolog-demo-users.md`, role `admin` no tenant `cd-homolog`). Senha em arquivo local do Wandson — nunca neste doc.
- **Tenant**: `cd-homolog` ("Homologação iFood") — allowlist de **8 telas** (`tenant_modules`, migration `20260706_002`): `visao`, `lojas`, `resp-avaliacoes`, `aprovacoes`, `auditoria`, `notificacoes`, `acesso`, `configsys`. Qualquer coisa fora dessa lista **não aparece no menu** — não precisa evitar clicar, o allowlist já esconde.
- **Loja/merchant de teste**: loja `2494ee86-41b4-481b-994b-6f54965ced30` (`fonte_dados='api'`), merchant iFood `92a0ec17-6951-4a9b-9c02-ee12963be5f1` ("Teste - CONSULT DELIVERY LTDA"). É o merchant sandbox usado nos 3 smoke tests — todo comportamento abaixo já foi confirmado ao vivo nele.
- **Sandbox sem reviews reais hoje** — avise o analista antes de entrar na tela de avaliações (ver passo 3).

---

## Passo 1 — Login e Visão Geral (`visao`)

1. Login com `qa-homolog`.
2. Mostrar a Visão Geral — card "Notas iFood" (BI de summary).

**Prova**: item 5 dos "itens de build derivados" (summary alimentando a Visão Geral, PR #758). Como o sandbox tem 0 reviews, o card mostra **"Sem avaliações ainda."** — não um erro. Isso É o comportamento correto (PR #763): dizer isso ao analista antes de abrir, para não parecer bug.

**Confirmado live**: smoke item 1 (Rodada 1) — `GET /ifood-api/summary/:lojaId` → 200 `summary:null`.

---

## Passo 2 — Tela `lojas` → aba Merchant iFood

Abrir a loja de teste → aba "Merchant" (`TabMerchantIfood`, só aparece quando `fonte_dados='api'`).

### 2.1 — Status da loja (polling)

Mostrar o indicador de status e dizer que atualiza sozinho a cada 30s (`MERCHANT_STATUS_POLL_MS`, comentário no código: "mínimo exigido pelo checklist — não reduzir").

**Prova**: checklist Merchant — `GET /merchants/{id}/status` (state) + "Polling mínimo de 30 segundos para status" (considerações finais).
**Confirmado live**: smoke item 4 — hoje a loja de teste aparece **`state:"ERROR"` / "Loja fechada"** (achado real do sandbox — dizer isso ao analista, não é falha da integração).

### 2.2 — Pausar a loja (Interruptions — escrita)

1. Preencher o form "Pausar loja" (início/fim/motivo) e clicar "Solicitar pausa".
2. Mostrar que isso cria um **draft amarelo** (não pausa a loja ainda) — abrir a tela `aprovacoes` e mostrar o draft pendente.
3. Aprovar o draft.
4. **Avisar o analista**: a listagem de pausas pode levar até ~1 minuto pra refletir a pausa recém-aprovada — é comportamento do iFood (a API só lista pausas com `start` já no passado), não bug nosso. A UI já mostra um aviso disso (banner de cooldown, PR #778) — não repita o clique.

**Prova**: `POST /merchants/{id}/interruptions` → 201 (criar pausa) + fluxo draft→aprovação exigido pelo checklist ("Merchant exige demonstrar escrita pela interface").
**Confirmado live**: smoke Rodada 3 (R3.2→R3.4b) — pausa criada de verdade no sandbox, `resultado.id` = prova do 201 upstream real.

### 2.3 — Despausar a loja (DELETE)

Repetir o fluxo: draft → aprovar → confirmar que a pausa some da listagem (mesma ressalva de latência do 2.2).

**Prova**: `DELETE /merchants/{id}/interruptions/{id}` → 204.
**Confirmado live**: smoke Rodada 3 (R3.5→R3.7) — `resultado:null` = prova do 204 upstream (corpo vazio); sandbox devolvido ao estado limpo.

### 2.4 — Horários de funcionamento (leitura)

Mostrar a lista de turnos (só leitura — sem botão de editar; o checklist exige "leitura no mínimo").

**Prova**: `GET /merchants/{id}/opening-hours`.
**Confirmado live**: smoke item 6 — 7 turnos (1 por dia), hoje configurados `00:00–23:59` no sandbox (config default, mencionar se perguntado).
**Ressalva a dizer se perguntarem**: o `PUT` de horários já está implementado no backend (via draft→aprovação, mesmo padrão da pausa), mas ainda não tem botão no front — não demonstrar, dizer que está pronto pra habilitar se o checklist exigir.

---

## Passo 3 — Tela `resp-avaliacoes` ("Avaliações iFood")

**Antes de abrir**: avisar o analista que o **sandbox de reviews está vazio hoje** — a demonstração abaixo prova o mecanismo (chamadas reais à API, validação, fluxo de aprovação), não o conteúdo de uma review específica.

### 3.1 — Listar avaliações

Abrir a tela — mostrar a lista (vazia) e a paginação.

**Prova**: `GET /reviews` — lista básica, campos de paginação (`page`/`size`/`total`/`pageCount`).
**Confirmado live**: smoke item 2 — `reviews:[]`, `page:1 size:10 total:null pageCount:null` (envelope de paginação real confirmado; o objeto de 1 review em si não, por falta de dado).

### 3.2 — Filtro por data

Preencher os 2 campos de data e mostrar que a lista recarrega (continua vazia, mas a chamada muda).

**Prova**: "Filtro por data (retorna só reviews do período)".
**Confirmado live**: smoke itens 8-9 (Rodada 2) — filtro aceito e traduzido corretamente pro formato real do iFood (`dataInicio=2026-06-01` → `dateFrom=2026-06-01T00:00:00-03:00`); formato inválido → 400 claro (ver passo 4).

### 3.3 — Limite de página

Se o analista pedir para forçar `size > 50`: mostrar o erro 400 (ver passo 4) — não é necessário ter reviews pra provar esse critério.

### 3.4 — Detalhe de 1 review

**Sem review real no sandbox, este passo não tem o que abrir.** Explicar ao analista: o botão "Ver detalhes" e o modal existem e estão testados (offline + o caminho de erro 404 confirmado live — passo 4), só falta 1 review real pra demonstrar o 200 com dado. Oferecer mostrar o código/teste se pedirem prova adicional.

### 3.5 — Responder avaliação (draft → aprovação)

**Também sem review real pra responder de verdade.** Se o analista aceitar, demonstrar com uma avaliação FICTÍCIA digitada só pra mostrar a validação:
1. Digitar um texto com menos de 10 caracteres → mostrar o aviso visual (contador vermelho, botão desabilitado).
2. Digitar um texto válido (10–300 chars) → "Salvar rascunho" → mostrar que isso cria um draft (aba `aprovacoes`), **não publica nada ainda**.
3. Não aprovar esse draft específico (não há review real por trás — aprovar geraria erro 404/409 do iFood, que é o comportamento correto, mas não é o objetivo desta demo).

**Prova**: validação 10–300 chars (client+bridge) + fluxo draft→aprovação (nunca publica sem aprovação humana).
**Confirmado offline**: 3 cenários de teste (`test/ifood-api-routes.test.js`) cobrindo texto curto/longo/válido. **Não confirmado live** (exige 1 review real) — dizer isso com transparência.

### 3.6 — Link "Política de Avaliações"

Mostrar o link visível na tela.

**Prova**: exigência literal do checklist ("Link de Política de Avaliações visível na UI").
⚠️ **Atenção antes da sessão**: confirmar com o Wandson se a URL apontada está correta contra o portal oficial do desenvolvedor — nunca foi validada contra uma fonte canônica (ver matriz de cobertura, nota R9).

---

## Passo 4 — Tratamento de erros (400/404/409/429)

Estes cenários são rápidos de mostrar e **não dependem de reviews reais** — são os mais seguros da sessão porque já foram confirmados ao vivo:

| Cenário | Como provocar | O que mostrar | Confirmado live |
|---|---|---|---|
| 400 (paginação) | `size=51` na URL/query da lista | Mensagem clara, não JSON cru | Smoke item 3 |
| 400 (data inválida) | Data em formato errado (ex. `01-06-2026`) no filtro | Mensagem clara | Smoke item 9 |
| 400 (texto de resposta) | Texto <10 ou >300 chars no formulário de resposta | Contador vermelho + botão desabilitado | Offline (3.5 acima) |
| 404 (review inexistente) | Só demonstrável via chamada direta (não há UI pra digitar um ID de review) — mencionar que está testado e confirmado live | — | Smoke item 10 |
| 409 (review já respondida) | Não demonstrável hoje (exige review real já respondida) — mencionar que existe e está testado offline | — | Offline (`test/ifood-aprovar-routes.test.js`) |
| 429 (rate limit) | Não provocável de propósito com segurança — mencionar que o client respeita o header `Retry-After` do iFood (cap de 30s) e a UI mostra "tente novamente em Xs" | — | Testado offline (`test/ifood.test.js`) |

**Se o analista perguntar por que 404/409/429 não são demonstrados ao vivo**: são cenários de erro que exigem provocar uma falha real (review inexistente/já respondida, ou esgotar o rate limit) — o comportamento está implementado, testado (offline + 404 confirmado ao vivo no smoke), e a resposta é sempre uma mensagem clara em vez de erro cru, nunca um crash.

---

## O que NÃO mostrar

- **Qualquer tela fora da allowlist de 8 telas do `cd-homolog`** (`visao`, `lojas`, `resp-avaliacoes`, `aprovacoes`, `auditoria`, `notificacoes`, `acesso`, `configsys`) — o allowlist (`tenant_modules`) já esconde tudo o resto do menu, então isso é automático, não uma disciplina manual. Se o analista perguntar sobre algo que não aparece (CRM/Clientes, Chat ao Vivo, Cobrança/Cora, Contratos, Cardápio iFood, CSAT/NPS, Custos IA, etc.) — dizer que é fora do escopo desta homologação (App 1 = Avaliações), não que "não existe".
- **`GET /merchants` (listagem de merchants) e `GET /merchants/{id}` (detalhe root)** — não têm rota nem tela (matriz M1/M2, baixo risco, não é cenário de teste explícito do checklist). Não navegar pra lá porque não existe pra onde navegar.
- **Provocar 429 de propósito** — nunca forçar rate limit contra a API real do iFood durante a sessão (risco de bloquear o sandbox pro resto da demo). Só explicar o mecanismo.
- **Editar horários de funcionamento (PUT)** — sem botão no front hoje (ver 2.4); não fingir que existe.
- **Aprovar um draft de resposta de review fictícia** (passo 3.5) — geraria um erro real do iFood (review não existe) que não ajuda a demo. Mostrar só até "Salvar rascunho".

---

## Resumo de cobertura desta sessão

| Módulo | Critérios demonstráveis ao vivo hoje | Critérios só explicáveis (sem dado real) |
|---|---|---|
| Merchant | Status+polling (2.1), pausar/despausar loja completo (2.2-2.3), horários leitura (2.4) | Detalhe root do merchant (fora do checklist), PUT horários (sem UI) |
| Review | Listar+paginação (3.1), filtro de data (3.2), validação de texto (3.5), link política (3.6), erros 400 (passo 4) | Detalhe de review com dado real (3.4), responder de verdade (3.5 completo), 404/409/429 ao vivo (passo 4) |

Todos os itens da coluna da direita têm evidência de **teste offline** e, nos casos de 404 e do mecanismo de escrita, **confirmação live equivalente** documentada na matriz de cobertura — a limitação é só a ausência de reviews reais no sandbox, não uma lacuna de implementação.
