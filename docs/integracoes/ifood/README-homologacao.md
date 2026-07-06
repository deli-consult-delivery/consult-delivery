# Pacote de Homologação iFood — App Avaliações (Merchant + Review)

> Índice de tudo que foi produzido no sprint de 06/07. Ler isto primeiro de manhã.

## O que existe

| Peça | Arquivo | Status |
|---|---|---|
| Critérios do portal (coletados logado) | `docs/integracoes/ifood/homologacao-checklist-avaliacoes.md` | ✅ pronto |
| Matriz de cobertura (código × critério) | `docs/integracoes/ifood/homologacao-matriz-cobertura.md` | ✅ pronto — Review 10/11 ✅, Merchant M3/M4/M6/M7 ✅ + M5 leitura. Único risco de conteúdo: R9 (URL da Política de Avaliações nunca confirmada) |
| Checklist geral antigo (pré-sprint) | `docs/dossie/checklist-homologacao.md` | ⚠️ DRAFT desatualizado — só os pré-requisitos gerais ainda valem, o resto foi superado pela matriz acima |
| Texto pronto do ticket | `docs/dossie/ticket-homologacao-avaliacoes.md` | ✅ pronto para colar (PR #772) |
| Runbook de usuários admin | `docs/runbooks/homolog-demo-users.md` | ✅ pronto (PR #770, mergeado) — cria o admin de `cd-homolog`/`cd-demo` |
| Smoke live contra o merchant de teste | — | ❌ **NÃO EXISTE ainda** — nenhuma rodada foi documentada. É o item 5 das "Pendências" da matriz de cobertura e o Passo C do runbook (smoke visual) — falta rodar e registrar o resultado |

## Ordem exata das ações (Wandson, de manhã)

1. **Criar o usuário admin** (ou reaproveitar um de QA temporário) — seguir `docs/runbooks/homolog-demo-users.md`, Passos 0/A/B (~2 min, SQL copiável).
2. **Smoke visual** — Passo C do mesmo runbook: login em `app.consultdelivery.com.br`, conferir o menu de `cd-homolog` (8 telas) e `cd-demo` (16 telas), navegar Lojas/Avaliações/Visão Geral do T-HOMOLOG contra o merchant de teste `92a0ec17-6951-4a9b-9c02-ee12963be5f1` (status, 1 pausa, listar/responder 1 avaliação, `/summary`). Esse é o smoke live que falta documentar — usar o checklist no fim de `docs/dossie/ticket-homologacao-avaliacoes.md`.
3. **Confirmar/corrigir a URL da Política de Avaliações** (`src/console/AvaliacoesReviewApi.jsx:15`) contra o portal do desenvolvedor — único risco de conteúdo aberto (R9 da matriz).
4. **Abrir o ticket de homologação** no portal do desenvolvedor iFood — copiar o texto pronto de `docs/dossie/ticket-homologacao-avaliacoes.md` (categoria Avaliações, merchant de teste, endpoints, telas, contato).
5. **Rotacionar a chave da Evolution API** — esteve exposta no bundle público até a noite de 06/07 (#756/#761 já tiraram do código; a rotação da credencial em si é ação manual no painel da Evolution, gate 0 dele).

## Pendências que não bloqueiam o ticket, mas ficam abertas

- Merchant M2 (detalhe root do endpoint `/merchants/{id}`) e M1 (rota/UI de listagem de merchants) — baixo risco, não são cenário de teste explícito do checklist.
- Edição de horários de funcionamento no front (hoje só leitura) — backend já pronto, sem botão.
