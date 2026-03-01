#!/usr/bin/env bash
set -euo pipefail

COMPOSE_FILE=docker/dev-compose.yml

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$REPO_ROOT/.env"
ENV_SAMPLE="$REPO_ROOT/.env.sample"
# Load environment variables from .env (private) or .env.sample (fallback)
if [ -f "$ENV_FILE" ]; then
	echo "[start-all] Loading environment from $ENV_FILE"
 	set -a
 	# shellcheck disable=SC1090
 	. "$ENV_FILE"
 	set +a
elif [ -f "$ENV_SAMPLE" ]; then
 	echo "[start-all] Loading environment from $ENV_SAMPLE"
 	set -a
 	# shellcheck disable=SC1090
 	. "$ENV_SAMPLE"
 	set +a
fi

# If a Docker personal access token is provided, attempt to login so builds won't hit unauthenticated pull limits.
if [ -n "${DOCKER_PAT:-}" ]; then
	DOCKER_USER=${DOCKER_USERNAME:-${USER:-}}
	echo "[start-all] Attempting docker login for user: ${DOCKER_USER}"
	echo "${DOCKER_PAT}" | docker login --username "${DOCKER_USER}" --password-stdin || echo "[start-all] Docker login failed (ignored)"
fi

echo "[start-all] Ensuring docker images are up-to-date (will rebuild if necessary)..."
# Behavior options (env vars):
#  SKIP_BUILD=true     -> skip docker build entirely
#  BUILD_SERVICES="s1 s2" -> build only the listed services
#  NO_PULL=true        -> do not pull base images (omit --pull)

if [ "${SKIP_BUILD:-false}" = "true" ]; then
	echo "[start-all] SKIP_BUILD=true; skipping docker build."
else
	if [ "${BUILD_ALL:-false}" = "true" ]; then
		echo "[start-all] BUILD_ALL=true; building all services (ignoring BUILD_SERVICES)."
		BUILD_SERVICES=""
	fi
	if [ -n "${BUILD_SERVICES:-}" ]; then
		echo "[start-all] Building only services: ${BUILD_SERVICES}"
		if [ "${NO_PULL:-false}" = "true" ]; then
			docker compose -f "$COMPOSE_FILE" build --parallel $BUILD_SERVICES
		else
			docker compose -f "$COMPOSE_FILE" build --pull --parallel $BUILD_SERVICES
		fi
	else
		echo "[start-all] Building all services"
		if [ "${NO_PULL:-false}" = "true" ]; then
			docker compose -f "$COMPOSE_FILE" build --parallel
		else
			docker compose -f "$COMPOSE_FILE" build --pull --parallel
		fi
	fi
fi

echo "[start-all] Bringing up compose stack (detached)..."
docker compose -f "$COMPOSE_FILE" up -d --remove-orphans

echo "[start-all] Compose started. Launching local dev servers (SSR + frontend dev server)."
export FRONTEND_PORT=${FRONTEND_PORT:-4000}
pnpm exec concurrently --kill-others-on-fail "pnpm run serve:ssr" "pnpm nx serve frontend"
