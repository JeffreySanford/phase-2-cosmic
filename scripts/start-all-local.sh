#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$REPO_ROOT/.env"
ENV_SAMPLE="$REPO_ROOT/.env.sample"
FORGE_COMPOSE_FILE="$REPO_ROOT/docker/cosmic-forge-compose.yml"
COMPOSE_ENV_ARGS=()

# A Windows-created private .env may use CRLF. Docker Compose parses CRLF
# correctly, but sourcing the same file through sh can retain a carriage return
# in credential values. Normalize only line endings (not values) before any
# shell sourcing so Docker Compose, shell scripts and Windows-native Node all
# receive identical credential bytes. The private file remains gitignored.
if [ -f "$ENV_FILE" ]; then
  node -e '
    const fs = require("fs");
    const p = process.argv[1];
    const before = fs.readFileSync(p, "utf8");
    const after = before.replace(/\r\n/g, "\n");
    if (after !== before) {
      fs.writeFileSync(p, after, "utf8");
      console.log("[forge-postgres] normalized private .env line endings (CRLF -> LF)");
    }
  ' "$ENV_FILE"
fi

if [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
  COMPOSE_ENV_ARGS=(--env-file "$ENV_FILE")
elif [ -f "$ENV_SAMPLE" ]; then
  set -a
  # shellcheck disable=SC1090
  . "$ENV_SAMPLE"
  set +a
  COMPOSE_ENV_ARGS=(--env-file "$ENV_SAMPLE")
fi

normalize_env_value() {
  printf '%s' "$1" | tr -d '\r'
}

FORGE_POSTGRES_DB="$(normalize_env_value "${FORGE_POSTGRES_DB:-cosmic_forge}")"
FORGE_POSTGRES_USER="$(normalize_env_value "${FORGE_POSTGRES_USER:-cosmic_forge}")"
FORGE_POSTGRES_PASSWORD="$(normalize_env_value "${FORGE_POSTGRES_PASSWORD:-}")"
FORGE_POSTGRES_HOST_PORT="$(normalize_env_value "${FORGE_POSTGRES_HOST_PORT:-55432}")"
export FORGE_POSTGRES_DB FORGE_POSTGRES_USER FORGE_POSTGRES_PASSWORD FORGE_POSTGRES_HOST_PORT

: "${FORGE_POSTGRES_DB:=cosmic_forge}"
: "${FORGE_POSTGRES_USER:=cosmic_forge}"
: "${FORGE_POSTGRES_PASSWORD:?Set FORGE_POSTGRES_PASSWORD in .env or .env.sample}"
: "${FORGE_POSTGRES_HOST_PORT:=55432}"

sh "$REPO_ROOT/scripts/reconcile-forge-postgres.sh"

published_binding="$(docker compose "${COMPOSE_ENV_ARGS[@]}" -f "$FORGE_COMPOSE_FILE" port postgres 5432 2>/dev/null | head -n 1 | tr -d '\r')"
actual_host_port="${published_binding##*:}"
if ! printf '%s' "$actual_host_port" | grep -Eq '^[0-9]+$'; then
  echo "[forge-postgres] unable to determine Docker-published host port from: ${published_binding:-<empty>}" >&2
  exit 1
fi

if [ "$actual_host_port" != "$FORGE_POSTGRES_HOST_PORT" ]; then
  echo "[forge-postgres] configured host port ${FORGE_POSTGRES_HOST_PORT} differs from running Docker binding ${published_binding}; using ${actual_host_port}"
fi
FORGE_POSTGRES_HOST_PORT="$actual_host_port"
export FORGE_POSTGRES_HOST_PORT

urlencode() {
  node -e 'process.stdout.write(encodeURIComponent(process.argv[1] ?? ""))' "$1"
}

encoded_user="$(urlencode "$FORGE_POSTGRES_USER")"
encoded_db="$(urlencode "$FORGE_POSTGRES_DB")"

export PGHOST="127.0.0.1"
export PGPORT="$FORGE_POSTGRES_HOST_PORT"
export PGUSER="$FORGE_POSTGRES_USER"
export PGPASSWORD="$FORGE_POSTGRES_PASSWORD"
export PGDATABASE="$FORGE_POSTGRES_DB"
export FORGE_POSTGRES_URL="postgresql://${encoded_user}@127.0.0.1:${FORGE_POSTGRES_HOST_PORT}/${encoded_db}"

echo "[forge-postgres] prepared SSR connection on Docker-published port ${FORGE_POSTGRES_HOST_PORT} (password kept out of URL)"

# The host path is authoritative. If PostgreSQL reports invalid_password while
# the container-side check passed, the two connections likely matched different
# pg_hba.conf rules. Reset the role password once through the local admin socket
# and retry the exact Windows-host -> Docker path before giving up.
verify_status=0
node "$REPO_ROOT/scripts/verify-forge-postgres.mjs" || verify_status=$?
if [ "$verify_status" -eq 28 ]; then
  echo "[forge-postgres] host path rejected the password; performing one forced role reset and retry"
  FORGE_POSTGRES_FORCE_PASSWORD_RESET=true sh "$REPO_ROOT/scripts/reconcile-forge-postgres.sh"
  verify_status=0
  node "$REPO_ROOT/scripts/verify-forge-postgres.mjs" || verify_status=$?
fi

if [ "$verify_status" -ne 0 ]; then
  echo "[forge-postgres] host-side verification remains unavailable after reconciliation (exit=${verify_status})" >&2
  exit "$verify_status"
fi

exec sh "$REPO_ROOT/scripts/start-all.sh"
