# Estado real da suíte de testes offline — 2026-07-06

Rodado 100% offline (sem prod, sem rede real — todos os testes mockam I/O externo). 4 grupos, **30 arquivos, 100% verde**.

## Achado prévio (corrigido antes de rodar)
`bridge-server/` e `vendaerp-mcp/` têm `package.json` próprios, mas **sem `node_modules` instalado** neste worktree — rodar `node bridge-server/test/*.test.js` direto falhava com `Cannot find module 'express'` (11/18 arquivos). Resolvido com `npm install` dentro de cada pasta antes de rodar. Isso não é um bug do teste — é um passo de setup que falta documentar (nenhum README instrui `npm install` por subpasta antes de rodar os testes).

**Achado 2:** `npx vitest run` (sem escopo) varre o repo inteiro e falha em 29 arquivos com "No test suite found" — porque `bridge-server/test/*.test.js`, `trigger/**/*.test.ts` e `vendaerp-mcp/test/*.test.js` são scripts `node:assert` puros (não vitest `describe/it`), e não há `vitest.config.js` restringindo o discovery a `src/`. Comando certo: `npx vitest run src`.

---

## 1. `bridge-server/test/*.test.js` — Node puro (`node:assert`), 18 arquivos

**Comando:** `cd bridge-server && npm install` (1x) → `node test/<arquivo>.test.js` (cada um)

| Arquivo | Resultado |
|---|---|
| `asaas-webhook-rate-limit.test.js` | ✅ 2 cenários |
| `auth-integration.test.js` | ✅ 5 cenários |
| `auth-middleware.test.js` | ✅ 16 cenários |
| `breno-aprovacao.test.js` | ✅ 7/7 |
| `gestor-aprovacao.test.js` | ✅ 10/10 |
| `ifood-api-routes.test.js` | ✅ 37 cenários |
| `ifood-aprovar-routes.test.js` | ✅ 4 cenários |
| `ifood-dupla-checagem.test.js` | ✅ 7 asserções |
| `ifood-reviews-size.test.js` | ✅ todos passaram |
| `ifood-routes-acao-aprovar.test.js` | ✅ 13 cenários |
| `ifood.test.js` | ✅ 46 asserções (zero rede real) |
| `loop-autorizar.test.js` | ✅ 5/5 |
| `loop-despachar.test.js` | ✅ 5/5 |
| `loop-erp-confirm-code.test.js` | ✅ 3/3 |
| `portal-worker.test.js` | ✅ 5/5 |
| `pricing.test.js` | ✅ 4 asserções |
| `semaforo.test.js` | ✅ todas passaram |
| `vendaerp-write.test.js` | ✅ todas passaram |

**18/18 arquivos verdes.**

---

## 2. `src/**/*.test.js` — Vitest, 2 arquivos

**Comando:** `npx vitest run src`

```
✓ src/hooks/permissions-derive.test.js (8 tests) 8ms
✓ src/lib/mapErro.test.js (3 tests) 4ms

Test Files  2 passed (2)
     Tests  11 passed (11)
```

**2/2 arquivos, 11/11 testes verdes.**

---

## 3. `trigger/**/*.test.ts` — tsx (`node:assert`), 6 arquivos

**Comando:** `npx tsx <arquivo>.test.ts` (cada um; tsx é baixado on-demand via npx se não instalado)

| Arquivo | Resultado |
|---|---|
| `trigger/_shared/llm-tools.test.ts` | ✅ conversor OpenAI<->Anthropic íntegro |
| `trigger/_shared/pricing.test.ts` | ✅ calcularCustoUsd íntegro |
| `trigger/_shared/tenant-window.test.ts` | ✅ horaParaMinutos/minutosAgoraBRT/isSabadoBRT/estaNaJanela corretos |
| `trigger/agents/revisor.test.ts` | ✅ todos os asserts |
| `trigger/agents/triggered-by-uuid.test.ts` | ✅ InputSchema rejeita run_xxx, aceita ausente |
| `trigger/lara/csat-reengajamento.test.ts` | ✅ detecção/dedup/mensagem íntegros |

**6/6 arquivos verdes.**

---

## 4. `vendaerp-mcp/test/*.test.js` — Node puro, 4 arquivos (achado incidental, fora do pedido original mas existe e é offline)

**Comando:** `cd vendaerp-mcp && npm install` (1x) → `node test/<arquivo>.test.js`

| Arquivo | Resultado |
|---|---|
| `erp_confirmar.test.js` | ✅ todas passaram |
| `erp_propor.test.js` | ✅ todas passaram |
| `proposals.test.js` | ✅ todas passaram |
| `supabase.test.js` | ✅ todas passaram |

**4/4 arquivos verdes.** (Scripts `smoke`/`live-smoke`/`write-live-smoke` do `package.json` NÃO foram rodados — são testes ao vivo contra o ERP real, fora do escopo "offline, sem prod".)

---

## Resumo

**30/30 arquivos de teste offline passam, 0 falhas.** Nenhum teste quebrado foi encontrado nesta rodada.
