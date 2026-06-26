#!/usr/bin/env bash
# Atualiza o bridge-server com o último main de forma segura.
# BLOQUEIA se houver mudanças não comitadas — evita perda acidental de trabalho.
set -euo pipefail

cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"

# ── 1. Checar mudanças não comitadas ──────────────────────────────────────────
UNSTAGED=$(git diff --name-only)
STAGED=$(git diff --cached --name-only)
UNTRACKED=$(git ls-files --others --exclude-standard)

if [[ -n "$UNSTAGED" || -n "$STAGED" ]]; then
  echo "❌ BLOQUEADO: há mudanças não comitadas."
  echo ""
  [[ -n "$STAGED" ]]   && echo "Staged:"   && echo "$STAGED"   | sed 's/^/  /'
  [[ -n "$UNSTAGED" ]] && echo "Unstaged:" && echo "$UNSTAGED" | sed 's/^/  /'
  echo ""
  echo "Commite ou descarte antes de rodar update-server.sh"
  echo "  git stash          — salva temporariamente"
  echo "  git checkout -- .  — descarta (irreversível)"
  exit 1
fi

if [[ -n "$UNTRACKED" ]]; then
  echo "⚠️  Há arquivos não rastreados (serão preservados, não apagados):"
  echo "$UNTRACKED" | sed 's/^/  /'
  echo ""
fi

# ── 2. Atualizar do main ───────────────────────────────────────────────────────
echo "🔄 Atualizando para origin/main..."
git fetch origin
BEFORE=$(git rev-parse HEAD)
git reset --hard origin/main
AFTER=$(git rev-parse HEAD)

if [[ "$BEFORE" == "$AFTER" ]]; then
  echo "✅ Já estava na versão mais recente ($(git rev-parse --short HEAD))"
else
  echo "✅ Atualizado: $(git rev-parse --short $BEFORE) → $(git rev-parse --short HEAD)"
  git log --oneline "$BEFORE..HEAD" | sed 's/^/  /'
fi

# ── 3. Reiniciar bridge-server ────────────────────────────────────────────────
echo ""
echo "🔁 Reiniciando bridge-server..."
pm2 restart bridge-server
echo "✅ bridge-server reiniciado"
echo ""
pm2 list --no-color | grep bridge-server
