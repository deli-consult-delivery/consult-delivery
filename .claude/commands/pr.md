---
description: Workflow guiado de PR (branch + commit + push + gh pr create)
argument-hint: [tipo título-curto]
---

# /pr — Abrir Pull Request

Workflow padrão Consult Delivery: nunca commitar em `main`, sempre branch dedicado + PR.

## Argumentos

`$ARGUMENTS` pode vir como `tipo título descritivo` (ex: `feat exportar relatório CSV`).

- Se vazio: pergunte ao usuário **tipo** (`feat` | `fix` | `docs` | `refactor` | `chore`) e **título curto** (1 linha, imperativo, PT-BR).
- Se preenchido: extraia o primeiro token como tipo e o restante como título. Valide o tipo contra a lista acima — se inválido, pergunte de novo.

## Passos

### 1. Pré-checagem
```bash
git branch --show-current
git status --porcelain
```

- Se branch atual ≠ `main`: avisa e pergunta se deve criar branch a partir do atual ou voltar pra `main` primeiro.
- Se working tree vazio: erro "nada pra commitar".

### 2. Gerar slug do branch
`tipo/<título-em-kebab-case-truncado-50-chars>`

Exemplo: `feat exportar relatório CSV` → `feat/exportar-relatorio-csv`

Regras do slug:
- Lowercase, sem acentos (`ç`→`c`, `ã`→`a`, etc.)
- Espaços e símbolos → `-`
- Truncar em 50 chars

### 3. Criar branch e stagear
```bash
git checkout -b <slug-branch>
git add -A    # ou arquivos específicos se o usuário indicar
```

Mostre `git diff --cached --stat` pra confirmar o que entra no commit.

### 4. Commit
Use HEREDOC pra mensagem (assinatura padrão):
```bash
git commit -m "$(cat <<'EOF'
<tipo>: <título>

<corpo opcional — só se houver contexto não-óbvio>
EOF
)"
```

### 5. Push
```bash
git push -u origin <slug-branch>
```

### 6. Abrir PR
```bash
gh pr create --title "<tipo>: <título>" --body "$(cat <<'EOF'
## Summary
- <bullet 1>
- <bullet 2>

## Test plan
- [ ] <passo de teste manual>

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Resuma os bullets a partir do `git diff` real (não inventar).

### 7. Saída final
Retorne a URL do PR e a branch.

## Regras

- **Nunca** força push, nunca `--no-verify`, nunca commit em `main`.
- **Não merge** — só abre o PR. O usuário decide quando mergear.
- Se algum passo falhar (hook, push rejeitado), pare e mostre o erro bruto.
- Se houver pre-commit hook falhando: NÃO use `--amend`; fix → re-stage → commit novo.
