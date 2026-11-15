#!/usr/bin/env bash
# Spins up a throwaway local Postgres; each *_test.sql gets a fresh database with all migrations applied.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PG_BIN="${PG_BIN:-$(dirname "$(command -v pg_ctl 2>/dev/null || echo /usr/lib/postgresql/16/bin/pg_ctl)")}"
[ -x "$PG_BIN/pg_ctl" ] || PG_BIN=/usr/lib/postgresql/16/bin
WORK="$(mktemp -d)"
PORT=54329

as_pg() {
  if [ "$(id -u)" = 0 ]; then runuser -u postgres -- "$@"; else "$@"; fi
}

cleanup() {
  as_pg "$PG_BIN/pg_ctl" -D "$WORK/data" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT

[ "$(id -u)" = 0 ] && chown postgres "$WORK"
as_pg "$PG_BIN/initdb" -D "$WORK/data" -U postgres -A trust >/dev/null
as_pg "$PG_BIN/pg_ctl" -D "$WORK/data" -o "-k $WORK -p $PORT -c listen_addresses=''" -l "$WORK/log" -w start >/dev/null

PSQL=(psql -h "$WORK" -p "$PORT" -U postgres -v ON_ERROR_STOP=1 -q -X)
"${PSQL[@]}" -d postgres -f "$ROOT/supabase/tests/roles.sql"

for test in "$ROOT"/supabase/tests/*_test.sql; do
  name="$(basename "$test" .sql)"
  echo "── $name"
  "${PSQL[@]}" -d postgres -c "create database $name"
  "${PSQL[@]}" -d "$name" -f "$ROOT/supabase/tests/auth_stub.sql"
  for f in "$ROOT"/supabase/migrations/*.sql; do
    "${PSQL[@]}" -d "$name" -f "$f"
  done
  "${PSQL[@]}" -d "$name" -f "$test" 2>&1 | sed -E 's/^psql:[^ ]+ NOTICE:  //'
done
