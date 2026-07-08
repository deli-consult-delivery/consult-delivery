# Smoke Live — App 3 Catálogo (rodada 2026-07-07)

> Evidência bruta do smoke contra o sandbox iFood real, via Bridge deployado em prod
> (`/root/consult-delivery`, PM2 `bridge-server`, porta 3001). Loja de teste
> `2494ee86-41b4-481b-994b-6f54965ced30` (tenant `daebb6a7-76c1-492e-b872-0a37b9f36b0d`,
> merchant `92a0ec17-6951-4a9b-9c02-ee12963be5f1`, `fonte_dados='api'`).
> Credenciais via `.env` do Bridge (`IFOOD_CLIENT_ID`/`SECRET` SET, sem
> `IFOOD_HOMOLOGATION_HEADER` → header de homologação OFF por padrão, confirmado).
> Token interno: `INTERNAL_BRIDGE_TOKEN` (64 chars).

## Método

Scripts `scp`'ados pra `/tmp/smoke_cat*.sh` na VPS (evita quoting duplo
PowerShell→SSH→bash), executados com `bash`. `set -a; . .env; set +a` dentro do
script. Respostas salvas em `/tmp/*.json` e inspecionadas com `python3`.

---

## STEP 1 — M1 baseline: `GET /ifood-api/catalogo/:lojaId`

```
HTTP=200  BYTES=605
{"ok":true,"data":{"loja_id":"2494ee86-41b4-481b-994b-6f54965ced30",
"merchant_id":"92a0ec17-6951-4a9b-9c02-ee12963be5f1","cardapio":{"catalogos":[
{"catalogId":"3248add5-39ba-4b12-864f-412b3f6ebf96",
"groupId":"ffca0022-eb43-4205-9a1b-73a72f8e3f95","status":"AVAILABLE",
"categorias":[{"categoryId":"e615dd3b-ee56-4ed9-bf48-b680988d3caf",
"nome":"Teste-Cd","status":"AVAILABLE","itens":[
{"itemId":"0bb349b1-23c2-4397-8a0f-378b646398e6","nome":"X-Burger Teste Cd",
"descricao":"Item de teste criado pela integracao Cd","preco":25,
"externalCode":"CD_TESTE_XBURGER","disponivel":true,"status":"AVAILABLE"}
]}]}]}}}
```

Parse: `catalogs_n=1`, `groupId=ffca0022-...`, `catalogId=3248add5-...`,
`itens_n=1`, item real `X-Burger Teste Cd` `preco:25`. **Reproduz o
`report-88-catalogo.md` (2026-07-06)** — baseline sólido antes dos smokes-alvo.

---

## STEP 2 — M2: `GET /ifood-api/catalogo/:lojaId/unsellable/:groupId`

Com `?catalogId=` (catalogId real sobrescrevendo groupId do path):

```
HTTP=200  BYTES=248
{"ok":true,"data":{"loja_id":"2494ee86-41b4-481b-994b-6f54965ced30",
"merchant_id":"92a0ec17-6951-4a9b-9c02-ee12963be5f1",
"groupId":"ffca0022-eb43-4205-9a1b-73a72f8e3f95",
"catalogId":"3248add5-39ba-4b12-864f-412b3f6ebf96",
"itens":{"categories":[]}}}
```

Sem `?catalogId=` (cai no `groupId` do path):

```
HTTP=200
{"ok":true,"data":{...,"groupId":"ffca0022-...","catalogId":"ffca0022-...",
"itens":{"categories":[]}}}
```

**✅ Rota 200 contra o sandbox real** — path, gating e propagação funcionam.
**⚠️ Achado de SHAPE ( relevante pra M2 e o front)**: o iFood devolve
`itens={"categories":[...]}`, **NÃO** um array direto de itens. A rota do Bridge
(`routes/ifood-api.js:289`) repassa o body cru do iFood sem normalizar. O front
`CardapioIfood.jsx:249` faz `Array.isArray(itens)` → `false` → cai em `[]` →
mostra "Nenhum item arquivado" **mesmo se houver itens dentro de `categories`**.
Não crasha, mas **não exibe itens arquivados reais** quando existirem. O sandbox
de teste tem `categories:[]` (vazio), então o smoke não prova o bug em ação —
mas o shape diverge do que o front espera, é um **risco real de M2** a corrigir
antes do ticket.

---

## STEP 3 — M6: `POST /api/ifood/acao` (`ifood.alterar_preco`) — cria draft amarelo

Request:
```json
{"operacao":"ifood.alterar_preco","parametros":{"item_nome":"X-Burger Teste Cd","price":26.50}}
```

```
HTTP=200  BYTES=171
{"ok":true,"data":{"draft_id":"66b6c35c-b633-40fe-80de-f295817f69ce",
"operacao":"ifood.alterar_preco",
"content":"Alterar preço X-Burger Teste Cd no iFood para R$ 26.50"}}
```

Validação do draft no Supabase (`agent_drafts?id=eq....`):

```json
[{"id":"66b6c35c-b633-40fe-80de-f295817f69ce","status":"pending",
"autonomy_level":"amarelo","agent_name":"BRENO",
"content":"Alterar preço X-Burger Teste Cd no iFood para R$ 26.50",
"metadata":{"price":26.5,"item_id":"0bb349b1-23c2-4397-8a0f-378b646398e6",
"operacao":"ifood.alterar_preco","item_nome":"X-Burger Teste Cd",
"tenant_id":"daebb6a7-76c1-492e-b872-0a37b9f36b0d",
"product_id":"b80e2f34-1866-45ca-99c2-8462e52be473",
"merchant_id":"92a0ec17-6951-4a9b-9c02-ee12963be5f1"}}]
```

**✅ Confirmação live de M6/M7**:
- Resolução `item_nome`→`itemId` ao vivo contra o sandbox real funcionou
  (`item_id=0bb349b1...`, `product_id=b80e2f34...` — ambos reais do catálogo).
- Draft criado `amarelo/pending`, `agent_name=BRENO`, `channel=painel` — exato
  contrato do `OPERACOES_ESCRITA['ifood.alterar_preco']`.
- Metadata com `price:26.5` (number), `merchant_id`, `tenant_id` — todos os
  `argKeys` (`item_id`, `price`) presentes para o `/aprovar` despachar.
- **A escrita real (`PATCH /items/{itemId}`) NÃO foi executada** — só o draft,
  conforme o gate (amarelo = aprovação humana). Endpoint de escrita segue
  não-confirmado-live (só offline); o draft→aprovação está confirmado.

---

## STEP 4 — gates de validação server-side (não cria draft)

Preço inválido (`price:-5`):

```
HTTP=400
{"ok":false,"error":"parametros.price deve ser um número maior que zero"}
```

Item inexistente (`ITEM_FANTASMA_999`):

```
HTTP=422
{"ok":false,"error":"Nenhum item casou com o nome/externalCode informado.",
"motivo":"nao_encontrado","candidatos":[]}
```

**✅ Gates funcionam ao vivo**: preço `<=0` rejeitado ANTES de tocar a rede
(400, sem draft); item não-resolvível → 422 com `candidatos:[]` (sem draft).
Nenhum lixo em `agent_drafts`.

---

## STEP 5 — limpeza

Draft de teste deletado do Supabase:

```
DELETE_HTTP=204
```

Nenhum resíduo em prod.

---

## Resumo da rodada

| Critério | Resultado live |
|---|---|
| M1 (catálogo agregado) | ✅ 200, item real reproduzido |
| M2 (unsellableItems) | ✅ 200 (rota+gating), ⚠️ **shape `categories[]` diverge do front** |
| M6/M7 (alterar_preco, draft) | ✅ 200, draft amarelo criado com metadata correto, resolução de item live |
| M6/M7 (escrita PATCH real) | 🔲 não executada (amarelo = gated), só offline |
| Gate preço `<=0` | ✅ 400 sem draft |
| Gate item não-resolvível | ✅ 422 sem draft, `candidatos:[]` |
| `x-request-homologation` | OFF por padrão (env sem `IFOOD_HOMOLOGATION_HEADER`) |