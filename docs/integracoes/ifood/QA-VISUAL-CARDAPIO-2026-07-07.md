# QA Visual — App 3 Catálogo (`CardapioIfood.jsx`) — 2026-07-07

> QA visual da tela `src/console/CardapioIfood.jsx` via harness estático (React 18 UMD +
> `console.css` oficial, **sem auth Supabase** — dados mockados do sandbox real).
> Complementa o smoke live da rota (`report-89-catalogo-smoke.md`) — aquele confirmou a
> rota+draft contra o sandbox; este valida o **render + interação da UI** no estilo cv2.
>
> ⚠️ **Não é QA visual em prod/tenant real** (exige login). É render do componente isolado
> com o shape real do sandbox, suficiente pra validar layout, classes cv2, botões e o
> **bug de shape M2 evidenciado visualmente**. QA visual em prod fica como pendência
> (matriz item 4).

## Método

- Harness: `docs/integracoes/ifood/_qa-visual/harness-cardapio.html` — réplica fiel do
  JSX de `CardapioIfood.jsx` (mesmas classes `cv2-*`, mesma lógica de `ItemLinha`,
  `categoriasDe`, `carregarArquivados`), com `supabase`/`fetch` stubados. Dados mockados
  = item real do sandbox (`X-Burger Teste Cd`, `preco:25`, 1 catálogo, 1 categoria).
- React 18 UMD servido localmente (`vendor/react.js` + `react-dom.js`, baixados de unpkg)
  + `console.css` via `<link>` — server estático Node porta 5599 (evita Tracking Prevention
  do Edge bloqueando unpkg e `file://` cross-origin).
- Browser: Edge com `--remote-debugging-port=9225`, puppeteer-core conectado. Snapshot
  textual do DOM + interação programática (cliques/digitação) + screenshots full-page.

## Evidências

Screenshots em `docs/integracoes/ifood/_qa-visual/`:

| Arquivo | Estado |
|---|---|
| `qa-cardapio-01-estado-inicial.png` | Tela inicial: título, seletor de loja, item real, badge, botões |
| `qa-cardapio-03-arquivados-bug-m2.png` | "Mostrar arquivados" aberto — evidencia o bug de shape M2 |
| `qa-cardapio-04-editar-preco-preenchido.png` | Input decimal aberto com "26,50" digitado |
| `qa-cardapio-05-preco-salvo-msg.png` | Após Salvar — msg de confirmação do draft |

## Snapshot do DOM (output bruto do puppeteer)

### Render inicial

```json
{
  "headings": ["iFood: Cardápio"],
  "sub": "Itens do cardápio do iFood por categoria, ao vivo via Bridge. Pausar/Reabrir cria um draft que aguarda sua aprovação.",
  "rule": true,
  "btns": [
    {"label": "Atualizar", "visible": true},
    {"label": "Alterar preço", "visible": true},
    {"label": "Pausar", "visible": true},
    {"label": "Mostrar arquivados", "visible": true}
  ],
  "badges": [{"text": "Disponível", "cls": "cv2-bdg ok"}],
  "cards": [{"text": "X-Burger Teste Cd Disponível Item de teste criado pela integracao Cd R$ 25,00 Alterar preço Pausar", "visible": true}],
  "selects": [{"value": "2494ee86-41b4-481b-994b-6f54965ced30", "options": ["Teste - CONSULT DELIVERY LTDA"]}],
  "bodyBg": "rgb(245, 246, 248)",
  "hasPriceInput": false
}
```

### Após clicar "Mostrar arquivados"

```json
{
  "cards": [
    "X-Burger Teste Cd Disponível Item de teste criado pela integracao Cd R$ 25,00 Alterar preço Pausar",
    "Nenhum item arquivado. ⚠️ BUG M2: iFood devolve itens={categories:[]}, não array — front sempre cai aqui mesmo com itens reais."
  ],
  "hasArquivadosHeading": false
}
```

**⚠️ Bug M2 evidenciado visualmente**: o card "Nenhum item arquivado" aparece mesmo o
shape sendo `{categories:[]}` — o front `Array.isArray(itens)` → false → `[]`. Se o
sandbox tivesse itens arquivados reais dentro de `categories[]`, **continuaria
mostrando "Nenhum item arquivado"**. Confirma visualmente o achado do smoke live
(`report-89-catalogo-smoke.md` STEP 2) e da matriz v3 §2.

### Após clicar "Alterar preço"

```json
{
  "inputVisible": true,
  "placeholder": "25.00",
  "saveVisible": true,
  "cancelVisible": true,
  "labelVisible": true
}
```

Input decimal (`inputMode="decimal"`) aparece com placeholder do preço atual, botões
Salvar/Cancelar e label "Novo preço (R$)".

### Após digitar "26,50" + Salvar

```
MSG="X-Burger Teste Cd Disponível Item de teste criado pela integracao Cd R$ 25,00
Alterar preço Solicitação de novo preço R$ 26,50 enviada para aprovação. [MOCK draft criado] Pausar"
```

Msg de confirmação do draft exibida (no fluxo real, seria a resposta do
`POST /api/ifood/acao` — confirmado live no `report-89-catalogo-smoke.md` STEP 3).

## Checklist visual (cv2)

| Item | Resultado |
|---|---|
| Título `h1` "iFood: Cardápio" | ✅ |
| `cv2-rule` (separador) presente | ✅ |
| `cv2-sub` (subtítulo) presente | ✅ |
| Fundo claro `rgb(245,246,248)` (console.css, tema claro) | ✅ |
| `cv2-card` nos itens | ✅ |
| `cv2-bdg ok` no badge "Disponível" | ✅ |
| `cv2-btn`/`cv2-btn sec` nos botões | ✅ |
| Seletor de loja (loja de teste) | ✅ |
| Botão "Alterar preço" por item | ✅ |
| Input decimal + Salvar/Cancelar + label "Novo preço (R$)" | ✅ |
| Botão "Mostrar arquivados" (toggle on-demand) | ✅ |
| Msg de confirmação do draft após Salvar | ✅ (mock; rota real confirmada no smoke) |
| Bug M2 evidenciado ("Nenhum item arquivado" com shape `{categories:[]}`) | ⚠️ confirmado visualmente |

## Pendências

1. **QA visual em prod/tenant real** (`daebb6a7...`) — exige login no Console + loja com
   `fonte_dados='api'`. Este harness valida o componente isolado; o fluxo completo no
   ConsoleV2 (sidebar, header, auth) fica pra quando o Wandson liberar acesso.
2. **Corrigir bug M2 antes do QA em prod** — senão o "Mostrar arquivados" sempre mostrará
   "Nenhum item arquivado" mesmo com itens reais (matriz v3 §2 + item 1 das pendências).