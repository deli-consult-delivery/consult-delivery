---
description: Gera changelog dos últimos 20 PRs mergeados, agrupado por tipo
argument-hint: [limite-de-PRs — default 20]
---

# /release-notes — Changelog a partir de PRs mergeados

Comando **read-only**. Gera release notes em markdown a partir do histórico de PRs mergeados via `gh`.

## Argumentos

`$ARGUMENTS` pode conter um número (limite de PRs). Default: `20`.

## Coleta

```bash
gh pr list --state merged --limit ${LIMITE:-20} \
  --json number,title,mergedAt,author,labels,url \
  --jq 'sort_by(.mergedAt) | reverse'
```

## Parser do título

Para cada PR, extraia o tipo a partir do título no formato `tipo: descrição` (também aceitar `tipo(escopo): descrição`):

| Tipo no título | Seção no changelog |
|----------------|--------------------|
| `feat`         | Features           |
| `fix`          | Fixes              |
| `docs`         | Docs               |
| `refactor`     | Refactor           |
| `chore`        | Chore              |
| `test`         | Tests              |
| `perf`         | Performance        |
| outros         | Outros             |

Se o título não bater no padrão `tipo:`, joga em "Outros".

## Formato de saída

```markdown
# Release Notes — <data ISO de hoje>

Período: <data do PR mais antigo> a <data do PR mais novo> · <N PRs mergeados>

## Features
- #<num> <descrição> ([link](url)) — @<autor>
- ...

## Fixes
- #<num> <descrição> ([link](url)) — @<autor>
- ...

## Docs
- ...

## Refactor
- ...

## Chore
- ...

## Outros
- ...
```

Seções sem itens devem ser **omitidas** (não mostrar headers vazios).

## Regras

- Não modifica nada.
- Não autentica nem mexe em config do `gh`.
- Se `gh` falhar (não logado, sem repo): mostre o erro bruto.
- Inclua a URL do PR como link clicável.
- Não invente PRs — só o que sair do `gh pr list`.
