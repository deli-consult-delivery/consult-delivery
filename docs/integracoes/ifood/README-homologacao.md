# Pacote de Homologação iFood — App Avaliações (Merchant + Review)

> Índice de tudo que foi produzido no sprint de 06/07. Ler isto primeiro de manhã.

## Status atual (2026-07-06, fim da noite)

**Código e evidências completos; faltam apenas os gates D1 (Wandson) + QA visual.**

- ✅ Código: Review 10/11 critérios, Merchant M3/M4/M6/M7 completos + M5 leitura (ver matriz).
- ✅ Smoke live via API (SSH, 3 rodadas — leitura + **escrita real validada**: pausar loja 201, despausar 204, ambos via draft→aprovação no merchant sandbox).
- ✅ Roteiro de demonstração pronto (ordem exata pro analista, o que mostrar/não mostrar).
- ✅ Usuários QA temporários já existem — `qa-homolog@consultdelivery.com.br` (admin em `cd-homolog`) e `qa-demo@consultdelivery.com.br` (admin em `cd-demo`), criados via runbook. **Credenciais fora do git**, em arquivo local do Wandson (`qa-creds-TEMP.md`) — trocar/deletar após o QA.
- 🔲 **Falta**: QA visual (Passo C do runbook — login pelo browser em `app.consultdelivery.com.br`, navegar as telas de verdade; a Rodada 3 do smoke testou a API direto via SSH, não o Console). E os **gates D1 do Wandson**: confirmar categoria do app no portal, conta CNPJ, e a URL da Política de Avaliações (único risco de conteúdo aberto) — só então abrir o ticket.

## O que existe

| Peça | Arquivo | Status |
|---|---|---|
| Critérios do portal (coletados logado) | `docs/integracoes/ifood/homologacao-checklist-avaliacoes.md` | ✅ pronto |
| Matriz de cobertura (código × critério + smoke live) | `docs/integracoes/ifood/homologacao-matriz-cobertura.md` | ✅ pronto — Review 10/11 ✅, Merchant M3/M4/M6/M7 ✅ + M5 leitura, **seção "Smoke live" com 3 rodadas verdes (leitura + escrita)**. Único risco de conteúdo: R9 (URL da Política de Avaliações nunca confirmada) |
| **Roteiro da sessão com o analista (~45min)** | `docs/integracoes/ifood/roteiro-sessao-homologacao.md` | ✅ pronto (PR #780) — ordem exata de demonstração, critério provado por passo, o que NÃO mostrar (allowlist de 8 telas) |
| Checklist geral antigo (pré-sprint) | `docs/dossie/checklist-homologacao.md` | ⚠️ DRAFT desatualizado — só os pré-requisitos gerais ainda valem, o resto foi superado pela matriz acima |
| Texto pronto do ticket | `docs/dossie/ticket-homologacao-avaliacoes.md` | ✅ pronto para colar (PR #772) |
| Runbook de usuários admin | `docs/runbooks/homolog-demo-users.md` | ✅ pronto (PR #770, mergeado) — Passos 0/A/B já executados (usuários QA criados, ver Status atual); **Passo C (smoke visual) ainda não executado** |
| Smoke live contra o merchant de teste | `homologacao-matriz-cobertura.md` §"Smoke live 2026-07-06" | ✅ **3 rodadas verdes** (sessão consult-delivery-87) — Rodada 1-2: leitura (status, reviews, paginação, filtro de data, erros 400/404); **Rodada 3: escrita real** (pausar loja 201 + despausar 204 via draft→aprovação, sandbox devolvido ao estado limpo) |

## Ordem exata das ações (Wandson, de manhã)

1. ~~Criar o usuário admin~~ — **JÁ FEITO**: `qa-homolog`/`qa-demo` existem (ver "Status atual"). Só reaproveitar pro QA visual abaixo.
2. **QA visual** (Passo C do runbook, ainda pendente) — login em `app.consultdelivery.com.br` com `qa-homolog`, conferir o menu de `cd-homolog` (8 telas) navegando de verdade pelo browser: Visão Geral (card de summary), Lojas → aba Merchant (status/pausar/despausar/horários), Avaliações iFood (listar/filtrar/responder). A Rodada 3 do smoke validou a escrita via API direto — este passo confirma que o **Console** (não só o Bridge) funciona ponta-a-ponta. Seguir a ordem de `roteiro-sessao-homologacao.md`.
3. **Confirmar/corrigir a URL da Política de Avaliações** (`src/console/AvaliacoesReviewApi.jsx:15`) contra o portal do desenvolvedor — único risco de conteúdo aberto (R9 da matriz).
4. **Gate D1** — confirmar categoria do app ("Avaliações") e conta Profissional (CNPJ) no portal do desenvolvedor.
5. **Abrir o ticket de homologação** no portal do desenvolvedor iFood — copiar o texto pronto de `docs/dossie/ticket-homologacao-avaliacoes.md` (categoria Avaliações, merchant de teste, endpoints, telas, contato).
6. **Na sessão com o analista** (~45min): seguir `docs/integracoes/ifood/roteiro-sessao-homologacao.md` do início ao fim.
7. **Rotacionar a chave da Evolution API** — esteve exposta no bundle público até a noite de 06/07 (#756/#761 já tiraram do código; a rotação da credencial em si é ação manual no painel da Evolution, gate 0 dele). Não bloqueia o ticket, mas não deixar pra depois.

## Pendências que não bloqueiam o ticket, mas ficam abertas

- Merchant M2 (detalhe root do endpoint `/merchants/{id}`) e M1 (rota/UI de listagem de merchants) — baixo risco, não são cenário de teste explícito do checklist.
- Edição de horários de funcionamento no front (hoje só leitura) — backend já pronto, sem botão.
- Shape completo de 1 review, aritmética real do summary, e o 200 de detalhe de review com dado — só confirmáveis quando houver pelo menos 1 review de verdade no sandbox (hoje tem 0).
