#!/usr/bin/env bash
# deploy-hermes.sh — sincroniza a config versionada (hermes/) para ~/.hermes/ na VPS.
# Roda na VPS (reservado ao Wandson). Dry-run por padrão; --apply para efetivar.
#
# NUNCA copia segredos: .env, mcp-tokens/, state.db, sessions/, memories/ são EXCLUÍDOS
# (ficam só na VPS). Versionado = config.yaml + profiles/<slug>/SOUL.md + skills/.
#
# Uso:
#   bash hermes/deploy-hermes.sh            # dry-run (mostra o que mudaria)
#   bash hermes/deploy-hermes.sh --apply    # efetiva
#   depois:  hermes gateway restart         # recarrega config.yaml
set -euo pipefail

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/"
DEST="${HERMES_HOME:-$HOME/.hermes}/"

APPLY=0
[[ "${1:-}" == "--apply" ]] && APPLY=1

# Exclui tudo que é segredo/estado local — só config-como-código viaja.
EXCLUDES=(
  --exclude '.env'
  --exclude 'mcp-tokens/'
  --exclude 'state.db'
  --exclude 'sessions/'
  --exclude 'memories/'
  --exclude 'logs/'
  --exclude 'checkpoints/'
  --exclude 'sandboxes/'
  --exclude 'README.md'
  --exclude 'deploy-hermes.sh'
  --exclude '.gitkeep'
)

echo "[deploy-hermes] origem: $SRC"
echo "[deploy-hermes] destino: $DEST"
mkdir -p "$DEST"

if [[ "$APPLY" -eq 1 ]]; then
  echo "[deploy-hermes] APLICANDO (rsync)…"
  rsync -av "${EXCLUDES[@]}" "$SRC" "$DEST"
  echo "[deploy-hermes] OK. Rode:  hermes gateway restart   (para recarregar config.yaml)"
else
  echo "[deploy-hermes] DRY-RUN (nada alterado). Use --apply para efetivar."
  rsync -avn "${EXCLUDES[@]}" "$SRC" "$DEST"
fi
