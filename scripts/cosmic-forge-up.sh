#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$REPO_ROOT/.env"
ENV_SAMPLE="$REPO_ROOT/.env.sample"

if [ -f "$ENV_FILE" ]; then
  # shellcheck disable=SC1090
  set -a && . "$ENV_FILE" && set +a
elif [ -f "$ENV_SAMPLE" ]; then
  # shellcheck disable=SC1090
  set -a && . "$ENV_SAMPLE" && set +a
fi

export COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-cosmic-forge}"

cd "$REPO_ROOT"
docker compose -f docker/cosmic-forge-compose.yml up -d --build "$@"
