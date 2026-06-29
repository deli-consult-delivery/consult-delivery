# ifood-portal-worker — Fase 1 do Consultor de iFood

Worker Node + `playwright-core` que opera o **Portal do Parceiro iFood** da loja piloto
**"Café Container - Lanches e Salgados"** dirigindo o Chromium ao vivo do container
[`ifood-browser`](../ifood-browser) via **CDP** (`connectOverCDP`).

## ⚠️ Segurança — esta fase é READ-ONLY

- `listarAvaliacoesPendentes()` é **100% leitura**.
- `preencherResposta()` **preenche** o campo de resposta mas **NUNCA envia/submete/publica** —
  não existe nenhuma linha de código que clique em "Responder"/"Enviar". Além disso ela só preenche
  com a flag explícita `{ permitirPreenchimento: true }`.
- **NÃO rodar `preencherResposta` contra o portal real nesta fase** — o envio é fluxo supervisionado
  (semáforo amarelo: Wandson aprova → sistema envia) de uma fase posterior.

## Como o worker conecta ao CDP

O Chromium do `ifood-browser` expõe o CDP **só em `127.0.0.1:9222`** — o Chromium moderno ignora
`--remote-debugging-address=0.0.0.0` por segurança, então a porta **não** é alcançável pela rede
docker (`ifood-browser:9222` dá `ECONNREFUSED`). A forma que funciona é **compartilhar o network
namespace** do container e falar com `127.0.0.1`:

```bash
cd ifood-portal-worker
docker run --rm --init \
  --network container:ifood-browser \
  -v "$PWD":/app -w /app node:20-alpine \
  sh -c "npm i --omit=dev && node smoke-read.js"
```

> `connectOverCDP` **não** baixa browsers — por isso `playwright-core` (não `playwright`).
> `--init` garante que o processo é reapado e o container encerra limpo.

## Smoke de leitura (prova a Fase 1)

```bash
docker run --rm --init --network container:ifood-browser \
  -v "$PWD":/app -w /app node:20-alpine \
  sh -c "npm i --omit=dev && node smoke-read.js"
```

Saída real (loja piloto, 2026-06-29) — JSON bruto em stdout:

```json
[
  {
    "id": "6975",
    "nota": 5,
    "comentario": "Gente, maravilhoso! Muito bem preparado e parece que foi feito em casa. Parabéns, continuem assim!",
    "autor": null,
    "data": "25/06/2026",
    "status": "1 diapara responder",
    "prazo": "1 dia"
  }
]
```

## Como a leitura funciona

A área **Avaliações** do portal abre em `/reviews/search`, com uma **tabela** (`data-testid="table"`)
de colunas `Pedido | Data da avaliação | Data do pedido | Nota | Comentário | Status`.
`listarAvaliacoesPendentes()`:

1. conecta no CDP e reusa a aba principal (a que aparece no viewer ao vivo);
2. se cair em `/chains`, seleciona **"Portal do Parceiro"** (loja única) — navegação, não escrita;
3. navega para `/reviews/search` e espera a tabela;
4. retorna as linhas com **comentário** (≠ "-") e **status "… para responder"** (pendentes, não
   respondidas), validadas por Zod.

Campos:

| campo | origem |
|---|---|
| `id` | nº do pedido (coluna "Pedido") — id estável visível na lista |
| `nota` | 1–5 |
| `comentario` | texto do cliente |
| `autor` | `null` — o iFood **não** expõe o nome do cliente nesta lista |
| `data` | data da avaliação (DD/MM/AAAA) |
| `status` / `prazo` | status bruto e prazo extraído (ex.: "1 dia") |

> ponytail: lê só a 1ª página (ordenada por data desc). Pendentes têm prazo curto → ficam no topo.
> Para varrer tudo um dia: aplicar o filtro "Possui comentários=Sim" + "Status=não respondida" e paginar.

## `preencherResposta(orderId, texto, { permitirPreenchimento: true })`

Localiza a linha do pedido, clica a célula do comentário (abre o **drawer** de detalhe), e digita o
texto no `textarea[data-testid="review-details-drawer-comment-textarea"]`. Retorna
`{ ok, pedido, reviewId, orderId, preenchido: true, enviado: false }` — incluindo os UUIDs
`reviewId`/`orderId` que o portal expõe na URL do drawer. **Nunca envia.** Selecionado e provado o
caminho do drawer por sondagem read-only; o passo de envio fica para o teste supervisionado.
