#!/usr/bin/env bash
# End-to-end check of the app's data layer: local Postgres + PostgREST (Supabase's REST server)
# with the real supabase-js client, signed in as two different users.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PG_BIN=/usr/lib/postgresql/16/bin
[ -x "$PG_BIN/pg_ctl" ] || PG_BIN="$(dirname "$(command -v pg_ctl)")"
PGRST_VERSION=v12.2.3
PGRST="${PGRST_BIN:-$HOME/.cache/vapro/postgrest-$PGRST_VERSION}"
WORK="$(mktemp -d)"
PG_PORT=54330
API_PORT=54331
JWT_SECRET="integration-test-secret-at-least-32-characters-long"

if [ ! -x "$PGRST" ]; then
  mkdir -p "$(dirname "$PGRST")"
  curl -sSL "https://github.com/PostgREST/postgrest/releases/download/$PGRST_VERSION/postgrest-$PGRST_VERSION-linux-static-x64.tar.xz" \
    | tar -xJ -O postgrest > "$PGRST"
  chmod +x "$PGRST"
fi

as_pg() {
  if [ "$(id -u)" = 0 ]; then runuser -u postgres -- "$@"; else "$@"; fi
}

PGRST_PID=""
cleanup() {
  [ -n "$PGRST_PID" ] && kill "$PGRST_PID" 2>/dev/null || true
  as_pg "$PG_BIN/pg_ctl" -D "$WORK/data" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT

[ "$(id -u)" = 0 ] && chown postgres "$WORK"
as_pg "$PG_BIN/initdb" -D "$WORK/data" -U postgres -A trust >/dev/null
as_pg "$PG_BIN/pg_ctl" -D "$WORK/data" -o "-k $WORK -p $PG_PORT -c listen_addresses=localhost" -l "$WORK/log" -w start >/dev/null

PSQL=(psql -h "$WORK" -p "$PG_PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -q -X)
"${PSQL[@]}" -f "$ROOT/supabase/tests/roles.sql"
"${PSQL[@]}" -c "create role authenticator login noinherit; grant anon, authenticated to authenticator;"
"${PSQL[@]}" -f "$ROOT/supabase/tests/auth_stub.sql"
for f in "$ROOT"/supabase/migrations/*.sql; do "${PSQL[@]}" -f "$f"; done
"${PSQL[@]}" -c "insert into auth.users (id, email, raw_user_meta_data) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'ali@example.test', '{\"display_name\":\"Ali\"}'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'bee@example.test', '{}'),
  ('cccccccc-0000-0000-0000-000000000003', 'cara@example.test', '{}'),
  ('dddddddd-0000-0000-0000-000000000004', 'dan@example.test', '{}'),
  ('eeeeeeee-0000-0000-0000-000000000005', 'eva@example.test', '{}');"

PGRST_DB_URI="postgres://authenticator@localhost:$PG_PORT/postgres" \
PGRST_DB_SCHEMAS=public \
PGRST_DB_ANON_ROLE=anon \
PGRST_JWT_SECRET="$JWT_SECRET" \
PGRST_SERVER_PORT=$API_PORT \
PGRST_LOG_LEVEL=crit \
  "$PGRST" >"$WORK/pgrst.log" 2>&1 &
PGRST_PID=$!

for _ in $(seq 1 50); do
  curl -sf "http://localhost:$API_PORT/" >/dev/null 2>&1 && break
  sleep 0.2
done

if [ -n "${HOLD:-}" ]; then
  echo "READY postgrest=http://localhost:$API_PORT pg=$WORK:$PG_PORT"
  wait "$PGRST_PID"
  exit 0
fi

cd "$ROOT"
PGRST_URL="http://localhost:$API_PORT" PGRST_JWT_SECRET="$JWT_SECRET" \
  npx vitest run src/integration --reporter=verbose
