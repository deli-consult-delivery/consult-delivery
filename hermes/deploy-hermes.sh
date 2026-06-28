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
  --exclude 'routing/'
  --exclude 'describe.txt'
)

echo "[deploy-hermes] origem: $SRC"
echo "[deploy-hermes] destino: $DEST"
mkdir -p "$DEST"

# Garante que os describe.txt estão em sincronia com o roteamento-como-dado (roster.json)
# ANTES de aplicar — barra deploy de describe defasado.
if ! node "${SRC}routing/gen-describe.cjs" --check; then
  echo "[deploy-hermes] describe.txt fora de sincronia com roster.json — rode 'node hermes/routing/gen-describe.cjs' e commite. Abortando." >&2
  exit 1
fi

# Barra deploy se a PERSONA (SOUL.md/SKILL.md) contiver valor de negócio (R$/%/prazos).
# Regra de negócio vive em tools MCP no Bridge, nunca na persona (Blueprint v2 §3/FASE 4).
if ! node "${SRC}routing/lint-persona.cjs"; then
  echo "[deploy-hermes] persona com valor de negócio — mova p/ tools MCP no Bridge. Abortando." >&2
  exit 1
fi

if [[ "$APPLY" -eq 1 ]]; then
  echo "[deploy-hermes] APLICANDO (rsync)…"
  rsync -av "${EXCLUDES[@]}" "$SRC" "$DEST"

  # Aplica o `profile describe` de cada agente (roteamento) via CLI do Hermes.
  # describe.txt não é rsyncado — é fonte aplicada pelo CLI (profile describe não é um arquivo em ~/.hermes).
  echo "[deploy-hermes] aplicando profile describe (roteamento)…"
  for d in "${SRC}profiles"/*/describe.txt; do
    [[ -f "$d" ]] || continue
    slug="$(basename "$(dirname "$d")")"
    echo "  - $slug"
    hermes -p "$slug" profile describe --text "$(cat "$d")"
  done

  echo "[deploy-hermes] OK. Rode:  hermes gateway restart   (para recarregar config.yaml)"
else
  echo "[deploy-hermes] DRY-RUN (nada alterado). Use --apply para efetivar."
  rsync -avn "${EXCLUDES[@]}" "$SRC" "$DEST"
  echo "[deploy-hermes] (no --apply: aplicaria 'hermes profile describe' para $(ls "${SRC}profiles"/*/describe.txt 2>/dev/null | wc -l) agente(s))"
fi
