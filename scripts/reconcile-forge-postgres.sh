#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
COMPOSE_FILE="$REPO_ROOT/docker/cosmic-forge-compose.yml"
ENV_FILE="$REPO_ROOT/.env"
ENV_SAMPLE="$REPO_ROOT/.env.sample"
COMPOSE_ENV_ARGS=()

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
FORGE_POSTGRES_FORCE_PASSWORD_RESET="$(normalize_env_value "${FORGE_POSTGRES_FORCE_PASSWORD_RESET:-false}")"
export FORGE_POSTGRES_DB FORGE_POSTGRES_USER FORGE_POSTGRES_PASSWORD FORGE_POSTGRES_HOST_PORT

: "${FORGE_POSTGRES_DB:=cosmic_forge}"
: "${FORGE_POSTGRES_USER:=cosmic_forge}"
: "${FORGE_POSTGRES_PASSWORD:?Set FORGE_POSTGRES_PASSWORD in .env or .env.sample}"

# Always converge the sidecar on the current Compose configuration before
# validating credentials. The named data volume is preserved if Compose needs
# to recreate a container whose environment or published-port binding drifted.
echo "[forge-postgres] converging postgres sidecar with current compose configuration"
docker compose "${COMPOSE_ENV_ARGS[@]}" -f "$COMPOSE_FILE" up -d postgres >/dev/null

container_id="$(docker compose "${COMPOSE_ENV_ARGS[@]}" -f "$COMPOSE_FILE" ps -q postgres)"
if [ -z "$container_id" ]; then
  echo "[forge-postgres] unable to locate postgres container" >&2
  exit 1
fi

published_binding="$(docker port "$container_id" 5432/tcp 2>/dev/null | head -n 1 | tr -d '\r')"
if [ -n "$published_binding" ]; then
  echo "[forge-postgres] docker published binding: ${published_binding}"
else
  echo "[forge-postgres] postgres container has no published 5432/tcp binding" >&2
  exit 1
fi

echo "[forge-postgres] waiting for local postgres socket readiness"
ready=false
for _ in $(seq 1 30); do
  if docker exec "$container_id" pg_isready -U "$FORGE_POSTGRES_USER" -d "$FORGE_POSTGRES_DB" >/dev/null 2>&1; then
    ready=true
    break
  fi
  sleep 1
done

if [ "$ready" != "true" ]; then
  echo "[forge-postgres] postgres did not become ready" >&2
  exit 1
fi

# An internal TCP connection can match a different pg_hba.conf rule from a
# connection arriving through Docker's bridge. Therefore an internal success is
# useful as a health signal, but it is not authoritative proof that the host
# path can authenticate. The wrapper can request a one-time forced role reset
# after a real host-side SQLSTATE 28P01 failure.
if [ "$FORGE_POSTGRES_FORCE_PASSWORD_RESET" != "true" ]; then
  if docker exec \
    -e PGPASSWORD="$FORGE_POSTGRES_PASSWORD" \
    "$container_id" \
    psql -h 127.0.0.1 -U "$FORGE_POSTGRES_USER" -d "$FORGE_POSTGRES_DB" -tAc "SELECT 1" \
    >/dev/null 2>&1; then
    echo "[forge-postgres] internal TCP credential check passed"
    exit 0
  fi
fi

if [ "$FORGE_POSTGRES_FORCE_PASSWORD_RESET" = "true" ]; then
  echo "[forge-postgres] host authentication failed; forcing persisted role password reset"
else
  echo "[forge-postgres] internal TCP credential check failed; reconciling persisted role password"
fi

escaped_user=${FORGE_POSTGRES_USER//\"/\"\"}
escaped_password=${FORGE_POSTGRES_PASSWORD//\'/\'\'}
printf 'ALTER ROLE "%s" WITH PASSWORD '\''%s'\'';\n' "$escaped_user" "$escaped_password" |
  docker exec -i "$container_id" \
    psql -U "$FORGE_POSTGRES_USER" -d "$FORGE_POSTGRES_DB" -v ON_ERROR_STOP=1 \
    >/dev/null

if ! docker exec \
  -e PGPASSWORD="$FORGE_POSTGRES_PASSWORD" \
  "$container_id" \
  psql -h 127.0.0.1 -U "$FORGE_POSTGRES_USER" -d "$FORGE_POSTGRES_DB" -tAc "SELECT 1" \
  >/dev/null 2>&1; then
  echo "[forge-postgres] role password reset did not validate on container TCP" >&2
  exit 1
fi

echo "[forge-postgres] role password reset complete; persisted data volume was preserved"
