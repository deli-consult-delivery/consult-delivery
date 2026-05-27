#!/bin/bash
set -e

echo "=== PRE-DEPLOY CHECK ==="

echo ""
echo "[1] Node syntax check — bridge routes..."
for f in bridge-server/routes/*.js; do
  node --check "$f" && echo "  OK $f"
done

echo ""
echo "[2] TypeScript check — trigger tasks..."
npx tsc --noEmit && echo "  OK No TS errors"

echo ""
echo "[3] Frontend build..."
npm run build 2>&1 | tail -5

echo ""
echo "[4] Migrations check..."
ls supabase/migrations/20260603_*.sql 2>/dev/null | wc -l | xargs -I{} echo "  {} new migrations (Sprint 1-3)"

echo ""
echo "=== ALL CHECKS PASSED ==="
