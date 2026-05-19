---
description: Health check da VPS (claude-dev, docker, processos, disco, RAM)
---

# /vps-health — Saúde da VPS

Comando **read-only**. Coleta métricas LOCAIS da VPS (a sessão dev roda na própria VPS — sem SSH) e formata como tabela.

## O que coletar (execução local direta)

Rode o bloco abaixo localmente:

```bash
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

- **Não modifica nada** — só `systemctl is-active`/`show`/`docker ps`/`ps`/`df`/`free`/`uptime`.
- Não pede confirmação.
- Se algum subcomando falhar: mostra `(falhou)` na seção e segue.
