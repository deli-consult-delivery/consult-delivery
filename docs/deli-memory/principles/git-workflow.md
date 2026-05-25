# Git Workflow — Consult Delivery

## Como começar uma tarefa (Wandson)

```bash
git checkout main
git pull origin main
git checkout -b wandson/nome-da-tarefa
# Exemplo: git checkout -b wandson/dashboard-supabase
```

Abrir o Claude Code nesse branch. Ao terminar:

```bash
git push -u origin wandson/nome-da-tarefa
# GitHub → abrir Pull Request → merge
```

## Padrão de nomes de branch

```
wandson/dashboard-kpis
wandson/login-real
fix/bug-topbar
hotfix/login-erro
chore/slim-claude-md
feat/feature-name
```

## Regras para o Claude Code

1. Ao iniciar qualquer sessão, verificar: `git branch --show-current`
2. Se estiver em `main`: PARAR e pedir branch.
3. Nunca fazer commit direto em main.
4. Nunca fazer `push --force` em main.
5. Antes de trabalho novo: `git pull origin main` para sincronizar.

## Resolvendo conflitos

1. Abrir arquivo conflitado no editor.
2. Escolher qual versão manter (ou misturar).
3. Remover marcações `<<<<<<<`, `=======`, `>>>>>>>`.
4. `git add . && git commit -m "resolve conflito em X"`

## PR e merge

```bash
gh pr create --base main --title "feat: ..." --body "..."
gh pr merge --squash --delete-branch
gh run watch  # acompanhar GitHub Actions
```

Deploy automático: push em main → GitHub Actions → GitHub Pages → app.consultdelivery.com.br (~3 min).
