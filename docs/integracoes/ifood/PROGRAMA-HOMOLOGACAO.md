# Programa de Homologação iFood — Visão Executiva (3 Apps)

> Para o Wandson. 1 página: onde cada app está, o que falta, e por que a ordem é essa. Detalhe técnico fica nos docs linkados — aqui só a decisão.

## Ordem estratégica: por que Avaliações primeiro

**App 1 (Avaliações) é o único apto a abrir ticket hoje** — código completo, smoke live em 3 rodadas (leitura + escrita real confirmada), QA visual feito, achados corrigidos. Finanças e Catálogo dependem do MESMO processo de homologação no portal do iFood (1 app por vez, fila do analista) — não faz sentido abrir 2-3 tickets em paralelo pro mesmo parceiro/CNPJ enquanto o 1º ainda não tem data marcada. **A sequência é: homologar Avaliações → só então abrir o próximo ticket (Finanças, já pronto para isso).** Catálogo segue em build atrás de Finanças na fila de esforço, mas nada impede terminar o build dele em paralelo — só o *ticket* dele espera a vez.

---

## App 1 — Avaliações (Merchant + Review)

**Status: ✅ PRONTO — gates do Wandson são a única pendência**

- Código: Review 10/11 critérios ✅, Merchant M3/M4/M6/M7 ✅ completos (leitura + escrita) + M5 leitura.
- Smoke live: 3 rodadas verdes (leitura completa + **escrita real** — pausar loja 201/despausar 204 via draft→aprovação no sandbox).
- QA visual: feito via magic link nos 2 tenants, 4 achados de polish, todos corrigidos.
- **Gates que faltam (só do Wandson)**: confirmar categoria do app + conta CNPJ no portal (D1) · confirmar a URL da Política de Avaliações (único risco de conteúdo aberto) · abrir o ticket com o texto já pronto.

**Docs**:
- Índice: [`README-homologacao.md`](./README-homologacao.md)
- Matriz de cobertura: [`homologacao-matriz-cobertura.md`](./homologacao-matriz-cobertura.md)
- Checklist do portal: [`homologacao-checklist-avaliacoes.md`](./homologacao-checklist-avaliacoes.md)
- Roteiro da sessão com o analista: [`roteiro-sessao-homologacao.md`](./roteiro-sessao-homologacao.md)
- Texto pronto do ticket: [`../dossie/ticket-homologacao-avaliacoes.md`](../dossie/ticket-homologacao-avaliacoes.md)
- QA visual (evidência formal): [`../qa/QA-VISUAL-HOMOLOG-2026-07-06.md`](../qa/QA-VISUAL-HOMOLOG-2026-07-06.md)

---

## App 2 — Finanças (Financial + Events)

**Status: ✅ PRONTO para o próximo ticket (depende só da vez do App 1) — 1 lacuna documentada, não bloqueante**

- Código: client Financial completo (vendas, repasses/settlements, antecipações, ajustes) + Events (esqueleto mínimo, polling+ack, leitura) + tela `financeiro-ifood` no ConsoleV2 (vendas + repasses, estados vazios decentes).
- Smoke live confirmou e **corrigiu** os params reais de 2 endpoints que a doc pública tinha errado (settlements: `beginPaymentDate`/`endPaymentDate`; antecipações: intervalo, não data única) — já ajustado no código.
- **Lacuna documentada**: `listarOcorrencias` (ajustes/chargebacks) **não resolvido** — os 3 caminhos de URL testados no sandbox deram 404/500; path final incerto. Ticket de suporte ao iFood está vetado hoje — a resolução depende de recapturar a doc logada (mesmo padrão usado pro checklist de Avaliações) ou abrir chamado quando permitido. Não bloqueia o restante do app.
- Matriz de cobertura espelha a de Avaliações (mesmo formato, mesmos PRs referenciados).

**Docs**:
- Research (endpoints públicos): [`financas-endpoints.md`](./financas-endpoints.md)
- Matriz de cobertura: [`homologacao-matriz-financas.md`](./homologacao-matriz-financas.md)
- UI-spec da tela (contrato usado na implementação): [`financeiro-ui-spec.md`](./financeiro-ui-spec.md)

---

## App 3 — Catálogo

**Status: 🔨 EM BUILD — research pronta, implementação não iniciada**

- Só a pesquisa dos endpoints públicos do módulo Catalog foi feita até agora (leitura de catálogos/categorias/itens já existe no client desde antes deste sprint — `unsellableItems` ainda não implementado; escrita — criar categoria, PUT item, pausar/reabrir item, deletar categoria — já existe e já é gated por draft→aprovação, reaproveitável).
- Falta: matriz de cobertura, tela no ConsoleV2, smoke live, QA visual — mesmo pipeline dos Apps 1 e 2, só que ainda no início.
- Sem pendência estratégica: o ticket dele só entra na fila depois que Avaliações + Finanças tiverem passado (ou pelo menos Avaliações concluído e Finanças com data marcada) — o build pode continuar em paralelo sem pressa de ticket.

**Docs**:
- Research (endpoints públicos): [`catalogo-endpoints.md`](./catalogo-endpoints.md)

---

## Resumo de 1 linha por app

| App | Código | Smoke live | QA visual | Ticket |
|---|---|---|---|---|
| 1 — Avaliações | ✅ completo | ✅ 3 rodadas (leitura+escrita) | ✅ feito, achados corrigidos | 🔲 aguardando gates D1 do Wandson |
| 2 — Finanças | ✅ completo (1 lacuna doc.) | ✅ confirmou e corrigiu 2 params errados | 🔲 não feito ainda | 🔲 aguarda a vez (após App 1) |
| 3 — Catálogo | 🔨 só research | 🔲 não feito | 🔲 não feito | 🔲 aguarda a vez (após App 2) |
