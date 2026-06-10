#!/usr/bin/env bash
# Injeta a service_role do Supabase no config do gateway Hermes
# (cd-admin > SUPABASE_SERVICE_KEY) e reinicia o gateway.
#
# A chave é lida de forma SILENCIOSA do terminal (read -s): não aparece
# na tela, não vai pro histórico do shell, não passa por chat/log.
#
# Uso (como root, na VPS):
#   bash /root/consult-delivery/admin-mcp/scripts/fix-hermes-service-key.sh
set -euo pipefail

CONFIG="/root/.hermes/config.yaml"
[ -f "$CONFIG" ] || { echo "ERRO: $CONFIG não existe"; exit 1; }

echo "Cole a service_role do Supabase e tecle ENTER."
echo "(o texto NÃO vai aparecer na tela — é proposital)"
read -r -s -p "service_role: " KEY
echo
KEY="$(printf '%s' "$KEY" | tr -d '\r\n[:space:]')"   # limpa espaços/quebras coladas junto

# validações (sem exibir o valor) — aceita chave nova (sb_secret_) ou JWT legada (eyJ)
if [ -z "$KEY" ]; then echo "ERRO: nada foi colado"; exit 1; fi
case "$KEY" in
  sb_secret_*)
    if [ "${#KEY}" -lt 20 ]; then echo "ERRO: sb_secret_ curta demais (${#KEY} chars)"; exit 1; fi
    echo "[1/4] chave recebida: OK (sb_secret, ${#KEY} chars)" ;;
  eyJ*)
    if [ "${#KEY}" -lt 100 ]; then echo "ERRO: JWT curta demais (${#KEY} chars)"; exit 1; fi
    echo "[1/4] chave recebida: OK (JWT legada, ${#KEY} chars)" ;;
  *)
    echo "ERRO: a chave não começa com 'sb_secret_' nem 'eyJ' — você pode ter colado o nome/rótulo errado"; exit 1 ;;
esac

# backup
BAK="$CONFIG.bak.$(date +%Y%m%d_%H%M%S)"
cp "$CONFIG" "$BAK"
echo "[2/4] backup criado: $BAK"

# substituir SÓ a linha do cd-admin > SUPABASE_SERVICE_KEY (preserva indentação/comentários)
KEY="$KEY" python3 - "$CONFIG" <<'PY'
import os, sys
cfg = sys.argv[1]
key = os.environ['KEY']
lines = open(cfg).read().split('\n')
n = 0
out = []
for ln in lines:
    s = ln.lstrip()
    if s.startswith('SUPABASE_SERVICE_KEY:') and not s.startswith('#'):
        indent = ln[:len(ln) - len(s)]
        out.append(f'{indent}SUPABASE_SERVICE_KEY: {key}')
        n += 1
    else:
        out.append(ln)
if n == 0:
    sys.stderr.write("ERRO: nenhuma linha 'SUPABASE_SERVICE_KEY:' encontrada no config\n")
    sys.exit(2)
open(cfg, 'w').write('\n'.join(out))
print(f"[3/4] config atualizado ({n} linha(s) SUPABASE_SERVICE_KEY)")
PY

# reiniciar o gateway
systemctl restart hermes-gateway.service
sleep 4
if systemctl is-active --quiet hermes-gateway.service; then
  echo "[4/4] gateway reiniciado: active (running)"
  echo "PRONTO. Volte no Telegram e mande: qual o semáforo da Consult Delivery agora?"
else
  echo "[4/4] ATENCAO: gateway NAO esta active. Veja: journalctl -u hermes-gateway -n 30 --no-pager"
  echo "       Backup do config em: $BAK"
  exit 1
fi

unset KEY
