#!/usr/bin/env bash
# QA Verification Runner — Consult Delivery
# Uso: ./scripts/qa-run.sh [--no-build] [--no-bundle]
# Retorna exit 0 se tudo passou, exit 1 se algum teste falhou.

set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

PROD_URL="https://app.consultdelivery.com.br"
SKIP_BUILD=false
SKIP_BUNDLE=false
for arg in "$@"; do
  [[ "$arg" == "--no-build"  ]] && SKIP_BUILD=true
  [[ "$arg" == "--no-bundle" ]] && SKIP_BUNDLE=true
done

passed=0; failed=0
declare -a results=()

ok()   { results+=("✅ $1"); ((passed++)); }
fail() { results+=("❌ $1"); ((failed++)); }

echo "═══════════════════════════════════════════"
echo "  QA Verification — $(date '+%Y-%m-%d %H:%M')"
echo "═══════════════════════════════════════════"

# ── TEST 1: Build ────────────────────────────────
if [[ "$SKIP_BUILD" == false ]]; then
  echo "→ Build..."
  build_out=$(npm run build 2>&1 | tail -4)
  if echo "$build_out" | grep -q "built in"; then
    ok "Build passou"
  else
    fail "Build FALHOU:\n$build_out"
  fi
fi

# ── TEST 2: Colunas inexistentes em queries Supabase ─
echo "→ Verificando colunas problemáticas conhecidas..."

# BomDia: picture_url não existe em whatsapp_groups
if grep -rn "picture_url" src/ --include="*.jsx" --include="*.tsx" 2>/dev/null \
   | grep -q "\.select("; then
  fail "picture_url encontrada em .select() — coluna não existe em whatsapp_groups"
else
  ok "Sem colunas inexistentes em queries (picture_url)"
fi

# ── TEST 3: Bundle de produção ────────────────────
if [[ "$SKIP_BUNDLE" == false ]]; then
  echo "→ Bundle de produção..."
  bundle_raw=$(curl -s --connect-timeout 5 "$PROD_URL/" 2>/dev/null | grep -o '"[^"]*\.js"' | head -1 | tr -d '"')
  if [[ -n "$bundle_raw" ]]; then
    ok "Bundle ativo: $bundle_raw"
  else
    fail "Não foi possível obter bundle (prod offline ou timeout)"
  fi
fi

# ── TEST 4: Sem console.log de secrets ───────────
echo "→ Verificando logs de segurança..."
if grep -rn "console\.log.*password\|console\.log.*senha\|console\.log.*token\|console\.log.*apikey" \
   src/ --include="*.jsx" --include="*.tsx" --include="*.ts" 2>/dev/null | grep -qv "//"; then
  fail "console.log com dado sensível detectado"
else
  ok "Sem logs de dados sensíveis"
fi

# ── Resultado ─────────────────────────────────────
echo ""
echo "── Resultados ──────────────────────────────"
for r in "${results[@]}"; do
  echo "  $r"
done
echo ""
echo "  Total: $passed passou · $failed falhou"
echo "═══════════════════════════════════════════"

[[ $failed -eq 0 ]]
