---
description: Health check da VPS (claude-dev, docker, processos, disco, RAM)
---

# /vps-health — Saúde da VPS

Comando **read-only**. Coleta métricas da VPS `187.127.25.24` via SSH e formata como tabela.

## Conexão

Use a chave SSH já configurada no `~/.ssh/config` ou:
```bash
ssh -o StrictHostKeyChecking=no -o ConnectTimeout=8 root@187.127.25.24 '<comando-remoto>'
```

## O que coletar (em UMA chamada SSH para economizar conexão)

Monte um bloco shell remoto único:

```bash
ssh -o StrictHostKeyChecking=no -o ConnectTimeout=8 root@187.127.25.24 'bash -s' <<'REMOTE'
echo "=== claude-dev.service ==="
systemctl is-active claude-dev.service
systemctl show claude-dev.service --property=ActiveEnterTimestamp,MainPID,MemoryCurrent,CPUUsageNSec --no-pager 2>&1 | head -10

echo ""
echo "=== bridge-server systemd (se existir) ==="
systemctl is-active bridge-server 2>&1 || echo "(servico nao gerenciado por systemd)"

echo ""
echo "=== docker ps ==="
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" 2>&1 | head -20

echo ""
echo "=== Processos node/python ==="
ps -eo pid,etime,pcpu,pmem,cmd --no-headers | grep -E '(node|python)' | grep -v grep | head -15

echo ""
echo "=== Disco ==="
df -h / /var 2>/dev/null

echo ""
echo "=== RAM ==="
free -h

echo ""
echo "=== Uptime ==="
uptime
REMOTE
```

## Formato de saída

Renderize cada seção como bloco markdown com tabela. Exemplo:

```
### VPS Health — 187.127.25.24 (<data ISO>)

**claude-dev.service**: active (pid 12345, mem 234 MiB, started 2026-05-15 12:30)

**Containers Docker** (top 10):
| Nome | Status | Portas |
|------|--------|--------|
| ... | ... | ... |

**Processos Node/Python** (top 10):
| PID | Tempo | CPU% | MEM% | Comando |
|-----|-------|------|------|---------|
| ... | ... | ... | ... | ... |

**Disco**: / 23% (45G / 200G livre)
**RAM**: 4.2G / 16G usado
**Uptime**: 27 dias
```

## Regras

- **Não modifica nada na VPS** — só `systemctl is-active`/`show`/`docker ps`/`ps`/`df`/`free`/`uptime`.
- Não pede confirmação.
- Se SSH falhar (timeout, chave): mostra o erro bruto e encerra.
- Se algum subcomando falhar dentro do bloco remoto: mostra `(falhou)` na seção e segue.
