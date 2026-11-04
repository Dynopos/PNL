#!/usr/bin/env bash
# Spins up a throwaway local Postgres, applies the migrations and runs the RLS tests.
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

PSQL=(psql -h "$WORK" -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -q -X)
"${PSQL[@]}" -f "$ROOT/supabase/tests/auth_stub.sql"
for f in "$ROOT"/supabase/migrations/*.sql; do
  echo "apply $(basename "$f")"
  "${PSQL[@]}" -f "$f"
done
"${PSQL[@]}" -f "$ROOT/supabase/tests/rls_test.sql"
