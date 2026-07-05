#!/usr/bin/env bash
# ponytail: script só cobre os passos locais (dump/verificação/arquivamento) do
# docs/runbooks/RUNBOOK-SQUASH-BASELINE.md. O repair de supabase_migrations.schema_migrations
# (seção 4 do runbook) é manual e exige aprovação do Wandson — nunca roda automaticamente aqui.
set -euo pipefail

MIGRATIONS_DIR="supabase/migrations"
ARCHIVE_DIR="supabase/migrations_archive"
BASELINE_NAME="00000000000000_baseline.sql"
BASELINE_FILE="$MIGRATIONS_DIR/$BASELINE_NAME"
# array, não string — "$SUPABASE_CMD" (string) quebraria com word-splitting perdido pelas aspas
SUPABASE_CMD=(${SUPABASE_CMD:-npx --yes supabase})

echo "== 1/4: pré-checagem =="
if [ -f "$BASELINE_FILE" ]; then
  echo "ERRO: $BASELINE_FILE já existe. Remova antes de rodar de novo (script é idempotente, não sobrescreve)." >&2
  exit 1
fi

before_count=$(find "$MIGRATIONS_DIR" -maxdepth 1 -name '*.sql' | wc -l | tr -d ' ')
echo "Migrations atuais em $MIGRATIONS_DIR: $before_count"

echo "== 2/4: dump do schema de produção (read-only, --linked) =="
# --linked = conexão real e ao vivo com prod pela rede (não é local/offline); só leitura de
# catálogo/schema, nenhum INSERT/UPDATE/DELETE/DDL é executado.
"${SUPABASE_CMD[@]}" db dump --linked -f "$BASELINE_FILE" \
  || { echo "ERRO: dump falhou (provável falta de credencial — rode '${SUPABASE_CMD[*]} login' ou exporte SUPABASE_ACCESS_TOKEN). Nada foi arquivado." >&2; exit 1; }

if [ ! -s "$BASELINE_FILE" ]; then
  echo "ERRO: dump não gerou conteúdo. Abortando ANTES de arquivar nada." >&2
  rm -f "$BASELINE_FILE"
  exit 1
fi

echo "== 3/4: verificação do dump =="
table_count=$(grep -c '^CREATE TABLE' "$BASELINE_FILE" || true)
policy_count=$(grep -c '^CREATE POLICY' "$BASELINE_FILE" || true)
ext_count=$(grep -c '^CREATE EXTENSION' "$BASELINE_FILE" || true)
echo "CREATE TABLE: $table_count | CREATE POLICY: $policy_count | CREATE EXTENSION: $ext_count"

if [ "$table_count" -eq 0 ]; then
  echo "ERRO: dump sem nenhuma CREATE TABLE — schema vazio ou dump incompleto. Abortando ANTES de arquivar." >&2
  rm -f "$BASELINE_FILE"
  exit 1
fi

echo "== 4/4: arquivamento das migrations antigas (git mv, reversível) =="
mkdir -p "$ARCHIVE_DIR"
for f in "$MIGRATIONS_DIR"/*.sql; do
  base="$(basename "$f")"
  [ "$base" = "$BASELINE_NAME" ] && continue
  git mv "$f" "$ARCHIVE_DIR/$base"
done

after_count=$(find "$MIGRATIONS_DIR" -maxdepth 1 -name '*.sql' | wc -l | tr -d ' ')
archived_count=$(find "$ARCHIVE_DIR" -maxdepth 1 -name '*.sql' | wc -l | tr -d ' ')
echo "Migrations em $MIGRATIONS_DIR após arquivamento: $after_count (esperado: 1, a baseline)"
echo "Arquivadas em $ARCHIVE_DIR: $archived_count"

cat <<'EOF'

PRÓXIMO PASSO (manual, fora deste script, precisa aprovação do Wandson):
  repair de supabase_migrations.schema_migrations — ver seção 4 de
  docs/runbooks/RUNBOOK-SQUASH-BASELINE.md. Este script NUNCA mexe nessa tabela.
EOF
