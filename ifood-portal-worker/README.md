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

---

# Fase 2 — `gerarResposta(avaliacao)` (geração por IA)

`gerarResposta.js` recebe uma avaliação lida (`{ nota: 1-5, comentario, autor? }`) e devolve um
**texto de resposta PERSONALIZADA em PT-BR**, em nome da **Café Container**, pronto para ser
publicado como resposta à avaliação.

- **Nota baixa (1–3):** empatia + reconhece o problema específico citado + sinaliza melhoria, sem
  ser defensivo e sem prometer o impossível.
- **Nota alta (4–5):** agradecimento caloroso e específico ao que o cliente elogiou.
- Sempre humano, profissional e **curto**; saída validada por Zod (20–600 chars, sem placeholders).

## ⚠️ Esta fase SÓ GERA TEXTO

O texto é um **DRAFT** (semáforo amarelo). `gerarResposta` **não** abre o portal, **não** preenche e
**não** envia. O envio é supervisionado pelo Wandson ao vivo numa **fase posterior** — nada vai a
cliente aqui.

## Credencial (lazy, sem hardcode)

Resolve a key só na chamada: prioriza **`ANTHROPIC_API_KEY`** (padrão do projeto). Se ausente no
ambiente, lê de `bridge-server/.env` (apenas leitura) e, como camada multi-provider já decidida no
épico (D1), cai para **`OPENROUTER_API_KEY`** rodando o mesmo modelo Claude (`claude-sonnet-4.6`).
Sem nenhuma das duas → erro claro. Nenhuma chave é hardcoded e nenhum segredo é impresso.

## Smoke de geração (prova a Fase 2)

```bash
cd ifood-portal-worker
npm install
node smoke-gerar.js
```

Gera 2 respostas — (a) negativa fictícia (nota 2, demora + comida fria) e (b) caso real da Fase 1
(Pedido 6975, nota 5) — imprime o **texto bruto** e valida cada uma. Prova real (2026-06-30,
via fallback OpenRouter pois `ANTHROPIC_API_KEY` não está provisionada neste ambiente):

```
NOTA 2 → "Sentimos muito por essa experiência, receber o lanche frio depois de tanta espera é
realmente frustrante... Estamos trabalhando para melhorar nossos prazos de entrega e a conservação
dos pedidos no caminho. Esperamos ter a chance de reconquistar sua confiança..." (304 chars)

NOTA 5 → "Que alegria receber esse carinho! Fico muito feliz que a comida tenha agradado, que a
entrega chegou rapidinho e que a embalagem caprichou no cuidado. Obrigado por recomendar..." (210 chars)
```
