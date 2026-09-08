#!/usr/bin/env bash
#
# Staging on the host, for machines that cannot run the container stack.
#
#   ./staging/staging.sh up      # build, start, print the URL
#   ./staging/staging.sh down    # stop both processes
#   ./staging/staging.sh logs    # follow both logs
#
# docker-compose.yml is the reference staging environment and this is not a
# replacement for it — it drops to one Postgres major below production and
# skips the container boundary entirely. What it does keep is the layer that
# has actually broken deployments here: nginx serving the built bundle with its
# own mime.types, /api proxied same-origin, and VITE_API_URL baked in at build
# time rather than read at runtime. A laptop without the disk for a VM can
# still catch that class of bug before it reaches production.
#
# Everything runs on 127.0.0.1 and nothing is published to the network.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN="$ROOT/staging/.run"

WEB_PORT="${STAGING_WEB_PORT:-8081}"
API_PORT="${STAGING_API_PORT:-8090}"
ORIGIN="http://localhost:$WEB_PORT"

# Its own database, so staging traffic never lands in the one the dev server is
# writing to and a destructive migration is caught here rather than there.
STAGING_DB="${STAGING_DB:-wit_staging}"

# Staging exercises the production path: migration 000009 removes the demo
# accounts, and the only way back in is the bootstrap admin being rotated at
# boot — the same setting a real deployment has to get right.
ADMIN_EMAIL="${BOOTSTRAP_ADMIN_EMAIL:-admin@wit.id}"
ADMIN_PASSWORD="${BOOTSTRAP_ADMIN_PASSWORD:-staging-admin-1234}"

# Node 18+ is required and may not be what `node` resolves to. nvm's copy is
# used when the one on PATH is too old, so the script works without the caller
# having sourced anything.
node_ok() { command -v node >/dev/null && [ "$(node -pe 'process.versions.node.split(".")[0]')" -ge 18 ] 2>/dev/null; }
if ! node_ok; then
  for candidate in "$HOME"/.nvm/versions/node/v*/bin; do
    [ -x "$candidate/node" ] || continue
    PATH="$candidate:$PATH"
    node_ok && break
  done
fi
node_ok || { echo "staging: need Node 18+, found $(node -v 2>&1)" >&2; exit 1; }

# psql/pg_isready are keg-only in Homebrew, so PATH may not have them.
for pg in /usr/local/opt/postgresql@*/bin /opt/homebrew/opt/postgresql@*/bin /usr/local/opt/libpq/bin; do
  [ -d "$pg" ] && PATH="$PATH:$pg"
done

port_busy() { nc -z 127.0.0.1 "$1" 2>/dev/null; }

down() {
  for name in api web; do
    pidfile="$RUN/$name.pid"
    [ -f "$pidfile" ] || continue
    pid="$(cat "$pidfile")"
    if kill -0 "$pid" 2>/dev/null; then
      # nginx wants its own quit signal; the API is a plain process.
      [ "$name" = web ] && kill -QUIT "$pid" 2>/dev/null || kill "$pid" 2>/dev/null
      echo "staging: stopped $name (pid $pid)"
    fi
    rm -f "$pidfile"
  done

  # A pid file is not enough on its own. `go run` used to leave its compiled
  # child holding the port after the parent was killed, and a stale run
  # directory then looks like "port already in use" with nothing to stop. Only
  # processes started from this run directory are matched, so a stray kill
  # cannot reach anything else on the machine.
  for pid in $(lsof -t -nP -iTCP:"$API_PORT" -sTCP:LISTEN 2>/dev/null); do
    [ "$(lsof -p "$pid" -Fn 2>/dev/null | grep -c "^n$RUN/api$")" -gt 0 ] || continue
    kill "$pid" 2>/dev/null && echo "staging: stopped orphaned api (pid $pid)"
  done
}

up() {
  command -v nginx >/dev/null || { echo "staging: nginx not installed — brew install nginx" >&2; exit 1; }
  mkdir -p "$RUN/logs"

  down

  # --- database -----------------------------------------------------------
  # Read DB_* from the backend's own .env so staging and development cannot
  # drift apart on host, port or credentials.
  # Read only the DB_* lines, and read them rather than sourcing the file:
  # backend/.env holds SMTP_FROM=WIT <no-reply@wit.id>, and a shell asked to
  # source that sees a redirect and dies on a syntax error.
  if [ -f "$ROOT/backend/.env" ]; then
    while IFS='=' read -r key value; do
      value="${value%\"}"; value="${value#\"}"
      export "$key=$value"
    done < <(grep -E '^DB_[A-Z_]+=' "$ROOT/backend/.env")
  fi
  DB_HOST="${DB_HOST:-localhost}"; DB_PORT="${DB_PORT:-5432}"
  DB_USER="${DB_USER:-wit}"; DB_PASSWORD="${DB_PASSWORD:-wit}"
  DSN="postgres://$DB_USER:$DB_PASSWORD@$DB_HOST:$DB_PORT/$STAGING_DB?sslmode=${DB_SSLMODE:-disable}"

  if ! psql "$DSN" -c 'select 1' >/dev/null 2>&1; then
    echo "staging: creating database $STAGING_DB"
    createdb -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -O "$DB_USER" "$STAGING_DB"
  fi
  echo "staging: applying migrations to $STAGING_DB"
  migrate -path "$ROOT/backend/migrations" -database "$DSN" up 2>&1 | sed 's/^/  /' || true

  # --- frontend -----------------------------------------------------------
  # /api, not an absolute URL: the bundle must call the same origin it was
  # served from, which is the whole point of putting nginx in front.
  echo "staging: building frontend with VITE_API_URL=/api"
  ( cd "$ROOT" && VITE_API_URL=/api npm run build ) >"$RUN/logs/build.log" 2>&1 \
    || { echo "staging: build failed — see staging/.run/logs/build.log" >&2; exit 1; }

  # --- api ----------------------------------------------------------------
  port_busy "$API_PORT" && { echo "staging: port $API_PORT already in use" >&2; exit 1; }

  # Compile first and run the binary, rather than `go run`. Production runs a
  # built binary too, and it removes a compile from the startup path — after a
  # toolchain upgrade `go run` rebuilds the standard library and takes long
  # enough to look like a server that failed to come up.
  echo "staging: building API"
  ( cd "$ROOT/backend" && go build -o "$RUN/api" ./cmd/api ) >"$RUN/logs/api-build.log" 2>&1 \
    || { echo "staging: API build failed — see staging/.run/logs/api-build.log" >&2; exit 1; }

  echo "staging: starting API on 127.0.0.1:$API_PORT"
  # `exec` so the recorded pid is the API and not the subshell around it —
  # otherwise `down` kills the wrapper and leaves the server holding the port.
  # The cd is what lets config.go find backend/.env for DB_HOST/PORT/USER;
  # godotenv.Load does not overwrite variables already in the environment, so
  # the staging values set here still win.
  ( cd "$ROOT/backend" && exec env \
      DB_NAME="$STAGING_DB" HTTP_PORT="$API_PORT" \
      CORS_ORIGINS="$ORIGIN" APP_BASE_URL="$ORIGIN" \
      BOOTSTRAP_ADMIN_EMAIL="$ADMIN_EMAIL" BOOTSTRAP_ADMIN_PASSWORD="$ADMIN_PASSWORD" \
      UPLOAD_DIR="$RUN/uploads" \
      "$RUN/api" >"$RUN/logs/api.log" 2>&1 ) &
  echo $! >"$RUN/api.pid"

  for _ in $(seq 1 60); do port_busy "$API_PORT" && break; sleep 1; done
  port_busy "$API_PORT" || { echo "staging: API did not start — see staging/.run/logs/api.log" >&2; down; exit 1; }

  # --- nginx --------------------------------------------------------------
  port_busy "$WEB_PORT" && { echo "staging: port $WEB_PORT already in use" >&2; down; exit 1; }

  # nginx.conf in the repo root is a server block meant to be included by the
  # container's nginx. Here it has to be a whole configuration, so the same
  # block is wrapped and its two container-specific values substituted: the
  # document root, and the backend's address.
  mime="$(nginx -V 2>&1 | sed -n 's/.*--conf-path=\([^ ]*\)\/nginx.conf.*/\1/p')/mime.types"
  [ -f "$mime" ] || mime=/usr/local/etc/nginx/mime.types
  {
    echo "worker_processes 1;"
    echo "daemon on;"
    # Every path is quoted: a checkout under a directory with a space in its
    # name is otherwise read as extra arguments and nginx refuses to start.
    echo "pid \"$RUN/web.pid\";"
    echo "error_log \"$RUN/logs/nginx-error.log\";"
    echo "events { worker_connections 256; }"
    echo "http {"
    echo "  include \"$mime\";"
    echo "  default_type application/octet-stream;"
    echo "  access_log \"$RUN/logs/nginx-access.log\";"
    echo "  sendfile on;"
    sed -e "s|listen 8080;|listen 127.0.0.1:$WEB_PORT;|" \
        -e "s|root /usr/share/nginx/html;|root \"$ROOT/dist\";|" \
        -e "s|proxy_pass http://backend:8080/;|proxy_pass http://127.0.0.1:$API_PORT/;|" \
        "$ROOT/nginx.conf" | sed 's/^/  /'
    echo "}"
  } >"$RUN/nginx.conf"

  nginx -c "$RUN/nginx.conf" -p "$RUN" -t >"$RUN/logs/nginx-test.log" 2>&1 \
    || { cat "$RUN/logs/nginx-test.log" >&2; down; exit 1; }
  nginx -c "$RUN/nginx.conf" -p "$RUN"
  echo "staging: nginx on $ORIGIN"

  echo
  echo "  Staging   $ORIGIN"
  echo "  API       $ORIGIN/api/healthz  (direct: http://127.0.0.1:$API_PORT)"
  echo "  Sign in   $ADMIN_EMAIL / $ADMIN_PASSWORD"
  echo "  Stop      ./staging/staging.sh down"
}

case "${1:-up}" in
  up)   up ;;
  down) down ;;
  logs) tail -f "$RUN/logs/api.log" "$RUN/logs/nginx-error.log" ;;
  *)    echo "usage: $0 [up|down|logs]" >&2; exit 1 ;;
esac
