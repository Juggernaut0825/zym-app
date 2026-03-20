#!/usr/bin/env bash
set -euo pipefail

SERVER_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SQLITE_PATH="${SQLITE_PATH:-$SERVER_ROOT/data/zym.db}"
EXPORT_DIR="${EXPORT_DIR:-$SERVER_ROOT/data/postgres-export}"
DATABASE_URL="${DATABASE_URL:-}"

if [[ -z "$DATABASE_URL" ]]; then
  echo "DATABASE_URL is required"
  exit 1
fi

cd "$SERVER_ROOT"

echo "[bootstrap-postgres] exporting SQLite data from $SQLITE_PATH"
npx tsx scripts/export-sqlite-to-postgres.ts --sqlite "$SQLITE_PATH" --out "$EXPORT_DIR"

echo "[bootstrap-postgres] generating Postgres import SQL in $EXPORT_DIR/import.sql"
npx tsx scripts/generate-postgres-import-sql.ts --in "$EXPORT_DIR" --out "$EXPORT_DIR/import.sql"

echo "[bootstrap-postgres] applying schema"
psql "$DATABASE_URL" -f src/database/schema.sql

echo "[bootstrap-postgres] importing data"
psql "$DATABASE_URL" -f "$EXPORT_DIR/import.sql"

echo "[bootstrap-postgres] completed"
