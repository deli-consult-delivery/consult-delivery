#!/usr/bin/env bash
# verify-deploy.sh — guarda de deploy que PROVA que o bundle mudou em produção.
#
# Motivação (PR #719): Actions reportou "success" mas o build interno do
# GitHub Pages travou em "building" 30+ min e o site seguiu servindo o
# bundle ANTIGO. O qa-run.sh só checava "existe bundle ativo" — não detectava
# que o bundle NÃO mudou. Este script fecha esse gap.
#
# Uso: bash scripts/verify-deploy.sh [--expect <bundle.js>] [--prev <bundle.js>] [--timeout <s>]

set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

REPO="deli-consult-delivery/consult-delivery"
PROD_URL="https://app.consultdelivery.com.br"
EXPECT=""
PREV=""
TIMEOUT=600
INTERVAL=20

while [[ $# -gt 0 ]]; do
  case "$1" in
    --expect) EXPECT="$2"; shift 2 ;;
    --prev) PREV="$2"; shift 2 ;;
    --timeout) TIMEOUT="$2"; shift 2 ;;
    *) echo "Argumento desconhecido: $1" >&2; exit 1 ;;
  esac
done

ts() { date '+%Y-%m-%d %H:%M:%S'; }
log() { echo "[$(ts)] $1"; }

# ── Resolve bundle esperado ─────────────────────────
if [[ -z "$EXPECT" ]]; then
  log "→ Resolvendo bundle esperado a partir do último run de deploy.yml..."
  run_id=$(gh run list --repo "$REPO" --workflow=deploy.yml --limit 1 --json databaseId -q '.[0].databaseId')
  if [[ -z "$run_id" ]]; then
    log "❌ Não foi possível obter o run mais recente de deploy.yml"
    exit 1
  fi
  candidates=$(gh run view "$run_id" --repo "$REPO" --log 2>/dev/null | grep -oE 'index-[A-Za-z0-9_-]+\.js' | sort -u)
  if [[ -n "$PREV" ]]; then
    candidates=$(echo "$candidates" | grep -v -F "$PREV")
  fi
  count=$(echo "$candidates" | grep -c . || true)
  if [[ "$count" -eq 0 ]]; then
    log "❌ Nenhum bundle candidato encontrado no log do run $run_id"
    exit 1
  elif [[ "$count" -gt 1 ]]; then
    log "❌ Ambíguo: múltiplos bundles candidatos no run $run_id:"
    echo "$candidates" | sed 's/^/    /'
    log "Use --expect <bundle.js> para desambiguar."
    exit 1
  fi
  EXPECT="$candidates"
  log "  Bundle esperado (run $run_id): $EXPECT"
else
  log "→ Bundle esperado (via --expect): $EXPECT"
fi

# ── Loop de verificação ──────────────────────────────
start_ts=$(date +%s)
rebuild_triggered=false

while true; do
  now_ts=$(date +%s)
  elapsed=$((now_ts - start_ts))

  served=$(curl -s --connect-timeout 5 "${PROD_URL}/?cb=$RANDOM" 2>/dev/null | grep -oE 'index-[A-Za-z0-9_-]+\.js' | head -1)
  log "→ Servido: ${served:-<vazio>} (esperado: $EXPECT) — ${elapsed}s decorridos"

  if [[ "$served" == "$EXPECT" ]]; then
    log "✅ Deploy confirmado em produção: $served"
    exit 0
  fi

  if [[ "$elapsed" -ge "$TIMEOUT" ]]; then
    log "❌ Timeout após ${TIMEOUT}s. Servido: ${served:-<vazio>} | Esperado: $EXPECT"
    exit 1
  fi

  pages_status=$(gh api "repos/${REPO}/pages/builds/latest" -q .status 2>/dev/null)
  log "  Pages build status: ${pages_status:-<desconhecido>}"

  if [[ "$pages_status" == "errored" ]]; then
    error_msg=$(gh api "repos/${REPO}/pages/builds/latest" -q .error.message 2>/dev/null)
    log "❌ Pages build ERRORED: $error_msg"
    exit 1
  fi

  if [[ "$pages_status" == "queued" || "$pages_status" == "building" ]]; then
    log "  Build já em andamento (queued/building) — aguardando, sem disparar novo rebuild."
  elif [[ "$elapsed" -ge 300 && "$rebuild_triggered" == false ]]; then
    log "⚠️  Bundle divergente há mais de 5min e nenhum build em andamento. Disparando rebuild..."
    gh api -X POST "repos/${REPO}/pages/builds" >/dev/null 2>&1
    rebuild_triggered=true
    log "  Rebuild disparado (única vez por execução)."
  fi

  sleep "$INTERVAL"
done
