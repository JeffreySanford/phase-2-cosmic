#!/usr/bin/env bash
set -euo pipefail

# Simple method-level logging: writes timestamped lines to logs/ and prints to console
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOG_DIR="$REPO_ROOT/logs"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/start-all-$(date +%Y%m%dT%H%M%S).log"
log() {
	if command -v date >/dev/null 2>&1; then
		TS=$(date --rfc-3339=seconds 2>/dev/null || date)
	else
		TS="$(date)"
	fi
	printf '%s %s\n' "$TS" "$*" | tee -a "$LOG_FILE"
}

log "[start-all] script started, logging to ${LOG_FILE}"

COMPOSE_FILE=docker/dev-compose.yml
DEFAULT_BUILD_SERVICES="java-governance data-generator java-ingest"

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$REPO_ROOT/.env"
ENV_SAMPLE="$REPO_ROOT/.env.sample"
# Load environment variables from .env (private) or .env.sample (fallback)
if [ -f "$ENV_FILE" ]; then
	log "[start-all] Loading environment from $ENV_FILE"
 	set -a
 	# shellcheck disable=SC1090
 	. "$ENV_FILE"
 	set +a
elif [ -f "$ENV_SAMPLE" ]; then
	log "[start-all] Loading environment from $ENV_SAMPLE"
 	set -a
 	# shellcheck disable=SC1090
 	. "$ENV_SAMPLE"
 	set +a
fi

# If a Docker personal access token is provided, attempt to login so builds won't hit unauthenticated pull limits.
if [ -n "${DOCKER_PAT:-}" ]; then
	DOCKER_USER=${DOCKER_USERNAME:-${USER:-}}
	log "[start-all] Attempting docker login for user: ${DOCKER_USER}"
	echo "${DOCKER_PAT}" | docker login --username "${DOCKER_USER}" --password-stdin || log "[start-all] Docker login failed (ignored)"
fi

# If a GitHub PAT is provided, log in to ghcr.io so GHCR-hosted images (e.g. nginxlog-exporter) can be pulled.
if [ -n "${GITHUB_PAT:-}" ]; then
	GH_USER=${GITHUB_USERNAME:-${DOCKER_USERNAME:-${USER:-}}}
	log "[start-all] Attempting ghcr.io login for user: ${GH_USER}"
	echo "${GITHUB_PAT}" | docker login ghcr.io --username "${GH_USER}" --password-stdin || log "[start-all] ghcr.io login failed (ignored)"
fi

FAST_START="${FAST_START:-true}"
SKIP_BUILD_EFFECTIVE="${SKIP_BUILD:-}"
NO_PULL_EFFECTIVE="${NO_PULL:-}"
BUILD_SERVICES_EFFECTIVE="${BUILD_SERVICES:-}"

if [ -z "$SKIP_BUILD_EFFECTIVE" ]; then
	if [ "$FAST_START" = "true" ]; then
		SKIP_BUILD_EFFECTIVE="true"
	else
		SKIP_BUILD_EFFECTIVE="false"
	fi
fi

if [ -z "$NO_PULL_EFFECTIVE" ]; then
	if [ "$FAST_START" = "true" ]; then
		NO_PULL_EFFECTIVE="true"
	else
		NO_PULL_EFFECTIVE="false"
	fi
fi

if [ -z "$BUILD_SERVICES_EFFECTIVE" ] && [ "$FAST_START" != "true" ] && [ "${BUILD_ALL:-false}" != "true" ]; then
	BUILD_SERVICES_EFFECTIVE="$DEFAULT_BUILD_SERVICES"
fi

log "[start-all] Build strategy: FAST_START=${FAST_START} SKIP_BUILD=${SKIP_BUILD_EFFECTIVE} NO_PULL=${NO_PULL_EFFECTIVE} BUILD_ALL=${BUILD_ALL:-false} BUILD_SERVICES=${BUILD_SERVICES_EFFECTIVE:-<none>}"
log "[start-all] Ensuring docker images are up-to-date when requested..."
# Behavior options (env vars):
#  FAST_START=true         -> default dev path: skip compose build and avoid pulls
#  SKIP_BUILD=true|false   -> explicit override
#  BUILD_SERVICES="s1 s2"  -> build only the listed services
#  BUILD_ALL=true          -> build all services
#  NO_PULL=true|false      -> explicit pull policy override

if [ "$SKIP_BUILD_EFFECTIVE" = "true" ]; then
	log "[start-all] Skipping docker build for fast startup."
else
	if [ "${BUILD_ALL:-false}" = "true" ]; then
		log "[start-all] BUILD_ALL=true; building all services (ignoring BUILD_SERVICES)."
		BUILD_SERVICES_EFFECTIVE=""
	fi
	if [ -n "${BUILD_SERVICES_EFFECTIVE:-}" ]; then
		log "[start-all] Building only services: ${BUILD_SERVICES_EFFECTIVE}"
		if [ "$NO_PULL_EFFECTIVE" = "true" ]; then
			docker compose -f "$COMPOSE_FILE" build --parallel $BUILD_SERVICES_EFFECTIVE
		else
			docker compose -f "$COMPOSE_FILE" build --pull --parallel $BUILD_SERVICES_EFFECTIVE
		fi
	else
		log "[start-all] Building all services"
		if [ "$NO_PULL_EFFECTIVE" = "true" ]; then
			docker compose -f "$COMPOSE_FILE" build --parallel
		else
			docker compose -f "$COMPOSE_FILE" build --pull --parallel
		fi
	fi
fi

log "[start-all] Bringing up compose stack (detached)..."
docker compose -f "$COMPOSE_FILE" up -d --remove-orphans

log "[start-all] Ensuring Redis is ready and precaching sample data..."
if [ -x "$(command -v bash)" ]; then
	# run precache (script handles locating/starting redis)
	log "[start-all] running redis-precache.sh"
	bash "$REPO_ROOT/scripts/redis-precache.sh" || log "[start-all] redis-precache step failed (ignored)"
else
	log "[start-all] bash not available; skipping redis precache"
fi

log "[start-all] Compose started. Launching local dev servers (SSR + frontend dev server)."
export FRONTEND_PORT=${FRONTEND_PORT:-4000}

CONCURRENTLY_JS="$REPO_ROOT/node_modules/concurrently/dist/bin/concurrently.js"
export NODE_PATH="$REPO_ROOT/node_modules${NODE_PATH:+;$NODE_PATH}"
if command -v cygpath >/dev/null 2>&1; then
	WIN_REPO_ROOT="$(cygpath -w "$REPO_ROOT")"
else
	WIN_REPO_ROOT="$REPO_ROOT"
fi

# Kill any stale process already bound to the SSR port (e.g. a leftover tsx
# --watch instance from a previous run) so the new server can bind cleanly.
if command -v powershell.exe &>/dev/null; then
	_ssr_pid=$(powershell.exe -NoProfile -Command "
		(Get-NetTCPConnection -LocalPort $FRONTEND_PORT -State Listen -ErrorAction SilentlyContinue).OwningProcess |
		Where-Object { \$_ -match '^\d+$' } | Select-Object -First 1" 2>/dev/null | tr -d '[:space:]')
	if [ -n "$_ssr_pid" ]; then
		log "[start-all] Killing stale PID $_ssr_pid on port $FRONTEND_PORT"
		powershell.exe -NoProfile -Command "Stop-Process -Id $_ssr_pid -Force" 2>/dev/null || true
	fi
else
	_ssr_pid=$(lsof -ti tcp:"$FRONTEND_PORT" 2>/dev/null || fuser "$FRONTEND_PORT/tcp" 2>/dev/null)
	if [ -n "$_ssr_pid" ]; then
		log "[start-all] Killing stale PID $_ssr_pid on port $FRONTEND_PORT"
		kill -9 "$_ssr_pid" 2>/dev/null || true
	fi
fi

# also launch the allocator simulator so it’s always available
node "$CONCURRENTLY_JS" --kill-others-on-fail \
  "powershell.exe -NoProfile -Command \"Set-Location '$WIN_REPO_ROOT'; node ./tools/trident-allocator/server.js\"" \
  "powershell.exe -NoProfile -Command \"Set-Location '$WIN_REPO_ROOT'; node .\\node_modules\\tsx\\dist\\cli.mjs --watch --tsconfig apps/frontend/tsconfig.server.json apps/frontend/server.nest.ts\"" \
  "cmd.exe /d /s /c \"cd /d $WIN_REPO_ROOT && set NX_DAEMON=false&& pnpm nx serve frontend\"" 2>&1 | tee -a "$LOG_FILE"

log "[start-all] finished"
