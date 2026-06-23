---
description: Mostra estado da sessão de dev (branch, git, serviços, processos)
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

### 2. Serviço claude-dev.service (local)
A sessão de dev roda na própria VPS, então o serviço é local — não use SSH.
```bash
systemctl is-active claude-dev.service 2>&1 || echo "(service not found)"
systemctl show claude-dev.service --property=ActiveEnterTimestamp,MainPID,MemoryCurrent --no-pager 2>&1
```

### 3. Processos locais relevantes (Node/Python/dev servers)
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

**Serviços**
- claude-dev.service: <active | inactive | not-found>

**Processos locais**
- <pid> <etime> <cmd>
- ...
```

## Regras

- Não modifica nada. Não pede confirmação.
- Se algum comando falhar, mostra "(falhou: <motivo>)" na linha correspondente e segue.
- Sem emojis no output (exceto se já existirem no commit msg).
