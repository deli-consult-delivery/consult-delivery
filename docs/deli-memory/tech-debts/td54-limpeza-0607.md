# TD#54 — Limpeza de branches remotas (rodada 2026-07-07, PRs #809–#851)

Segunda rodada da mesma higiene (a primeira foi 2026-07-06, ver `docs/deli-memory/tech-debts/td-index.md` §TD#54 e `~/.ao/briefs/report-85-branches.md`, 30 branches deletadas). Desde então, os PRs #809–#851 (e outros do mesmo dia) acumularam mais branches órfãs. Ação **só de git** (branch `wandson/limpeza-branches-0607`) — sem alteração de código, PR só deste doc.

## Contagem antes/depois

```
$ git branch -r | grep -v -E "origin/(main|gh-pages)$" | grep -v HEAD | wc -l
74     (antes, 2026-07-07 ~01:20 UTC)

$ git branch -r | grep -v -E "origin/(main|gh-pages)$" | grep -v HEAD | wc -l
28     (depois, mesmo horário — 47 deletadas; +1 branch nova criada por
        outra sessão durante a checagem, wandson/tracker-final-0607,
        contabilizada corretamente: 74 + 1 - 47 = 28)
```

## Método

1. **Excluídas de qualquer deleção**: as 54 branches com `git worktree` ativo no momento (`git worktree list`) — inclui sessões `ao/consult-delivery-*/root`, a sessão orquestradora, e todas as branches `wandson/*` que sessões-worker tinham checked out. Critério de segurança pedido ("não deletar as branches de worktree ativas") aplicado de forma conservadora: qualquer branch com worktree local, independente do nome, ficou de fora — não só as `ao/*`.
2. Das 67 branches candidatas restantes, cruzei cada headRefName contra `gh pr list --state merged --limit 1000` (834 PRs mergeados no total). 61 tinham PR mergeado correspondente; 6 não tinham (`chore/g06-vps-hardening`, `claude/gifted-borg-53f2a8`, `claude/tender-lalande-14723f`, `wandson/fix-outros-horarios`, `wandson/local-state-19-mai-2026`, `wandson/sidebar-fix-hidden-state`) — ficaram de fora por padrão (sem prova de merge).
3. **Critério de prova (igual ao TD#54 original, refinado)**: para cada uma das 61 com PR mergeado, peguei o `mergeCommit.oid` do PR (o commit squash em `main`) e comparei — restrito aos arquivos que a branch alterou desde seu ponto de divergência (`git diff --name-only $(git merge-base origin/main branch) branch`) — o conteúdo desses arquivos no **merge commit específico** (não no `main` atual) contra o tip da branch: `git diff <mergeCommitOid> branch -- <arquivos>`. Diff vazio = o squash-merge capturou o conteúdo da branch fielmente, comprovado por conteúdo, não só por metadado do PR.
   - Refinamento sobre a rodada anterior: comparar contra o **merge commit exato** (em vez do `main` atual) evita falso-negativo quando `main` já evoluiu esses mesmos arquivos depois do merge — nessa rodada isso elevou de 22 para 47 branches comprovadas.
4. Resultado: **47 comprovadas** (diff vazio contra o merge commit) → deletadas. **14 com PR mergeado mas diff NÃO vazio contra o merge commit** → NÃO deletadas (ver lista abaixo, precisam de olhar manual — provável branch atualizada/rebaseada depois do merge, ou PR fechado com squash parcial). **6 sem PR mergeado** → não deletadas.

## 47 branches deletadas (squash-merge comprovado contra o merge commit)

```
$ git push origin <47 refspecs de deleção de uma vez>
 - [deleted]         wandson/audit-log-viewer
 - [deleted]         wandson/audit-security-definer
 - [deleted]         wandson/bridge-tests
 - [deleted]         wandson/cardapio-api
 - [deleted]         wandson/ci-build-pr
 - [deleted]         wandson/ci-build-trigger
 - [deleted]         wandson/cleanup-0607
 - [deleted]         wandson/cost-usd-instrumentacao
 - [deleted]         wandson/cost-usd-leva2
 - [deleted]         wandson/csat-analise-dashboard
 - [deleted]         wandson/custo-dashboard
 - [deleted]         wandson/cvnovas-crud
 - [deleted]         wandson/cvnovas-leva2
 - [deleted]         wandson/cvnovas-remove-erro
 - [deleted]         wandson/drafts-tests
 - [deleted]         wandson/edge-functions-audit
 - [deleted]         wandson/erros-amigaveis
 - [deleted]         wandson/financas-ifood-financial-bridge
 - [deleted]         wandson/financas-ifood-smoke-fix
 - [deleted]         wandson/financeiro-ifood
 - [deleted]         wandson/fix-loop-triggered-by
 - [deleted]         wandson/gap2-config-unify
 - [deleted]         wandson/gestao-membros
 - [deleted]         wandson/ifood-financas-events
 - [deleted]         wandson/lara-csat-reengajamento
 - [deleted]         wandson/matriz-catalogo
 - [deleted]         wandson/matriz-financas
 - [deleted]         wandson/membros-guards
 - [deleted]         wandson/perf-indices
 - [deleted]         wandson/qa-c2-parte-a
 - [deleted]         wandson/qa-c2-parte-b
 - [deleted]         wandson/qa-c2-rls
 - [deleted]         wandson/rate-limit-publico
 - [deleted]         wandson/rbac-can-fix
 - [deleted]         wandson/rbac-tenant-sync
 - [deleted]         wandson/readme-homolog
 - [deleted]         wandson/rls-audit-0607
 - [deleted]         wandson/security-p2-0707
 - [deleted]         wandson/smoke-features-noite
 - [deleted]         wandson/td44-scheduler-por-tenant
 - [deleted]         wandson/td54-55-branches-deadroute
 - [deleted]         wandson/test-suite-status
 - [deleted]         wandson/tracker-leva5-0607
 - [deleted]         wandson/ux-latencia-interruptions
 - [deleted]         wandson/vite-secret-bundle
 - [deleted]         wandson/webhook-auth
 - [deleted]         wandson/webhook-auth-failclosed
```

0 falhas — 47/47 confirmadas `[deleted]` pelo git.

## NÃO deletadas — precisam de olhar manual (14, PR mergeado mas conteúdo diverge do merge commit)

```
claude/jolly-heisenberg-230ace       (PR merge f3a7122)
claude/magical-wescoff-2e77af        (PR merge be4a544)
feat/onda07-f3-confirmacao           (PR merge 8300632)
feat/s2-g06-memoria-central          (PR merge 7b3ebc1)
wandson/avaliacao-karina             (PR merge 97a426b)
wandson/catalogo-client              (PR merge 3a2769b)
wandson/eslint-jsx-guard             (PR merge 8f780f6)
wandson/evonexus-decisao-d1          (PR merge 50825d0)
wandson/kanban-tasks-panel           (PR merge 871e14c)
wandson/nps-datacrazy                (PR merge 1b7ec49)
wandson/onboarding-selfservice       (PR merge e72b108)
wandson/qa-visual-fixes              (PR merge 2ba244a)
wandson/realtime-replica-identity    (PR merge 258e2f8)
wandson/reset-password               (PR merge 667bb8f)
```

## NÃO deletadas — sem PR mergeado encontrado (6)

```
chore/g06-vps-hardening
claude/gifted-borg-53f2a8
claude/tender-lalande-14723f
wandson/fix-outros-horarios
wandson/local-state-19-mai-2026
wandson/sidebar-fix-hidden-state
```

## Recomendação ainda pendente
Mesma do TD#54 original: ativar **"Automatically delete head branches"** nas Settings do repo no GitHub — resolve na raiz, evita o acúmulo se repetir a cada leva de PRs squash-merged.
