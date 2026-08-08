#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$REPO_ROOT/.env"
ENV_SAMPLE="$REPO_ROOT/.env.sample"
COMPOSE_ENV_FILE=""

if [ -f "$ENV_FILE" ]; then
  COMPOSE_ENV_FILE="$ENV_FILE"
  # shellcheck disable=SC1090
  set -a && . "$ENV_FILE" && set +a
elif [ -f "$ENV_SAMPLE" ]; then
  COMPOSE_ENV_FILE="$ENV_SAMPLE"
  # shellcheck disable=SC1090
  set -a && . "$ENV_SAMPLE" && set +a
fi

COMPOSE_ENV_ARGS=()
if [ -n "$COMPOSE_ENV_FILE" ]; then
  COMPOSE_ENV_ARGS=(--env-file "$COMPOSE_ENV_FILE")
fi

export COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-cosmic-forge}"

cd "$REPO_ROOT"
docker compose "${COMPOSE_ENV_ARGS[@]}" -f docker/cosmic-forge-compose.yml up -d --build "$@"
