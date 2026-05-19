---
description: Mostra estado da sessão de dev (branch, git, fase GSD, serviços, processos)
---

# /dev-status — Diagnóstico da sessão de dev

Comando **read-only**. Coleta em paralelo o estado atual e formata um resumo.

## O que executar

Rode os comandos abaixo em paralelo (uma chamada Bash com `&&` ou múltiplas Bash em paralelo) e formate a saída em um bloco único.

### 1. Git local
```bash
git branch --show-current
git status -sb
git log -1 --oneline
git rev-parse --short HEAD
```

### 2. Fase GSD ativa
Procura em `.planning/phases/`:
```bash
ls .planning/phases/ 2>/dev/null
# Fase ativa: marcador definido pelo session-start hook (CLAUDE_PROJECT_DIR/.claude/hooks/gsd-session-start.cjs)
# Se houver arquivo .planning/phases/_active ou similar, exibir
cat .planning/phases/_active 2>/dev/null || echo "(sem marcador de fase ativa)"
```

### 3. Serviço Claude Code remoto (VPS)
```bash
ssh -o StrictHostKeyChecking=no -o ConnectTimeout=5 root@187.127.25.24 \
  "systemctl is-active claude-dev.service && systemctl show claude-dev.service --property=ActiveEnterTimestamp,MainPID,MemoryCurrent --no-pager" \
  2>&1 || echo "(VPS unreachable)"
```

### 4. Processos locais relevantes (Node/Python/dev servers)
```bash
ps -eo pid,etime,cmd --no-headers | grep -E '(vite|trigger|node.*bridge|python.*agent)' | grep -v grep | head -10
```

## Formato de saída

Exiba um bloco markdown assim:

```
### Dev Status — <data ISO>

**Git**
- Branch: `<branch>`
- HEAD: `<short-sha>` — <last commit msg>
- Working tree: <clean | N arquivos modificados>

**GSD**
- Fase ativa: <nome ou "nenhuma">

**Serviços**
- claude-dev.service (VPS): <active | inactive | unreachable>

**Processos locais**
- <pid> <etime> <cmd>
- ...
```

## Regras

- Não modifica nada. Não pede confirmação.
- Se algum comando falhar, mostra "(falhou: <motivo>)" na linha correspondente e segue.
- Sem emojis no output (exceto se já existirem no commit msg).
